-- Repertório por ciclo: cada repertório pertence a um ciclo. Os já existentes ficam no ciclo atual da organização.
alter table public.repertoires add column if not exists cycle_id uuid;
alter table public.repertoires drop constraint if exists repertoires_cycle_fk;
alter table public.repertoires add constraint repertoires_cycle_fk foreign key (organization_id, cycle_id) references public.cycles (organization_id, id);
create index if not exists repertoires_cycle_idx on public.repertoires (cycle_id);
update public.repertoires r set cycle_id = (select c.id from public.cycles c where c.organization_id = r.organization_id and c.is_current limit 1) where r.cycle_id is null;
