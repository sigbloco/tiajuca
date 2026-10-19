-- Loja · registro de que o cliente leu o aviso de privacidade ao comprar. A Edge Function `shop-checkout` só cria o pedido se o aceite vier
-- marcado; a data/hora do pedido passa a valer como data do aceite.
alter table public.shop_orders add column privacy_accepted_at timestamptz not null default now();
