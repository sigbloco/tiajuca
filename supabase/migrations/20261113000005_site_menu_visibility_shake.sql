-- Início → Site: olhinho (mostrar/ocultar) em cada botão do menu e um botão que "treme" para chamar atenção (só um por vez).
alter table public.site_settings
  add column if not exists show_enrollment boolean not null default true,
  add column if not exists show_login boolean not null default true,
  add column if not exists shake_button text check (shake_button in ('enrollment', 'shop', 'login'));
