-- Altura do naipe: definida (tem afinação), indefinida ou não se aplica. O tipo de item (Instrumento, Atividade, Voz…) vira texto livre.
alter table public.section_names add column pitch_mode text not null default 'defined' check (pitch_mode in ('defined', 'undefined', 'na'));
alter table public.sections add column pitch_mode text not null default 'defined' check (pitch_mode in ('defined', 'undefined', 'na'));
alter table public.section_names drop constraint section_names_item_label_check;
alter table public.sections drop constraint sections_item_label_check;
alter table public.section_names add constraint section_names_item_label_len check (length(trim(item_label)) between 1 and 30);
alter table public.sections add constraint sections_item_label_len check (length(trim(item_label)) between 1 and 30);

update public.section_names set pitch_mode = 'undefined' where name = 'Percussão';
update public.section_names set pitch_mode = 'na' where name = 'Performance';
update public.sections set pitch_mode = 'undefined' where name = 'Percussão';
update public.sections set pitch_mode = 'na' where name = 'Performance';
-- Atividades de Performance não têm altura: nada de "indefinida" nelas.
update public.instruments set tuning = null where section_id in (select id from public.sections where name = 'Performance') and tuning = 'indef';
