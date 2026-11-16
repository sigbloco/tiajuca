-- Valores por CICLO (não por data): cada categoria tem um valor mensal em cada ciclo. Os formulários leem por aqui.
-- A cobrança continua lendo fee_category_prices (por data): cada gravação por ciclo é espelhada lá, no período do ciclo.
create table public.fee_cycle_prices (
  organization_id uuid not null, fee_category_id uuid not null, cycle_id uuid not null,
  amount numeric(12,2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (fee_category_id, cycle_id),
  foreign key (organization_id, fee_category_id) references public.fee_categories (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);
alter table public.fee_cycle_prices enable row level security;
revoke all on public.fee_cycle_prices from anon, authenticated;
grant select on public.fee_cycle_prices to authenticated;
create policy fcyp_select on public.fee_cycle_prices for select to authenticated using (public.is_org_member(organization_id));

-- Valores que já existiam: o de cada categoria no início de cada ciclo.
insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount)
select c.organization_id, c.id, cy.id, p.amount
  from public.fee_categories c join public.cycles cy on cy.organization_id = c.organization_id
  join lateral (select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= cy.starts_on and (pr.valid_to is null or pr.valid_to >= cy.starts_on) order by pr.valid_from desc limit 1) p on true
on conflict do nothing;

-- Espelha o valor do ciclo no período dele (preservando o que vinha antes e depois).
create or replace function public._sync_price_range(p_cat uuid, p_org uuid, p_from date, p_to date, p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.fee_category_prices;
begin
  for r in select * from public.fee_category_prices where fee_category_id = p_cat and valid_from <= p_to and coalesce(valid_to, date '9999-12-31') >= p_from loop
    delete from public.fee_category_prices where id = r.id;
    if r.valid_from < p_from then insert into public.fee_category_prices (organization_id, fee_category_id, amount, valid_from, valid_to) values (p_org, p_cat, r.amount, r.valid_from, p_from - 1); end if;
    if r.valid_to is null or r.valid_to > p_to then insert into public.fee_category_prices (organization_id, fee_category_id, amount, valid_from, valid_to) values (p_org, p_cat, r.amount, p_to + 1, r.valid_to); end if;
  end loop;
  insert into public.fee_category_prices (organization_id, fee_category_id, amount, valid_from, valid_to) values (p_org, p_cat, p_amount, p_from, p_to);
end $$;
revoke all on function public._sync_price_range(uuid, uuid, date, date, numeric) from public, anon, authenticated;

create or replace function public.set_cycle_fee_price(p_category uuid, p_cycle uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; cy public.cycles;
begin
  select organization_id into v_org from public.fee_categories where id = p_category;
  if v_org is null then raise exception 'Categoria não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(v_org);
  select * into cy from public.cycles where id = p_cycle and organization_id = v_org;
  if cy.id is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22003'; end if;
  insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount) values (v_org, p_category, p_cycle, p_amount)
  on conflict (fee_category_id, cycle_id) do update set amount = excluded.amount, updated_at = now();
  perform public._sync_price_range(p_category, v_org, cy.starts_on, cy.ends_on, p_amount);
end $$;
revoke all on function public.set_cycle_fee_price(uuid, uuid, numeric) from public, anon;
grant execute on function public.set_cycle_fee_price(uuid, uuid, numeric) to authenticated;

-- Replica os valores do ciclo anterior (o de início mais próximo antes deste) nas categorias que ainda não têm valor neste ciclo.
create or replace function public.replicate_cycle_prices(p_cycle uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare cy public.cycles; prev public.cycles; r record; n int := 0;
begin
  select * into cy from public.cycles where id = p_cycle;
  if cy.id is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_billing(cy.organization_id);
  select * into prev from public.cycles where organization_id = cy.organization_id and starts_on < cy.starts_on order by starts_on desc limit 1;
  if prev.id is null then raise exception 'Não há ciclo anterior para replicar.' using errcode = 'P0001'; end if;
  for r in select p.fee_category_id, p.amount from public.fee_cycle_prices p
            where p.cycle_id = prev.id and not exists (select 1 from public.fee_cycle_prices x where x.fee_category_id = p.fee_category_id and x.cycle_id = cy.id) loop
    insert into public.fee_cycle_prices (organization_id, fee_category_id, cycle_id, amount) values (cy.organization_id, r.fee_category_id, cy.id, r.amount);
    perform public._sync_price_range(r.fee_category_id, cy.organization_id, cy.starts_on, cy.ends_on, r.amount);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.replicate_cycle_prices(uuid) from public, anon;
grant execute on function public.replicate_cycle_prices(uuid) to authenticated;

-- Formulários: com ciclo, o valor é o do ciclo (por ele, não pela data); sem valor próprio no ciclo, cai no vigente na data de início.
-- Também expõe nome e datas do ciclo para as variáveis dos textos.
do $$
declare d text; n text; price_old text; price_new text; vars_old text; vars_new text;
begin
  price_old := 'select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= ref_d and (pr.valid_to is null or pr.valid_to >= ref_d) order by pr.valid_from desc limit 1';
  price_new := 'select a.amount from (select coalesce((select cp.amount from public.fee_cycle_prices cp where cp.fee_category_id = c.id and cp.cycle_id = f.cycle_id), (select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= ref_d and (pr.valid_to is null or pr.valid_to >= ref_d) order by pr.valid_from desc limit 1)) as amount) a where a.amount is not null';
  vars_old := '''whatsapp'', s.contact_whatsapp,';
  vars_new := '''ciclo'', (select cy.name from public.cycles cy where cy.id = f.cycle_id), ''inicio_ciclo'', (select cy.starts_on from public.cycles cy where cy.id = f.cycle_id), ''fim_ciclo'', (select cy.ends_on from public.cycles cy where cy.id = f.cycle_id), ''whatsapp'', s.contact_whatsapp,';

  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, price_old, price_new);
  if n = d then raise exception 'patch get: price'; end if; d := n;
  n := replace(d, vars_old, vars_new);
  if n = d then raise exception 'patch get: cycle vars'; end if;
  execute n;

  d := pg_get_functiondef('public.form_vars(uuid)'::regprocedure);
  n := replace(d, price_old, price_new);
  if n = d then raise exception 'patch vars: price'; end if; d := n;
  n := replace(d, vars_old, vars_new);
  if n = d then raise exception 'patch vars: cycle vars'; end if;
  execute n;
end $$;
