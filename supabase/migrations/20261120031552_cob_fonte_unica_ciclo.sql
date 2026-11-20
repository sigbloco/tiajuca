-- Etapa 3 da revisão (COB-01 a COB-05, COB-07, COB-08): cobranças com uma fonte só, por ciclo.
-- Fonte única: cycle_fee_assignments (categoria), fee_cycle_prices (valor), cycle_scholarships (bolsa), fee_cycle_exempt (isenção da função).
-- As tabelas antigas por data (member_fee_assignments, fee_category_prices, scholarships) deixam de ser lidas e escritas;
-- são apagadas na migration seguinte (cob_remove_tabelas_antigas), depois de conferir antes × depois.
-- As RPCs antigas (assign_fee_category, set_scholarship, set_fee_price) viram pontes para o ciclo atual até a tela nova ser publicada.

-- 1. Ciclos passados sem valor por ciclo: o valor-base mais cobrado de cada categoria (decisão do usuário, 20/11/2026).
--    2024/25: Aluno 100, Sênior 35, Pernalta 35; 2025/26: Aluno 150, Sênior 50, Pernalta 35. Cobranças geradas não mudam.
insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount)
select ch.organization_id, ch.fee_category_id, ch.cycle_id, mode() within group (order by ch.base_amount)
  from public.monthly_charges ch
  join public.cycles cy on cy.id = ch.cycle_id and cy.ends_on < current_date
 where ch.fee_category_id is not null
   and not exists (select 1 from public.fee_cycle_prices p where p.cycle_id = ch.cycle_id)
 group by ch.organization_id, ch.fee_category_id, ch.cycle_id
on conflict (fee_category_id, cycle_id) do nothing;

-- 2. Auditoria nas tabelas que agora são a fonte (as antigas tinham; estas não).
drop trigger if exists trg_audit_cycle_fee_assignments on public.cycle_fee_assignments;
create trigger trg_audit_cycle_fee_assignments after insert or update or delete on public.cycle_fee_assignments for each row execute function public.fn_audit();
drop trigger if exists trg_audit_cycle_scholarships on public.cycle_scholarships;
create trigger trg_audit_cycle_scholarships after insert or update or delete on public.cycle_scholarships for each row execute function public.fn_audit();
drop trigger if exists trg_audit_fee_cycle_prices on public.fee_cycle_prices;
create trigger trg_audit_fee_cycle_prices after insert or update or delete on public.fee_cycle_prices for each row execute function public.fn_audit();
drop trigger if exists trg_audit_fee_cycle_exempt on public.fee_cycle_exempt;
create trigger trg_audit_fee_cycle_exempt after insert or update or delete on public.fee_cycle_exempt for each row execute function public.fn_audit();
drop trigger if exists trg_audit_cycle_extra_categories on public.cycle_extra_categories;
create trigger trg_audit_cycle_extra_categories after insert or update or delete on public.cycle_extra_categories for each row execute function public.fn_audit();

-- 3. A regra da mensalidade de uma pessoa num ciclo, num lugar só. Usada pela geração e por "Minha participação".
--    paid_by (D3): quem tem atividade remunerada no ciclo (vínculo marcado como remunerado, como na ficha) nunca é cobrado.
create or replace function public.billing_member_fee(p_member uuid, p_cycle uuid)
returns table (fee_category_id uuid, category_name text, base_amount numeric, percent numeric, exempt_by text, paid_by text, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select fa.fee_category_id, fc.name,
         (select p.amount from public.fee_cycle_prices p where p.fee_category_id = fa.fee_category_id and p.cycle_id = p_cycle),
         coalesce((select s.percent from public.cycle_scholarships s where s.member_id = p_member and s.cycle_id = p_cycle), 0),
         (select af.name from public.cycle_participations cp join public.artistic_functions af on af.id = cp.function_id
           where cp.member_id = p_member and cp.cycle_id = p_cycle
             and (af.exempt_locked or coalesce((select e.is_exempt from public.fee_cycle_exempt e where e.function_id = af.id and e.cycle_id = p_cycle), af.is_exempt))
           order by af.name limit 1),
         (select af.name from public.cycle_participations cp join public.artistic_functions af on af.id = cp.function_id
           where cp.member_id = p_member and cp.cycle_id = p_cycle and cp.is_paid
           order by af.name limit 1),
         exists (select 1 from public.member_cycles mc join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
                  where mc.member_id = p_member and mc.cycle_id = p_cycle)
    from (select 1) x
    left join public.cycle_fee_assignments fa on fa.member_id = p_member and fa.cycle_id = p_cycle
    left join public.fee_categories fc on fc.id = fa.fee_category_id
$$;
revoke all on function public.billing_member_fee(uuid, uuid) from public, anon, authenticated;

-- 4. Geração mensal: mesma regra de antes, agora pela função acima, sem o valor por data (COB-02) e sem quem é remunerado (COB-05, D3).
create or replace function public.generate_monthly_charges(p_org uuid, p_competence date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_comp date := date_trunc('month', p_competence)::date;
  v_end date := (date_trunc('month', p_competence) + interval '1 month - 1 day')::date;
  v_due_day int; v_created int; v_noprice int; v_total int;
begin
  perform public.require_billing(p_org);
  v_due_day := coalesce((select (value #>> '{}')::int from public.org_settings where organization_id = p_org and key = 'billing_due_day'), 10);

  with elig as (
    select distinct on (fa.member_id) fa.member_id, fa.cycle_id, f.fee_category_id, f.base_amount as base, f.percent as pct
      from public.cycle_fee_assignments fa
      join public.cycles cy on cy.id = fa.cycle_id and cy.is_active and cy.starts_on <= v_end and cy.ends_on >= v_comp
      join public.members m on m.id = fa.member_id and m.archived_at is null
      cross join lateral public.billing_member_fee(fa.member_id, fa.cycle_id) f
     where fa.organization_id = p_org and f.is_active and f.exempt_by is null and f.paid_by is null
     order by fa.member_id, cy.starts_on desc
  ), ins as (
    insert into public.monthly_charges (organization_id, member_id, competence, cycle_id, fee_category_id, base_amount,
                                        scholarship_percent, scholarship_discount, final_amount, status, due_on)
    select p_org, e.member_id, v_comp, e.cycle_id, e.fee_category_id, e.base, e.pct,
           round(e.base * e.pct / 100, 2), e.base - round(e.base * e.pct / 100, 2),
           case when e.base - round(e.base * e.pct / 100, 2) <= 0 then 'exempt' else 'pending' end,
           public.next_business_day(p_org, v_comp + (v_due_day - 1))
      from elig e where e.base is not null
    on conflict (organization_id, member_id, competence) do nothing
    returning 1
  )
  select (select count(*) from ins), (select count(*) from elig where base is null), (select count(*) from elig where base is not null)
    into v_created, v_noprice, v_total;
  return jsonb_build_object('created', v_created, 'already_existing', v_total - v_created, 'skipped_no_price', v_noprice);
end $$;

-- 5. "Minha participação" (COB-01): categoria, valor, bolsa e isenção do ciclo atual, pela mesma regra da geração.
create or replace function public.my_participation(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare m public.members; v_cycle public.cycles; res jsonb;
  v_cat text; v_price numeric; v_pct numeric; v_exempt text; v_paid text; v_active boolean;
begin
  select * into m from public.members where id = p_member;
  if m.id is null or not (public.is_self(p_member) or public.has_permission(m.organization_id, 'members.manage')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into v_cycle from public.cycles where organization_id = m.organization_id and is_current and is_active limit 1;
  if v_cycle.id is not null then
    select f.category_name, f.base_amount, f.percent, f.exempt_by, f.paid_by, f.is_active
      into v_cat, v_price, v_pct, v_exempt, v_paid, v_active
      from public.billing_member_fee(p_member, v_cycle.id) f;
  end if;
  select jsonb_build_object(
    'artistic', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', i.name, 'section', s.name, 'level', sl.name) order by l.created_at)
        from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
        left join public.sections s on s.id = i.section_id left join public.skill_levels sl on sl.id = l.skill_level_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is not null), '[]'::jsonb),
    'collab', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', af.name,
          'exempt', af.exempt_locked or coalesce((select e.is_exempt from public.fee_cycle_exempt e where e.function_id = af.id and e.cycle_id = v_cycle.id), af.is_exempt)) order by l.created_at)
        from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is null and not l.is_paid), '[]'::jsonb),
    'paid', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', af.name) order by l.created_at)
        from public.member_artistic_links l join public.artistic_functions af on af.id = l.function_id
        where l.member_id = p_member and l.ended_at is null and l.instrument_id is null and l.is_paid), '[]'::jsonb),
    'cycle', v_cycle.name,
    'category', v_cat, 'price', v_price, 'percent', coalesce(v_pct, 0), 'exempt_by', v_exempt, 'paid_by', v_paid, 'active', coalesce(v_active, false),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'action', r.action, 'status', r.status, 'created_at', r.created_at,
          'label', coalesce(i.name, af.name, (select coalesce(i2.name, af2.name) from public.member_artistic_links l2
              left join public.instruments i2 on i2.id = l2.instrument_id left join public.artistic_functions af2 on af2.id = l2.function_id
              where l2.id = r.link_id))) order by r.created_at desc)
        from (select * from public.participation_requests where member_id = p_member order by created_at desc limit 10) r
        left join public.instruments i on i.id = r.instrument_id left join public.artistic_functions af on af.id = r.function_id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- 6. COB-04: o gatilho de sincronização só espelha a participação (vínculos → ciclo atual). Categoria e bolsa não são mais
--    apagadas e recriadas a partir das tabelas antigas.
create or replace function public.sync_member_current_cycle(p_member uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_cycle uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then return; end if;
  select id into v_cycle from public.cycles where organization_id = v_org and is_current and is_active limit 1;
  if v_cycle is null then return; end if;
  if not exists (select 1 from public.member_cycles where member_id = p_member and cycle_id = v_cycle) then return; end if;

  delete from public.cycle_participations where member_id = p_member and cycle_id = v_cycle;
  insert into public.cycle_participations (organization_id, member_id, cycle_id, instrument_id, function_id, skill_level_id, is_student, is_paid, is_primary, source_link_id)
  select l.organization_id, l.member_id, v_cycle, l.instrument_id, l.function_id, l.skill_level_id, l.is_student, l.is_paid, l.is_primary, l.id
    from public.member_artistic_links l where l.member_id = p_member and l.ended_at is null;
end $$;

drop trigger if exists trg_sync_cycle_fees on public.member_fee_assignments;
drop trigger if exists trg_sync_cycle_schol on public.scholarships;

-- Quem entra no ciclo atual começa com a categoria e a bolsa do último ciclo em que tinha categoria (era o que a tabela antiga fazia).
-- Categoria de outro naipe (barrada por guard_category_section) não é copiada: a direção escolhe na ficha.
create or replace function public.carry_member_fee_to_cycle()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_prev uuid; v_cat uuid;
begin
  if not exists (select 1 from public.cycles c where c.id = new.cycle_id and c.is_current) then return null; end if;
  if exists (select 1 from public.cycle_fee_assignments where member_id = new.member_id and cycle_id = new.cycle_id) then return null; end if;
  select fa.cycle_id, fa.fee_category_id into v_prev, v_cat
    from public.cycle_fee_assignments fa join public.cycles c on c.id = fa.cycle_id
   where fa.member_id = new.member_id and c.starts_on < (select starts_on from public.cycles where id = new.cycle_id)
   order by c.starts_on desc limit 1;
  if v_prev is null then return null; end if;
  begin
    insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id)
    values (new.organization_id, new.member_id, new.cycle_id, v_cat);
  exception when raise_exception then
    return null;
  end;
  insert into public.cycle_scholarships (organization_id, member_id, cycle_id, percent, reason, scholarship_type_id)
  select s.organization_id, s.member_id, new.cycle_id, s.percent, s.reason, s.scholarship_type_id
    from public.cycle_scholarships s where s.member_id = new.member_id and s.cycle_id = v_prev
  on conflict do nothing;
  return null;
end $$;
revoke all on function public.carry_member_fee_to_cycle() from public, anon, authenticated;
-- O nome vem depois de trg_sync_cycle_member: a participação já está no ciclo quando a categoria é conferida pelo naipe.
drop trigger if exists trg_sync_cycle_member_fee on public.member_cycles;
create trigger trg_sync_cycle_member_fee after insert on public.member_cycles for each row execute function public.carry_member_fee_to_cycle();

-- 7. Aprovação de inscrição com categoria: grava só a categoria do ciclo atual.
create or replace function public._apply_principal_category(p_org uuid, p_member uuid, p_function uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare cat uuid; cy uuid;
begin
  select id into cat from public.fee_categories where organization_id = p_org and function_id = p_function limit 1;
  if cat is null then return false; end if;
  select id into cy from public.cycles where organization_id = p_org and is_current limit 1;
  if cy is not null then
    insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id) values (p_org, p_member, cy, cat)
    on conflict (member_id, cycle_id) where cycle_id is not null do update set fee_category_id = excluded.fee_category_id;
  end if;
  return true;
end $$;

-- 8. Bolsa do ciclo: uma RPC para a ficha e para a página Bolsas (0% remove a bolsa do ciclo).
create or replace function public.set_cycle_scholarship(p_member uuid, p_cycle uuid, p_percent numeric, p_type uuid default null, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'scholarships.manage') then
    raise exception 'Sem permissão para conceder bolsas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo não encontrado.' using errcode = 'P0002';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'A bolsa deve ser entre 0%% e 100%%.' using errcode = '22003';
  end if;
  if p_type is not null and not exists (select 1 from public.scholarship_types where id = p_type and organization_id = v_org) then
    raise exception 'Tipo de bolsa inválido.' using errcode = 'P0002';
  end if;
  if p_percent = 0 then
    delete from public.cycle_scholarships where member_id = p_member and cycle_id = p_cycle;
    return;
  end if;
  insert into public.cycle_scholarships (organization_id, member_id, cycle_id, percent, reason, scholarship_type_id)
  values (v_org, p_member, p_cycle, p_percent, nullif(trim(p_reason), ''), p_type)
  on conflict (member_id, cycle_id) where cycle_id is not null
  do update set percent = excluded.percent, reason = excluded.reason, scholarship_type_id = excluded.scholarship_type_id;
end $$;
revoke all on function public.set_cycle_scholarship(uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.set_cycle_scholarship(uuid, uuid, numeric, uuid, text) to authenticated;

-- Pontes para a tela publicada (até o próximo deploy): as RPCs antigas gravam no ciclo atual. Saem na próxima migration.
create or replace function public.assign_fee_category(p_member uuid, p_category uuid, p_from date default current_date)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; cy uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if p_category is not null and not exists (select 1 from public.fee_categories where id = p_category and organization_id = v_org) then
    raise exception 'Categoria inválida.' using errcode = 'P0002';
  end if;
  select id into cy from public.cycles where organization_id = v_org and is_current and is_active limit 1;
  if cy is null then raise exception 'Não há ciclo atual.' using errcode = 'P0001'; end if;
  if p_category is null then delete from public.cycle_fee_assignments where member_id = p_member and cycle_id = cy; return; end if;
  insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id) values (v_org, p_member, cy, p_category)
  on conflict (member_id, cycle_id) where cycle_id is not null do update set fee_category_id = excluded.fee_category_id;
end $$;

create or replace function public.set_scholarship(p_member uuid, p_percent numeric, p_from date default current_date, p_type uuid default null, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare cy uuid;
begin
  select c.id into cy from public.cycles c join public.members m on m.organization_id = c.organization_id
   where m.id = p_member and c.is_current and c.is_active limit 1;
  if cy is null then raise exception 'Não há ciclo atual.' using errcode = 'P0001'; end if;
  perform public.set_cycle_scholarship(p_member, cy, p_percent, p_type, p_reason);
end $$;

create or replace function public.set_fee_price(p_category uuid, p_amount numeric, p_from date)
returns void language plpgsql security definer set search_path = ''
as $$
declare cy uuid;
begin
  select c.id into cy from public.cycles c join public.fee_categories fc on fc.organization_id = c.organization_id
   where fc.id = p_category and c.is_current and c.is_active limit 1;
  if cy is null then raise exception 'Não há ciclo atual.' using errcode = 'P0001'; end if;
  perform public.set_cycle_fee_price(p_category, cy, p_amount);
end $$;

-- 9. Valores: só o valor do ciclo (a cópia por data, _sync_price_range, sai).
create or replace function public.set_cycle_fee_price(p_category uuid, p_cycle uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.fee_categories where id = p_category;
  if v_org is null then raise exception 'Categoria não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22003'; end if;
  insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount) values (v_org, p_category, p_cycle, p_amount)
  on conflict (fee_category_id, cycle_id) do update set amount = excluded.amount, updated_at = now();
end $$;

create or replace function public.replicate_cycle_prices(p_cycle uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare cy public.cycles; prev public.cycles; n int;
begin
  select * into cy from public.cycles where id = p_cycle;
  if cy.id is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_billing(cy.organization_id);
  select * into prev from public.cycles where organization_id = cy.organization_id and starts_on < cy.starts_on order by starts_on desc limit 1;
  if prev.id is null then raise exception 'Não há ciclo anterior para replicar.' using errcode = 'P0001'; end if;
  insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount)
  select cy.organization_id, p.fee_category_id, cy.id, p.amount from public.fee_cycle_prices p
   where p.cycle_id = prev.id and not exists (select 1 from public.fee_cycle_prices x where x.fee_category_id = p.fee_category_id and x.cycle_id = cy.id);
  get diagnostics n = row_count;
  insert into public.fee_cycle_exempt (organization_id, function_id, cycle_id, is_exempt)
  select x.organization_id, x.function_id, cy.id, x.is_exempt from public.fee_cycle_exempt x where x.cycle_id = prev.id
  on conflict do nothing;
  return n;
end $$;

drop function if exists public._sync_price_range(uuid, uuid, date, date, numeric);

-- 10. Indicadores de bolsa (COB-03): do ciclo escolhido (padrão: o atual), com o valor do ciclo de cada categoria.
drop function if exists public.scholarship_indicators(uuid);
create function public.scholarship_indicators(p_org uuid, p_cycle uuid default null)
returns table (bolsistas integer, soma_percentual numeric, equivalente_integrais numeric, impacto_estimado numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare v_cycle uuid;
begin
  if not public.has_permission(p_org, 'scholarships.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_cycle := coalesce(p_cycle, (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1));
  if v_cycle is not null and not exists (select 1 from public.cycles c where c.id = v_cycle and c.organization_id = p_org) then
    raise exception 'Ciclo não encontrado.' using errcode = 'P0002';
  end if;
  return query
  select count(*)::int,
         coalesce(sum(s.percent), 0),
         round(coalesce(sum(s.percent), 0) / 100, 2),
         coalesce(sum(round(coalesce(p.amount, 0) * s.percent / 100, 2)), 0)
    from public.cycle_scholarships s
    join public.members m on m.id = s.member_id and m.archived_at is null
    left join public.cycle_fee_assignments fa on fa.member_id = s.member_id and fa.cycle_id = s.cycle_id
    left join public.fee_cycle_prices p on p.fee_category_id = fa.fee_category_id and p.cycle_id = s.cycle_id
   where s.organization_id = p_org and s.cycle_id = v_cycle and s.percent > 0;
end $$;
revoke all on function public.scholarship_indicators(uuid, uuid) from public, anon;
grant execute on function public.scholarship_indicators(uuid, uuid) to authenticated;

-- 11. Painel da direção (COB-08): perfil do bloco pelo Tipo da categoria do ciclo (ativos), bolsas do ciclo.
create or replace function public.dashboard_direction(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cycle public.cycles; v_today date; v_comp date; v_res jsonb;
  v_total int; v_active int; v_inactive int; v_wait int;
begin
  if not public.has_permission(p_org, 'finance.read') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;
  v_comp := date_trunc('month', v_today)::date;
  select * into v_cycle from public.cycles where organization_id = p_org and is_active order by is_current desc, starts_on desc limit 1;
  select count(*) into v_total from public.members where organization_id = p_org and archived_at is null;
  select count(*) filter (where s.counts_as_active), count(*) filter (where not s.counts_as_active and not s.is_waitlist), count(*) filter (where s.is_waitlist)
    into v_active, v_inactive, v_wait
    from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id
   where mc.cycle_id = v_cycle.id;

  v_res := jsonb_build_object(
    'cycle', case when v_cycle.id is null then null else jsonb_build_object('id', v_cycle.id, 'name', v_cycle.name) end,
    'members_total', v_total, 'members_active', coalesce(v_active, 0), 'members_inactive', coalesce(v_inactive, 0), 'members_waitlist', coalesce(v_wait, 0),
    'by_type', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.label, 'count', x.n) order by x.ord, x.label)
        from (select case fc.base_key when 'aluno' then 'Aluno' when 'senior' then 'Sênior' when 'musico' then 'Músico' when 'isento' then 'Isento' else fc.name end as label,
                     case fc.base_key when 'aluno' then 1 when 'senior' then 2 when 'musico' then 3 when 'isento' then 5 else 4 end as ord,
                     count(distinct fa.member_id) as n
                from public.cycle_fee_assignments fa
                join public.fee_categories fc on fc.id = fa.fee_category_id
                join public.members m on m.id = fa.member_id and m.archived_at is null
                join public.member_cycles mc on mc.member_id = fa.member_id and mc.cycle_id = fa.cycle_id
                join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
               where fa.cycle_id = v_cycle.id
               group by 1, 2) x), '[]'::jsonb),
    'by_section', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'active', x.n) order by s.sort_order)
        from public.sections s
        join lateral (select count(distinct l.member_id) n from public.member_artistic_links l
                      join public.instruments i on i.id = l.instrument_id and i.section_id = s.id
                      join public.member_cycles mc on mc.member_id = l.member_id and mc.cycle_id = v_cycle.id
                      join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
                      where l.ended_at is null) x on true
       where s.organization_id = p_org and s.is_active), '[]'::jsonb),
    'capacity', (select jsonb_build_object('limited', count(*), 'full', count(*) filter (where o >= c.capacity),
                        'capacity', coalesce(sum(c.capacity), 0), 'occupied', coalesce(sum(o), 0))
                   from public.instrument_cycle_capacity c, lateral (select public.instrument_occupied(c.instrument_id, c.cycle_id) o) x
                  where c.organization_id = p_org and c.cycle_id = v_cycle.id),
    'billing', (select jsonb_build_object('previsto', coalesce(sum(final_amount) filter (where status in ('pending', 'paid')), 0),
                        'recebido', coalesce(sum(final_amount) filter (where status = 'paid'), 0),
                        'pendente', coalesce(sum(final_amount) filter (where status = 'pending'), 0),
                        'inadimplentes', count(*) filter (where status = 'pending' and due_on < v_today),
                        'bolsas', coalesce(sum(scholarship_discount) filter (where status <> 'cancelled'), 0))
                  from public.monthly_charges where organization_id = p_org and competence = v_comp),
    'scholarships', (select jsonb_build_object('bolsistas', count(*), 'equivalente', round(coalesce(sum(s.percent), 0) / 100, 2))
                       from public.cycle_scholarships s join public.members m on m.id = s.member_id and m.archived_at is null
                      where s.organization_id = p_org and s.cycle_id = v_cycle.id and s.percent > 0),
    'finance', (select jsonb_build_object('despesas', coalesce(sum(amount) filter (where kind = 'expense'), 0),
                        'receitas', coalesce(sum(amount) filter (where kind = 'income'), 0),
                        'saldo', coalesce(sum(case when kind = 'income' then amount else -amount end), 0))
                  from public.v_finance_ledger where organization_id = p_org and occurred_on >= v_comp and occurred_on < (v_comp + interval '1 month')::date)
  );
  return v_res;
end $$;

-- 12. Variáveis de valor dos formulários: o valor do ciclo do formulário (ou do ciclo atual, se o formulário não tiver ciclo).
create or replace function public.form_vars(p_form uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare f public.forms; v_cy uuid;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_cy := coalesce(f.cycle_id, (select cy.id from public.cycles cy where cy.organization_id = f.organization_id and cy.is_current limit 1));
  return (select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'key', c.system_key, 'price', p.amount) order by c.sort_order, c.name), '[]'::jsonb)
                     from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                    where c.organization_id = f.organization_id and c.is_active),
    'valor_field', (select fld.field_key from public.form_fields fld where fld.form_id = f.id and fld.is_active and fld.member_mapping = 'link.function' limit 1),
    'prices', (select coalesce(jsonb_object_agg(c.function_id::text, p.amount), '{}'::jsonb)
                 from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                where c.organization_id = f.organization_id and c.function_id is not null),
    'ciclo', (select cy.name from public.cycles cy where cy.id = f.cycle_id), 'inicio_ciclo', (select cy.starts_on from public.cycles cy where cy.id = f.cycle_id),
    'fim_ciclo', (select cy.ends_on from public.cycles cy where cy.id = f.cycle_id),
    'whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'chave_pix', s.pix_key,
    'vencimento', (select os.value #>> '{}' from public.org_settings os where os.organization_id = f.organization_id and os.key = 'billing_due_day'))
    from public.shop_settings s where s.organization_id = f.organization_id);
end $$;

create or replace function public.get_public_form(p_org_slug text, p_form_slug text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare o public.organizations; f public.forms; v public.form_versions; st text; m public.members; viewer jsonb; mine jsonb; v_cy uuid;
begin
  select * into o from public.organizations where slug = p_org_slug and is_active;
  if o.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into f from public.forms where organization_id = o.id and slug = p_form_slug and status in ('published', 'closed');
  if f.id is null or f.published_version_id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into v from public.form_versions where id = f.published_version_id;
  st := public._form_state(f);
  v_cy := coalesce(f.cycle_id, (select cy.id from public.cycles cy where cy.organization_id = o.id and cy.is_current limit 1));
  if f.access = 'internal' and st = 'open' then
    if auth.uid() is null then st := 'login_required';
    else
      select * into m from public.members where organization_id = o.id and user_id = auth.uid() and archived_at is null;
      if m.id is null then st := 'not_member';
      else
        viewer := jsonb_build_object('member_id', m.id, 'name', m.full_name, 'section_id', public._viewer_section(m.id));
        select jsonb_build_object('status', x.status, 'answers', x.answers, 'submitted_at', x.submitted_at, 'edited_at', x.edited_at) into mine
          from public.form_submissions x where x.form_id = f.id and x.member_id = m.id and x.status in ('pending', 'approved') order by x.submitted_at desc limit 1;
        if mine is not null then st := 'already'; end if;
      end if;
    end if;
  end if;
  return jsonb_build_object(
    'state', st, 'access', f.access, 'viewer', viewer, 'mine', mine,
    'organization', jsonb_build_object('name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'form', jsonb_build_object(
      'title', v.snapshot -> 'title', 'description', v.snapshot -> 'description', 'privacy_text', to_jsonb(case when f.privacy_enabled then f.privacy_text end),
      'requires_consent', v.snapshot -> 'requires_consent', 'closes_at', f.closes_at, 'send_text', case when f.send_enabled then f.send_text end,
      'show_confirmation', f.confirmation_enabled,
      'vars', (select jsonb_build_object(
          'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'key', c.system_key, 'price', p.amount) order by c.sort_order, c.name), '[]'::jsonb)
                           from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                          where c.organization_id = o.id and c.is_active),
          'valor_field', (select fld ->> 'key' from jsonb_array_elements(v.snapshot -> 'fields') fld where fld ->> 'mapping' = 'link.function' limit 1),
          'prices', (select coalesce(jsonb_object_agg(c.function_id::text, p.amount), '{}'::jsonb)
                       from public.fee_categories c join public.fee_cycle_prices p on p.fee_category_id = c.id and p.cycle_id = v_cy
                      where c.organization_id = o.id and c.function_id is not null),
          'ciclo', (select cy.name from public.cycles cy where cy.id = f.cycle_id), 'inicio_ciclo', (select cy.starts_on from public.cycles cy where cy.id = f.cycle_id),
          'fim_ciclo', (select cy.ends_on from public.cycles cy where cy.id = f.cycle_id),
          'whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'chave_pix', s.pix_key,
          'vencimento', (select os.value #>> '{}' from public.org_settings os where os.organization_id = o.id and os.key = 'billing_due_day'))
        from public.shop_settings s where s.organization_id = o.id),
      'full_options', (select coalesce(jsonb_agg(c.instrument_id), '[]'::jsonb) from public.instrument_cycle_capacity c
                        where c.organization_id = o.id and c.cycle_id = v_cy and public.instrument_occupied(c.instrument_id, c.cycle_id) >= c.capacity),
      'header', jsonb_build_object('image_url', f.header_image_url, 'x', f.header_pos_x, 'y', f.header_pos_y, 'zoom', f.header_zoom, 'height', f.header_height, 'logo', f.header_logo_size, 'color', f.header_color),
      'fields', case when st in ('open', 'already') then (select coalesce(jsonb_agg(case when f.access = 'internal' then fld else fld - 'mapping' end), '[]'::jsonb)
                                                           from jsonb_array_elements(v.snapshot -> 'fields') fld) else '[]'::jsonb end));
end $$;

-- 13. COB-07: ajuste de valor tira o link de pagamento antigo (o próximo link sai com o valor novo). O código antigo continua
--     reconhecido: se alguém pagar pelo link velho, o aviso da InfinitePay fica registrado como divergência na cobrança.
create or replace function public.adjust_charge(p_charge uuid, p_new_amount numeric, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if c.status not in ('pending', 'exempt') then raise exception 'Só é possível ajustar cobranças pendentes ou isentas.' using errcode = 'P0001'; end if;
  if p_new_amount is null or p_new_amount < 0 then raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22003'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Informe o motivo do ajuste.' using errcode = '22023'; end if;
  insert into public.charge_adjustments (organization_id, charge_id, original_amount, new_amount, reason, adjusted_by)
  values (c.organization_id, c.id, c.final_amount, p_new_amount, trim(p_reason), public.current_member_id(c.organization_id));
  update public.monthly_charges set final_amount = p_new_amount, manual_adjustment = true,
         status = case when p_new_amount = 0 then 'exempt' else 'pending' end,
         pay_code = null, pay_link_url = null,
         pay_ref = case when c.pay_code is null then pay_ref
                        else coalesce(pay_ref, '{}'::jsonb) || jsonb_build_object('old_codes',
                               coalesce(pay_ref -> 'old_codes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('code', c.pay_code, 'amount', c.final_amount, 'until', now()))) end
   where id = p_charge;
end $$;

-- Cobrança pelo código do link: o atual ou um antigo (guardado no ajuste).
create or replace function public._charge_by_pay_code(p_code text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select c.id from public.monthly_charges c
   where c.pay_code = upper(trim(p_code))
      or (c.pay_ref ? 'old_codes' and exists (select 1 from jsonb_array_elements(c.pay_ref -> 'old_codes') x where x ->> 'code' = upper(trim(p_code))))
   order by (c.pay_code = upper(trim(p_code))) desc nulls last
   limit 1
$$;
revoke all on function public._charge_by_pay_code(text) from public, anon, authenticated;

create or replace function public.charge_for_payment(p_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'status', c.status, 'amount_cents', round(c.final_amount * 100)::int,
                            'handle', (select s.infinitepay_handle from public.shop_settings s where s.organization_id = c.organization_id))
    from public.monthly_charges c where c.id = public._charge_by_pay_code(p_code)
$$;
revoke all on function public.charge_for_payment(text) from public, anon, authenticated;
grant execute on function public.charge_for_payment(text) to service_role;

create or replace function public.charge_mark_paid_by_link(p_code text, p_ref jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = public._charge_by_pay_code(p_code) for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if c.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if c.status <> 'pending' then
    update public.monthly_charges set pay_ref = coalesce(pay_ref, '{}'::jsonb) || coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('paid_while', c.status) where id = c.id;
    return jsonb_build_object('ok', false, 'reason', c.status);
  end if;
  update public.monthly_charges
     set status = 'paid', paid_on = (now() at time zone coalesce((select timezone from public.organizations where id = c.organization_id), 'America/Sao_Paulo'))::date,
         payment_method = 'InfinitePay', pay_ref = coalesce(pay_ref, '{}'::jsonb) || coalesce(p_ref, '{}'::jsonb)
   where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.charge_mark_paid_by_link(text, jsonb) from public, anon, authenticated;
grant execute on function public.charge_mark_paid_by_link(text, jsonb) to service_role;

-- Pagamento confirmado na InfinitePay com valor diferente do da cobrança (ex.: link antigo depois de um ajuste): fica registrado
-- na cobrança para a direção conferir. Não dá baixa.
create or replace function public.charge_note_divergence(p_code text, p_ref jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_id uuid := public._charge_by_pay_code(p_code);
begin
  if v_id is null then return; end if;
  update public.monthly_charges
     set pay_ref = coalesce(pay_ref, '{}'::jsonb) || jsonb_build_object('divergences',
           coalesce(pay_ref -> 'divergences', '[]'::jsonb) || jsonb_build_array(coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('code', upper(trim(p_code)), 'at', now())))
   where id = v_id
     and not exists (select 1 from jsonb_array_elements(coalesce(pay_ref -> 'divergences', '[]'::jsonb)) d
                      where d ->> 'transaction_nsu' is not null and d ->> 'transaction_nsu' = p_ref ->> 'transaction_nsu');
end $$;
revoke all on function public.charge_note_divergence(text, jsonb) from public, anon, authenticated;
grant execute on function public.charge_note_divergence(text, jsonb) to service_role;

-- 14. Chamada: o público "classificação" sai (nenhum evento usa; as classificações antigas são apagadas na próxima migration).
create or replace function public.get_attendance_roster(p_activity uuid)
returns table (member_id uuid, display_name text, instruments text, status_id uuid, notes text, is_off_roster boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_a public.activities; v_cycle uuid; v_scope text; v_has_aud boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  if v_scope is null or v_scope = 'own' then
    raise exception 'Sem permissão para a chamada.' using errcode = '42501';
  end if;
  v_cycle := coalesce(v_a.cycle_id, (
    select cy.id from public.cycles cy
     where cy.organization_id = v_a.organization_id and cy.is_active and v_a.activity_date between cy.starts_on and cy.ends_on
     order by cy.is_current desc, cy.starts_on desc limit 1));
  v_has_aud := exists (select 1 from public.activity_audiences au where au.activity_id = p_activity);

  return query
  with eligible as (
    select m.id as mid from public.members m
    where m.organization_id = v_a.organization_id and m.archived_at is null
      and (v_cycle is null or exists (
            select 1 from public.member_cycles mc
            join public.member_cycle_statuses s on s.id = mc.status_id
            where mc.member_id = m.id and mc.cycle_id = v_cycle
              and (s.counts_as_active
                   or (not s.is_waitlist and mc.left_on is not null and v_a.activity_date <= mc.left_on))))
      and (not v_has_aud or (
            -- categorias do público: basta ter uma delas no ciclo
            (not exists (select 1 from public.activity_audiences au where au.activity_id = p_activity and au.kind = 'category')
             or exists (
                select 1 from public.activity_audiences au
                where au.activity_id = p_activity and au.kind = 'category' and (
                     exists (select 1 from public.cycle_fee_assignments fa where fa.member_id = m.id and fa.cycle_id = v_cycle and fa.fee_category_id = au.ref_id)
                  or exists (select 1 from public.cycle_extra_categories ex where ex.member_id = m.id and ex.cycle_id = v_cycle and ex.fee_category_id = au.ref_id))))
            -- E naipe/instrumento/pessoa do público (quando houver): basta um deles
            and (not exists (select 1 from public.activity_audiences au where au.activity_id = p_activity and au.kind <> 'category')
             or exists (
                select 1 from public.activity_audiences au
                where au.activity_id = p_activity and au.kind <> 'category' and (
                     (au.kind = 'member' and au.ref_id = m.id)
                  or (au.kind in ('section', 'instrument') and exists (
                        select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
                        where l.member_id = m.id and l.ended_at is null
                          and ((au.kind = 'instrument' and i.id = au.ref_id)
                            or (au.kind = 'section' and i.section_id = au.ref_id)))))))))
  ), picked as (
    select e.mid, false as off from eligible e
    union
    select ea.member_id, true from public.event_attendance ea
     where ea.activity_id = p_activity and ea.member_id not in (select e2.mid from eligible e2)
  )
  select m.id, coalesce(m.display_name, m.full_name),
         (select string_agg(i.name, ', ' order by i.name)
            from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
           where l.member_id = m.id and l.ended_at is null),
         ea.status_id, ea.notes, p.off
  from picked p
  join public.members m on m.id = p.mid
  left join public.event_attendance ea on ea.activity_id = p_activity and ea.member_id = m.id
  where v_scope = 'org' or public.can_record_attendance_for(v_a.organization_id, m.id)
  order by 2;
end $$;
