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
