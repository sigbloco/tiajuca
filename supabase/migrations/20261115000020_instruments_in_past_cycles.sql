-- Instrumentos que pessoas tocaram em ciclos passados (ex.: Ganzá, Bombardino) estavam sem vínculo com esses ciclos e, por isso,
-- apareciam como "lixeira". Registra o vínculo instrumento ↔ ciclo onde houve participação e reativa quem tem ciclo.
insert into public.instrument_cycles (organization_id, instrument_id, cycle_id)
select distinct cp.organization_id, cp.instrument_id, cp.cycle_id
  from public.cycle_participations cp
 where cp.instrument_id is not null and cp.cycle_id is not null
   and not exists (select 1 from public.instrument_cycles ic where ic.instrument_id = cp.instrument_id and ic.cycle_id = cp.cycle_id);

insert into public.section_cycles (organization_id, section_id, cycle_id)
select distinct ic.organization_id, i.section_id, ic.cycle_id
  from public.instrument_cycles ic join public.instruments i on i.id = ic.instrument_id
 where i.section_id is not null
   and not exists (select 1 from public.section_cycles sc where sc.section_id = i.section_id and sc.cycle_id = ic.cycle_id);

update public.instruments i set is_active = true
 where not i.is_active and exists (select 1 from public.instrument_cycles ic where ic.instrument_id = i.id);
update public.sections s set is_active = true
 where not s.is_active and exists (select 1 from public.section_cycles sc where sc.section_id = s.id);
