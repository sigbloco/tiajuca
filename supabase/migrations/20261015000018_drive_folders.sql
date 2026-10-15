-- SIGBloco · Pastas do Google Drive com controle de quem enxerga cada pasta (por papel, naipe ou instrumento).
-- O app decide QUEM VÊ o atalho da pasta; o acesso real aos arquivos continua sendo do Google Drive
-- (a pasta precisa estar compartilhada no Drive de forma compatível). Pasta sem regra de acesso: só a Direção vê.
-- Sem DELETE de pastas (desativa-se); as regras de acesso são configuração e podem ser regravadas.

insert into public.permissions (key, module, description) values
  ('drive.read',   'drive', 'Ver as pastas do Drive liberadas para o seu perfil'),
  ('drive.manage', 'drive', 'Cadastrar pastas do Drive e definir quem acessa')
on conflict (key) do nothing;

-- Direção e Titular recebem pelo gatilho de `permissions`; os demais papéis só leem (o filtro real é por pasta).
insert into public.role_permissions (access_role_id, permission_key, scope)
select ar.id, 'drive.read', 'org' from public.access_roles ar where ar.key in ('direcao', 'titular', 'professor', 'monitor', 'integrante')
on conflict do nothing;
insert into public.role_permissions (access_role_id, permission_key, scope)
select ar.id, 'drive.manage', 'org' from public.access_roles ar where ar.key in ('direcao', 'titular')
on conflict do nothing;

create table public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  description text,
  url text not null check (url ~* '^https://(drive|docs)\.google\.com/'),
  drive_folder_id text,
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create trigger trg_drive_folders_updated before update on public.drive_folders for each row execute function public.set_updated_at();

-- Cada linha libera a pasta para UM alvo: um papel de acesso, um naipe ou um instrumento.
create table public.drive_folder_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, folder_id uuid not null,
  access_role_id uuid, section_id uuid, instrument_id uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, folder_id) references public.drive_folders (organization_id, id),
  foreign key (organization_id, access_role_id) references public.access_roles (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  check ((access_role_id is not null)::int + (section_id is not null)::int + (instrument_id is not null)::int = 1)
);
create unique index dfa_role_uq on public.drive_folder_access (folder_id, access_role_id) where access_role_id is not null;
create unique index dfa_section_uq on public.drive_folder_access (folder_id, section_id) where section_id is not null;
create unique index dfa_instrument_uq on public.drive_folder_access (folder_id, instrument_id) where instrument_id is not null;

-- A pessoa logada enxerga a pasta? (papel ativo, ou vínculo ativo com o naipe/instrumento liberado)
create or replace function public.can_see_drive_folder(p_folder uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.drive_folders f
    join public.members m on m.organization_id = f.organization_id and m.user_id = auth.uid() and m.archived_at is null
    join public.drive_folder_access a on a.folder_id = f.id
    where f.id = p_folder and f.is_active and (
      (a.access_role_id is not null and exists (
        select 1 from public.member_access_roles mar where mar.member_id = m.id and mar.revoked_at is null and mar.access_role_id = a.access_role_id))
      or (a.section_id is not null and exists (
        select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
         where l.member_id = m.id and l.ended_at is null and i.section_id = a.section_id))
      or (a.instrument_id is not null and exists (
        select 1 from public.member_artistic_links l where l.member_id = m.id and l.ended_at is null and l.instrument_id = a.instrument_id))
    )
  )
$$;
revoke all on function public.can_see_drive_folder(uuid) from public, anon;
grant execute on function public.can_see_drive_folder(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['drive_folders', 'drive_folder_access'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;
grant select, insert, update on public.drive_folders to authenticated;
grant select, insert, delete on public.drive_folder_access to authenticated;

create policy dfolder_select on public.drive_folders for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'drive.read') is not null
         and (public.has_permission(organization_id, 'drive.manage') or public.can_see_drive_folder(id)));
create policy dfolder_insert on public.drive_folders for insert to authenticated with check (public.has_permission(organization_id, 'drive.manage'));
create policy dfolder_update on public.drive_folders for update to authenticated
  using (public.has_permission(organization_id, 'drive.manage')) with check (public.has_permission(organization_id, 'drive.manage'));

create policy dfa_select on public.drive_folder_access for select to authenticated using (public.has_permission(organization_id, 'drive.manage'));
create policy dfa_insert on public.drive_folder_access for insert to authenticated with check (public.has_permission(organization_id, 'drive.manage'));
create policy dfa_delete on public.drive_folder_access for delete to authenticated using (public.has_permission(organization_id, 'drive.manage'));
