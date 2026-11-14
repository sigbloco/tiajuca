-- Cancelamento por instrumento: às vezes não há aula de um instrumento específico num dia (o evento continua para os demais).
create table public.activity_item_cancellations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  activity_id uuid not null,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (activity_id, instrument_id),
  foreign key (organization_id, activity_id) references public.activities (organization_id, id) on delete cascade
);
create trigger trg_audit_activity_item_cancellations after insert or update or delete on public.activity_item_cancellations for each row execute function public.fn_audit();

alter table public.activity_item_cancellations enable row level security;
revoke all on public.activity_item_cancellations from anon, authenticated;
grant select, insert, delete on public.activity_item_cancellations to authenticated;
create policy aic_select on public.activity_item_cancellations for select to authenticated using (public.has_permission(organization_id, 'events.read'));
create policy aic_insert on public.activity_item_cancellations for insert to authenticated with check (public.has_permission(organization_id, 'events.manage'));
create policy aic_delete on public.activity_item_cancellations for delete to authenticated using (public.has_permission(organization_id, 'events.manage'));
