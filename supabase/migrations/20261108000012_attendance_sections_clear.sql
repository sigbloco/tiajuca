-- Chamada: clear_attendance desmarca um registro (a escrita direta na tabela é bloqueada pelo RLS).
create or replace function public.clear_attendance(p_activity uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_a public.activities; v_scope text; v_allowed boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  v_allowed := v_scope = 'org' or (v_scope = 'group' and public.is_in_my_group(v_a.organization_id, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para registrar esta presença.' using errcode = '42501';
  end if;
  if v_a.status = 'cancelled' then raise exception 'Este evento foi cancelado.' using errcode = 'P0001'; end if;
  delete from public.event_attendance where activity_id = p_activity and member_id = p_member;
end $$;
revoke all on function public.clear_attendance(uuid, uuid) from public, anon;
grant execute on function public.clear_attendance(uuid, uuid) to authenticated;
