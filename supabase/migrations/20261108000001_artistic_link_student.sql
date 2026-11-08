-- Participação artística: marca se a pessoa participa como aluna naquela atividade (só alunos têm nível).
alter table public.member_artistic_links add column if not exists is_student boolean not null default false;
