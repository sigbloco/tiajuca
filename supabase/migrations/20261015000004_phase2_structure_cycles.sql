-- SIGBloco · Fase 2 · Estrutura artística, ciclos, participação, vagas, lista de espera, atribuição de equipe
-- Decisões: docs/PROPOSTA_TECNICA.md (I.1.1). Sem enums para instrumentos/naipes/funções; sem DELETE físico.

-- ───────────── novas permissões ─────────────
insert into public.permissions (key, module, description) values
  ('staff_assignments.manage', 'acesso', 'Definir quais naipes cada professor/monitor acompanha')
on conflict (key) do nothing;

insert into public.role_permissions (access_role_id, permission_key, scope)
select ar.id, 'staff_assignments.manage', 'org' from public.access_roles ar where ar.key = 'direcao'
on conflict do nothing;

-- ───────────── estrutura artística (configurável) ─────────────
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);
create table public.sections ( -- naipes
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, area_id uuid not null,
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name),
  foreign key (organization_id, area_id) references public.areas (organization_id, id)
);
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, area_id uuid not null, section_id uuid,
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name),
  foreign key (organization_id, area_id) references public.areas (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id)
);
create table public.artistic_functions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, area_id uuid,
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name),
  foreign key (organization_id, area_id) references public.areas (organization_id, id)
);
create table public.skill_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);

-- Vínculos artísticos: N por pessoa, sem duplicar o integrante.
create table public.member_artistic_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null, area_id uuid not null,
  section_id uuid, instrument_id uuid, function_id uuid, skill_level_id uuid,
  is_primary boolean not null default false,
  started_at date not null default current_date, ended_at date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, area_id) references public.areas (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, function_id) references public.artistic_functions (organization_id, id),
  foreign key (organization_id, skill_level_id) references public.skill_levels (organization_id, id),
  check (section_id is not null or instrument_id is not null or function_id is not null)
);
create index mal_member_idx on public.member_artistic_links (member_id) where ended_at is null;
create index mal_section_idx on public.member_artistic_links (section_id) where ended_at is null;

-- ───────────── ciclos ─────────────
create table public.cycle_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key text not null, name text not null, is_active boolean not null default true,
  unique (organization_id, id), unique (organization_id, key)
);
create type public.cycle_status as enum ('planned', 'open', 'closed');
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, cycle_type_id uuid not null,
  name text not null, starts_on date not null, ends_on date not null,
  status public.cycle_status not null default 'planned',
  is_active boolean not null default true, is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name),
  foreign key (organization_id, cycle_type_id) references public.cycle_types (organization_id, id),
  check (ends_on >= starts_on)
);
create unique index cycles_one_current_uq on public.cycles (organization_id) where is_current;

create table public.member_cycle_statuses ( -- Ativo, Inativo, Lista de espera… (configurável)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key text not null, name text not null,
  counts_as_active boolean not null default false, is_waitlist boolean not null default false,
  sort_order int not null default 0, is_active boolean not null default true,
  unique (organization_id, id), unique (organization_id, key),
  check (not (counts_as_active and is_waitlist))
);

create table public.member_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null, cycle_id uuid not null, status_id uuid not null,
  joined_on date, left_on date, notes text,
  waitlisted_at timestamptz, waitlist_section_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (member_id, cycle_id),
  unique (organization_id, id),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id),
  foreign key (organization_id, status_id) references public.member_cycle_statuses (organization_id, id),
  foreign key (organization_id, waitlist_section_id) references public.sections (organization_id, id)
);
create index member_cycles_cycle_status_idx on public.member_cycles (cycle_id, status_id);
create trigger trg_member_cycles_updated before update on public.member_cycles
  for each row execute function public.set_updated_at();

create table public.member_cycle_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null, member_cycle_id uuid not null,
  old_status_id uuid, new_status_id uuid not null,
  changed_by uuid references public.members(id), changed_at timestamptz not null default now(),
  notes text
);
create index mcsh_mc_idx on public.member_cycle_status_history (member_cycle_id, changed_at desc);

create table public.section_cycle_capacity (
  organization_id uuid not null, section_id uuid not null, cycle_id uuid not null,
  capacity int not null check (capacity >= 0),
  updated_at timestamptz not null default now(),
  primary key (section_id, cycle_id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);

-- Quais naipes cada professor/monitor acompanha (acumulável; editável pela Direção).
create type public.staff_kind as enum ('professor', 'monitor');
create table public.staff_section_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null, section_id uuid not null,
  staff_kind public.staff_kind not null,
  valid_from date not null default current_date, valid_to date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id)
);
create unique index ssa_active_uq on public.staff_section_assignments (member_id, section_id, staff_kind) where valid_to is null;

-- ───────────── funções de domínio ─────────────
create or replace function public.log_member_cycle_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    insert into public.member_cycle_status_history
      (organization_id, member_cycle_id, old_status_id, new_status_id, changed_by, notes)
    values (new.organization_id, new.id, case when tg_op = 'UPDATE' then old.status_id end, new.status_id,
            public.current_member_id(new.organization_id), new.notes);
  end if;
  return null;
end $$;
create trigger trg_member_cycles_history after insert or update of status_id on public.member_cycles
  for each row execute function public.log_member_cycle_status();

-- Ocupação = integrantes cujo status no ciclo conta como ativo e que têm vínculo vigente com o naipe.
create or replace function public.section_occupied(p_section uuid, p_cycle uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct mc.member_id)::int
  from public.member_cycles mc
  join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
  join public.member_artistic_links l on l.member_id = mc.member_id and l.section_id = p_section and l.ended_at is null
  where mc.cycle_id = p_cycle
$$;

-- Substitui o stub da Fase 1: grupo = integrantes com vínculo vigente em naipe que o usuário acompanha.
create or replace function public.is_in_my_group(p_org uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.staff_section_assignments sa
    join public.member_artistic_links l on l.section_id = sa.section_id and l.ended_at is null
    where sa.organization_id = p_org
      and sa.member_id = public.current_member_id(p_org)
      and (sa.valid_to is null or sa.valid_to >= current_date)
      and l.member_id = p_member
  )
$$;

-- Altera o status no ciclo (cria a participação se não existir). Regras de vaga e permissão no banco.
create or replace function public.set_member_cycle_status(
  p_member uuid, p_cycle uuid, p_status_key text,
  p_notes text default null, p_waitlist_section uuid default null, p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_status public.member_cycle_statuses; v_existing public.member_cycles;
  v_was_active boolean := false; v_full text; v_id uuid;
begin
  select organization_id into v_org from public.members where id = p_member;
  if v_org is null then raise exception 'Integrante não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.cycles where id = p_cycle and organization_id = v_org) then
    raise exception 'Ciclo inválido.' using errcode = 'P0002';
  end if;
  select * into v_status from public.member_cycle_statuses
   where organization_id = v_org and key = p_status_key and is_active;
  if v_status.id is null then raise exception 'Status inválido.' using errcode = 'P0002'; end if;

  if not (public.has_permission(v_org, 'member_cycles.manage')
          or (public.permission_scope_of(v_org, 'member_cycles.manage') = 'group'
              and public.is_in_my_group(v_org, p_member))) then
    raise exception 'Você não tem permissão para alterar este status.' using errcode = '42501';
  end if;

  select * into v_existing from public.member_cycles where member_id = p_member and cycle_id = p_cycle;
  if v_existing.id is not null then
    select s.counts_as_active into v_was_active from public.member_cycle_statuses s where s.id = v_existing.status_id;
  end if;

  if v_status.counts_as_active and not coalesce(v_was_active, false) then
    select string_agg(sec.name, ', ') into v_full
    from public.member_artistic_links l
    join public.sections sec on sec.id = l.section_id
    join public.section_cycle_capacity c on c.section_id = l.section_id and c.cycle_id = p_cycle
    where l.member_id = p_member and l.ended_at is null
      and public.section_occupied(l.section_id, p_cycle) >= c.capacity;
    if v_full is not null and not (p_force and public.has_permission(v_org, 'capacity.manage')) then
      raise exception 'Naipe lotado: %. Só a Direção pode autorizar a exceção.', v_full using errcode = 'P0001';
    end if;
  end if;

  insert into public.member_cycles (organization_id, member_id, cycle_id, status_id, joined_on, left_on, notes,
                                    waitlisted_at, waitlist_section_id)
  values (v_org, p_member, p_cycle, v_status.id,
          case when v_status.counts_as_active then current_date end,
          case when not v_status.counts_as_active and not v_status.is_waitlist then current_date end,
          p_notes,
          case when v_status.is_waitlist then now() end,
          case when v_status.is_waitlist then p_waitlist_section end)
  on conflict (member_id, cycle_id) do update set
    status_id = excluded.status_id,
    joined_on = case when v_status.counts_as_active then coalesce(public.member_cycles.joined_on, current_date)
                     else public.member_cycles.joined_on end,
    left_on = case when v_status.counts_as_active then null
                   when v_status.is_waitlist then null else current_date end,
    notes = coalesce(excluded.notes, public.member_cycles.notes),
    waitlisted_at = case when v_status.is_waitlist then coalesce(public.member_cycles.waitlisted_at, now()) end,
    waitlist_section_id = case when v_status.is_waitlist then coalesce(excluded.waitlist_section_id, public.member_cycles.waitlist_section_id) end
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.set_member_cycle_status(uuid, uuid, text, text, uuid, boolean) to authenticated;
revoke all on function public.section_occupied(uuid, uuid), public.log_member_cycle_status() from public, anon;
grant execute on function public.section_occupied(uuid, uuid) to authenticated;

-- Visão de vagas: ciclo × naipe ativo, com limite (se houver), ocupadas, livres e lotado.
create view public.v_section_cycle_overview with (security_invoker = true) as
select s.organization_id, cy.id as cycle_id, s.id as section_id, s.name as section_name, s.sort_order,
       c.capacity,
       public.section_occupied(s.id, cy.id) as occupied,
       case when c.capacity is null then null else greatest(c.capacity - public.section_occupied(s.id, cy.id), 0) end as available,
       coalesce(public.section_occupied(s.id, cy.id) >= c.capacity, false) as is_full
from public.sections s
join public.cycles cy on cy.organization_id = s.organization_id
left join public.section_cycle_capacity c on c.section_id = s.id and c.cycle_id = cy.id
where s.is_active;

-- Defaults genéricos por organização (statuses e tipos de ciclo). Estrutura artística é dado da instância.
create or replace function public.seed_org_cycle_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_cycle_statuses (organization_id, key, name, counts_as_active, is_waitlist, sort_order) values
    (p_org, 'active',   'Ativo',            true,  false, 1),
    (p_org, 'inactive', 'Inativo',          false, false, 2),
    (p_org, 'waitlist', 'Lista de espera',  false, true,  3)
  on conflict (organization_id, key) do nothing;
  insert into public.cycle_types (organization_id, key, name) values
    (p_org, 'carnaval', 'Carnaval'), (p_org, 'junino', 'Junino')
  on conflict (organization_id, key) do nothing;
end $$;
revoke all on function public.seed_org_cycle_defaults(uuid) from public, anon, authenticated;

-- ───────────── auditoria ─────────────
do $$
declare t text;
begin
  foreach t in array array['areas','sections','instruments','artistic_functions','skill_levels',
    'member_artistic_links','cycle_types','cycles','member_cycle_statuses','member_cycles',
    'section_cycle_capacity','staff_section_assignments'] loop
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- ───────────── RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['areas','sections','instruments','artistic_functions','skill_levels',
    'member_artistic_links','cycle_types','cycles','member_cycle_statuses','member_cycles',
    'member_cycle_status_history','section_cycle_capacity','staff_section_assignments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
grant insert, update on public.areas, public.sections, public.instruments, public.artistic_functions,
  public.skill_levels, public.cycle_types, public.cycles, public.member_cycle_statuses,
  public.section_cycle_capacity, public.staff_section_assignments to authenticated;
grant insert, update on public.member_artistic_links to authenticated;
revoke all on public.v_section_cycle_overview from public, anon;
grant select on public.v_section_cycle_overview to authenticated;

-- catálogos da estrutura: leitura por qualquer membro; escrita com structure.manage
do $$
declare t text;
begin
  foreach t in array array['areas','sections','instruments','artistic_functions','skill_levels'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_permission(organization_id, ''structure.manage''))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.has_permission(organization_id, ''structure.manage'')) with check (public.has_permission(organization_id, ''structure.manage''))', t);
  end loop;
end $$;

create policy mal_select on public.member_artistic_links for select to authenticated
  using (public.can_read_member(organization_id, member_id));
create policy mal_insert on public.member_artistic_links for insert to authenticated
  with check (public.has_permission(organization_id, 'members.manage'));
create policy mal_update on public.member_artistic_links for update to authenticated
  using (public.has_permission(organization_id, 'members.manage'))
  with check (public.has_permission(organization_id, 'members.manage'));

create policy cycle_types_select on public.cycle_types for select to authenticated using (public.is_org_member(organization_id));
create policy cycle_types_insert on public.cycle_types for insert to authenticated with check (public.has_permission(organization_id, 'cycles.manage'));
create policy cycle_types_update on public.cycle_types for update to authenticated
  using (public.has_permission(organization_id, 'cycles.manage')) with check (public.has_permission(organization_id, 'cycles.manage'));

create policy cycles_select on public.cycles for select to authenticated using (public.is_org_member(organization_id));
create policy cycles_insert on public.cycles for insert to authenticated with check (public.has_permission(organization_id, 'cycles.manage'));
create policy cycles_update on public.cycles for update to authenticated
  using (public.has_permission(organization_id, 'cycles.manage')) with check (public.has_permission(organization_id, 'cycles.manage'));

create policy mcs_select on public.member_cycle_statuses for select to authenticated using (public.is_org_member(organization_id));
create policy mcs_insert on public.member_cycle_statuses for insert to authenticated with check (public.has_permission(organization_id, 'settings.manage'));
create policy mcs_update on public.member_cycle_statuses for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage')) with check (public.has_permission(organization_id, 'settings.manage'));

-- participação e histórico: leitura por escopo; escrita APENAS via RPC set_member_cycle_status
create policy mc_select on public.member_cycles for select to authenticated
  using (public.can_read_member(organization_id, member_id));
create policy mcsh_select on public.member_cycle_status_history for select to authenticated
  using (exists (select 1 from public.member_cycles mc where mc.id = member_cycle_id
                 and public.can_read_member(mc.organization_id, mc.member_id)));

create policy capacity_select on public.section_cycle_capacity for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'capacity.read') is not null);
create policy capacity_insert on public.section_cycle_capacity for insert to authenticated
  with check (public.has_permission(organization_id, 'capacity.manage'));
create policy capacity_update on public.section_cycle_capacity for update to authenticated
  using (public.has_permission(organization_id, 'capacity.manage'))
  with check (public.has_permission(organization_id, 'capacity.manage'));

create policy ssa_select on public.staff_section_assignments for select to authenticated
  using (public.is_self(member_id) or public.has_permission(organization_id, 'staff_assignments.manage'));
create policy ssa_insert on public.staff_section_assignments for insert to authenticated
  with check (public.has_permission(organization_id, 'staff_assignments.manage'));
create policy ssa_update on public.staff_section_assignments for update to authenticated
  using (public.has_permission(organization_id, 'staff_assignments.manage'))
  with check (public.has_permission(organization_id, 'staff_assignments.manage'));
