-- Trazida do banco (DRIFT-01): aplicada pelo editor em 15/11/2026 sem arquivo no repositório.
create or replace function public._att_base(p_org uuid, p_from date, p_to date)
returns table (member_id uuid, activity_id uuid, activity_date date, start_time time, cycle_id uuid, title text, present boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column

declare v_scope text;
begin
  v_scope := public.permission_scope_of(p_org, 'attendance.read')::text;
  if v_scope is null or v_scope = 'own' then
    raise exception 'Sem permissão para relatórios de presença.' using errcode = '42501';
  end if;
  return query
  select ea.member_id, a.id, a.activity_date, a.start_time, a.cycle_id, a.title, st.counts_as_present
  from public.event_attendance ea
  join public.members mm on mm.id = ea.member_id and mm.archived_at is null
  join public.activities a on a.id = ea.activity_id and a.status <> 'cancelled' and a.activity_date between p_from and p_to
  join public.attendance_statuses st on st.id = ea.status_id
  where ea.organization_id = p_org and (v_scope = 'org' or public.is_in_my_group(p_org, ea.member_id));
end $$;
revoke all on function public._att_base(uuid, date, date) from public, anon, authenticated;
