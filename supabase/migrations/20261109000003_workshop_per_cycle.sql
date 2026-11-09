-- Regra: tudo da organização é relativo a um ciclo. Oficina por instrumento passa a valer por ciclo
-- (muda de um ciclo para o seguinte), como as vagas. Substitui as colunas has_workshop de naipes e instrumentos.
alter table public.sections drop column if exists has_workshop;
alter table public.instruments drop column if exists has_workshop;

create table public.instrument_cycle_workshop (
  organization_id uuid not null,
  instrument_id uuid not null,
  cycle_id uuid not null,
  has_workshop boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (instrument_id, cycle_id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);

create trigger trg_audit_instrument_cycle_workshop after insert or update on public.instrument_cycle_workshop
  for each row execute function public.fn_audit();
alter table public.instrument_cycle_workshop enable row level security;
revoke all on public.instrument_cycle_workshop from anon, authenticated;
grant select, insert, update on public.instrument_cycle_workshop to authenticated;

create policy workshop_select on public.instrument_cycle_workshop for select to authenticated using (public.is_org_member(organization_id));
create policy workshop_insert on public.instrument_cycle_workshop for insert to authenticated with check (public.has_permission(organization_id, 'structure.manage'));
create policy workshop_update on public.instrument_cycle_workshop for update to authenticated
  using (public.has_permission(organization_id, 'structure.manage')) with check (public.has_permission(organization_id, 'structure.manage'));
