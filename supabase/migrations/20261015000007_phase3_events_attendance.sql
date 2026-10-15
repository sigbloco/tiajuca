-- SIGBloco · Fase 3 · Agenda, recorrência semanal, público, presença por evento e indicadores.
-- Data/horário do evento são "civis" (date + time no fuso da organização): sem conversão de timezone.
-- Escrita de eventos: somente Direção (events.manage, escopo org). Presença: somente via RPC set_attendance.

create table public.activity_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  color text not null default 'primary' check (color in ('primary','secondary','info','success','warning','muted')),
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);

-- Recorrência semanal estruturada (um dia da semana). Ocorrências são materializadas em activities.
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, activity_type_id uuid not null,
  title text not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0=domingo … 6=sábado
  start_time time, end_time time, location text, description text,
  visibility text not null default 'members' check (visibility in ('members', 'staff')),
  starts_on date not null, until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, activity_type_id) references public.activity_types (organization_id, id),
  check (until is null or until >= starts_on),
  check (end_time is null or start_time is null or end_time > start_time)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, activity_type_id uuid not null, cycle_id uuid,
  title text not null,
  activity_date date not null, start_time time, end_time time,
  location text, description text,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  visibility text not null default 'members' check (visibility in ('members', 'staff')),
  recurrence_rule_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, activity_type_id) references public.activity_types (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id),
  foreign key (organization_id, recurrence_rule_id) references public.recurrence_rules (organization_id, id),
  check (end_time is null or start_time is null or end_time > start_time)
);
create unique index activities_rule_date_uq on public.activities (recurrence_rule_id, activity_date) where recurrence_rule_id is not null;
create index activities_org_date_idx on public.activities (organization_id, activity_date);
create index activities_cycle_idx on public.activities (cycle_id);
create trigger trg_activities_updated before update on public.activities for each row execute function public.set_updated_at();

-- Público da atividade. Sem linhas = todos os ativos no ciclo.
create table public.activity_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, activity_id uuid not null,
  kind text not null check (kind in ('section', 'subsection', 'instrument', 'classification', 'member')),
  ref_id uuid not null,
  unique (activity_id, kind, ref_id),
  foreign key (organization_id, activity_id) references public.activities (organization_id, id) on delete cascade
);

create table public.attendance_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key text not null, name text not null,
  counts_as_present boolean not null default false,
  sort_order int not null default 0, is_active boolean not null default true,
  unique (organization_id, id), unique (organization_id, key)
);

create table public.event_attendance (
  organization_id uuid not null, activity_id uuid not null, member_id uuid not null, status_id uuid not null,
  notes text, is_off_roster boolean not null default false,
  recorded_by uuid references public.members(id), recorded_at timestamptz not null default now(),
  primary key (activity_id, member_id),
  foreign key (organization_id, activity_id) references public.activities (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, status_id) references public.attendance_statuses (organization_id, id)
);
create index event_attendance_member_idx on public.event_attendance (member_id);
create index event_attendance_status_idx on public.event_attendance (activity_id, status_id);

-- ───────────── defaults genéricos por organização ─────────────
create or replace function public.seed_org_events_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_types (organization_id, name, color, sort_order) values
    (p_org, 'Ensaio', 'primary', 1), (p_org, 'Oficina', 'info', 2), (p_org, 'Apresentação', 'secondary', 3),
    (p_org, 'Reunião', 'warning', 4), (p_org, 'Evento', 'success', 5), (p_org, 'Outro', 'muted', 6)
  on conflict (organization_id, name) do nothing;
  insert into public.attendance_statuses (organization_id, key, name, counts_as_present, sort_order) values
    (p_org, 'present', 'Presente', true, 1), (p_org, 'absent', 'Ausente', false, 2), (p_org, 'justified', 'Justificado', false, 3)
  on conflict (organization_id, key) do nothing;
end $$;
revoke all on function public.seed_org_events_defaults(uuid) from public, anon, authenticated;

-- ───────────── recorrência ─────────────
create or replace function public.materialize_recurrences(p_org uuid, p_until date) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; n int := 0; c int;
begin
  if not public.has_permission(p_org, 'events.manage') then
    raise exception 'Sem permissão para gerar eventos.' using errcode = '42501';
  end if;
  for r in select * from public.recurrence_rules where organization_id = p_org and is_active loop
    insert into public.activities (organization_id, activity_type_id, cycle_id, title, activity_date, start_time, end_time,
                                   location, description, visibility, recurrence_rule_id)
    select r.organization_id, r.activity_type_id,
           (select cy.id from public.cycles cy
             where cy.organization_id = r.organization_id and cy.is_active and g.d::date between cy.starts_on and cy.ends_on
             order by cy.is_current desc, cy.starts_on desc limit 1),
           r.title, g.d::date, r.start_time, r.end_time, r.location, r.description, r.visibility, r.id
    from generate_series(r.starts_on::timestamp, least(coalesce(r.until, p_until), p_until)::timestamp, interval '1 day') as g(d)
    where extract(dow from g.d) = r.weekday
    on conflict do nothing;
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end $$;
revoke all on function public.materialize_recurrences(uuid, date) from public, anon;
grant execute on function public.materialize_recurrences(uuid, date) to authenticated;

-- Encerra a recorrência: para de gerar e cancela as ocorrências futuras sem presença registrada.
create or replace function public.end_recurrence(p_rule uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.recurrence_rules; v_today date; n int;
begin
  select * into r from public.recurrence_rules where id = p_rule;
  if r.id is null or not public.has_permission(r.organization_id, 'events.manage') then
    raise exception 'Sem permissão para encerrar esta recorrência.' using errcode = '42501';
  end if;
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = r.organization_id;
  update public.recurrence_rules set is_active = false, until = greatest(starts_on, least(coalesce(until, v_today), v_today))
   where id = p_rule;
  update public.activities a set status = 'cancelled'
   where a.recurrence_rule_id = p_rule and a.activity_date > v_today and a.status = 'scheduled'
     and not exists (select 1 from public.event_attendance ea where ea.activity_id = a.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.end_recurrence(uuid) from public, anon;
grant execute on function public.end_recurrence(uuid) to authenticated;

-- ───────────── chamada ─────────────
-- Elegíveis = ativos no ciclo do evento ∩ público; + quem já tem registro (fora da lista). Limitado ao escopo de quem consulta.
create or replace function public.get_attendance_roster(p_activity uuid)
returns table (member_id uuid, display_name text, instruments text, status_id uuid, notes text, is_off_roster boolean)
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
         ea.status_id, ea.notes, p.off
  from picked p
  join public.members m on m.id = p.mid
  left join public.event_attendance ea on ea.activity_id = p_activity and ea.member_id = m.id
  where v_scope = 'org' or public.is_in_my_group(v_a.organization_id, m.id)
  order by 2;
end $$;
revoke all on function public.get_attendance_roster(uuid) from public, anon;
grant execute on function public.get_attendance_roster(uuid) to authenticated;

create or replace function public.set_attendance(p_activity uuid, p_member uuid, p_status_key text, p_notes text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_a public.activities; v_status uuid; v_scope text; v_allowed boolean; v_cycle uuid; v_off boolean;
begin
  select * into v_a from public.activities where id = p_activity;
  if v_a.id is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.members where id = p_member and organization_id = v_a.organization_id) then
    raise exception 'Integrante não encontrado.' using errcode = 'P0002';
  end if;
  v_scope := public.permission_scope_of(v_a.organization_id, 'attendance.record')::text;
  v_allowed := v_scope = 'org' or (v_scope = 'group' and public.is_in_my_group(v_a.organization_id, p_member));
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
end $$;
revoke all on function public.set_attendance(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_attendance(uuid, uuid, text, text) to authenticated;

-- ───────────── indicadores (base para relatórios) ─────────────
create view public.v_attendance_member_cycle with (security_invoker = true) as
select ea.organization_id, ea.member_id, a.cycle_id,
       count(*) as records,
       count(*) filter (where st.counts_as_present) as present,
       round(100.0 * count(*) filter (where st.counts_as_present) / nullif(count(*), 0), 1) as pct_present
from public.event_attendance ea
join public.activities a on a.id = ea.activity_id and a.status <> 'cancelled'
join public.attendance_statuses st on st.id = ea.status_id
group by ea.organization_id, ea.member_id, a.cycle_id;
revoke all on public.v_attendance_member_cycle from public, anon;
grant select on public.v_attendance_member_cycle to authenticated;

-- Faltas consecutivas mais recentes (eventos já realizados, mais novos primeiro, até a última presença).
create or replace function public.consecutive_absences(p_member uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; n int;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null or not coalesce(public.can_read_member(v_org, p_member)
       and public.permission_scope_of(v_org, 'attendance.read') is not null, false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  with seq as (
    select row_number() over (order by a.activity_date desc, a.start_time desc nulls last) as rn, st.counts_as_present as present
    from public.event_attendance ea
    join public.activities a on a.id = ea.activity_id and a.status <> 'cancelled' and a.activity_date <= current_date
    join public.attendance_statuses st on st.id = ea.status_id
    where ea.member_id = p_member)
  select coalesce((select min(rn) - 1 from seq where present), (select count(*) from seq))::int into n;
  return n;
end $$;
revoke all on function public.consecutive_absences(uuid) from public, anon;
grant execute on function public.consecutive_absences(uuid) to authenticated;

-- ───────────── auditoria, RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['activity_types','recurrence_rules','activities','activity_audiences','attendance_statuses','event_attendance'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  foreach t in array array['activity_types','recurrence_rules','activities','attendance_statuses'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
  end loop;
  grant insert, delete on public.activity_audiences to authenticated;
  foreach t in array array['activity_types','recurrence_rules','activities','activity_audiences','attendance_statuses','event_attendance'] loop
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;
-- exclusão de público é auditada manualmente pela edição do evento (linhas são substituídas)

create policy at_select on public.activity_types for select to authenticated using (public.is_org_member(organization_id));
create policy at_insert on public.activity_types for insert to authenticated with check (public.has_permission(organization_id, 'events.manage'));
create policy at_update on public.activity_types for update to authenticated
  using (public.has_permission(organization_id, 'events.manage')) with check (public.has_permission(organization_id, 'events.manage'));

create policy rr_select on public.recurrence_rules for select to authenticated using (public.has_permission(organization_id, 'events.manage'));
create policy rr_insert on public.recurrence_rules for insert to authenticated with check (public.has_permission(organization_id, 'events.manage'));
create policy rr_update on public.recurrence_rules for update to authenticated
  using (public.has_permission(organization_id, 'events.manage')) with check (public.has_permission(organization_id, 'events.manage'));

create policy act_select on public.activities for select to authenticated
  using (public.is_org_member(organization_id)
         and public.permission_scope_of(organization_id, 'events.read') is not null
         and (visibility = 'members' or public.is_staff(organization_id)));
create policy act_insert on public.activities for insert to authenticated with check (public.has_permission(organization_id, 'events.manage'));
create policy act_update on public.activities for update to authenticated
  using (public.has_permission(organization_id, 'events.manage')) with check (public.has_permission(organization_id, 'events.manage'));

create policy aud_select on public.activity_audiences for select to authenticated using (public.has_permission(organization_id, 'events.manage'));
create policy aud_insert on public.activity_audiences for insert to authenticated with check (public.has_permission(organization_id, 'events.manage'));
create policy aud_delete on public.activity_audiences for delete to authenticated using (public.has_permission(organization_id, 'events.manage'));

create policy ast_select on public.attendance_statuses for select to authenticated using (public.is_org_member(organization_id));
create policy ast_insert on public.attendance_statuses for insert to authenticated with check (public.has_permission(organization_id, 'settings.manage'));
create policy ast_update on public.attendance_statuses for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage')) with check (public.has_permission(organization_id, 'settings.manage'));

-- presença: leitura por escopo; escrita APENAS pela RPC set_attendance
create policy ea_select on public.event_attendance for select to authenticated
  using (public.is_self(member_id)
         or public.has_permission(organization_id, 'attendance.read')
         or (coalesce(public.permission_scope_of(organization_id, 'attendance.read')::text = 'group', false)
             and public.is_in_my_group(organization_id, member_id)));
