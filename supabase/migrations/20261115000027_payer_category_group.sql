-- Grupo "Contribuintes" (Aluno, Senior, Músico convidado, Banda, Pernalta): as categorias que têm valor mensal.
-- O grupo "Artística" acaba: o que a pessoa exerce (instrumento/atividade) é o vínculo artístico, não uma categoria. Regência vai para Colaborativas.
alter table public.artistic_functions drop constraint if exists artistic_functions_kind_check;

update public.artistic_functions set kind = 'collab' where kind = 'artistic' and lower(name) in ('regência', 'regencia');
update public.artistic_functions set kind = 'payer' where kind = 'artistic';
-- Contribuinte paga pela categoria PRINCIPAL; ser também "Banda" não isenta nem cobra em dobro.
update public.artistic_functions set is_exempt = false where kind = 'payer' and not exempt_locked;

alter table public.artistic_functions add constraint artistic_functions_kind_check check (kind in ('paid', 'collab', 'payer'));
