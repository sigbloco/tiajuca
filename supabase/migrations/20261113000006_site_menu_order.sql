-- Início → Site: ordem dos botões do menu (inscrições, loja, acesso).
alter table public.site_settings
  add column if not exists menu_order jsonb not null default '["enrollment","shop","login"]'::jsonb
  check (jsonb_typeof(menu_order) = 'array' and jsonb_array_length(menu_order) <= 3);
