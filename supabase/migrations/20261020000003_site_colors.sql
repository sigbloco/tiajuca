-- Cores da página inicial escolhidas pela Direção (hex #RRGGBB). Vazio = usa as cores do tema do bloco.
alter table public.site_settings
  add column header_color text check (header_color is null or header_color ~ '^#[0-9a-fA-F]{6}$'),
  add column page_color text check (page_color is null or page_color ~ '^#[0-9a-fA-F]{6}$');
