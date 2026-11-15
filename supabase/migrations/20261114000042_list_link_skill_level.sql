-- Uma lista criada em "Listas do cadastro" pode ser ligada ao integrante como lista de níveis (ex.: Níveis de pernalta):
-- os itens passam a ser linhas de skill_levels com list_id, então tudo que já usa nível (vínculo artístico, formulário, aprovação) funciona sem mudar.
alter table public.form_lists add column if not exists link text check (link in ('skill_level'));
alter table public.skill_levels add column if not exists list_id uuid references public.form_lists(id);
alter table public.skill_levels drop constraint if exists skill_levels_organization_id_name_key;
drop index if exists public.skill_levels_organization_id_name_key;
create unique index if not exists skill_levels_org_list_name_uq on public.skill_levels (organization_id, coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
create index if not exists skill_levels_list_idx on public.skill_levels (list_id) where list_id is not null;

create or replace function public.link_list_to_levels(p_list uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare l public.form_lists; n int := 0;
begin
  select * into l from public.form_lists where id = p_list;
  if l.id is null or not public.has_permission(l.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if l.kind <> 'custom' then raise exception 'Só listas criadas por você podem ser ligadas.' using errcode = 'P0001'; end if;
  if l.link is not null then return 0; end if;
  insert into public.skill_levels (organization_id, name, sort_order, is_active, description, list_id)
  select i.organization_id, i.name, i.sort_order, i.is_active, i.description, l.id from public.form_list_items i where i.list_id = l.id;
  get diagnostics n = row_count;
  update public.form_lists set link = 'skill_level' where id = l.id;
  return n;
end $$;
revoke all on function public.link_list_to_levels(uuid) from public, anon;
grant execute on function public.link_list_to_levels(uuid) to authenticated;
