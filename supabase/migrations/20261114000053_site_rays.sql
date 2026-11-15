-- Site · "raios" atrás da logo (como na camiseta): ligados/desligados no cabeçalho do site.
alter table public.site_settings add column if not exists show_rays boolean not null default false;
