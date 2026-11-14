-- Eventos: apagar manda para a lixeira (deleted_at); da lixeira dá para restaurar ou excluir de vez.
alter table public.activities add column if not exists deleted_at timestamptz;

create or replace function public.trash_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar este evento.' using errcode = '42501';
  end if;
  if exists (select 1 from public.event_attendance ea where ea.activity_id = a.id) then
    raise exception 'Este evento tem presença registrada: use Cancelar para manter o histórico.' using errcode = 'P0001';
  end if;
  update public.activities set deleted_at = now() where id = a.id;
end $$;

create or replace function public.restore_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para restaurar este evento.' using errcode = '42501';
  end if;
  update public.activities set deleted_at = null where id = a.id;
end $$;

-- Excluir de vez: só da lixeira. Evento gerado por recorrência fica na lixeira (apagar de vez faria a recorrência recriá-lo).
create or replace function public.delete_activity(p_activity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para apagar este evento.' using errcode = '42501';
  end if;
  if a.deleted_at is null then
    raise exception 'Mande o evento para a lixeira antes de excluir de vez.' using errcode = 'P0001';
  end if;
  if a.recurrence_rule_id is not null then
    raise exception 'Este evento vem de uma recorrência: ele fica na lixeira (excluir de vez faria a recorrência recriá-lo).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_attendance ea where ea.activity_id = a.id) then
    raise exception 'Este evento tem presença registrada e não pode ser excluído de vez.' using errcode = 'P0001';
  end if;
  delete from public.activities where id = a.id;
end $$;

revoke all on function public.trash_activity(uuid) from public, anon;
revoke all on function public.restore_activity(uuid) from public, anon;
grant execute on function public.trash_activity(uuid) to authenticated;
grant execute on function public.restore_activity(uuid) to authenticated;
