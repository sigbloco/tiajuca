-- Loja · ações do painel de pedidos (executadas por quem tem shop.manage). Cada ação grava QUEM fez e QUANDO em shop_order_events.
-- Fluxo do pedido:        aguardando pagamento → pagamento em conferência → pago;  cancelado (a qualquer momento antes da retirada)
-- Fluxo de cada grupo:    em estoque:  pendente → pronto → retirado       sob encomenda:  pendente → em preparo → pronto → retirado
-- Dá para voltar um passo (corrigir engano). Ao RETIRAR itens em estoque, o estoque físico baixa; ao voltar a retirada, devolve.

-- Quem está agindo: pessoa logada, com permissão na organização do pedido. Devolve (organização, membro, nome).
create or replace function public.shop_admin_actor(p_org uuid, out v_member uuid, out v_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'shop.manage') then raise exception 'Você não tem permissão para gerenciar a loja.' using errcode = '42501'; end if;
  select m.id, coalesce(m.display_name, m.full_name) into v_member, v_label
    from public.members m where m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null limit 1;
end $$;
revoke all on function public.shop_admin_actor(uuid) from public, anon, authenticated;

create or replace function public.shop_transition_allowed(p_kind text, p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'stock' then (p_from, p_to) in (('pending','ready'), ('ready','picked_up'), ('ready','pending'), ('picked_up','ready'))
    when p_kind = 'made_to_order' then (p_from, p_to) in (('pending','in_preparation'), ('in_preparation','ready'), ('in_preparation','pending'),
                                                          ('ready','picked_up'), ('ready','in_preparation'), ('picked_up','ready'))
    else false end
$$;

-- Marcar como pago (depois de conferir o comprovante / o pagamento).
create or replace function public.shop_admin_mark_paid(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; a record; r jsonb;
begin
  select * into o from public.shop_orders where id = p_order;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status = 'cancelled' then raise exception 'Este pedido está cancelado. Reative o pedido antes de marcar como pago.' using errcode = 'P0001'; end if;
  r := public.shop_mark_paid(o.code, 'manual', a.v_member, a.v_label, jsonb_build_object('confirmed_manually_by', a.v_label));
  return r;
end $$;
revoke all on function public.shop_admin_mark_paid(uuid) from public, anon;
grant execute on function public.shop_admin_mark_paid(uuid) to authenticated;

-- Avançar/voltar o andamento de um grupo (em estoque ou sob encomenda). Só em pedido PAGO.
create or replace function public.shop_admin_set_fulfillment(p_order uuid, p_kind text, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; f record; a record; it record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status <> 'paid' then raise exception 'O pedido precisa estar pago para andar.' using errcode = 'P0001'; end if;
  select * into f from public.shop_fulfillments where order_id = p_order and kind = p_kind for update;
  if not found then raise exception 'Este pedido não tem itens desse tipo.' using errcode = 'P0001'; end if;
  if f.status = p_status then return jsonb_build_object('ok', true, 'status', f.status); end if;
  if not public.shop_transition_allowed(p_kind, f.status, p_status) then raise exception 'Essa mudança de status não é permitida.' using errcode = 'P0001'; end if;

  -- retirada baixa o estoque físico; desfazer a retirada devolve.
  if p_kind = 'stock' and p_status = 'picked_up' then
    for it in select variant_id, quantity from public.shop_order_items where order_id = p_order and kind = 'stock' order by variant_id loop
      update public.shop_product_variants set stock = stock - it.quantity, reserved = reserved - it.quantity where id = it.variant_id;
    end loop;
  elsif p_kind = 'stock' and f.status = 'picked_up' then
    for it in select variant_id, quantity from public.shop_order_items where order_id = p_order and kind = 'stock' order by variant_id loop
      update public.shop_product_variants set stock = stock + it.quantity, reserved = reserved + it.quantity where id = it.variant_id;
    end loop;
  end if;

  update public.shop_fulfillments set status = p_status, updated_by = a.v_member, updated_at = now() where id = f.id;
  insert into public.shop_order_events (organization_id, order_id, fulfillment_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, f.id, 'fulfillment', f.status, p_status, a.v_member, a.v_label, p_kind);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;
revoke all on function public.shop_admin_set_fulfillment(uuid, text, text) from public, anon;
grant execute on function public.shop_admin_set_fulfillment(uuid, text, text) to authenticated;

-- Cancelar (libera as reservas). Não cancela se algo já foi retirado: nesse caso trate à mão.
create or replace function public.shop_admin_cancel_order(p_order uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; a record;
begin
  select * into o from public.shop_orders where id = p_order;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status = 'cancelled' then return jsonb_build_object('ok', true, 'status', 'cancelled'); end if;
  if exists (select 1 from public.shop_fulfillments where order_id = p_order and status = 'picked_up') then
    raise exception 'Já houve retirada neste pedido. Desfaça a retirada antes de cancelar.' using errcode = 'P0001';
  end if;
  perform public.shop_cancel_order(p_order, nullif(trim(coalesce(p_reason, '')), ''), a.v_member, a.v_label);
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;
revoke all on function public.shop_admin_cancel_order(uuid, text) from public, anon;
grant execute on function public.shop_admin_cancel_order(uuid, text) to authenticated;

-- Reativar um pedido cancelado (ex.: o cliente pagou depois do prazo). Reserva o estoque de novo; volta para "pagamento em conferência".
create or replace function public.shop_admin_reactivate_order(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; a record; it record; v record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status <> 'cancelled' then raise exception 'Só é possível reativar pedidos cancelados.' using errcode = 'P0001'; end if;

  for it in select i.variant_id, i.quantity, i.product_name, i.variant_label from public.shop_order_items i where i.order_id = p_order and i.kind = 'stock' order by i.variant_id loop
    select * into v from public.shop_product_variants where id = it.variant_id for update;
    if coalesce(v.stock, 0) - v.reserved < it.quantity then
      raise exception 'Sem estoque para reativar: % (%) tem só % disponível.', it.product_name, it.variant_label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
    end if;
    update public.shop_product_variants set reserved = reserved + it.quantity where id = it.variant_id;
  end loop;

  update public.shop_orders set status = 'payment_review', cancel_reason = null, expires_at = null where id = p_order;
  update public.shop_fulfillments set status = 'pending', updated_at = now(), updated_by = a.v_member where order_id = p_order;
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, 'order', 'cancelled', 'payment_review', a.v_member, a.v_label, 'pedido reativado');
  return jsonb_build_object('ok', true, 'status', 'payment_review');
end $$;
revoke all on function public.shop_admin_reactivate_order(uuid) from public, anon;
grant execute on function public.shop_admin_reactivate_order(uuid) to authenticated;
