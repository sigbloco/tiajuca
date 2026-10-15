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
-- SIGBloco · Fase 1 · Helpers de acesso, catálogo de permissões, auditoria e RPCs

-- ───────────── catálogo de permissões (dado de referência do núcleo) ─────────────
insert into public.permissions (key, module, description) values
  ('org.manage',               'organizacao',  'Editar dados e identidade da organização'),
  ('settings.manage',          'configuracoes','Administrar configurações e catálogos'),
  ('roles.manage',             'acesso',       'Atribuir papéis de acesso e editar permissões'),
  ('members.read',             'membros',      'Ver cadastro básico de integrantes'),
  ('members.manage',           'membros',      'Criar e editar integrantes'),
  ('members.sensitive.read',   'membros',      'Ver dados pessoais sensíveis (LGPD)'),
  ('members.sensitive.manage', 'membros',      'Editar dados pessoais sensíveis (LGPD)'),
  ('audit.read',               'auditoria',    'Consultar logs de auditoria'),
  ('structure.manage',         'estrutura',    'Editar áreas, naipes, instrumentos e funções'),
  ('cycles.manage',            'ciclos',       'Criar e editar ciclos'),
  ('member_cycles.read',       'ciclos',       'Ver participação no ciclo'),
  ('member_cycles.manage',     'ciclos',       'Alterar status no ciclo'),
  ('capacity.read',            'vagas',        'Ver vagas por naipe'),
  ('capacity.manage',          'vagas',        'Definir limite de vagas'),
  ('events.read',              'eventos',      'Ver eventos'),
  ('events.manage',            'eventos',      'Criar e editar eventos'),
  ('checklists.manage',        'eventos',      'Editar modelos de checklist'),
  ('attendance.read',          'presenca',     'Ver presença'),
  ('attendance.record',        'presenca',     'Registrar presença'),
  ('billing.read',             'mensalidades', 'Ver mensalidades'),
  ('billing.manage',           'mensalidades', 'Gerar e baixar mensalidades'),
  ('scholarships.manage',      'mensalidades', 'Conceder bolsas'),
  ('finance.read',             'financeiro',   'Ver financeiro'),
  ('finance.manage',           'financeiro',   'Lançar receitas, despesas e distribuição'),
  ('staff_payments.read',      'financeiro',   'Ver pagamentos da equipe'),
  ('staff_payments.manage',    'financeiro',   'Lançar pagamentos da equipe'),
  ('pix.manage',               'financeiro',   'Gerenciar chave PIX'),
  ('repertoire.read',          'repertorio',   'Ver repertório'),
  ('repertoire.manage',        'repertorio',   'Editar repertório'),
  ('forms.manage',             'inscricoes',   'Gerenciar formulários de inscrição')
on conflict (key) do nothing;

-- ───────────── helpers de acesso (security definer, sem recursão de RLS) ─────────────
create or replace function public.current_member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    join public.organizations o on o.id = m.organization_id and o.is_active
    where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
  )
$$;

create or replace function public.is_self(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member and m.user_id = auth.uid() and m.archived_at is null
  )
$$;

-- Maior escopo concedido ao usuário para a permissão (união dos papéis ativos acumulados).
create or replace function public.permission_scope_of(p_org uuid, p_perm text)
returns public.permission_scope
language sql stable security definer set search_path = '' as $$
  select rp.scope
  from public.members m
  join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
  join public.role_permissions rp on rp.access_role_id = mar.access_role_id
  where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
    and rp.permission_key = p_perm
  order by rp.scope desc
  limit 1
$$;

create or replace function public.has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.permission_scope_of(p_org, p_perm) = 'org'
$$;

-- Fase 2 substitui por consulta a staff_section_assignments (decisão I.1.1 #1).
create or replace function public.is_in_my_group(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select false
$$;

create or replace function public.can_read_member(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_permission(p_org, 'members.read')
      or public.is_self(p_member)
      or (public.permission_scope_of(p_org, 'members.read') = 'group'
          and public.is_in_my_group(p_org, p_member))
$$;

revoke all on function public.current_member_id(uuid), public.is_org_member(uuid), public.is_self(uuid),
  public.permission_scope_of(uuid, text), public.has_permission(uuid, text),
  public.is_in_my_group(uuid, uuid), public.can_read_member(uuid, uuid) from public, anon;
grant execute on function public.current_member_id(uuid), public.is_org_member(uuid), public.is_self(uuid),
  public.permission_scope_of(uuid, text), public.has_permission(uuid, text),
  public.is_in_my_group(uuid, uuid), public.can_read_member(uuid, uuid) to authenticated;

-- ───────────── auditoria: trigger genérico ─────────────
alter table public.members alter column created_by set default auth.uid();

create or replace function public.fn_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_org uuid; v_id text; v_member uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  elsif tg_table_name = 'role_permissions' then
    select r.organization_id into v_org from public.access_roles r
    where r.id = coalesce(v_new ->> 'access_role_id', v_old ->> 'access_role_id')::uuid;
  else
    v_org := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'member_id', v_old ->> 'member_id',
                   v_new ->> 'key', v_old ->> 'key');

  -- LGPD: o log de dados sensíveis registra apenas QUAIS campos mudaram, nunca os valores.
  if tg_table_name = 'member_sensitive_data' then
    v_old := null;
    v_new := jsonb_build_object('changed_fields', coalesce((
      select jsonb_agg(n.key) from jsonb_each(to_jsonb(new)) n
      where n.key not in ('updated_at', 'updated_by')
        and (tg_op = 'INSERT' or n.value is distinct from (to_jsonb(old) -> n.key))
    ), '[]'::jsonb));
  end if;

  v_member := (select m.id from public.members m
               where m.user_id = auth.uid() and m.organization_id = v_org limit 1);

  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action,
                                 entity_type, entity_id, old_data, new_data)
  values (v_org, auth.uid(), v_member, lower(tg_op), tg_table_name, v_id, v_old, v_new);
  return null;
end $$;

create trigger trg_audit_organizations     after insert or update on public.organizations        for each row execute function public.fn_audit();
create trigger trg_audit_members           after insert or update on public.members              for each row execute function public.fn_audit();
create trigger trg_audit_sensitive         after insert or update on public.member_sensitive_data for each row execute function public.fn_audit();
create trigger trg_audit_access_roles      after insert or update on public.access_roles         for each row execute function public.fn_audit();
create trigger trg_audit_role_permissions  after insert or update or delete on public.role_permissions for each row execute function public.fn_audit();
create trigger trg_audit_member_roles      after insert or update on public.member_access_roles  for each row execute function public.fn_audit();
create trigger trg_audit_classifications   after insert or update on public.classifications      for each row execute function public.fn_audit();
create trigger trg_audit_member_classif    after insert or update or delete on public.member_classifications for each row execute function public.fn_audit();
create trigger trg_audit_org_settings      after insert or update on public.org_settings         for each row execute function public.fn_audit();

-- ───────────── defaults genéricos de uma organização nova ─────────────
create or replace function public.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  insert into public.access_roles (organization_id, key, name, rank, is_system) values
    (p_org, 'direcao',    'Direção',    40, true),
    (p_org, 'professor',  'Professor',  30, true),
    (p_org, 'monitor',    'Monitor',    20, true),
    (p_org, 'integrante', 'Integrante', 10, true)
  on conflict (organization_id, key) do nothing;

  insert into public.classifications (organization_id, key, name, sort_order) values
    (p_org, 'aluno',     'Aluno',     1),
    (p_org, 'musico',    'Músico',    2),
    (p_org, 'monitor',   'Monitor',   3),
    (p_org, 'professor', 'Professor', 4),
    (p_org, 'diretor',   'Diretor',   5),
    (p_org, 'senior',    'Senior',    6)
  on conflict (organization_id, key) do nothing;

  -- Direção: todas as permissões, escopo organização.
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, p.key, 'org' from public.access_roles ar cross join public.permissions p
  where ar.organization_id = p_org and ar.key = 'direcao'
  on conflict do nothing;

  -- Demais papéis (matriz E da proposta).
  for r in
    select * from (values
      ('professor','members.read','group'), ('professor','member_cycles.read','group'),
      ('professor','member_cycles.manage','group'), ('professor','capacity.read','org'),
      ('professor','events.read','org'), ('professor','events.manage','group'),
      ('professor','attendance.read','group'), ('professor','attendance.record','group'),
      ('professor','repertoire.read','org'), ('professor','billing.read','own'),
      ('professor','staff_payments.read','own'), ('professor','pix.manage','own'),
      ('monitor','members.read','group'), ('monitor','member_cycles.read','group'),
      ('monitor','member_cycles.manage','group'), ('monitor','capacity.read','group'),
      ('monitor','events.read','org'), ('monitor','attendance.read','group'),
      ('monitor','attendance.record','group'), ('monitor','repertoire.read','org'),
      ('monitor','billing.read','own'), ('monitor','staff_payments.read','own'),
      ('monitor','pix.manage','own'),
      ('integrante','members.read','own'), ('integrante','events.read','org'),
      ('integrante','attendance.read','own'), ('integrante','repertoire.read','org'),
      ('integrante','billing.read','own')
    ) as t(role_key, perm, scope)
  loop
    insert into public.role_permissions (access_role_id, permission_key, scope)
    select ar.id, r.perm, r.scope::public.permission_scope
    from public.access_roles ar where ar.organization_id = p_org and ar.key = r.role_key
    on conflict do nothing;
  end loop;

  insert into public.org_settings (organization_id, key, value) values
    (p_org, 'member_directory_visibility', '"all_members"'::jsonb),
    (p_org, 'billing_due_day', '10'::jsonb),
    (p_org, 'minimum_member_age', '18'::jsonb)
  on conflict do nothing;
end $$;
revoke all on function public.seed_org_defaults(uuid) from public, anon, authenticated;

-- Cria o primeiro diretor de uma organização (executar como postgres/service role).
create or replace function public.bootstrap_first_director(p_org_slug text, p_email text, p_full_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_user uuid; v_member uuid; v_role uuid;
begin
  select id into v_org from public.organizations where slug = p_org_slug;
  if v_org is null then raise exception 'Organização não encontrada: %', p_org_slug; end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);

  insert into public.members (organization_id, user_id, full_name, email)
  values (v_org, v_user, p_full_name, lower(p_email))
  returning id into v_member;

  select id into v_role from public.access_roles where organization_id = v_org and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
  values (v_org, v_member, v_role);
  return v_member;
end $$;
revoke all on function public.bootstrap_first_director(text, text, text) from public, anon, authenticated;

-- ───────────── RPCs expostas ao app ─────────────
-- Identidade pública (tela de login), sem expor nada além do necessário.
create or replace function public.get_public_org(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', o.name, 'short_name', o.short_name, 'slug', o.slug,
                            'logo_path', o.logo_path, 'theme', o.theme)
  from public.organizations o where o.slug = p_slug and o.is_active
$$;
revoke all on function public.get_public_org(text) from public;
grant execute on function public.get_public_org(text) to anon, authenticated;

-- Organizações do usuário logado + papéis + permissões efetivas.
create or replace function public.get_my_memberships() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
    'logo_path', o.logo_path, 'theme', o.theme, 'timezone', o.timezone,
    'member_id', m.id, 'display_name', coalesce(m.display_name, m.full_name),
    'roles', coalesce((
      select jsonb_agg(ar.key order by ar.rank desc)
      from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
      where mar.member_id = m.id and mar.revoked_at is null), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.k, 'scope', x.s::text))
      from (select rp.permission_key k, max(rp.scope) s
            from public.member_access_roles mar
            join public.role_permissions rp on rp.access_role_id = mar.access_role_id
            where mar.member_id = m.id and mar.revoked_at is null
            group by rp.permission_key) x), '[]'::jsonb)
  )), '[]'::jsonb)
  from public.members m
  join public.organizations o on o.id = m.organization_id and o.is_active
  where m.user_id = auth.uid() and m.archived_at is null
$$;
revoke all on function public.get_my_memberships() from public, anon;
grant execute on function public.get_my_memberships() to authenticated;

-- Direção gera convite; o token em texto puro é devolvido uma única vez.
create or replace function public.create_member_invite(p_member uuid, p_ttl_days int default 7) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.members; v_token text;
begin
  select * into v_m from public.members where id = p_member;
  if v_m.id is null or not public.has_permission(v_m.organization_id, 'members.manage') then
    raise exception 'Sem permissão para convidar este integrante.' using errcode = '42501';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.member_invites (organization_id, member_id, email, token_hash, expires_at, invited_by)
  values (v_m.organization_id, v_m.id, v_m.email, sha256(convert_to(v_token, 'UTF8')),
          now() + make_interval(days => p_ttl_days), auth.uid());
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
  values (v_m.organization_id, auth.uid(), public.current_member_id(v_m.organization_id),
          'invite_created', 'members', v_m.id::text);
  return v_token;
end $$;
revoke all on function public.create_member_invite(uuid, int) from public, anon;
grant execute on function public.create_member_invite(uuid, int) to authenticated;

-- Usuário logado (e-mail verificado) vincula sua conta ao cadastro existente.
create or replace function public.claim_member(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.member_invites; v_email text; v_verified boolean;
begin
  if auth.uid() is null then raise exception 'Faça login para aceitar o convite.' using errcode = '42501'; end if;
  select email, (email_confirmed_at is not null) into v_email, v_verified from auth.users where id = auth.uid();
  if not coalesce(v_verified, false) then
    raise exception 'Verifique seu e-mail antes de aceitar o convite.' using errcode = '42501';
  end if;

  select * into v_inv from public.member_invites
  where token_hash = sha256(convert_to(p_token, 'UTF8')) and accepted_at is null and expires_at > now()
  for update;
  if v_inv.id is null then raise exception 'Convite inválido ou expirado.' using errcode = 'P0002'; end if;
  if v_inv.email is not null and lower(v_inv.email) <> lower(v_email) then
    raise exception 'Este convite foi emitido para outro e-mail.' using errcode = '42501';
  end if;
  if exists (select 1 from public.members where organization_id = v_inv.organization_id
             and user_id = auth.uid() and id <> v_inv.member_id) then
    raise exception 'Sua conta já está vinculada a outro cadastro desta organização.' using errcode = '23505';
  end if;

  update public.members set user_id = auth.uid()
  where id = v_inv.member_id and user_id is null;
  if not found then raise exception 'Este cadastro já possui uma conta vinculada.' using errcode = '23505'; end if;

  update public.member_invites set accepted_at = now() where id = v_inv.id;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
  values (v_inv.organization_id, auth.uid(), v_inv.member_id, 'invite_claimed', 'members', v_inv.member_id::text);
  return v_inv.member_id;
end $$;
revoke all on function public.claim_member(text) from public, anon;
grant execute on function public.claim_member(text) to authenticated;

-- Autoedição do integrante: somente campos não administrativos (nada de e-mail, papéis, datas de inscrição).
create or replace function public.update_my_profile(p_member uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_self(p_member) then
    raise exception 'Você só pode editar o seu próprio cadastro.' using errcode = '42501';
  end if;
  update public.members set
    display_name        = case when p_patch ? 'display_name'        then nullif(trim(p_patch ->> 'display_name'), '') else display_name end,
    phone               = case when p_patch ? 'phone'               then nullif(trim(p_patch ->> 'phone'), '') else phone end,
    social_handle       = case when p_patch ? 'social_handle'       then nullif(trim(p_patch ->> 'social_handle'), '') else social_handle end,
    affective_relation  = case when p_patch ? 'affective_relation'  then nullif(trim(p_patch ->> 'affective_relation'), '') else affective_relation end,
    played_other_blocks = case when p_patch ? 'played_other_blocks' then (p_patch ->> 'played_other_blocks')::boolean else played_other_blocks end,
    other_blocks        = case when p_patch ? 'other_blocks'        then nullif(trim(p_patch ->> 'other_blocks'), '') else other_blocks end
  where id = p_member;
end $$;
revoke all on function public.update_my_profile(uuid, jsonb) from public, anon;
grant execute on function public.update_my_profile(uuid, jsonb) to authenticated;

-- Registra a LEITURA de dado sensível por terceiros (chamar antes de exibir na UI).
create or replace function public.log_sensitive_access(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null or public.is_self(p_member) then return; end if;
  if not public.has_permission(v_org, 'members.sensitive.read') then
    raise exception 'Sem permissão para dados sensíveis.' using errcode = '42501';
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id)
  values (v_org, auth.uid(), public.current_member_id(v_org), 'sensitive_read', 'member_sensitive_data', p_member::text);
end $$;
revoke all on function public.log_sensitive_access(uuid) from public, anon;
grant execute on function public.log_sensitive_access(uuid) to authenticated;

-- Diretório mínimo (nome de exibição) conforme configuração da organização.
create view public.v_member_directory with (security_barrier = true) as
  select m.id, m.organization_id, coalesce(m.display_name, m.full_name) as display_name
  from public.members m
  where m.archived_at is null
    and public.is_org_member(m.organization_id)
    and coalesce((select s.value #>> '{}' from public.org_settings s
                  where s.organization_id = m.organization_id and s.key = 'member_directory_visibility'),
                 'all_members') = 'all_members';
revoke all on public.v_member_directory from public, anon;
grant select on public.v_member_directory to authenticated;
-- SIGBloco · Fase 1 · Row Level Security
-- Regras: RLS ligado em todas as tabelas; sem DELETE físico; escrita sempre via permissão do catálogo.
-- anon não acessa nada (exceto RPC get_public_org). Documentação: docs/RLS.md

alter table public.organizations          enable row level security;
alter table public.members                enable row level security;
alter table public.member_sensitive_data  enable row level security;
alter table public.permissions            enable row level security;
alter table public.access_roles           enable row level security;
alter table public.role_permissions       enable row level security;
alter table public.member_access_roles    enable row level security;
alter table public.classifications        enable row level security;
alter table public.member_classifications enable row level security;
alter table public.member_invites         enable row level security;
alter table public.org_settings           enable row level security;
alter table public.consent_records        enable row level security;
alter table public.audit_logs             enable row level security;

-- Menor privilégio: nenhum acesso por padrão; concede-se apenas o necessário.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.members, public.member_sensitive_data, public.permissions,
  public.access_roles, public.role_permissions, public.member_access_roles, public.classifications,
  public.member_classifications, public.member_invites, public.org_settings, public.consent_records,
  public.audit_logs to authenticated;
grant insert, update on public.members, public.member_sensitive_data, public.access_roles,
  public.member_access_roles, public.classifications, public.org_settings to authenticated;
grant update on public.organizations to authenticated;
grant insert, update, delete on public.role_permissions, public.member_classifications to authenticated;
grant insert, update on public.member_invites to authenticated;
grant insert, update on public.consent_records to authenticated;
grant select on public.v_member_directory to authenticated;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_permission(id, 'org.manage')) with check (public.has_permission(id, 'org.manage'));

-- members: leitura por escopo (org / grupo / próprio); escrita só com members.manage.
-- Autoedição do integrante acontece exclusivamente via RPC update_my_profile.
create policy members_select on public.members for select to authenticated
  using (public.is_org_member(organization_id) and public.can_read_member(organization_id, id));
create policy members_insert on public.members for insert to authenticated
  with check (public.has_permission(organization_id, 'members.manage'));
create policy members_update on public.members for update to authenticated
  using (public.has_permission(organization_id, 'members.manage'))
  with check (public.has_permission(organization_id, 'members.manage'));

-- dados sensíveis: somente o próprio titular e quem tem permissão específica (Direção).
create policy msd_select on public.member_sensitive_data for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'members.sensitive.read'));
create policy msd_insert on public.member_sensitive_data for insert to authenticated
  with check (public.is_self(member_id) or public.has_permission(organization_id, 'members.sensitive.manage'));
create policy msd_update on public.member_sensitive_data for update to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'members.sensitive.manage'))
  with check (public.is_self(member_id) or public.has_permission(organization_id, 'members.sensitive.manage'));

-- catálogo de permissões: leitura para autenticados (dado de referência)
create policy permissions_select on public.permissions for select to authenticated using (true);

-- papéis e permissões
create policy roles_select on public.access_roles for select to authenticated
  using (public.is_org_member(organization_id));
create policy roles_insert on public.access_roles for insert to authenticated
  with check (public.has_permission(organization_id, 'roles.manage'));
create policy roles_update on public.access_roles for update to authenticated
  using (public.has_permission(organization_id, 'roles.manage') and not is_system)
  with check (public.has_permission(organization_id, 'roles.manage'));

create policy role_perms_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.access_roles r
                 where r.id = access_role_id and public.is_org_member(r.organization_id)));
create policy role_perms_write on public.role_permissions for all to authenticated
  using (exists (select 1 from public.access_roles r
                 where r.id = access_role_id and public.has_permission(r.organization_id, 'roles.manage')))
  with check (exists (select 1 from public.access_roles r
                      where r.id = access_role_id and public.has_permission(r.organization_id, 'roles.manage')));

create policy member_roles_select on public.member_access_roles for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'roles.manage'));
create policy member_roles_insert on public.member_access_roles for insert to authenticated
  with check (public.has_permission(organization_id, 'roles.manage'));
create policy member_roles_update on public.member_access_roles for update to authenticated
  using (public.has_permission(organization_id, 'roles.manage'))
  with check (public.has_permission(organization_id, 'roles.manage'));

-- classificações
create policy classif_select on public.classifications for select to authenticated
  using (public.is_org_member(organization_id));
create policy classif_insert on public.classifications for insert to authenticated
  with check (public.has_permission(organization_id, 'settings.manage'));
create policy classif_update on public.classifications for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage'))
  with check (public.has_permission(organization_id, 'settings.manage'));

create policy member_classif_select on public.member_classifications for select to authenticated
  using (public.can_read_member(organization_id, member_id));
create policy member_classif_write on public.member_classifications for all to authenticated
  using (public.has_permission(organization_id, 'members.manage'))
  with check (public.has_permission(organization_id, 'members.manage'));

-- convites e consentimento
create policy invites_select on public.member_invites for select to authenticated
  using (public.has_permission(organization_id, 'members.manage'));
create policy invites_write on public.member_invites for all to authenticated
  using (public.has_permission(organization_id, 'members.manage'))
  with check (public.has_permission(organization_id, 'members.manage'));

create policy consent_select on public.consent_records for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
create policy consent_insert on public.consent_records for insert to authenticated
  with check (public.is_self(member_id) or public.has_permission(organization_id, 'members.manage'));
create policy consent_update on public.consent_records for update to authenticated
  using (public.is_self(member_id)) with check (public.is_self(member_id));

-- configurações
create policy settings_select on public.org_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy settings_insert on public.org_settings for insert to authenticated
  with check (public.has_permission(organization_id, 'settings.manage'));
create policy settings_update on public.org_settings for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage'))
  with check (public.has_permission(organization_id, 'settings.manage'));

-- auditoria: leitura só Direção; escrita apenas por triggers/RPC (security definer); imutável.
create policy audit_select on public.audit_logs for select to authenticated
  using (public.has_permission(organization_id, 'audit.read'));
-- Dados da INSTÂNCIA Cordão da Tia Juca. Único lugar com nome/identidade específicos.
-- Executar após as migrations. Depois, criar o primeiro diretor:
--   select public.bootstrap_first_director('tiajuca', 'email@exemplo.com', 'Nome Completo');
-- (a conta precisa existir em auth.users para o vínculo automático; senão vincule por convite.)

with org as (
  insert into public.organizations (name, short_name, slug, theme, timezone)
  values (
    'Cordão da Tia Juca', 'Tia Juca', 'tiajuca',
    '{"primary":"#E93D2B","primaryForeground":"#FFFFFF","secondary":"#DEE33B","secondaryForeground":"#2B2B14"}'::jsonb,
    'America/Sao_Paulo'
  )
  on conflict (slug) do update set name = excluded.name
  returning id
)
select public.seed_org_defaults(id) from org;
