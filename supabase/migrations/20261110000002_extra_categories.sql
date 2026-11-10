-- Categorias acumuláveis: a principal (cycle_fee_assignments) define a cobrança;
-- as extras (ex.: Aluno + Sênior) são marcações para filtros e listas.
create table public.cycle_extra_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  fee_category_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, fee_category_id) references public.fee_categories (organization_id, id),
  unique (member_id, cycle_id, fee_category_id)
);
alter table public.cycle_extra_categories enable row level security;
revoke all on public.cycle_extra_categories from anon, authenticated;
grant select, insert, delete on public.cycle_extra_categories to authenticated;
create policy cec_select on public.cycle_extra_categories for select to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'billing.read'));
create policy cec_insert on public.cycle_extra_categories for insert to authenticated with check (public.has_permission(organization_id, 'billing.manage'));
create policy cec_delete on public.cycle_extra_categories for delete to authenticated using (public.has_permission(organization_id, 'billing.manage'));

drop function if exists public.list_member_categories(uuid, uuid);
create or replace function public.list_member_categories(p_org uuid, p_cycle uuid default null)
returns table (member_id uuid, category_id uuid, category_name text, is_extra boolean)
language sql stable security definer set search_path = '' as $$
  with cy as (select coalesce(p_cycle, (select c.id from public.cycles c where c.organization_id = p_org and c.is_current and c.is_active limit 1)) as id)
  select a.member_id, c.id, c.name, false
    from public.cycle_fee_assignments a
    join public.fee_categories c on c.id = a.fee_category_id
   where a.organization_id = p_org and a.cycle_id = (select id from cy)
     and public.is_org_member(p_org) and public.can_read_member(p_org, a.member_id)
  union all
  select e.member_id, c.id, c.name, true
    from public.cycle_extra_categories e
    join public.fee_categories c on c.id = e.fee_category_id
   where e.organization_id = p_org and e.cycle_id = (select id from cy)
     and public.is_org_member(p_org) and public.can_read_member(p_org, e.member_id)
$$;
revoke all on function public.list_member_categories(uuid, uuid) from public, anon;
grant execute on function public.list_member_categories(uuid, uuid) to authenticated;
