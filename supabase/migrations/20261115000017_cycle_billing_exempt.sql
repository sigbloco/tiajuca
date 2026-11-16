-- Cobranças ligadas ao CICLO (não só à data) e Isento por ciclo.

-- 1) Isento por ciclo: sem linha para o ciclo, vale o padrão antigo da categoria (artistic_functions.is_exempt).
create table public.fee_cycle_exempt (
  organization_id uuid not null, function_id uuid not null, cycle_id uuid not null,
  is_exempt boolean not null,
  updated_at timestamptz not null default now(),
  primary key (function_id, cycle_id),
  foreign key (organization_id, function_id) references public.artistic_functions (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);
alter table public.fee_cycle_exempt enable row level security;
revoke all on public.fee_cycle_exempt from anon, authenticated;
grant select on public.fee_cycle_exempt to authenticated;
create policy fcye_select on public.fee_cycle_exempt for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.set_cycle_exempt(p_function uuid, p_cycle uuid, p_exempt boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.artistic_functions where id = p_function;
  if v_org is null then raise exception 'Categoria não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  insert into public.fee_cycle_exempt (organization_id, function_id, cycle_id, is_exempt) values (v_org, p_function, p_cycle, coalesce(p_exempt, false))
  on conflict (function_id, cycle_id) do update set is_exempt = excluded.is_exempt, updated_at = now();
end $$;
revoke all on function public.set_cycle_exempt(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_cycle_exempt(uuid, uuid, boolean) to authenticated;

-- Replicar do ciclo anterior também leva o Isento.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.replicate_cycle_prices(uuid)'::regprocedure);
  n := replace(d, E'  return n;', E'  insert into public.fee_cycle_exempt (organization_id, function_id, cycle_id, is_exempt)\n  select x.organization_id, x.function_id, cy.id, x.is_exempt from public.fee_cycle_exempt x where x.cycle_id = prev.id\n  on conflict do nothing;\n  return n;');
  if n = d then raise exception 'patch replicate'; end if;
  execute n;
end $$;

-- 2) Cobrança guarda o ciclo a que pertence.
alter table public.monthly_charges add column if not exists cycle_id uuid references public.cycles (id);
update public.monthly_charges c set cycle_id = (
  select cy.id from public.cycles cy
   where cy.organization_id = c.organization_id and cy.is_active and cy.starts_on <= (date_trunc('month', c.competence) + interval '1 month - 1 day')::date and cy.ends_on >= c.competence
   order by cy.starts_on desc limit 1)
 where c.cycle_id is null;
create index if not exists monthly_charges_cycle_idx on public.monthly_charges (cycle_id);

-- 3) Geração: valor do CICLO da atribuição (sem valor no ciclo, cai no vigente na data), Isento do ciclo, e o ciclo gravado na cobrança.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.generate_monthly_charges(uuid,date)'::regprocedure);
  n := replace(d, '(select p.amount from public.fee_category_prices p', '(coalesce((select cp.amount from public.fee_cycle_prices cp where cp.fee_category_id = fa.fee_category_id and cp.cycle_id = fa.cycle_id), (select p.amount from public.fee_category_prices p');
  if n = d then raise exception 'patch gen: price a'; end if; d := n;
  n := replace(d, 'order by p.valid_from desc limit 1) as base,', 'order by p.valid_from desc limit 1))) as base,');
  if n = d then raise exception 'patch gen: price b'; end if; d := n;
  n := replace(d, '(af.is_exempt or af.exempt_locked)', '(af.exempt_locked or coalesce((select e.is_exempt from public.fee_cycle_exempt e where e.function_id = af.id and e.cycle_id = fa.cycle_id), af.is_exempt))');
  if n = d then raise exception 'patch gen: exempt'; end if; d := n;
  n := replace(d, 'select distinct on (fa.member_id) fa.member_id, fa.fee_category_id,', 'select distinct on (fa.member_id) fa.member_id, fa.cycle_id, fa.fee_category_id,');
  if n = d then raise exception 'patch gen: elig'; end if; d := n;
  n := replace(d, 'competence, fee_category_id, base_amount,', 'competence, cycle_id, fee_category_id, base_amount,');
  if n = d then raise exception 'patch gen: cols'; end if; d := n;
  n := replace(d, 'v_comp, e.fee_category_id, e.base, e.pct,', 'v_comp, e.cycle_id, e.fee_category_id, e.base, e.pct,');
  if n = d then raise exception 'patch gen: vals'; end if;
  execute n;
end $$;
