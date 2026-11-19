-- Liberação de páginas por categoria (Direção, Professor, Monitor, Integrante ativo, Integrante inativo).
-- Só RESTRINGE a interface: quem não tem a permissão em "Acesso e papéis" continua sem a página; quem tem, só a vê liberada.
-- Linha ausente = valor padrão (Direção liberada, demais não): o sistema sobe igual a hoje e páginas novas já nascem assim.
-- O Titular vê tudo sempre e é o único que grava; todos os membros leem (o menu precisa).

create table if not exists public.page_releases (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_key text not null check (page_key ~ '^[a-z0-9-]{1,40}$'),
  category text not null check (category in ('direcao', 'professor', 'monitor', 'ativo', 'inativo')),
  released boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (organization_id, page_key, category)
);
alter table public.page_releases enable row level security;
create policy page_releases_read on public.page_releases for select to authenticated using (public.is_org_member(organization_id));
revoke all on public.page_releases from anon;
grant select on public.page_releases to authenticated;

-- Grava várias liberações de uma vez ([{page, category, released}]). Só o Titular.
create or replace function public.set_page_releases(p_org uuid, p_changes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.members m
      join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
      join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
     where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
  ) then
    raise exception 'Só o Titular altera a liberação das páginas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 600 then
    raise exception 'Alterações inválidas.' using errcode = '22023';
  end if;
  insert into public.page_releases (organization_id, page_key, category, released, updated_by)
  select p_org, x.page, x.category, x.released, auth.uid()
    from jsonb_to_recordset(p_changes) as x(page text, category text, released boolean)
   where x.page is not null and x.category is not null and x.released is not null
  on conflict (organization_id, page_key, category)
  do update set released = excluded.released, updated_at = now(), updated_by = excluded.updated_by;
end $$;
revoke all on function public.set_page_releases(uuid, jsonb) from public, anon;
grant execute on function public.set_page_releases(uuid, jsonb) to authenticated;
