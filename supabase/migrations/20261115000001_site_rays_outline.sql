-- Site · contorno da logo é opcional e tem cor própria (vazia = cor do site).
alter table public.site_settings
  add column if not exists rays_outline boolean not null default true,
  add column if not exists rays_outline_color text;
