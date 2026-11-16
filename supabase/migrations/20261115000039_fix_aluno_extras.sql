-- Seniors percussionistas com "Aluno (sopro)" em "também é": é Aluno (percussão). Diogo Eiras fica só com um.
delete from public.cycle_extra_categories where id = '57a77c0c-f93c-492c-9360-bfa4469ffc02';
update public.cycle_extra_categories e set fee_category_id = (select id from public.fee_categories where name = 'Aluno (percussão)')
 where fee_category_id = (select id from public.fee_categories where name = 'Aluno (sopro)')
   and exists (select 1 from public.member_artistic_links l join public.instruments i on i.id = l.instrument_id join public.sections s on s.id = i.section_id
                where l.member_id = e.member_id and l.ended_at is null and s.name ilike 'percuss%');
