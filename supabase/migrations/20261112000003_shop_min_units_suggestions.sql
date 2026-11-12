-- Loja · (1) meta mínima de unidades para produzir (opcional, só produtos sob encomenda) com contador de pedidos pagos;
--        (2) produtos sugeridos, escolhidos no painel, exibidos na página do produto e no carrinho.
alter table public.shop_products add column min_units integer check (min_units is null or min_units > 0);
alter table public.shop_products add column suggested_ids uuid[] not null default '{}';
alter table public.shop_products add check (min_units is null or kind = 'made_to_order');

do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  newdef := replace(def, '''lead_time_days'', p.lead_time_days,',
    '''lead_time_days'', p.lead_time_days, ''min_units'', p.min_units, ''suggested_ids'', to_jsonb(p.suggested_ids), '
    || '''confirmed_units'', case when p.min_units is null then null else coalesce((select sum(oi.quantity)::int from public.shop_order_items oi '
    || 'join public.shop_orders so on so.id = oi.order_id and so.organization_id = oi.organization_id '
    || 'where oi.product_id = p.id and so.status = ''paid''), 0) end,');
  if newdef = def then raise exception 'shop_get_public_store: lead_time_days não encontrado'; end if;
  execute newdef;
end $$;
