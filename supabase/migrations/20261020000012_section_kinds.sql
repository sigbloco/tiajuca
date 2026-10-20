-- Cada nome de naipe define: se os itens têm afinação ("altura definida") ou não ("altura indefinida"), e como se chamam os itens
-- (Instrumento, Atividade, Voz). O naipe criado a partir do nome herda essas configurações.
alter table public.section_names
  add column has_tuning boolean not null default true,
  add column item_label text not null default 'Instrumento' check (item_label in ('Instrumento', 'Atividade', 'Voz'));
alter table public.sections
  add column item_label text not null default 'Instrumento' check (item_label in ('Instrumento', 'Atividade', 'Voz'));

update public.section_names set has_tuning = false where name = 'Percussão';
update public.section_names set has_tuning = false, item_label = 'Atividade' where name = 'Performance';
update public.sections set has_tuning = false where name = 'Percussão';
update public.sections set has_tuning = false, item_label = 'Atividade' where name = 'Performance';
-- Cordas e Canto eram só exemplos.
delete from public.section_names where name in ('Cordas', 'Canto');
