-- Regência é só atividade artística: não é remunerada.
update public.staff_assignments set compensation = 'collaborative' where staff_kind = 'regente' and compensation <> 'collaborative';

-- Nando (Fernando Ferreira) foi regente da percussão no ciclo 2024/25.
insert into public.staff_assignments (organization_id, member_id, staff_kind, section_id, compensation, cycle_id, valid_from, valid_to)
select m.organization_id, m.id, 'regente', s.id, 'collaborative', cy.id, cy.starts_on, cy.ends_on
  from public.members m
  join public.cycles cy on cy.organization_id = m.organization_id and cy.name = 'Carnaval 2024/25'
  join public.sections s on s.organization_id = m.organization_id and s.name = 'Percussão'
 where m.full_name = 'Fernando Ferreira'
   and not exists (select 1 from public.staff_assignments a where a.member_id = m.id and a.cycle_id = cy.id and a.staff_kind = 'regente' and a.section_id = s.id);
