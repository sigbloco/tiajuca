-- Regra: tudo da organização é relativo a um ciclo. A equipe (professor/monitor/regente de cada naipe ou instrumento)
-- passa a valer por ciclo. Quem acompanha o grupo (is_in_my_group) só vale no ciclo principal.
alter table public.staff_assignments add column if not exists cycle_id uuid;
alter table public.staff_assignments
  add constraint staff_assignments_cycle_fk foreign key (organization_id, cycle_id) references public.cycles (organization_id, id);

-- As designações que já existem passam para o ciclo principal de cada organização.
update public.staff_assignments sa
   set cycle_id = (select c.id from public.cycles c where c.organization_id = sa.organization_id order by c.is_current desc, c.starts_on desc limit 1)
 where sa.cycle_id is null;

-- Designações novas entram no ciclo principal quando o app não informa outro.
create or replace function public.fn_staff_assignment_cycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cycle_id is null then
    select c.id into new.cycle_id from public.cycles c
     where c.organization_id = new.organization_id order by c.is_current desc, c.starts_on desc limit 1;
  end if;
  return new;
end $$;
create trigger trg_staff_assignment_cycle before insert on public.staff_assignments
  for each row execute function public.fn_staff_assignment_cycle();

drop index if exists public.staff_assignments_active_uq;
create unique index staff_assignments_active_uq
  on public.staff_assignments (member_id, staff_kind, coalesce(section_id, subsection_id, instrument_id), cycle_id) where valid_to is null;

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
      and (sa.instrument_id = i.id or sa.subsection_id = i.subsection_id or sa.section_id = i.section_id)
  )
$$;
