-- Subnaipes (Leves, Graves, Agudos, Chocalhos, Madeiras, Metais) foram abolidos: instrumento fica direto no naipe.
-- 1) vínculos de equipe de subnaipe viram vínculo com o naipe (sem duplicar se já houver)
delete from public.staff_assignments sa using public.subsections ss
 where sa.subsection_id = ss.id
   and exists (select 1 from public.staff_assignments o
                where o.id <> sa.id and o.member_id = sa.member_id and o.staff_kind = sa.staff_kind
                  and o.section_id = ss.section_id and o.cycle_id is not distinct from sa.cycle_id and o.valid_to is null and sa.valid_to is null);
update public.staff_assignments sa set section_id = ss.section_id, subsection_id = null
  from public.subsections ss where sa.subsection_id = ss.id;
-- 2) regras de pagamento por subnaipe viram por naipe
update public.staff_pay_rules r set scope = 'section', section_id = ss.section_id, subsection_id = null
  from public.subsections ss where r.subsection_id = ss.id;
-- 3) públicos de chamada por subnaipe saem
delete from public.activity_audiences where kind = 'subsection';
update public.recurrence_rules set audiences = coalesce((select jsonb_agg(e) from jsonb_array_elements(audiences) e where e ->> 'kind' <> 'subsection'), '[]'::jsonb)
 where audiences::text like '%subsection%';

-- 4) funções sem subnaipe
create or replace function public.is_in_my_group(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.staff_assignments sa
    join public.member_artistic_links l on l.member_id = p_member and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id
    where sa.organization_id = p_org
      and sa.member_id = public.current_member_id(p_org)
      and (sa.valid_to is null or sa.valid_to >= current_date)
      and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1)
      and (sa.instrument_id = i.id or sa.section_id = i.section_id)
  )
$$;

create or replace function public.copy_cycle_setup(p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_org2 uuid;
begin
  select organization_id into v_org from public.cycles where id = p_from;
  select organization_id into v_org2 from public.cycles where id = p_to;
  if v_org is null or v_org2 is null or v_org <> v_org2 then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not (public.has_permission(v_org, 'structure.manage') and public.has_permission(v_org, 'staff_assignments.manage')) then
    raise exception 'Sem permissão para copiar a organização do ciclo.' using errcode = '42501';
  end if;
  insert into public.section_cycles (organization_id, section_id, cycle_id)
    select organization_id, section_id, p_to from public.section_cycles where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycles (organization_id, instrument_id, cycle_id)
    select organization_id, instrument_id, p_to from public.instrument_cycles where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycle_workshop (organization_id, instrument_id, cycle_id, has_workshop)
    select organization_id, instrument_id, p_to, has_workshop from public.instrument_cycle_workshop where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycle_capacity (organization_id, instrument_id, cycle_id, capacity)
    select organization_id, instrument_id, p_to, capacity from public.instrument_cycle_capacity where cycle_id = p_from on conflict do nothing;
  insert into public.staff_assignments (organization_id, member_id, staff_kind, section_id, instrument_id, cycle_id)
    select sa.organization_id, sa.member_id, sa.staff_kind, sa.section_id, sa.instrument_id, p_to
      from public.staff_assignments sa where sa.cycle_id = p_from and sa.valid_to is null on conflict do nothing;
end $$;

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
      left join public.instruments si on si.id = sa.instrument_id
      join public.member_artistic_links l on l.member_id = p_member and l.ended_at is null
      join public.instruments i on i.id = l.instrument_id
      where sa.organization_id = p_org and sa.member_id = public.current_member_id(p_org)
        and sa.staff_kind = 'monitor' and (sa.valid_to is null or sa.valid_to >= current_date)
        and sa.cycle_id = (select c.id from public.cycles c where c.organization_id = p_org and c.is_current limit 1)
        and i.section_id = coalesce(sa.section_id, si.section_id))
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
              or (au.kind in ('section', 'instrument') and exists (
                    select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id
                    where l.member_id = m.id and l.ended_at is null
                      and ((au.kind = 'instrument' and i.id = au.ref_id)
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


-- 5) estrutura: constraints, índice, colunas e a tabela
drop index if exists public.staff_assignments_active_uq;
alter table public.staff_assignments drop constraint if exists staff_assignments_check;
alter table public.staff_assignments drop constraint if exists staff_assignments_organization_id_subsection_id_fkey;
alter table public.staff_assignments drop column subsection_id;
alter table public.staff_assignments add constraint staff_assignments_check check (((section_id is not null)::int + (instrument_id is not null)::int) = 1);
create unique index staff_assignments_active_uq on public.staff_assignments (member_id, staff_kind, coalesce(section_id, instrument_id), cycle_id) where valid_to is null;

alter table public.staff_pay_rules drop constraint if exists spr_scope_ck;
alter table public.staff_pay_rules drop constraint if exists spr_target_ck;
alter table public.staff_pay_rules drop constraint if exists staff_pay_rules_organization_id_subsection_id_fkey;
alter table public.staff_pay_rules drop column subsection_id;
alter table public.staff_pay_rules add constraint spr_scope_ck check (scope in ('all', 'section', 'instrument'));
alter table public.staff_pay_rules add constraint spr_target_ck check (
     (scope = 'all' and section_id is null and instrument_id is null)
  or (scope = 'section' and section_id is not null and instrument_id is null)
  or (scope = 'instrument' and instrument_id is not null and section_id is null));

alter table public.activity_audiences drop constraint activity_audiences_kind_check;
alter table public.activity_audiences add constraint activity_audiences_kind_check check (kind in ('section', 'instrument', 'classification', 'member'));

alter table public.instruments drop constraint if exists instruments_subsection_id_section_id_fkey;
alter table public.instruments drop column subsection_id;
drop table public.subsections;
