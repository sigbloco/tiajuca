-- Naipes: marca quais têm oficina (a Presença mostra só esses naipes em cada oficina).
alter table public.sections add column if not exists has_workshop boolean not null default false;
