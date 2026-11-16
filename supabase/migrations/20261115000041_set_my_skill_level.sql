-- A pessoa informa/atualiza o próprio nível no instrumento (autodeclarado), sem pedir à direção.
create or replace function public.set_my_skill_level(p_link uuid, p_level uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.member_artistic_links;
begin
  select * into l from public.member_artistic_links where id = p_link and ended_at is null and instrument_id is not null;
  if l.id is null then raise exception 'Vínculo não encontrado.' using errcode = 'P0002'; end if;
  if l.member_id is distinct from public.current_member_id(l.organization_id) and not public.has_permission(l.organization_id, 'members.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_level is not null and not exists (select 1 from public.skill_levels where id = p_level and organization_id = l.organization_id) then
    raise exception 'Nível inválido.' using errcode = 'P0002';
  end if;
  update public.member_artistic_links set skill_level_id = p_level where id = l.id;
end $$;
revoke all on function public.set_my_skill_level(uuid, uuid) from public, anon;
grant execute on function public.set_my_skill_level(uuid, uuid) to authenticated;
