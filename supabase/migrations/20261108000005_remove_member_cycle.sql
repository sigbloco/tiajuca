-- Tira a pessoa de um ciclo (apaga só o registro de participação no ciclo; vínculos artísticos, categoria e bolsa não são tocados).
create or replace function public.remove_member_cycle(p_member uuid, p_cycle uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_allowed boolean;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  v_allowed := public.has_permission(v_org, 'member_cycles.manage')
    or (coalesce(public.permission_scope_of(v_org, 'member_cycles.manage') = 'group', false) and public.is_in_my_group(v_org, p_member));
  if not coalesce(v_allowed, false) then raise exception 'Você não tem permissão para alterar este ciclo.' using errcode = '42501'; end if;
  delete from public.member_cycles where member_id = p_member and cycle_id = p_cycle and organization_id = v_org;
end $$;
revoke all on function public.remove_member_cycle(uuid, uuid) from public, anon;
grant execute on function public.remove_member_cycle(uuid, uuid) to authenticated;
