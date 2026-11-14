-- Apaga um evento avulso. Com presença registrada ou gerado por recorrência, não apaga (use Cancelar, que mantém o histórico).
create or replace function public.delete_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar este evento.' using errcode = '42501';
  end if;
  if a.recurrence_rule_id is not null then
    raise exception 'Este evento vem de uma recorrência: use Cancelar (ou apague a recorrência).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_attendance ea where ea.activity_id = a.id) then
    raise exception 'Este evento tem presença registrada: use Cancelar para manter o histórico.' using errcode = 'P0001';
  end if;
  delete from public.activities where id = a.id;
end $$;
revoke all on function public.delete_activity(uuid) from public, anon;
grant execute on function public.delete_activity(uuid) to authenticated;
