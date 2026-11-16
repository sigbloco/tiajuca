-- Nível pode valer só para alguns naipes (vazio = todos os naipes).
alter table public.skill_levels add column if not exists section_ids uuid[] not null default '{}';
