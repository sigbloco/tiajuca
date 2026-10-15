-- SIGBloco · Fornecedores: contatos de prestadores por categoria (sonorização, banheiro químico, tenda…).
-- Categorias configuráveis (nada fixo no código). Leitura: Direção, Professores e Monitores (suppliers.read);
-- escrita: Direção (suppliers.manage). Sem DELETE: fornecedores saem de uso por is_active (histórico preservado).

insert into public.permissions (key, module, description) values
  ('suppliers.read',   'fornecedores', 'Ver fornecedores'),
  ('suppliers.manage', 'fornecedores', 'Cadastrar e editar fornecedores')
on conflict (key) do nothing;

-- Direção e Titular já recebem as novas permissões pelo gatilho de `permissions`; Professor e Monitor só leem.
insert into public.role_permissions (access_role_id, permission_key, scope)
select ar.id, 'suppliers.read', 'org' from public.access_roles ar where ar.key in ('direcao', 'titular', 'professor', 'monitor')
on conflict do nothing;
insert into public.role_permissions (access_role_id, permission_key, scope)
select ar.id, 'suppliers.manage', 'org' from public.access_roles ar where ar.key in ('direcao', 'titular')
on conflict do nothing;

create table public.supplier_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, category_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  phone text, email text, website text, notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, category_id) references public.supplier_categories (organization_id, id),
  check (website is null or website ~* '^https?://')
);
create index suppliers_category_idx on public.suppliers (category_id) where is_active;
create trigger trg_suppliers_updated before update on public.suppliers for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['supplier_categories', 'suppliers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

create policy supcat_select on public.supplier_categories for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'suppliers.read') is not null
         and (is_active or public.has_permission(organization_id, 'suppliers.manage')));
create policy supcat_insert on public.supplier_categories for insert to authenticated with check (public.has_permission(organization_id, 'suppliers.manage'));
create policy supcat_update on public.supplier_categories for update to authenticated
  using (public.has_permission(organization_id, 'suppliers.manage')) with check (public.has_permission(organization_id, 'suppliers.manage'));

create policy sup_select on public.suppliers for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'suppliers.read') is not null
         and (is_active or public.has_permission(organization_id, 'suppliers.manage')));
create policy sup_insert on public.suppliers for insert to authenticated with check (public.has_permission(organization_id, 'suppliers.manage'));
create policy sup_update on public.suppliers for update to authenticated
  using (public.has_permission(organization_id, 'suppliers.manage')) with check (public.has_permission(organization_id, 'suppliers.manage'));
