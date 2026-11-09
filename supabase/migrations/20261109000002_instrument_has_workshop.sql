-- Instrumentos: quais têm oficina (a Presença filtra a chamada por eles).
alter table public.instruments add column if not exists has_workshop boolean not null default false;
