-- Eventos: rótulos acumuláveis (Oficina, Apresentação…) e "tem presença?" por evento.
-- Os rótulos são os tipos de evento (activity_types); o tipo principal do evento (activities.activity_type_id) continua
-- sendo o primeiro rótulo, que dá a cor no calendário. Os demais ficam em activity_type_links.
alter table public.activities add column if not exists has_attendance boolean not null default true;
alter table public.activity_types add column if not exists attendance_default boolean not null default true;
-- Reunião, Evento e Outro normalmente não têm chamada.
update public.activity_types set attendance_default = false where name in ('Reunião', 'Evento', 'Outro');

create table public.activity_type_links (
  organization_id uuid not null,
  activity_id uuid not null,
  activity_type_id uuid not null,
  primary key (activity_id, activity_type_id),
  foreign key (organization_id, activity_id) references public.activities (organization_id, id) on delete cascade,
  foreign key (organization_id, activity_type_id) references public.activity_types (organization_id, id) on delete cascade
);
create trigger trg_audit_activity_type_links after insert or update or delete on public.activity_type_links for each row execute function public.fn_audit();

alter table public.activity_type_links enable row level security;
revoke all on public.activity_type_links from anon, authenticated;
grant select, insert, delete on public.activity_type_links to authenticated;
create policy atl_select on public.activity_type_links for select to authenticated using (public.is_org_member(organization_id));
create policy atl_insert on public.activity_type_links for insert to authenticated with check (public.has_permission(organization_id, 'events.manage'));
create policy atl_delete on public.activity_type_links for delete to authenticated using (public.has_permission(organization_id, 'events.manage'));
