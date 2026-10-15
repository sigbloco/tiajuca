-- SIGBloco · Fase 4 · Contribuições, bolsas e mensalidades.
-- Decisões (docs/PROPOSTA_TECNICA.md I.1.1): uma categoria por integrante (vigência por data); só quem tem categoria paga;
-- competência = date no dia 1; vencimento no dia configurado (padrão 10) ou próximo dia útil, sem juros;
-- valores versionados por vigência; geração idempotente (UQ membro+competência); escrita só por RPC.

create table public.fee_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);

create table public.fee_category_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, fee_category_id uuid not null,
  amount numeric(12,2) not null check (amount >= 0),
  valid_from date not null, valid_to date,
  created_at timestamptz not null default now(),
  unique (fee_category_id, valid_from),
  foreign key (organization_id, fee_category_id) references public.fee_categories (organization_id, id),
  check (valid_to is null or valid_to >= valid_from)
);

create table public.member_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null, fee_category_id uuid not null,
  valid_from date not null, valid_to date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, fee_category_id) references public.fee_categories (organization_id, id),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index mfa_one_open_uq on public.member_fee_assignments (member_id) where valid_to is null;

create table public.scholarship_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, is_active boolean not null default true,
  unique (organization_id, id), unique (organization_id, name)
);

create table public.scholarships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  valid_from date not null, valid_to date,
  scholarship_type_id uuid, reason text,
  granted_by uuid default auth.uid(), created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, scholarship_type_id) references public.scholarship_types (organization_id, id),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index scholarships_one_open_uq on public.scholarships (member_id) where valid_to is null;

create table public.holidays (
  organization_id uuid not null references public.organizations(id),
  day date not null, name text not null,
  primary key (organization_id, day)
);

create table public.monthly_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  competence date not null check (extract(day from competence) = 1),
  fee_category_id uuid not null,
  base_amount numeric(12,2) not null check (base_amount >= 0),
  scholarship_percent numeric(5,2) not null default 0 check (scholarship_percent between 0 and 100),
  scholarship_discount numeric(12,2) not null default 0 check (scholarship_discount >= 0),
  final_amount numeric(12,2) not null check (final_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'exempt', 'cancelled')),
  due_on date not null,
  paid_on date, payment_method text,
  manual_adjustment boolean not null default false,
  notes text,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (organization_id, member_id, competence), -- idempotência: no máximo 1 cobrança por pessoa e mês
  unique (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, fee_category_id) references public.fee_categories (organization_id, id)
);
create index monthly_charges_comp_status_idx on public.monthly_charges (organization_id, competence, status);
create index monthly_charges_member_idx on public.monthly_charges (member_id, competence desc);
create trigger trg_charges_updated before update on public.monthly_charges for each row execute function public.set_updated_at();

create table public.charge_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, charge_id uuid not null,
  original_amount numeric(12,2) not null, new_amount numeric(12,2) not null,
  reason text not null check (length(trim(reason)) > 0),
  adjusted_by uuid references public.members(id), adjusted_at timestamptz not null default now(),
  foreign key (organization_id, charge_id) references public.monthly_charges (organization_id, id)
);

-- ───────────── funções ─────────────
create or replace function public.next_business_day(p_org uuid, p_date date) returns date
language plpgsql stable set search_path = '' as $$
declare d date := p_date;
begin
  while extract(isodow from d) in (6, 7) or exists (select 1 from public.holidays h where h.organization_id = p_org and h.day = d) loop
    d := d + 1;
  end loop;
  return d;
end $$;

create or replace function public.require_billing(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'billing.manage') then
    raise exception 'Sem permissão para gerenciar mensalidades.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_billing(uuid) from public, anon;
grant execute on function public.require_billing(uuid) to authenticated;

create or replace function public.set_fee_price(p_category uuid, p_amount numeric, p_from date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.fee_categories where id = p_category;
  if v_org is null then raise exception 'Categoria não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if p_amount is null or p_amount < 0 then raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22003'; end if;
  if exists (select 1 from public.fee_category_prices where fee_category_id = p_category and valid_from = p_from) then
    update public.fee_category_prices set amount = p_amount where fee_category_id = p_category and valid_from = p_from;
  else
    update public.fee_category_prices set valid_to = p_from - 1
     where fee_category_id = p_category and valid_to is null and valid_from < p_from;
    insert into public.fee_category_prices (organization_id, fee_category_id, amount, valid_from) values (v_org, p_category, p_amount, p_from);
  end if;
end $$;
revoke all on function public.set_fee_price(uuid, numeric, date) from public, anon;
grant execute on function public.set_fee_price(uuid, numeric, date) to authenticated;

create or replace function public.assign_fee_category(p_member uuid, p_category uuid, p_from date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; cur public.member_fee_assignments;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if p_category is not null and not exists (select 1 from public.fee_categories where id = p_category and organization_id = v_org) then
    raise exception 'Categoria inválida.' using errcode = 'P0002';
  end if;
  select * into cur from public.member_fee_assignments where member_id = p_member and valid_to is null;
  if cur.id is not null then
    if p_category is not null and cur.fee_category_id = p_category then return; end if;
    if cur.valid_from >= p_from then
      if p_category is null then delete from public.member_fee_assignments where id = cur.id;
      else update public.member_fee_assignments set fee_category_id = p_category where id = cur.id; end if;
      return;
    end if;
    update public.member_fee_assignments set valid_to = p_from - 1 where id = cur.id;
  end if;
  if p_category is not null then
    insert into public.member_fee_assignments (organization_id, member_id, fee_category_id, valid_from) values (v_org, p_member, p_category, p_from);
  end if;
end $$;
revoke all on function public.assign_fee_category(uuid, uuid, date) from public, anon;
grant execute on function public.assign_fee_category(uuid, uuid, date) to authenticated;

-- Bolsa vigente por integrante. percent = 0 encerra a bolsa.
create or replace function public.set_scholarship(p_member uuid, p_percent numeric, p_from date default current_date,
                                                  p_type uuid default null, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; cur public.scholarships;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'scholarships.manage') then
    raise exception 'Sem permissão para conceder bolsas.' using errcode = '42501';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'A bolsa deve ser entre 0%% e 100%%.' using errcode = '22003';
  end if;
  if p_type is not null and not exists (select 1 from public.scholarship_types where id = p_type and organization_id = v_org) then
    raise exception 'Tipo de bolsa inválido.' using errcode = 'P0002';
  end if;
  select * into cur from public.scholarships where member_id = p_member and valid_to is null;
  if cur.id is not null then
    if cur.valid_from >= p_from then
      if p_percent = 0 then delete from public.scholarships where id = cur.id;
      else update public.scholarships set percent = p_percent, scholarship_type_id = p_type, reason = p_reason where id = cur.id; end if;
      return;
    end if;
    update public.scholarships set valid_to = p_from - 1 where id = cur.id;
  end if;
  if p_percent > 0 then
    insert into public.scholarships (organization_id, member_id, percent, valid_from, scholarship_type_id, reason)
    values (v_org, p_member, p_percent, p_from, p_type, p_reason);
  end if;
end $$;
revoke all on function public.set_scholarship(uuid, numeric, date, uuid, text) from public, anon;
grant execute on function public.set_scholarship(uuid, numeric, date, uuid, text) to authenticated;

-- Gera as cobranças da competência. Idempotente. Cobra quem tem categoria vigente E participação ativa em ciclo do mês.
create or replace function public.generate_monthly_charges(p_org uuid, p_competence date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := date_trunc('month', p_competence)::date;
  v_end date := (date_trunc('month', p_competence) + interval '1 month - 1 day')::date;
  v_due_day int; v_created int; v_noprice int; v_total int;
begin
  perform public.require_billing(p_org);
  v_due_day := coalesce((select (value #>> '{}')::int from public.org_settings where organization_id = p_org and key = 'billing_due_day'), 10);

  with elig as (
    select fa.member_id, fa.fee_category_id,
      (select p.amount from public.fee_category_prices p
        where p.fee_category_id = fa.fee_category_id and p.valid_from <= v_comp and (p.valid_to is null or p.valid_to >= v_comp)
        order by p.valid_from desc limit 1) as base,
      coalesce((select s.percent from public.scholarships s
        where s.member_id = fa.member_id and s.valid_from <= v_end and (s.valid_to is null or s.valid_to >= v_comp)
        order by s.valid_from desc limit 1), 0) as pct
    from public.member_fee_assignments fa
    join public.members m on m.id = fa.member_id and m.archived_at is null
    where fa.organization_id = p_org and fa.valid_from <= v_end and (fa.valid_to is null or fa.valid_to >= v_comp)
      and exists (
        select 1 from public.member_cycles mc
        join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
        join public.cycles cy on cy.id = mc.cycle_id and cy.is_active and cy.starts_on <= v_end and cy.ends_on >= v_comp
        where mc.member_id = fa.member_id)
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
revoke all on function public.generate_monthly_charges(uuid, date) from public, anon;
grant execute on function public.generate_monthly_charges(uuid, date) to authenticated;

create or replace function public.adjust_charge(p_charge uuid, p_new_amount numeric, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
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
         status = case when p_new_amount = 0 then 'exempt' else 'pending' end
   where id = p_charge;
end $$;
revoke all on function public.adjust_charge(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_charge(uuid, numeric, text) to authenticated;

create or replace function public.mark_charge_paid(p_charge uuid, p_paid_on date, p_method text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if c.status <> 'pending' then raise exception 'Só cobranças pendentes podem ser baixadas.' using errcode = 'P0001'; end if;
  update public.monthly_charges set status = 'paid', paid_on = p_paid_on, payment_method = nullif(trim(p_method), '') where id = p_charge;
end $$;
revoke all on function public.mark_charge_paid(uuid, date, text) from public, anon;
grant execute on function public.mark_charge_paid(uuid, date, text) to authenticated;

-- Cancelar (pendente/isenta) ou reabrir (paga/cancelada → pendente). Nada é apagado.
create or replace function public.change_charge_status(p_charge uuid, p_status text, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if p_status = 'cancelled' and c.status in ('pending', 'exempt') then
    update public.monthly_charges set status = 'cancelled', notes = coalesce(nullif(trim(p_notes), ''), notes) where id = p_charge;
  elsif p_status = 'pending' and c.status in ('paid', 'cancelled') then
    update public.monthly_charges set status = case when final_amount = 0 then 'exempt' else 'pending' end,
           paid_on = null, payment_method = null, notes = coalesce(nullif(trim(p_notes), ''), notes) where id = p_charge;
  else
    raise exception 'Mudança de status não permitida.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.change_charge_status(uuid, text, text) from public, anon;
grant execute on function public.change_charge_status(uuid, text, text) to authenticated;

-- ───────────── indicadores ─────────────
create view public.v_billing_summary with (security_invoker = true) as
select c.organization_id, c.competence,
  coalesce(sum(c.final_amount) filter (where c.status in ('pending', 'paid')), 0) as previsto,
  coalesce(sum(c.final_amount) filter (where c.status = 'paid'), 0) as recebido,
  coalesce(sum(c.final_amount) filter (where c.status = 'pending'), 0) as pendente,
  coalesce(sum(c.base_amount) filter (where c.status = 'exempt'), 0) as isento,
  coalesce(sum(c.scholarship_discount) filter (where c.status <> 'cancelled'), 0) as impacto_bolsas,
  count(*) filter (where c.status = 'pending' and c.due_on < (now() at time zone o.timezone)::date) as inadimplentes,
  count(*) filter (where c.status <> 'cancelled') as cobrancas
from public.monthly_charges c
join public.organizations o on o.id = c.organization_id
group by c.organization_id, c.competence, o.timezone;
revoke all on public.v_billing_summary from public, anon;
grant select on public.v_billing_summary to authenticated;

-- Bolsas vigentes hoje: nº de bolsistas, soma dos percentuais, equivalente em bolsas integrais e impacto mensal estimado.
create or replace function public.scholarship_indicators(p_org uuid) returns table (
  bolsistas int, soma_percentual numeric, equivalente_integrais numeric, impacto_estimado numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'scholarships.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select count(*)::int,
         coalesce(sum(s.percent), 0),
         round(coalesce(sum(s.percent), 0) / 100, 2),
         coalesce(sum(round(coalesce(pr.amount, 0) * s.percent / 100, 2)), 0)
  from public.scholarships s
  left join public.member_fee_assignments fa on fa.member_id = s.member_id and fa.valid_to is null
  left join lateral (
    select p.amount from public.fee_category_prices p
    where p.fee_category_id = fa.fee_category_id and p.valid_from <= current_date and (p.valid_to is null or p.valid_to >= current_date)
    order by p.valid_from desc limit 1) pr on true
  where s.organization_id = p_org and s.percent > 0 and s.valid_from <= current_date and (s.valid_to is null or s.valid_to >= current_date);
end $$;
revoke all on function public.scholarship_indicators(uuid) from public, anon;
grant execute on function public.scholarship_indicators(uuid) to authenticated;

-- ───────────── auditoria, RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['fee_categories','fee_category_prices','member_fee_assignments','scholarship_types','scholarships',
                           'holidays','monthly_charges','charge_adjustments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  grant insert, update on public.fee_categories, public.scholarship_types to authenticated;
  grant insert, update, delete on public.holidays to authenticated;
  foreach t in array array['fee_categories','fee_category_prices','member_fee_assignments','scholarship_types','scholarships',
                           'monthly_charges','charge_adjustments'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

create policy fc_select on public.fee_categories for select to authenticated using (public.is_org_member(organization_id));
create policy fc_insert on public.fee_categories for insert to authenticated with check (public.has_permission(organization_id, 'billing.manage'));
create policy fc_update on public.fee_categories for update to authenticated
  using (public.has_permission(organization_id, 'billing.manage')) with check (public.has_permission(organization_id, 'billing.manage'));

create policy fcp_select on public.fee_category_prices for select to authenticated using (public.is_org_member(organization_id));

create policy mfa_select on public.member_fee_assignments for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'billing.read'));

create policy st_select on public.scholarship_types for select to authenticated using (public.has_permission(organization_id, 'scholarships.manage'));
create policy st_insert on public.scholarship_types for insert to authenticated with check (public.has_permission(organization_id, 'scholarships.manage'));
create policy st_update on public.scholarship_types for update to authenticated
  using (public.has_permission(organization_id, 'scholarships.manage')) with check (public.has_permission(organization_id, 'scholarships.manage'));

create policy sch_select on public.scholarships for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'scholarships.manage'));

create policy hol_select on public.holidays for select to authenticated using (public.is_org_member(organization_id));
create policy hol_insert on public.holidays for insert to authenticated with check (public.has_permission(organization_id, 'settings.manage'));
create policy hol_update on public.holidays for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage')) with check (public.has_permission(organization_id, 'settings.manage'));
create policy hol_delete on public.holidays for delete to authenticated using (public.has_permission(organization_id, 'settings.manage'));

-- cobranças: o integrante vê as próprias; Direção vê todas. Escrita apenas pelas RPCs.
create policy mc_charges_select on public.monthly_charges for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'billing.read'));
create policy adj_select on public.charge_adjustments for select to authenticated using (public.has_permission(organization_id, 'billing.manage'));
