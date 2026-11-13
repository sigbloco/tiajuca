-- Loja · produto DESATIVADO: some da vitrine e não pode ser comprado, mas continua na lista do painel (diferente da lixeira).
alter table public.shop_products add column is_hidden boolean not null default false;

do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  newdef := replace(def, 'where p.organization_id = o.id and p.is_active', 'where p.organization_id = o.id and p.is_active and not p.is_hidden');
  if newdef = def then raise exception 'shop_get_public_store: filtro de produtos não encontrado'; end if;
  execute newdef;

  def := pg_get_functiondef('public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer)'::regprocedure);
  newdef := replace(def, 'v2.is_active and p.is_active', 'v2.is_active and p.is_active and not p.is_hidden');
  if newdef = def then raise exception 'shop_create_order: filtro de produto não encontrado'; end if;
  execute newdef;
end $$;
