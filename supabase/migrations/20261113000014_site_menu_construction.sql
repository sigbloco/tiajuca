-- Início → Site → Menu: cada botão pode ser marcado "Em construção" (aparece com a etiqueta e não abre).
alter table public.site_settings
  add column if not exists menu_construction jsonb not null default '[]'::jsonb check (jsonb_typeof(menu_construction) = 'array');
