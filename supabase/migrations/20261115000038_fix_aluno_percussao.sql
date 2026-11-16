-- Alunos de percussão estavam com a categoria "Aluno (sopro)": corrige no ciclo atual e no cadastro vigente.
do $$
declare s uuid; p uuid; cur uuid;
begin
  select id into s from public.fee_categories where name = 'Aluno (sopro)';
  select id into p from public.fee_categories where name = 'Aluno (percussão)';
  select id into cur from public.cycles where is_current limit 1;
  update public.cycle_fee_assignments a set fee_category_id = p
   where a.fee_category_id = s and a.cycle_id = cur
     and exists (select 1 from public.cycle_participations x join public.instruments i on i.id = x.instrument_id join public.sections sc on sc.id = i.section_id
                  where x.member_id = a.member_id and x.cycle_id = a.cycle_id and sc.name ilike 'percuss%');
  update public.member_fee_assignments a set fee_category_id = p
   where a.fee_category_id = s and a.valid_to is null
     and exists (select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id join public.sections sc on sc.id = i.section_id
                  where l.member_id = a.member_id and l.ended_at is null and sc.name ilike 'percuss%');
  -- Diogo (Senior) também é aluno: "também é"
  insert into public.cycle_extra_categories (organization_id, member_id, cycle_id, fee_category_id)
  select organization_id, 'f05e7605-a9dc-4ddc-a5b1-a6056904178e', cur, p from public.fee_categories where id = p
  on conflict do nothing;
end $$;
