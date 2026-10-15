-- SIGBloco · Fase 1 · Núcleo: organizações, membros, papéis, classificações, auditoria
-- Convenções: uuid PK, organization_id em toda tabela de domínio, sem DELETE físico em dados históricos.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────── organizations ─────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_path   text,
  theme       jsonb not null default '{}'::jsonb,
  timezone    text not null default 'America/Sao_Paulo',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();

-- ───────────── members (pessoa ≠ conta de login) ─────────────
create table public.members (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id),
  user_id              uuid references auth.users(id) on delete set null,
  full_name            text not null check (length(trim(full_name)) > 0),
  display_name         text,
  email                text,
  phone                text,
  social_handle        text,
  birth_date           date,
  joined_at            date,
  affective_relation   text,
  played_other_blocks  boolean not null default false,
  other_blocks         text,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id),
  updated_at           timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id)
);
create unique index members_org_email_uq on public.members (organization_id, lower(email))
  where email is not null and archived_at is null;
create index members_org_name_idx on public.members (organization_id, lower(full_name));
create index members_name_trgm_idx on public.members using gin (full_name extensions.gin_trgm_ops);
create index members_user_idx on public.members (user_id) where user_id is not null;
create trigger trg_members_updated before update on public.members
  for each row execute function public.set_updated_at();

-- Regra de negócio (decisão I.1.1 #14): menores de 18 anos não podem ser integrantes.
create or replace function public.enforce_member_adult() returns trigger
language plpgsql as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'Menores de 18 anos não podem ser cadastrados como integrantes.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_members_adult before insert or update of birth_date on public.members
  for each row execute function public.enforce_member_adult();

-- ───────────── dados sensíveis (LGPD) — tabela separada ─────────────
create table public.member_sensitive_data (
  member_id        uuid primary key,
  organization_id  uuid not null,
  gender           text,
  is_trans         boolean,
  race_color       text,
  is_pcd           boolean,
  pcd_description  text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  check (is_pcd is distinct from false or pcd_description is null)
);
create trigger trg_msd_updated before update on public.member_sensitive_data
  for each row execute function public.set_updated_at();

-- ───────────── papéis de acesso e permissões (RBAC por organização) ─────────────
create table public.permissions (
  key          text primary key,
  module       text not null,
  description  text not null
);

create table public.access_roles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  key              text not null,
  name             text not null,
  rank             int  not null,
  is_system        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (organization_id, key),
  unique (organization_id, id)
);

create type public.permission_scope as enum ('own', 'group', 'org');

create table public.role_permissions (
  access_role_id  uuid not null references public.access_roles(id) on delete cascade,
  permission_key  text not null references public.permissions(key),
  scope           public.permission_scope not null default 'org',
  primary key (access_role_id, permission_key)
);

create table public.member_access_roles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  member_id        uuid not null,
  access_role_id   uuid not null,
  granted_by       uuid references auth.users(id),
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, access_role_id) references public.access_roles (organization_id, id)
);
create unique index member_access_roles_active_uq
  on public.member_access_roles (member_id, access_role_id) where revoked_at is null;
create index member_access_roles_member_idx on public.member_access_roles (member_id) where revoked_at is null;

-- ───────────── classificações (Aluno, Músico, Senior…) — NÃO concedem permissão ─────────────
create table public.classifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  key              text not null,
  name             text not null,
  sort_order       int  not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organization_id, key),
  unique (organization_id, id)
);

create table public.member_classifications (
  organization_id    uuid not null,
  member_id          uuid not null,
  classification_id  uuid not null,
  since              date,
  until              date,
  primary key (member_id, classification_id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, classification_id) references public.classifications (organization_id, id)
);

-- ───────────── convites (vincula conta ↔ cadastro) ─────────────
create table public.member_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  member_id        uuid not null,
  email            text,
  token_hash       bytea not null unique,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  invited_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id)
);
create index member_invites_member_idx on public.member_invites (member_id);

-- ───────────── configurações e consentimento ─────────────
create table public.org_settings (
  organization_id  uuid not null references public.organizations(id),
  key              text not null,
  value            jsonb not null,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, key)
);

create table public.consent_records (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  member_id        uuid not null,
  purpose          text not null,
  text_version     text not null,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  foreign key (organization_id, member_id) references public.members (organization_id, id)
);

-- ───────────── auditoria (append-only) ─────────────
create table public.audit_logs (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null,
  actor_user_id    uuid,
  actor_member_id  uuid,
  action           text not null,
  entity_type      text not null,
  entity_id        text,
  old_data         jsonb,
  new_data         jsonb,
  created_at       timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (organization_id, entity_type, entity_id);
