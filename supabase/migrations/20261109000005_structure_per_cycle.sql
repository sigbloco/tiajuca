-- Regra: tudo da organização é relativo a um ciclo. A estrutura (quais naipes e instrumentos existem) passa a valer por ciclo.
-- Naipes e instrumentos continuam um catálogo único (nome, ordem, histórico); estas tabelas dizem quais estão no ciclo.
create table public.section_cycles (
  organization_id uuid not null,
  section_id uuid not null,
  cycle_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (section_id, cycle_id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);
create table public.instrument_cycles (
  organization_id uuid not null,
  instrument_id uuid not null,
  cycle_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (instrument_id, cycle_id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id)
);

-- Quem existe hoje entra em todos os ciclos já criados.
insert into public.section_cycles (organization_id, section_id, cycle_id)
  select s.organization_id, s.id, c.id from public.sections s join public.cycles c on c.organization_id = s.organization_id where s.is_active;
insert into public.instrument_cycles (organization_id, instrument_id, cycle_id)
  select i.organization_id, i.id, c.id from public.instruments i join public.cycles c on c.organization_id = i.organization_id where i.is_active;

-- Naipe ou instrumento novo entra no ciclo principal.
create or replace function public.fn_structure_in_current_cycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cycle uuid;
begin
  select c.id into v_cycle from public.cycles c where c.organization_id = new.organization_id order by c.is_current desc, c.starts_on desc limit 1;
  if v_cycle is not null then
    if tg_table_name = 'sections' then
      insert into public.section_cycles (organization_id, section_id, cycle_id) values (new.organization_id, new.id, v_cycle) on conflict do nothing;
    else
      insert into public.instrument_cycles (organization_id, instrument_id, cycle_id) values (new.organization_id, new.id, v_cycle) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger trg_section_in_cycle after insert on public.sections for each row execute function public.fn_structure_in_current_cycle();
create trigger trg_instrument_in_cycle after insert on public.instruments for each row execute function public.fn_structure_in_current_cycle();

do $$
declare t text;
begin
  foreach t in array array['section_cycles', 'instrument_cycles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, delete on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_permission(organization_id, ''structure.manage''))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.has_permission(organization_id, ''structure.manage''))', t);
  end loop;
end $$;

-- Copia a organização de um ciclo para outro: estrutura, oficinas, vagas e equipe. O que já existe no destino é mantido.
create or replace function public.copy_cycle_setup(p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_org2 uuid;
begin
  select organization_id into v_org from public.cycles where id = p_from;
  select organization_id into v_org2 from public.cycles where id = p_to;
  if v_org is null or v_org2 is null or v_org <> v_org2 then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  if not (public.has_permission(v_org, 'structure.manage') and public.has_permission(v_org, 'staff_assignments.manage')) then
    raise exception 'Sem permissão para copiar a organização do ciclo.' using errcode = '42501';
  end if;
  insert into public.section_cycles (organization_id, section_id, cycle_id)
    select organization_id, section_id, p_to from public.section_cycles where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycles (organization_id, instrument_id, cycle_id)
    select organization_id, instrument_id, p_to from public.instrument_cycles where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycle_workshop (organization_id, instrument_id, cycle_id, has_workshop)
    select organization_id, instrument_id, p_to, has_workshop from public.instrument_cycle_workshop where cycle_id = p_from on conflict do nothing;
  insert into public.instrument_cycle_capacity (organization_id, instrument_id, cycle_id, capacity)
    select organization_id, instrument_id, p_to, capacity from public.instrument_cycle_capacity where cycle_id = p_from on conflict do nothing;
  insert into public.staff_assignments (organization_id, member_id, staff_kind, section_id, subsection_id, instrument_id, cycle_id)
    select sa.organization_id, sa.member_id, sa.staff_kind, sa.section_id, sa.subsection_id, sa.instrument_id, p_to
      from public.staff_assignments sa where sa.cycle_id = p_from and sa.valid_to is null on conflict do nothing;
end $$;
revoke all on function public.copy_cycle_setup(uuid, uuid) from public, anon;
grant execute on function public.copy_cycle_setup(uuid, uuid) to authenticated;
