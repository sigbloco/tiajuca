-- SIGBloco · Titular do bloco + edição da matriz papel × permissão.
--
-- TITULAR: papel acima da Direção, DENTRO da própria organização (não enxerga outros blocos). Quando o bloco tem um titular:
--   • só o titular concede/remove Direção; a titularidade só muda por TRANSFERÊNCIA; o titular não pode ser arquivado/removido por outros.
--   Se o bloco ainda não tem titular, a Direção segue gerindo a própria Direção (comportamento anterior).
--   Designar o primeiro titular é feito no banco (set_organization_titular), nunca pela interface.
-- MATRIZ: Direção e Titular sempre têm todas as permissões (org). Permissões críticas são exclusivas deles.
-- As proteções valem na RPC (mensagem amigável) e em gatilhos (qualquer escrita via API). Manutenção direta no banco (sem usuário) não é bloqueada.

-- ───────────── papel titular ─────────────
create or replace function public.ensure_titular_role(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.access_roles (organization_id, key, name, rank, is_system) values (p_org, 'titular', 'Titular do bloco', 50, true)
  on conflict (organization_id, key) do nothing;
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, p.key, 'org' from public.access_roles ar cross join public.permissions p where ar.organization_id = p_org and ar.key = 'titular'
  on conflict do nothing;
end $$;
revoke all on function public.ensure_titular_role(uuid) from public, anon, authenticated;

select public.ensure_titular_role(id) from public.organizations;

create or replace function public.trg_ensure_titular() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.key = 'direcao' then perform public.ensure_titular_role(new.organization_id); end if;
  return new;
end $$;
create trigger trg_access_roles_titular after insert on public.access_roles for each row execute function public.trg_ensure_titular();

-- Permissões novas do catálogo vão automaticamente para Direção e Titular.
create or replace function public.grant_new_permission_to_direction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, new.key, 'org' from public.access_roles ar where ar.key in ('direcao', 'titular')
  on conflict do nothing;
  return new;
end $$;
create trigger trg_permissions_to_direction after insert on public.permissions for each row execute function public.grant_new_permission_to_direction();

create or replace function public.has_active_titular(p_org uuid, p_except_member uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_access_roles mar
    join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
    join public.members m on m.id = mar.member_id and m.archived_at is null
    where mar.organization_id = p_org and mar.revoked_at is null and (p_except_member is null or mar.member_id <> p_except_member))
$$;
revoke all on function public.has_active_titular(uuid, uuid) from public, anon, authenticated;

create or replace function public.caller_is_titular(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_access_roles mar
    join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
    join public.members m on m.id = mar.member_id and m.archived_at is null and m.user_id = auth.uid()
    where mar.organization_id = p_org and mar.revoked_at is null)
$$;
revoke all on function public.caller_is_titular(uuid) from public, anon;
grant execute on function public.caller_is_titular(uuid) to authenticated;

-- ───────────── gatilho: Direção/Titular só mudam pelas mãos certas ─────────────
create or replace function public.guard_privileged_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_revoking boolean;
begin
  if auth.uid() is null then return new; end if;
  select key into v_key from public.access_roles where id = new.access_role_id;
  if v_key not in ('direcao', 'titular') then return new; end if;
  v_revoking := tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null;
  if tg_op = 'UPDATE' and not v_revoking then return new; end if;
  if v_key = 'titular' then
    if not public.caller_is_titular(new.organization_id) then
      raise exception 'Somente o titular do bloco pode designar ou transferir a titularidade.' using errcode = 'P0001';
    end if;
    if v_revoking and not public.has_active_titular(new.organization_id, old.member_id) then
      raise exception 'O bloco precisa ter um titular. Use a transferência de titularidade.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if public.has_active_titular(new.organization_id) and not public.caller_is_titular(new.organization_id) then
    raise exception 'Somente o titular do bloco pode conceder ou remover a Direção.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_guard_privileged_roles before insert or update on public.member_access_roles
  for each row execute function public.guard_privileged_roles();

-- ───────────── "último administrador" passa a considerar Direção e Titular ─────────────
create or replace function public.active_director_count(p_org uuid, p_except_member uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct mar.member_id)::int
  from public.member_access_roles mar
  join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('direcao', 'titular')
  join public.members m on m.id = mar.member_id and m.archived_at is null
  where mar.organization_id = p_org and mar.revoked_at is null and (p_except_member is null or mar.member_id <> p_except_member)
$$;

create or replace function public.guard_last_director_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if old.revoked_at is null and new.revoked_at is not null then
    select key into v_key from public.access_roles where id = old.access_role_id;
    if v_key in ('direcao', 'titular') and public.active_director_count(old.organization_id, old.member_id) = 0
       and not exists (select 1 from public.member_access_roles x join public.access_roles ax on ax.id = x.access_role_id and ax.key in ('direcao', 'titular')
                       where x.member_id = old.member_id and x.revoked_at is null and x.id <> old.id) then
      raise exception 'Não é possível remover o último diretor. Conceda o papel Direção a outra pessoa primeiro.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_last_director_archive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if auth.uid() is not null and exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'titular'
                                          where mar.member_id = old.id and mar.revoked_at is null) then
      raise exception 'Transfira a titularidade antes de arquivar o titular do bloco.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('direcao', 'titular')
               where mar.member_id = old.id and mar.revoked_at is null) and public.active_director_count(old.organization_id, old.id) = 0 then
      raise exception 'Não é possível arquivar o último diretor. Conceda o papel Direção a outra pessoa primeiro.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- ───────────── RPCs de papéis (com mensagens amigáveis) ─────────────
create or replace function public.grant_access_role(p_member uuid, p_role_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_role uuid;
begin
  select organization_id into v_org from public.members where id = p_member and archived_at is null;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'roles.manage') then raise exception 'Sem permissão para conceder papéis.' using errcode = '42501'; end if;
  if p_role_key = 'titular' then raise exception 'A titularidade só muda por transferência.' using errcode = 'P0001'; end if;
  if p_role_key = 'direcao' and public.has_active_titular(v_org) and not public.caller_is_titular(v_org) then
    raise exception 'Somente o titular do bloco pode conceder ou remover a Direção.' using errcode = 'P0001';
  end if;
  select id into v_role from public.access_roles where organization_id = v_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.member_access_roles where member_id = p_member and access_role_id = v_role and revoked_at is null) then return; end if;
  insert into public.member_access_roles (organization_id, member_id, access_role_id, granted_by) values (v_org, p_member, v_role, auth.uid());
end $$;

create or replace function public.revoke_access_role(p_member uuid, p_role_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_role uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'roles.manage') then raise exception 'Sem permissão para revogar papéis.' using errcode = '42501'; end if;
  if p_role_key = 'titular' then raise exception 'A titularidade só muda por transferência.' using errcode = 'P0001'; end if;
  if p_role_key = 'direcao' and public.has_active_titular(v_org) and not public.caller_is_titular(v_org) then
    raise exception 'Somente o titular do bloco pode conceder ou remover a Direção.' using errcode = 'P0001';
  end if;
  select id into v_role from public.access_roles where organization_id = v_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  update public.member_access_roles set revoked_at = now() where member_id = p_member and access_role_id = v_role and revoked_at is null;
end $$;

-- O titular passa a titularidade para outra pessoa (que precisa ter conta de acesso). Atômico.
create or replace function public.transfer_titular(p_org uuid, p_to_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role uuid; v_from uuid;
begin
  if not public.caller_is_titular(p_org) then raise exception 'Somente o titular do bloco pode transferir a titularidade.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = p_org and key = 'titular';
  if not exists (select 1 from public.members where id = p_to_member and organization_id = p_org and archived_at is null and user_id is not null) then
    raise exception 'A nova pessoa precisa estar cadastrada e ter conta de acesso vinculada.' using errcode = 'P0001';
  end if;
  select m.id into v_from from public.members m where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null;
  if v_from = p_to_member then raise exception 'Escolha outra pessoa.' using errcode = 'P0001'; end if;
  insert into public.member_access_roles (organization_id, member_id, access_role_id, granted_by) values (p_org, p_to_member, v_role, auth.uid());
  update public.member_access_roles set revoked_at = now() where member_id = v_from and access_role_id = v_role and revoked_at is null;
  insert into public.audit_logs (organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, new_data)
  values (p_org, auth.uid(), v_from, 'titular_transferred', 'member_access_roles', p_to_member::text, jsonb_build_object('to', p_to_member));
end $$;
revoke all on function public.transfer_titular(uuid, uuid) from public, anon;
grant execute on function public.transfer_titular(uuid, uuid) to authenticated;

-- Designação do PRIMEIRO titular: somente no banco (sem usuário logado). Ex.: select public.set_organization_titular('tiajuca', 'email@…');
create or replace function public.set_organization_titular(p_org_slug text, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_member uuid; v_role uuid;
begin
  if auth.uid() is not null then raise exception 'Operação restrita à administração do banco.' using errcode = '42501'; end if;
  select id into v_org from public.organizations where slug = p_org_slug;
  if v_org is null then raise exception 'Organização não encontrada: %', p_org_slug; end if;
  select m.id into v_member from public.members m join auth.users u on u.id = m.user_id
   where m.organization_id = v_org and lower(u.email) = lower(p_email) and m.archived_at is null;
  if v_member is null then raise exception 'Nenhum integrante com conta "%" nesta organização. Crie a conta e vincule o cadastro antes.', p_email; end if;
  perform public.ensure_titular_role(v_org);
  select id into v_role from public.access_roles where organization_id = v_org and key = 'titular';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
  select v_org, v_member, v_role where not exists (select 1 from public.member_access_roles where member_id = v_member and access_role_id = v_role and revoked_at is null);
  return v_member;
end $$;
revoke all on function public.set_organization_titular(text, text) from public, anon, authenticated;

-- ───────────── matriz papel × permissão ─────────────
create or replace function public.locked_permissions() returns text[]
language sql immutable set search_path = '' as $$
  select array['org.manage', 'settings.manage', 'roles.manage', 'audit.read', 'members.sensitive.read', 'members.sensitive.manage',
               'finance.read', 'finance.manage', 'billing.manage', 'scholarships.manage', 'staff_payments.manage', 'staff_assignments.manage', 'forms.manage']
$$;
grant execute on function public.locked_permissions() to authenticated;

create or replace function public.guard_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_perm text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select key into v_key from public.access_roles where id = coalesce(new.access_role_id, old.access_role_id);
  v_perm := coalesce(new.permission_key, old.permission_key);
  if tg_op = 'DELETE' then
    if v_key in ('direcao', 'titular') then raise exception 'A Direção e o Titular sempre possuem todas as permissões.' using errcode = 'P0001'; end if;
    return old;
  end if;
  if v_key in ('direcao', 'titular') and new.scope <> 'org' then
    raise exception 'A Direção e o Titular sempre possuem todas as permissões em toda a organização.' using errcode = 'P0001';
  end if;
  if v_key not in ('direcao', 'titular') and v_perm = any (public.locked_permissions()) then
    raise exception 'Esta permissão é exclusiva da Direção.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_guard_role_permissions before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_permissions();

create or replace function public.set_role_permission(p_org uuid, p_role_key text, p_permission text, p_scope text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role uuid;
begin
  if not public.has_permission(p_org, 'roles.manage') then raise exception 'Sem permissão para editar permissões.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = p_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  if p_role_key in ('direcao', 'titular') then raise exception 'A Direção e o Titular sempre possuem todas as permissões.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.permissions where key = p_permission) then raise exception 'Permissão inválida.' using errcode = 'P0002'; end if;
  if p_permission = any (public.locked_permissions()) then raise exception 'Esta permissão é exclusiva da Direção.' using errcode = 'P0001'; end if;
  if p_scope is null then
    delete from public.role_permissions where access_role_id = v_role and permission_key = p_permission;
  else
    if p_scope not in ('own', 'group', 'org') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
    insert into public.role_permissions (access_role_id, permission_key, scope) values (v_role, p_permission, p_scope::public.permission_scope)
    on conflict (access_role_id, permission_key) do update set scope = excluded.scope;
  end if;
end $$;
revoke all on function public.set_role_permission(uuid, text, text, text) from public, anon;
grant execute on function public.set_role_permission(uuid, text, text, text) to authenticated;
