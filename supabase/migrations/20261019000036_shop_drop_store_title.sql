-- Loja · o nome da loja já é editável em Configurações > Site (shop_label, usado no menu, no site e na vitrine). Para não haver duas fontes
-- de verdade, o título próprio da loja criado na 0035 sai: a vitrine usa o nome do Site.
do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  newdef := replace(def, '''title'', coalesce((select s.store_title from public.shop_settings s where s.organization_id = o.id), ''Loja '' || o.short_name),', '');
  if newdef = def then raise exception 'shop_get_public_store: trecho do título não encontrado'; end if;
  execute newdef;
end $$;
alter table public.shop_settings drop column store_title;
