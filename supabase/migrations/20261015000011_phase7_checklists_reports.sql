-- SIGBloco · Fase 7 · Checklists de eventos, relatórios de presença e resumo da Direção.
-- Checklists: modelo → itens do modelo → CÓPIA para o evento (editar o modelo não altera eventos já criados).
-- Relatórios: sempre respeitam o escopo de quem consulta (Direção = organização; Professor/Monitor = seu grupo).

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, template_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  sort_order int not null default 0, is_active boolean not null default true,
  unique (organization_id, id),
  foreign key (organization_id, template_id) references public.checklist_templates (organization_id, id)
);
create index cti_template_idx on public.checklist_template_items (template_id, sort_order);

create table public.activity_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, activity_id uuid not null,
  source_template_item_id uuid,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee_member_id uuid, notes text,
  sort_order int not null default 0, is_active boolean not null default true,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  foreign key (organization_id, activity_id) references public.activities (organization_id, id),
  foreign key (organization_id, assignee_member_id) references public.members (organization_id, id),
  foreign key (organization_id, source_template_item_id) references public.checklist_template_items (organization_id, id)
);
create index aci_activity_idx on public.activity_checklist_items (activity_id, sort_order) where is_active;
create unique index aci_source_once_uq on public.activity_checklist_items (activity_id, source_template_item_id) where source_template_item_id is not null and is_active;
create trigger trg_aci_updated before update on public.activity_checklist_items for each row execute function public.set_updated_at();

-- ───────────── RPCs de checklist ─────────────
create or replace function public.apply_checklist_template(p_activity uuid, p_template uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare a public.activities; n int; v_max int;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.checklist_templates where id = p_template and organization_id = a.organization_id and is_active) then
    raise exception 'Modelo inválido.' using errcode = 'P0002';
  end if;
  select coalesce(max(sort_order), 0) into v_max from public.activity_checklist_items where activity_id = p_activity;
  insert into public.activity_checklist_items (organization_id, activity_id, source_template_item_id, title, sort_order)
  select a.organization_id, p_activity, i.id, i.title, v_max + row_number() over (order by i.sort_order, i.title)
  from public.checklist_template_items i
  where i.template_id = p_template and i.is_active
    and not exists (select 1 from public.activity_checklist_items x where x.activity_id = p_activity and x.source_template_item_id = i.id and x.is_active);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.apply_checklist_template(uuid, uuid) from public, anon;
grant execute on function public.apply_checklist_template(uuid, uuid) to authenticated;

create or replace function public.add_checklist_item(p_activity uuid, p_title text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.activities; v_id uuid;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  insert into public.activity_checklist_items (organization_id, activity_id, title, sort_order)
  values (a.organization_id, p_activity, trim(p_title),
          (select coalesce(max(sort_order), 0) + 1 from public.activity_checklist_items where activity_id = p_activity))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_checklist_item(uuid, text) from public, anon;
grant execute on function public.add_checklist_item(uuid, text) to authenticated;

-- Direção altera tudo. O responsável do item altera apenas status e observação.
create or replace function public.update_checklist_item(p_item uuid, p_status text default null, p_notes text default null,
  p_assignee uuid default null, p_set_assignee boolean default false, p_title text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.activity_checklist_items; v_manage boolean; v_mine boolean;
begin
  select * into i from public.activity_checklist_items where id = p_item and is_active;
  if i.id is null then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  v_manage := public.has_permission(i.organization_id, 'events.manage');
  v_mine := i.assignee_member_id is not null and public.is_self(i.assignee_member_id);
  if not (v_manage or v_mine) then raise exception 'Você não pode alterar este item.' using errcode = '42501'; end if;
  if not v_manage and (p_set_assignee or p_title is not null) then
    raise exception 'Só a Direção altera responsável e título.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('todo', 'doing', 'done') then raise exception 'Status inválido.' using errcode = '22023'; end if;
  if p_set_assignee and p_assignee is not null and not exists (select 1 from public.members where id = p_assignee and organization_id = i.organization_id) then
    raise exception 'Responsável inválido.' using errcode = 'P0002';
  end if;
  update public.activity_checklist_items set
    status = coalesce(p_status, status),
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    assignee_member_id = case when p_set_assignee then p_assignee else assignee_member_id end,
    title = coalesce(nullif(trim(p_title), ''), title)
  where id = p_item;
end $$;
revoke all on function public.update_checklist_item(uuid, text, text, uuid, boolean, text) from public, anon;
grant execute on function public.update_checklist_item(uuid, text, text, uuid, boolean, text) to authenticated;

create or replace function public.remove_checklist_item(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.activity_checklist_items;
begin
  select * into i from public.activity_checklist_items where id = p_item;
  if i.id is null or not public.has_permission(i.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  update public.activity_checklist_items set is_active = false where id = p_item;
end $$;
revoke all on function public.remove_checklist_item(uuid) from public, anon;
grant execute on function public.remove_checklist_item(uuid) to authenticated;

create or replace function public.reorder_checklist(p_activity uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  update public.activity_checklist_items x set sort_order = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where x.id = o.id and x.activity_id = p_activity;
end $$;
revoke all on function public.reorder_checklist(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_checklist(uuid, uuid[]) to authenticated;

-- ───────────── relatórios de presença ─────────────
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
  join public.activities a on a.id = ea.activity_id and a.status <> 'cancelled' and a.activity_date between p_from and p_to
  join public.attendance_statuses st on st.id = ea.status_id
  where ea.organization_id = p_org and (v_scope = 'org' or public.is_in_my_group(p_org, ea.member_id));
end $$;
revoke all on function public._att_base(uuid, date, date) from public, anon, authenticated;

create or replace function public.attendance_report(p_org uuid, p_from date, p_to date, p_group text)
returns table (group_id uuid, label text, sort_key text, records bigint, present bigint, pct numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column

begin
  if p_group not in ('member', 'activity', 'cycle', 'month', 'instrument', 'section') then
    raise exception 'Agrupamento inválido.' using errcode = '22023';
  end if;
  if p_group = 'member' then
    return query select m.id, coalesce(m.display_name, m.full_name), lower(coalesce(m.display_name, m.full_name)), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_base(p_org, p_from, p_to) b join public.members m on m.id = b.member_id group by m.id;
  elsif p_group = 'activity' then
    return query select b.activity_id, b.title || ' · ' || to_char(b.activity_date, 'DD/MM/YYYY'), to_char(b.activity_date, 'YYYY-MM-DD'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_base(p_org, p_from, p_to) b group by b.activity_id, b.title, b.activity_date;
  elsif p_group = 'cycle' then
    return query select b.cycle_id, coalesce(c.name, 'Sem ciclo'), coalesce(c.name, 'zzz'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_base(p_org, p_from, p_to) b left join public.cycles c on c.id = b.cycle_id group by b.cycle_id, c.name;
  elsif p_group = 'month' then
    return query select null::uuid, to_char(date_trunc('month', b.activity_date), 'MM/YYYY'), to_char(date_trunc('month', b.activity_date), 'YYYY-MM'), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_base(p_org, p_from, p_to) b group by date_trunc('month', b.activity_date);
  elsif p_group = 'instrument' then
    return query select i.id, i.name, lower(i.name), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_base(p_org, p_from, p_to) b
    join public.member_artistic_links l on l.member_id = b.member_id and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id group by i.id, i.name;
  else
    return query select s.id, s.name, lower(s.name), count(*), count(*) filter (where b.present),
      round(100.0 * count(*) filter (where b.present) / count(*), 1)
    from public._att_base(p_org, p_from, p_to) b
    join public.member_artistic_links l on l.member_id = b.member_id and l.ended_at is null
    join public.instruments i on i.id = l.instrument_id join public.sections s on s.id = i.section_id group by s.id, s.name;
  end if;
end $$;
revoke all on function public.attendance_report(uuid, date, date, text) from public, anon;
grant execute on function public.attendance_report(uuid, date, date, text) to authenticated;

-- Quem está há N+ faltas consecutivas (eventos já realizados, do mais novo para o mais antigo, até a última presença).
create or replace function public.absence_streaks(p_org uuid, p_min int default 3)
returns table (member_id uuid, display_name text, streak int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column

begin
  return query
  with seq as (
    select b.member_id, b.present,
           row_number() over (partition by b.member_id order by b.activity_date desc, b.start_time desc nulls last) as rn
    from public._att_base(p_org, date '2000-01-01', current_date) b),
  agg as (
    select s.member_id, coalesce(min(s.rn) filter (where s.present) - 1, count(*))::int as streak from seq s group by s.member_id)
  select a.member_id, coalesce(m.display_name, m.full_name), a.streak
  from agg a join public.members m on m.id = a.member_id
  where a.streak >= p_min order by a.streak desc, 2;
end $$;
revoke all on function public.absence_streaks(uuid, int) from public, anon;
grant execute on function public.absence_streaks(uuid, int) to authenticated;

-- ───────────── resumo da Direção (sem dados sensíveis LGPD) ─────────────
create or replace function public.dashboard_direction(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cycle public.cycles; v_today date; v_comp date; v_res jsonb;
  v_total int; v_active int; v_inactive int; v_wait int;
begin
  if not public.has_permission(p_org, 'finance.read') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;
  v_comp := date_trunc('month', v_today)::date;
  select * into v_cycle from public.cycles where organization_id = p_org and is_active order by is_current desc, starts_on desc limit 1;
  select count(*) into v_total from public.members where organization_id = p_org and archived_at is null;
  select count(*) filter (where s.counts_as_active), count(*) filter (where not s.counts_as_active and not s.is_waitlist), count(*) filter (where s.is_waitlist)
    into v_active, v_inactive, v_wait
  from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id
  where mc.cycle_id = v_cycle.id;

  v_res := jsonb_build_object(
    'cycle', case when v_cycle.id is null then null else jsonb_build_object('id', v_cycle.id, 'name', v_cycle.name) end,
    'members_total', v_total, 'members_active', coalesce(v_active, 0), 'members_inactive', coalesce(v_inactive, 0), 'members_waitlist', coalesce(v_wait, 0),
    'by_classification', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'count', x.n) order by c.sort_order)
      from public.classifications c
      join lateral (select count(distinct mcl.member_id) n from public.member_classifications mcl
                    join public.members m on m.id = mcl.member_id and m.archived_at is null
                    where mcl.classification_id = c.id and (mcl.until is null or mcl.until >= v_today)) x on true
      where c.organization_id = p_org and c.is_active), '[]'::jsonb),
    'by_section', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'active', x.n) order by s.sort_order)
      from public.sections s
      join lateral (select count(distinct l.member_id) n from public.member_artistic_links l
                    join public.instruments i on i.id = l.instrument_id and i.section_id = s.id
                    join public.member_cycles mc on mc.member_id = l.member_id and mc.cycle_id = v_cycle.id
                    join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
                    where l.ended_at is null) x on true
      where s.organization_id = p_org and s.is_active), '[]'::jsonb),
    'capacity', (select jsonb_build_object('limited', count(*), 'full', count(*) filter (where o >= c.capacity),
                        'capacity', coalesce(sum(c.capacity), 0), 'occupied', coalesce(sum(o), 0))
                 from public.instrument_cycle_capacity c, lateral (select public.instrument_occupied(c.instrument_id, c.cycle_id) o) x
                 where c.organization_id = p_org and c.cycle_id = v_cycle.id),
    'billing', (select jsonb_build_object('previsto', coalesce(sum(final_amount) filter (where status in ('pending', 'paid')), 0),
                        'recebido', coalesce(sum(final_amount) filter (where status = 'paid'), 0),
                        'pendente', coalesce(sum(final_amount) filter (where status = 'pending'), 0),
                        'inadimplentes', count(*) filter (where status = 'pending' and due_on < v_today),
                        'bolsas', coalesce(sum(scholarship_discount) filter (where status <> 'cancelled'), 0))
                from public.monthly_charges where organization_id = p_org and competence = v_comp),
    'scholarships', (select jsonb_build_object('bolsistas', count(*), 'equivalente', round(coalesce(sum(percent), 0) / 100, 2))
                     from public.scholarships where organization_id = p_org and percent > 0 and valid_from <= v_today and (valid_to is null or valid_to >= v_today)),
    'finance', (select jsonb_build_object('despesas', coalesce(sum(amount) filter (where kind = 'expense'), 0),
                        'receitas', coalesce(sum(amount) filter (where kind = 'income'), 0),
                        'saldo', coalesce(sum(case when kind = 'income' then amount else -amount end), 0))
                from public.v_finance_ledger where organization_id = p_org and occurred_on >= v_comp and occurred_on < (v_comp + interval '1 month')::date)
  );
  return v_res;
end $$;
revoke all on function public.dashboard_direction(uuid) from public, anon;
grant execute on function public.dashboard_direction(uuid) to authenticated;

-- ───────────── auditoria, RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['checklist_templates', 'checklist_template_items', 'activity_checklist_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
  grant insert, update on public.checklist_templates, public.checklist_template_items to authenticated;
end $$;

create policy ct_select on public.checklist_templates for select to authenticated using (public.has_permission(organization_id, 'checklists.manage'));
create policy ct_insert on public.checklist_templates for insert to authenticated with check (public.has_permission(organization_id, 'checklists.manage'));
create policy ct_update on public.checklist_templates for update to authenticated
  using (public.has_permission(organization_id, 'checklists.manage')) with check (public.has_permission(organization_id, 'checklists.manage'));
create policy cti_select on public.checklist_template_items for select to authenticated using (public.has_permission(organization_id, 'checklists.manage'));
create policy cti_insert on public.checklist_template_items for insert to authenticated with check (public.has_permission(organization_id, 'checklists.manage'));
create policy cti_update on public.checklist_template_items for update to authenticated
  using (public.has_permission(organization_id, 'checklists.manage')) with check (public.has_permission(organization_id, 'checklists.manage'));

-- itens do evento: quem enxerga o evento (RLS de activities) enxerga o checklist; escrita só pelas RPCs.
create policy aci_select on public.activity_checklist_items for select to authenticated
  using (is_active and exists (select 1 from public.activities a where a.id = activity_id));
