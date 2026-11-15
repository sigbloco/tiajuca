-- Site · raios podem cobrir a página toda (o fundo do cabeçalho some e vale o fundo da página).
alter table public.site_settings add column if not exists rays_full boolean not null default false;
