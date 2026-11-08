-- Quem hoje contribui na categoria "Aluno" passa a ter o vínculo artístico atual marcado como aluno.
update public.member_artistic_links l set is_student = true
 where l.ended_at is null and l.instrument_id is not null
   and exists (select 1 from public.member_fee_assignments a join public.fee_categories c on c.id = a.fee_category_id
                where a.member_id = l.member_id and a.valid_to is null and c.name = 'Aluno');
