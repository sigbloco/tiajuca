-- "Aluno" é categoria de contribuição, não marca da participação artística.
update public.member_artistic_links set is_student = false where is_student;
update public.cycle_participations set is_student = false where is_student;
