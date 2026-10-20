-- Interface · todas as cores passam a viver em organizations.theme (página Interface: Geral, Site e Loja):
--   theme.primary/secondary/background/card/header = Geral;  theme.site = {…} = página inicial;  theme.shop = {…} = loja.
-- Aqui: (1) copia as cores antigas do Site (site_settings.header_color/page_color) e da Loja (shop_settings.theme_primary/secondary)
-- para o tema; (2) tira a cor da loja da vitrine/da tabela (a vitrine já recebe o tema inteiro em `org.theme`).
-- As colunas antigas de site_settings ficam sem uso (a página inicial lê o tema).

update public.organizations o
   set theme = o.theme || jsonb_build_object('site',
       coalesce(o.theme -> 'site', '{}'::jsonb)
       || jsonb_strip_nulls(jsonb_build_object('header', upper(s.header_color), 'background', upper(s.page_color))))
  from public.site_settings s
 where s.organization_id = o.id and (s.header_color is not null or s.page_color is not null);

update public.organizations o
   set theme = o.theme || jsonb_build_object('shop',
       coalesce(o.theme -> 'shop', '{}'::jsonb)
       || jsonb_strip_nulls(jsonb_build_object('primary', upper(s.theme_primary), 'secondary', upper(s.theme_secondary))))
  from public.shop_settings s
 where s.organization_id = o.id and (s.theme_primary is not null or s.theme_secondary is not null);

do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  newdef := regexp_replace(def, '''theme_override'',.*?from public\.shop_settings s where s\.organization_id = o\.id\),\s*', '', 's');
  if newdef = def then raise exception 'shop_get_public_store: theme_override não encontrado'; end if;
  execute newdef;
end $$;

alter table public.shop_settings drop column theme_primary, drop column theme_secondary;
