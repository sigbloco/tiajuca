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
