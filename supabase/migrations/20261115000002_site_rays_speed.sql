-- Site · velocidade do giro dos raios (1 a 20; 4 = uma volta a cada 3 minutos).
alter table public.site_settings add column if not exists rays_speed int not null default 4 check (rays_speed between 1 and 20);
