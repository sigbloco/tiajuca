-- Quem pode registrar a presença de quem:
--  • professor (do ciclo atual): qualquer naipe/subnaipe;
--  • monitor: qualquer integrante do naipe "mãe" do seu vínculo (todos os subnaipes/instrumentos dele);
--  • demais com escopo de grupo: como antes (is_in_my_group).
create or replace function public.can_record_attendance_for(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.staff_assignments sa
      where sa.organization_id = p_org and sa.member_id = public.current_member_id(p_org)
        and sa.staff_kind = 'professor' and (sa.valid_to is null or sa.valid_to >= current_date)
        and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1))
    or exists (
      select 1 from public.staff_assignments sa
      left join public.subsections ss on ss.id = sa.subsection_id
      left join public.instruments si on si.id = sa.instrument_id
      join public.member_artistic_links l on l.member_id = p_member and l.ended_at is null
      join public.instruments i on i.id = l.instrument_id
      where sa.organization_id = p_org and sa.member_id = public.current_member_id(p_org)
        and sa.staff_kind = 'monitor' and (sa.valid_to is null or sa.valid_to >= current_date)
        and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1)
        and i.section_id = coalesce(sa.section_id, ss.section_id, si.section_id))
    or public.is_in_my_group(p_org, p_member)
$$;
revoke all on function public.can_record_attendance_for(uuid, uuid) from public, anon;
grant execute on function public.can_record_attendance_for(uuid, uuid) to authenticated;

-- Inativar alguém não muda o passado: a chamada de uma atividade continua incluindo quem
-- ficou inativo DEPOIS dela (member_cycles.left_on = dia em que ficou inativo).
create or replace function public.get_attendance_roster(p_activity uuid)
 returns table(member_id uuid, display_name text, instruments text, status_id uuid, notes text, is_off_roster boolean)
 language plpgsql stable security definer set search_path to ''
as $function$
#variable_conflict use_column
declare v_a public.activities; v_cycle uuid; v_scope text; v_has_aud boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  if v_scope is null or v_scope = 'own' then
    raise exception 'Sem permissão para a chamada.' using errcode = '42501';
  end if;
  v_cycle := coalesce(v_a.cycle_id, (
    select cy.id from public.cycles cy
     where cy.organization_id = v_a.organization_id and cy.is_active and v_a.activity_date between cy.starts_on and cy.ends_on
     order by cy.is_current desc, cy.starts_on desc limit 1));
  v_has_aud := exists (select 1 from public.activity_audiences au where au.activity_id = p_activity);

  return query
  with eligible as (
    select m.id as mid from public.members m
    where m.organization_id = v_a.organization_id and m.archived_at is null
      and (v_cycle is null or exists (
            select 1 from public.member_cycles mc
            join public.member_cycle_statuses s on s.id = mc.status_id
            where mc.member_id = m.id and mc.cycle_id = v_cycle
              and (s.counts_as_active
                   or (not s.is_waitlist and mc.left_on is not null and v_a.activity_date <= mc.left_on))))
      and (not v_has_aud or exists (
            select 1 from public.activity_audiences au
            where au.activity_id = p_activity and (
                 (au.kind = 'member' and au.ref_id = m.id)
              or (au.kind = 'classification' and exists (
                    select 1 from public.member_classifications mcl
                    where mcl.member_id = m.id and mcl.classification_id = au.ref_id))
              or (au.kind in ('section', 'subsection', 'instrument') and exists (
                    select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
                    where l.member_id = m.id and l.ended_at is null
                      and ((au.kind = 'instrument' and i.id = au.ref_id)
                        or (au.kind = 'subsection' and i.subsection_id = au.ref_id)
                        or (au.kind = 'section' and i.section_id = au.ref_id)))))))
  ), picked as (
    select e.mid, false as off from eligible e
    union
    select ea.member_id, true from public.event_attendance ea
     where ea.activity_id = p_activity and ea.member_id not in (select e2.mid from eligible e2)
  )
  select m.id, coalesce(m.display_name, m.full_name),
         (select string_agg(i.name, ', ' order by i.name)
            from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
           where l.member_id = m.id and l.ended_at is null),
         ea.status_id, ea.notes, p.off
  from picked p
  join public.members m on m.id = p.mid
  left join public.event_attendance ea on ea.activity_id = p_activity and ea.member_id = m.id
  where v_scope = 'org' or public.can_record_attendance_for(v_a.organization_id, m.id)
  order by 2;
end $function$;

create or replace function public.clear_attendance(p_activity uuid, p_member uuid) returns void
language plpgsql security definer set search_path to '' as $function$
declare v_a public.activities; v_scope text; v_allowed boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  v_allowed := v_scope = 'org' or (v_scope = 'group' and public.can_record_attendance_for(v_a.organization_id, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para registrar esta presença.' using errcode = '42501';
  end if;
  if v_a.status = 'cancelled' then raise exception 'Este evento foi cancelado.' using errcode = 'P0001'; end if;
  delete from public.event_attendance where activity_id = p_activity and member_id = p_member;
end $function$;

create or replace function public.set_attendance(p_activity uuid, p_member uuid, p_status_key text, p_notes text default null) returns void
language plpgsql security definer set search_path to '' as $function$
declare v_a public.activities; v_status uuid; v_scope text; v_allowed boolean; v_cycle uuid; v_off boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.members where id = p_member and organization_id = v_a.organization_id) then
    raise exception 'Integrante não encontrado.' using errcode = 'P0002';
  end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  v_allowed := v_scope = 'org' or (v_scope = 'group' and public.can_record_attendance_for(v_a.organization_id, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para registrar esta presença.' using errcode = '42501';
  end if;
  if v_a.status = 'cancelled' then raise exception 'Este evento foi cancelado.' using errcode = 'P0001'; end if;
  select id into v_status from public.attendance_statuses
   where organization_id = v_a.organization_id and key = p_status_key and is_active;
  if v_status is null then raise exception 'Status de presença inválido.' using errcode = 'P0002'; end if;

  v_cycle := coalesce(v_a.cycle_id, (
    select cy.id from public.cycles cy
     where cy.organization_id = v_a.organization_id and cy.is_active and v_a.activity_date between cy.starts_on and cy.ends_on
     order by cy.is_current desc, cy.starts_on desc limit 1));
  v_off := v_cycle is not null and not exists (
    select 1 from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
    where mc.member_id = p_member and mc.cycle_id = v_cycle);

  insert into public.event_attendance (organization_id, activity_id, member_id, status_id, notes, is_off_roster, recorded_by)
  values (v_a.organization_id, p_activity, p_member, v_status, p_notes, v_off, public.current_member_id(v_a.organization_id))
  on conflict (activity_id, member_id) do update set
    status_id = excluded.status_id,
    notes = coalesce(excluded.notes, public.event_attendance.notes),
    recorded_by = excluded.recorded_by, recorded_at = now();
end $function$;
