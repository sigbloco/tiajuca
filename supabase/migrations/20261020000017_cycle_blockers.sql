-- O que impede excluir um ciclo (para o app explicar) e a exclusão completa, com tudo que depende dele. Só quem gerencia ciclos.
create or replace function public.cycle_blockers(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.cycles where id = p_cycle;
  if v_org is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'cycles.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'participations', (select count(*) from public.member_cycles where cycle_id = p_cycle),
    'events', (select count(*) from public.activities where cycle_id = p_cycle),
    'attendance', (select count(*) from public.event_attendance ea join public.activities a on a.id = ea.activity_id where a.cycle_id = p_cycle),
    'forms', (select count(*) from public.forms where cycle_id = p_cycle),
    'submissions', (select count(*) from public.form_submissions s join public.forms f on f.id = s.form_id where f.cycle_id = p_cycle),
    'capacity', (select count(*) from public.instrument_cycle_capacity where cycle_id = p_cycle),
    'reactivations', (select count(*) from public.reactivation_requests where cycle_id = p_cycle));
end $$;
revoke all on function public.cycle_blockers(uuid) from public, anon;
grant execute on function public.cycle_blockers(uuid) to authenticated;

create or replace function public.delete_cycle_cascade(p_cycle uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.cycles where id = p_cycle;
  if v_org is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, 'cycles.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  delete from public.event_attendance where activity_id in (select id from public.activities where cycle_id = p_cycle);
  delete from public.activity_checklist_items where activity_id in (select id from public.activities where cycle_id = p_cycle);
  delete from public.activities where cycle_id = p_cycle;
  delete from public.form_submissions where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.form_fields where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.form_versions where form_id in (select id from public.forms where cycle_id = p_cycle);
  delete from public.forms where cycle_id = p_cycle;
  delete from public.instrument_cycle_capacity where cycle_id = p_cycle;
  delete from public.reactivation_requests where cycle_id = p_cycle;
  delete from public.member_cycle_status_history where member_cycle_id in (select id from public.member_cycles where cycle_id = p_cycle);
  delete from public.member_cycles where cycle_id = p_cycle;
  delete from public.cycles where id = p_cycle;
end $$;
revoke all on function public.delete_cycle_cascade(uuid) from public, anon;
grant execute on function public.delete_cycle_cascade(uuid) to authenticated;
