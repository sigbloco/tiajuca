-- Nomes de naipes predefinidos (o formulário "Novo naipe" escolhe um deles num menu). Configurados em Organização → Nomes de naipes.
create table public.section_names (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index section_names_name_uq on public.section_names (organization_id, lower(name));
create trigger trg_section_names_updated before update on public.section_names for each row execute function public.set_updated_at();
create trigger trg_audit_section_names after insert or update or delete on public.section_names for each row execute function public.fn_audit();
alter table public.section_names enable row level security;
revoke all on public.section_names from anon, authenticated;
grant select, insert, update, delete on public.section_names to authenticated;
create policy section_names_select on public.section_names for select to authenticated using (public.is_org_member(organization_id));
create policy section_names_insert on public.section_names for insert to authenticated with check (public.has_permission(organization_id, 'structure.manage'));
create policy section_names_update on public.section_names for update to authenticated using (public.has_permission(organization_id, 'structure.manage')) with check (public.has_permission(organization_id, 'structure.manage'));
create policy section_names_delete on public.section_names for delete to authenticated using (public.has_permission(organization_id, 'structure.manage'));

insert into public.section_names (organization_id, name, sort_order)
select o.id, v.name, v.ord from public.organizations o, (values ('Sopro', 1), ('Cordas', 2), ('Percussão', 3), ('Performance', 4), ('Canto', 5)) v(name, ord);

-- Cordas e Canto tinham sido criados vazios só para testar; agora nascem pelo formulário "Novo naipe".
delete from public.sections s where lower(s.name) in ('cordas', 'canto')
  and not exists (select 1 from public.subsections x where x.section_id = s.id)
  and not exists (select 1 from public.instruments i where i.section_id = s.id);
