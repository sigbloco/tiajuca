-- Etapa 3 — as funções do banco que dependem do ciclo passam a ler as tabelas por ciclo
-- (cycle_participations, cycle_fee_assignments, cycle_scholarships). Para o ciclo atual o resultado é o mesmo de antes (as tabelas são sincronizadas).

-- Vagas: quem ocupa um instrumento num ciclo.
create or replace function public.instrument_occupied(p_instrument uuid, p_cycle uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct mc.member_id)::int
  from public.member_cycles mc
  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
  join public.cycle_participations p on p.member_id = mc.member_id and p.cycle_id = mc.cycle_id and p.instrument_id = p_instrument
  where mc.cycle_id = p_cycle
$$;

-- Mudança de situação no ciclo: confere a vaga pelos instrumentos da pessoa NAQUELE ciclo (no ciclo atual, se ainda não há registro, vale o vínculo vigente).
create or replace function public.set_member_cycle_status(p_member uuid, p_cycle uuid, p_status_key text, p_notes text default null, p_waitlist_instrument uuid default null, p_force boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_status public.member_cycle_statuses; v_existing public.member_cycles;
  v_was_active boolean := false; v_was_inactive boolean := false; v_full text; v_id uuid; v_allowed boolean;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo inválido.' using errcode = 'P0002';
  end if;
  select * into v_status from public.member_cycle_statuses
   where organization_id = v_org and key = p_status_key and is_active;
  if v_status.id is null then raise exception 'Status inválido.' using errcode = 'P0002'; end if;

  v_allowed := public.has_permission(v_org, 'member_cycles.manage')
    or (coalesce(public.permission_scope_of(v_org, 'member_cycles.manage') = 'group', false)
        and public.is_in_my_group(v_org, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  select * into v_existing from public.member_cycles where member_id = p_member and cycle_id = p_cycle;
  if v_existing.id is not null then
    select s.counts_as_active, (not s.counts_as_active and not s.is_waitlist)
      into v_was_active, v_was_inactive from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  if v_status.counts_as_active and coalesce(v_was_inactive, false) and not public.can_decide_reactivation(v_org, p_member) then
    raise exception 'Só a Direção ou um professor do grupo da pessoa pode reativar um integrante inativo.' using errcode = 'P0001';
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(i.name, ', ') into v_full
    from (
      select p.instrument_id from public.cycle_participations p where p.member_id = p_member and p.cycle_id = p_cycle and p.instrument_id is not null
      union
      select l.instrument_id from public.member_artistic_links l
       where l.member_id = p_member and l.ended_at is null and l.instrument_id is not null
         and exists (select 1 from public.cycles cy where cy.id = p_cycle and cy.is_current)
         and not exists (select 1 from public.cycle_participations p2 where p2.member_id = p_member and p2.cycle_id = p_cycle)
    ) mi
    join public.instruments i on i.id = mi.instrument_id
    join public.instrument_cycle_capacity c on c.instrument_id = mi.instrument_id and c.cycle_id = p_cycle
    where public.instrument_occupied(mi.instrument_id, p_cycle) >= c.capacity;
    if v_full is not null and not (p_force and public.has_permission(v_org, 'capacity.manage')) then
      raise exception 'Vaga lotada em: %. Só a Direção pode autorizar a exceção.', v_full using errcode = 'P0001';
    end if;
  end if;

  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id, joined_on, left_on, notes,
                                    waitlisted_at, waitlist_instrument_id)
  values (v_org, p_member, p_cycle, v_status.id,
          case when v_status.counts_as_active then current_date end,
          case when not v_status.counts_as_active and not v_status.is_waitlist then current_date end,
          p_notes,
          case when v_status.is_waitlist then now() end,
          case when v_status.is_waitlist then p_waitlist_instrument end)
  on conflict (member_id, cycle_id) do update set
    status_id = excluded.status_id,
    joined_on = case when v_status.counts_as_active then coalesce(public.member_cycles.joined_on, current_date)
                     else public.member_cycles.joined_on end,
    left_on = case when v_status.counts_as_active then null
                   when v_status.is_waitlist then null else current_date end,
    notes = coalesce(excluded.notes, public.member_cycles.notes),
    waitlisted_at = case when v_status.is_waitlist then coalesce(public.member_cycles.waitlisted_at, now()) end,
    waitlist_instrument_id = case when v_status.is_waitlist then coalesce(excluded.waitlist_instrument_id, public.member_cycles.waitlist_instrument_id) end
  returning id into v_id;
  return v_id;
end $$;

-- Cobranças do mês: categoria e bolsa vêm do ciclo que cobre a competência (a pessoa precisa estar ativa nesse ciclo).
create or replace function public.generate_monthly_charges(p_org uuid, p_competence date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := date_trunc('month', p_competence)::date;
  v_end date := (date_trunc('month', p_competence) + interval '1 month - 1 day')::date;
  v_due_day int; v_created int; v_noprice int; v_total int;
begin
  perform public.require_billing(p_org);
  v_due_day := coalesce((select (value #>> '{}')::int from public.org_settings where organization_id = p_org and key = 'billing_due_day'), 10);

  with elig as (
    select distinct on (fa.member_id) fa.member_id, fa.fee_category_id,
      (select p.amount from public.fee_category_prices p
        where p.fee_category_id = fa.fee_category_id and p.valid_from <= v_comp and (p.valid_to is null or p.valid_to >= v_comp)
        order by p.valid_from desc limit 1) as base,
      coalesce((select s.percent from public.cycle_scholarships s where s.member_id = fa.member_id and s.cycle_id = fa.cycle_id limit 1), 0) as pct
    from public.cycle_fee_assignments fa
    join public.cycles cy on cy.id = fa.cycle_id and cy.is_active and cy.starts_on <= v_end and cy.ends_on >= v_comp
    join public.members m on m.id = fa.member_id and m.archived_at is null
    where fa.organization_id = p_org
      and exists (
        select 1 from public.member_cycles mc
        join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
        where mc.member_id = fa.member_id and mc.cycle_id = fa.cycle_id)
    order by fa.member_id, cy.starts_on desc
  ), ins as (
    insert into public.monthly_charges (organization_id, member_id, competence, fee_category_id, base_amount,
                                        scholarship_percent, scholarship_discount, final_amount, status, due_on)
    select p_org, e.member_id, v_comp, e.fee_category_id, e.base, e.pct,
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

-- Categoria de cada integrante num ciclo (padrão: o ciclo atual).
drop function if exists public.list_member_categories(uuid);
create or replace function public.list_member_categories(p_org uuid, p_cycle uuid default null)
returns table (member_id uuid, category_id uuid, category_name text)
language sql stable security definer set search_path = '' as $$
  select a.member_id, c.id, c.name
    from public.cycle_fee_assignments a
    join public.fee_categories c on c.id = a.fee_category_id
   where a.organization_id = p_org
     and a.cycle_id = coalesce(p_cycle, (select cy.id from public.cycles cy where cy.organization_id = p_org and cy.is_current and cy.is_active limit 1))
     and public.is_org_member(p_org)
     and public.can_read_member(p_org, a.member_id)
$$;
revoke all on function public.list_member_categories(uuid, uuid) from public, anon;
grant execute on function public.list_member_categories(uuid, uuid) to authenticated;
