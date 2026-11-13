-- Início → Site: botão "Release" no menu (link configurável, normalmente um PDF no Drive).
alter table public.site_settings
  add column if not exists show_release boolean not null default true,
  add column if not exists release_label text not null default 'Release',
  add column if not exists release_url text check (release_url is null or release_url ~ '^https://');
alter table public.site_settings drop constraint if exists site_settings_menu_order_check;
alter table public.site_settings add constraint site_settings_menu_order_check check (jsonb_typeof(menu_order) = 'array' and jsonb_array_length(menu_order) <= 5);
alter table public.site_settings drop constraint if exists site_settings_shake_button_check;
alter table public.site_settings add constraint site_settings_shake_button_check check (shake_button in ('enrollment', 'shop', 'login', 'albums', 'release'));
