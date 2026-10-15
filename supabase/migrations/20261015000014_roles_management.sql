-- SIGBloco · Gestão de papéis de acesso (conceder/revogar) com proteção do ÚLTIMO diretor.
-- A proteção é dupla: nas RPCs (mensagem amigável) e em gatilhos (ninguém contorna pela API/REST).

-- Quantos diretores ativos a organização tem, opcionalmente ignorando um membro.
create or replace function public.active_director_count(p_org uuid, p_except_member uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct mar.member_id)::int
  from public.member_access_roles mar
  join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'direcao'
  join public.members m on m.id = mar.member_id and m.archived_at is null
  where mar.organization_id = p_org and mar.revoked_at is null
    and (p_except_member is null or mar.member_id <> p_except_member)
$$;
revoke all on function public.active_director_count(uuid, uuid) from public, anon, authenticated;

-- Gatilho 1: revogar o papel Direção do último diretor.
create or replace function public.guard_last_director_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if old.revoked_at is null and new.revoked_at is not null then
    select key into v_key from public.access_roles where id = old.access_role_id;
    if v_key = 'direcao' and public.active_director_count(old.organization_id, old.member_id) = 0 then
      raise exception 'Não é possível remover o último diretor. Conceda o papel Direção a outra pessoa primeiro.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_last_director_role before update on public.member_access_roles
  for each row execute function public.guard_last_director_role();

-- Gatilho 2: arquivar o cadastro do último diretor.
create or replace function public.guard_last_director_archive() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null
     and exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id and ar.key = 'direcao'
                 where mar.member_id = old.id and mar.revoked_at is null)
     and public.active_director_count(old.organization_id, old.id) = 0 then
    raise exception 'Não é possível arquivar o último diretor. Conceda o papel Direção a outra pessoa primeiro.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_guard_last_director_archive before update of archived_at on public.members
  for each row execute function public.guard_last_director_archive();

create or replace function public.grant_access_role(p_member uuid, p_role_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_role uuid;
begin
  select organization_id into v_org from public.members where id = p_member and archived_at is null;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'roles.manage') then raise exception 'Sem permissão para conceder papéis.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = v_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.member_access_roles where member_id = p_member and access_role_id = v_role and revoked_at is null) then return; end if;
  insert into public.member_access_roles (organization_id, member_id, access_role_id, granted_by) values (v_org, p_member, v_role, auth.uid());
end $$;
revoke all on function public.grant_access_role(uuid, text) from public, anon;
grant execute on function public.grant_access_role(uuid, text) to authenticated;

create or replace function public.revoke_access_role(p_member uuid, p_role_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_role uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'roles.manage') then raise exception 'Sem permissão para revogar papéis.' using errcode = '42501'; end if;
  select id into v_role from public.access_roles where organization_id = v_org and key = p_role_key;
  if v_role is null then raise exception 'Papel inválido.' using errcode = 'P0002'; end if;
  update public.member_access_roles set revoked_at = now() where member_id = p_member and access_role_id = v_role and revoked_at is null;
end $$;
revoke all on function public.revoke_access_role(uuid, text) from public, anon;
grant execute on function public.revoke_access_role(uuid, text) to authenticated;
