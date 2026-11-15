-- Site · controles dos raios: quantidade, transparência, giro e cor (sem cor, usa a cor secundária do site).
alter table public.site_settings
  add column if not exists rays_count int not null default 16 check (rays_count between 4 and 60),
  add column if not exists rays_opacity int not null default 100 check (rays_opacity between 5 and 100),
  add column if not exists rays_rotation int not null default 0 check (rays_rotation between 0 and 360),
  add column if not exists rays_color text;
