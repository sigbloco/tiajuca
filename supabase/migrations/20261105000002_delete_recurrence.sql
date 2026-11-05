-- Apaga a recorrência: remove os eventos gerados sem presença registrada e desvincula os que têm presença (histórico).
create or replace function public.delete_recurrence(p_rule uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; n int;
begin
  select * into r from public.recurrence_rules where id = p_rule;
  if r.id is null or not public.has_permission(r.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar esta recorrência.' using errcode = '42501';
  end if;
  delete from public.activities a
   where a.recurrence_rule_id = p_rule
     and not exists (select 1 from public.event_attendance ea where ea.activity_id = a.id);
  get diagnostics n = row_count;
  update public.activities set recurrence_rule_id = null where recurrence_rule_id = p_rule;
  delete from public.recurrence_rules where id = p_rule;
  return n;
end $$;
revoke all on function public.delete_recurrence(uuid) from public, anon;
grant execute on function public.delete_recurrence(uuid) to authenticated;
