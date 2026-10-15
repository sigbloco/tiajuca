-- SIGBloco · Reestruturação: Naipe (Percussão/Sopro/Performance) → Subnaipe (opcional) → Instrumento.
-- Vagas e acompanhamento de professores/monitores passam a valer por INSTRUMENTO (atribuição aceita naipe,
-- subnaipe ou instrumento e é expandida). Subnaipe é organização interna: aluno/integrante nunca o enxerga.
-- ATENÇÃO: recria tabelas de estrutura da Fase 2 (vínculos artísticos, vagas e atribuições de teste são descartados).

drop view if exists public.v_section_cycle_overview;
drop function if exists public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean);
drop function if exists public.section_occupied(uuid, uuid);

alter table public.member_cycles drop column if exists waitlist_section_id;
alter table public.artistic_functions drop column if exists area_id;

drop table if exists public.member_artistic_links;
drop table if exists public.section_cycle_capacity;
drop table if exists public.staff_section_assignments;
drop table if exists public.instruments;
drop table if exists public.sections;
drop table if exists public.areas;

-- ───────────── estrutura ─────────────
create table public.sections ( -- naipes
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);
create table public.subsections ( -- subnaipes (internos à equipe)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, section_id uuid not null,
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name), unique (id, section_id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id)
);
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, section_id uuid not null, subsection_id uuid,
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (subsection_id, section_id) references public.subsections (id, section_id) -- subnaipe deve ser do mesmo naipe
);
create index instruments_section_idx on public.instruments (section_id);

alter table public.artistic_functions add column section_id uuid;
alter table public.artistic_functions
  add foreign key (organization_id, section_id) references public.sections (organization_id, id);

create table public.member_artistic_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  instrument_id uuid, function_id uuid, skill_level_id uuid,
  is_primary boolean not null default false,
  started_at date not null default current_date, ended_at date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, function_id) references public.artistic_functions (organization_id, id),
  foreign key (organization_id, skill_level_id) references public.skill_levels (organization_id, id),
  check (instrument_id is not null or function_id is not null)
);
create index mal_member_idx on public.member_artistic_links (member_id) where ended_at is null;
create index mal_instrument_idx on public.member_artistic_links (instrument_id) where ended_at is null;

create table public.instrument_cycle_capacity (
  organization_id uuid not null, instrument_id uuid not null, cycle_id uuid not null,
  capacity int not null check (capacity >= 0),
  updated_at timestamptz not null default now(),
  primary key (instrument_id, cycle_id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);

alter table public.member_cycles add column waitlist_instrument_id uuid;
alter table public.member_cycles
  add foreign key (organization_id, waitlist_instrument_id) references public.instruments (organization_id, id);

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null, staff_kind public.staff_kind not null,
  section_id uuid, subsection_id uuid, instrument_id uuid,
  valid_from date not null default current_date, valid_to date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (organization_id, subsection_id) references public.subsections (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  check ((section_id is not null)::int + (subsection_id is not null)::int + (instrument_id is not null)::int = 1)
);
create unique index staff_assignments_active_uq
  on public.staff_assignments (member_id, staff_kind, coalesce(section_id, subsection_id, instrument_id)) where valid_to is null;

-- ───────────── funções ─────────────
create or replace function public.instrument_occupied(p_instrument uuid, p_cycle uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct mc.member_id)::int
  from public.member_cycles mc
  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
  join public.member_artistic_links l on l.member_id = mc.member_id and l.instrument_id = p_instrument and l.ended_at is null
  where mc.cycle_id = p_cycle
$$;
revoke all on function public.instrument_occupied(uuid, uuid) from public, anon;
grant execute on function public.instrument_occupied(uuid, uuid) to authenticated;

-- Equipe = quem enxerga além de si mesmo (escopo grupo ou organização). Aluno/integrante comum não é equipe.
create or replace function public.is_staff(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.permission_scope_of(p_org, 'members.read')::text in ('group', 'org'), false)
$$;
revoke all on function public.is_staff(uuid) from public, anon;
grant execute on function public.is_staff(uuid) to authenticated;

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
      and (sa.instrument_id = i.id or sa.subsection_id = i.subsection_id or sa.section_id = i.section_id)
  )
$$;

create or replace function public.set_member_cycle_status(
  p_member uuid, p_cycle uuid, p_status_key text,
  p_notes text default null, p_waitlist_instrument uuid default null, p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_status public.member_cycle_statuses; v_existing public.member_cycles;
  v_was_active boolean := false; v_full text; v_id uuid; v_allowed boolean;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo inválido.' using errcode = 'P0002';
  end if;
  select * into v_status from public.member_cycle_statuses
   where organization_id = v_org and key = p_status_key and is_active;
  if v_status.id is null then raise exception 'Status inválido.' using errcode = 'P0002'; end if;

  v_allowed := public.has_permission(v_org, 'member_cycles.manage')
    or (coalesce(public.permission_scope_of(v_org, 'member_cycles.manage') = 'group', false)
        and public.is_in_my_group(v_org, p_member));
  if not coalesce(v_allowed, false) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  select * into v_existing from public.member_cycles where member_id = p_member and cycle_id = p_cycle;
  if v_existing.id is not null then
    select s.counts_as_active into v_was_active from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(i.name, ', ') into v_full
    from public.member_artistic_links l
    join public.instruments i on i.id = l.instrument_id
    join public.instrument_cycle_capacity c on c.instrument_id = l.instrument_id and c.cycle_id = p_cycle
    where l.member_id = p_member and l.ended_at is null
      and public.instrument_occupied(l.instrument_id, p_cycle) >= c.capacity;
    if v_full is not null and not (p_force and public.has_permission(v_org, 'capacity.manage')) then
      raise exception 'Vaga lotada em: %. Só a Direção pode autorizar a exceção.', v_full using errcode = 'P0001';
    end if;
  end if;

  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id, joined_on, left_on, notes,
                                    waitlisted_at, waitlist_instrument_id)
  values (v_org, p_member, p_cycle, v_status.id,
          case when v_status.counts_as_active then current_date end,
          case when not v_status.counts_as_active and not v_status.is_waitlist then current_date end,
          p_notes,
          case when v_status.is_waitlist then now() end,
          case when v_status.is_waitlist then p_waitlist_instrument end)
  on conflict (member_id, cycle_id) do update set
    status_id = excluded.status_id,
    joined_on = case when v_status.counts_as_active then coalesce(public.member_cycles.joined_on, current_date)
                     else public.member_cycles.joined_on end,
    left_on = case when v_status.counts_as_active then null
                   when v_status.is_waitlist then null else current_date end,
    notes = coalesce(excluded.notes, public.member_cycles.notes),
    waitlisted_at = case when v_status.is_waitlist then coalesce(public.member_cycles.waitlisted_at, now()) end,
    waitlist_instrument_id = case when v_status.is_waitlist
      then coalesce(excluded.waitlist_instrument_id, public.member_cycles.waitlist_instrument_id) end
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean) to authenticated;

-- Vagas por instrumento. Não expõe subnaipe (dado interno da equipe).
create view public.v_instrument_cycle_overview with (security_invoker = true) as
select i.organization_id, cy.id as cycle_id, i.id as instrument_id, i.name as instrument_name,
       s.id as section_id, s.name as section_name, s.sort_order as section_order, i.sort_order as instrument_order,
       c.capacity,
       public.instrument_occupied(i.id, cy.id) as occupied,
       case when c.capacity is null then null else greatest(c.capacity - public.instrument_occupied(i.id, cy.id), 0) end as available,
       coalesce(public.instrument_occupied(i.id, cy.id) >= c.capacity, false) as is_full
from public.instruments i
join public.sections s on s.id = i.section_id
join public.cycles cy on cy.organization_id = i.organization_id
left join public.instrument_cycle_capacity c on c.instrument_id = i.id and c.cycle_id = cy.id
where i.is_active;
revoke all on public.v_instrument_cycle_overview from public, anon;
grant select on public.v_instrument_cycle_overview to authenticated;

-- ───────────── auditoria, RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['sections','subsections','instruments','member_artistic_links',
    'instrument_cycle_capacity','staff_assignments'] loop
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

create policy sections_select on public.sections for select to authenticated using (public.is_org_member(organization_id));
create policy sections_insert on public.sections for insert to authenticated with check (public.has_permission(organization_id, 'structure.manage'));
create policy sections_update on public.sections for update to authenticated
  using (public.has_permission(organization_id, 'structure.manage')) with check (public.has_permission(organization_id, 'structure.manage'));

-- Subnaipes: somente equipe lê; aluno/integrante comum nunca.
create policy subsections_select on public.subsections for select to authenticated
  using (public.is_org_member(organization_id) and public.is_staff(organization_id));
create policy subsections_insert on public.subsections for insert to authenticated with check (public.has_permission(organization_id, 'structure.manage'));
create policy subsections_update on public.subsections for update to authenticated
  using (public.has_permission(organization_id, 'structure.manage')) with check (public.has_permission(organization_id, 'structure.manage'));

create policy instruments_select on public.instruments for select to authenticated using (public.is_org_member(organization_id));
create policy instruments_insert on public.instruments for insert to authenticated with check (public.has_permission(organization_id, 'structure.manage'));
create policy instruments_update on public.instruments for update to authenticated
  using (public.has_permission(organization_id, 'structure.manage')) with check (public.has_permission(organization_id, 'structure.manage'));

create policy mal_select on public.member_artistic_links for select to authenticated
  using (public.can_read_member(organization_id, member_id));
create policy mal_insert on public.member_artistic_links for insert to authenticated
  with check (public.has_permission(organization_id, 'members.manage'));
create policy mal_update on public.member_artistic_links for update to authenticated
  using (public.has_permission(organization_id, 'members.manage')) with check (public.has_permission(organization_id, 'members.manage'));

create policy capacity_select on public.instrument_cycle_capacity for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'capacity.read') is not null);
create policy capacity_insert on public.instrument_cycle_capacity for insert to authenticated
  with check (public.has_permission(organization_id, 'capacity.manage'));
create policy capacity_update on public.instrument_cycle_capacity for update to authenticated
  using (public.has_permission(organization_id, 'capacity.manage')) with check (public.has_permission(organization_id, 'capacity.manage'));

create policy staff_assign_select on public.staff_assignments for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'staff_assignments.manage'));
create policy staff_assign_insert on public.staff_assignments for insert to authenticated
  with check (public.has_permission(organization_id, 'staff_assignments.manage'));
create policy staff_assign_update on public.staff_assignments for update to authenticated
  using (public.has_permission(organization_id, 'staff_assignments.manage'))
  with check (public.has_permission(organization_id, 'staff_assignments.manage'));
