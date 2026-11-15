-- Descrição opcional nos itens das listas automáticas (listas do cadastro e categorias de Organização).
alter table public.skill_levels add column if not exists description text;
alter table public.gender_options add column if not exists description text;
alter table public.race_options add column if not exists description text;
alter table public.artistic_functions add column if not exists description text;
alter table public.form_list_items add column if not exists description text;
