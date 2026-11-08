-- Etapa 1 — participação artística, categoria de contribuição e bolsa POR CICLO.
-- Tabelas novas; as antigas (member_artistic_links, member_fee_assignments, scholarships) continuam valendo até as próximas etapas.
-- cycle_id fica nulo se o ciclo for apagado: a informação não se perde, só fica desvinculada.

create table public.cycle_participations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  cycle_id uuid references public.cycles (id) on delete set null,
  instrument_id uuid, function_id uuid, skill_level_id uuid,
  is_student boolean not null default false, is_paid boolean not null default false, is_primary boolean not null default false,
  source_link_id uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, function_id) references public.artistic_functions (organization_id, id),
  foreign key (organization_id, skill_level_id) references public.skill_levels (organization_id, id),
  check (instrument_id is not null or function_id is not null)
);
create index cp_member_idx on public.cycle_participations (member_id, cycle_id);
create index cp_cycle_idx on public.cycle_participations (cycle_id);
create unique index cp_source_uq on public.cycle_participations (source_link_id, cycle_id) where source_link_id is not null;

create table public.cycle_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  cycle_id uuid references public.cycles (id) on delete set null,
  fee_category_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, fee_category_id) references public.fee_categories (organization_id, id)
);
create unique index cfa_member_cycle_uq on public.cycle_fee_assignments (member_id, cycle_id) where cycle_id is not null;

create table public.cycle_scholarships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, member_id uuid not null,
  cycle_id uuid references public.cycles (id) on delete set null,
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  reason text, scholarship_type_id uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, scholarship_type_id) references public.scholarship_types (organization_id, id)
);
create unique index csch_member_cycle_uq on public.cycle_scholarships (member_id, cycle_id) where cycle_id is not null;

alter table public.cycle_participations enable row level security;
alter table public.cycle_fee_assignments enable row level security;
alter table public.cycle_scholarships enable row level security;
grant select, insert, update, delete on public.cycle_participations, public.cycle_fee_assignments, public.cycle_scholarships to authenticated;

create policy cp_select on public.cycle_participations for select to authenticated using (public.can_read_member(organization_id, member_id));
create policy cp_insert on public.cycle_participations for insert to authenticated with check (public.has_permission(organization_id, 'members.manage'));
create policy cp_update on public.cycle_participations for update to authenticated
  using (public.has_permission(organization_id, 'members.manage')) with check (public.has_permission(organization_id, 'members.manage'));
create policy cp_delete on public.cycle_participations for delete to authenticated using (public.has_permission(organization_id, 'members.manage'));

create policy cfa_select on public.cycle_fee_assignments for select to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'billing.read'));
create policy cfa_insert on public.cycle_fee_assignments for insert to authenticated with check (public.has_permission(organization_id, 'billing.manage'));
create policy cfa_update on public.cycle_fee_assignments for update to authenticated
  using (public.has_permission(organization_id, 'billing.manage')) with check (public.has_permission(organization_id, 'billing.manage'));
create policy cfa_delete on public.cycle_fee_assignments for delete to authenticated using (public.has_permission(organization_id, 'billing.manage'));

create policy csch_select on public.cycle_scholarships for select to authenticated using (public.is_self(member_id) or public.has_permission(organization_id, 'scholarships.manage'));
create policy csch_insert on public.cycle_scholarships for insert to authenticated with check (public.has_permission(organization_id, 'scholarships.manage'));
create policy csch_update on public.cycle_scholarships for update to authenticated
  using (public.has_permission(organization_id, 'scholarships.manage')) with check (public.has_permission(organization_id, 'scholarships.manage'));
create policy csch_delete on public.cycle_scholarships for delete to authenticated using (public.has_permission(organization_id, 'scholarships.manage'));

-- Preenchimento pelas datas: para cada ciclo em que a pessoa tem registro, copia o que estava vigente no período do ciclo.
insert into public.cycle_participations (organization_id, member_id, cycle_id, instrument_id, function_id, skill_level_id, is_student, is_paid, is_primary, source_link_id)
select l.organization_id, l.member_id, c.id, l.instrument_id, l.function_id, l.skill_level_id, l.is_student, l.is_paid, l.is_primary, l.id
  from public.member_artistic_links l
  join public.member_cycles mc on mc.member_id = l.member_id
  join public.cycles c on c.id = mc.cycle_id and c.is_active
 where l.started_at <= c.ends_on and (l.ended_at is null or l.ended_at >= c.starts_on)
on conflict do nothing;

insert into public.cycle_fee_assignments (organization_id, member_id, cycle_id, fee_category_id)
select distinct on (a.member_id, c.id) a.organization_id, a.member_id, c.id, a.fee_category_id
  from public.member_fee_assignments a
  join public.member_cycles mc on mc.member_id = a.member_id
  join public.cycles c on c.id = mc.cycle_id and c.is_active
 where a.valid_from <= c.ends_on and (a.valid_to is null or a.valid_to >= c.starts_on)
 order by a.member_id, c.id, a.valid_from desc
on conflict do nothing;

insert into public.cycle_scholarships (organization_id, member_id, cycle_id, percent, reason, scholarship_type_id)
select distinct on (s.member_id, c.id) s.organization_id, s.member_id, c.id, s.percent, s.reason, s.scholarship_type_id
  from public.scholarships s
  join public.member_cycles mc on mc.member_id = s.member_id
  join public.cycles c on c.id = mc.cycle_id and c.is_active
 where s.valid_from <= c.ends_on and (s.valid_to is null or s.valid_to >= c.starts_on)
 order by s.member_id, c.id, s.valid_from desc
on conflict do nothing;
