-- Site · os raios podem girar bem devagar.
alter table public.site_settings add column if not exists rays_animate boolean not null default false;
