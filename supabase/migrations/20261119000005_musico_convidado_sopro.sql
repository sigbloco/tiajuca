-- Músico convidado também é por naipe: hoje todos tocam Sopro, então a categoria existente vira "Músico convidado (sopro)"
-- (mesmo valor, mesmas pessoas; a chave fixa e o tipo continuam). Outros naipes ganham a sua categoria quando houver.
update public.fee_categories fc
   set name = 'Músico convidado (sopro)',
       section_id = (select s.id from public.sections s where s.organization_id = fc.organization_id and s.name = 'Sopro')
 where fc.name = 'Músico convidado' and fc.section_id is null;
update public.artistic_functions af set name = 'Músico convidado (sopro)'
 where af.name = 'Músico convidado' and af.kind = 'payer';
