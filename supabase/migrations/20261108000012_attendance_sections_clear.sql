-- Chamada: (1) a lista passa a informar o(s) naipe(s) de cada pessoa, para filtrar; (2) clear_attendance desmarca um registro.
drop function if exists public.get_attendance_roster(uuid);
create or replace function public.get_attendance_roster(p_activity uuid)
returns table (member_id uuid, display_name text, instruments text, status_id uuid, notes text, is_off_roster boolean, sections text)
language plpgsql stable security definer set search_path = '' as $$
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
            join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
            where mc.member_id = m.id and mc.cycle_id = v_cycle))
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
         ea.status_id, ea.notes, p.off,
         (select string_agg(distinct sec.name, ', ')
            from public.member_artistic_links l
            join public.instruments i on i.id = l.instrument_id
            join public.sections sec on sec.id = i.section_id
           where l.member_id = m.id and l.ended_at is null)
  from picked p
  join public.members m on m.id = p.mid
  left join public.event_attendance ea on ea.activity_id = p_activity and ea.member_id = m.id
  where v_scope = 'org' or public.is_in_my_group(v_a.organization_id, m.id)
  order by 2;
end $$;
revoke all on function public.get_attendance_roster(uuid) from public, anon;
grant execute on function public.get_attendance_roster(uuid) to authenticated;

-- Desmarca a presença (remove o registro); mesmas regras de permissão do set_attendance.
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
