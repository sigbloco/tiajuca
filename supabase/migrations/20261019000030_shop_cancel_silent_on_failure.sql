-- Loja · se o pedido é cancelado porque o pagamento nem chegou a ser iniciado (ex.: InfinitePay fora do ar no checkout), o cliente
-- não viu nenhum pedido: então não enviamos "pedido recebido" nem "pedido cancelado". Os avisos pendentes desse pedido são descartados.

create or replace function public.shop_cancel_order(p_order uuid, p_reason text, p_actor_member uuid, p_actor_label text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o record; it record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found or o.status = 'cancelled' then return false; end if;
  for it in
    select i.variant_id, i.quantity from public.shop_order_items i
      join public.shop_fulfillments f on f.order_id = i.order_id and f.kind = i.kind
     where i.order_id = p_order and i.kind = 'stock' and f.status <> 'picked_up'
     order by i.variant_id
  loop
    update public.shop_product_variants set reserved = greatest(reserved - it.quantity, 0) where id = it.variant_id;
  end loop;
  update public.shop_orders set status = 'cancelled', cancel_reason = p_reason, expires_at = null where id = p_order;
  update public.shop_fulfillments set status = 'cancelled', updated_at = now() where order_id = p_order and status <> 'picked_up';
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, 'order', o.status, 'cancelled', p_actor_member, coalesce(p_actor_label, 'sistema'), p_reason);
  if p_reason = 'Falha ao iniciar o pagamento' then
    delete from public.shop_email_outbox where order_id = p_order and status = 'pending';
  end if;
  return true;
end $$;
revoke all on function public.shop_cancel_order(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_cancel_order(uuid, text, uuid, text) to service_role;

create extension if not exists pg_net;
