-- Loja · confirmação de pagamento (usada pelo webhook da InfinitePay agora e pelo painel na etapa de pedidos) e consulta mínima de status.

-- Guarda dados do pagamento externo (link, slug, transaction_nsu…), sem mexer no status.
create or replace function public.shop_set_payment_ref(p_code text, p_ref jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.shop_orders set payment_ref = payment_ref || coalesce(p_ref, '{}'::jsonb) where code = upper(trim(p_code))
$$;
revoke all on function public.shop_set_payment_ref(text, jsonb) from public, anon, authenticated;
grant execute on function public.shop_set_payment_ref(text, jsonb) to service_role;

-- Marca o pedido como pago. Idempotente (webhook pode repetir). Pedido já cancelado NÃO é reaberto sozinho: fica registrado
-- um evento para a Direção decidir (reativar ou reembolsar), porque o estoque reservado já foi liberado.
create or replace function public.shop_mark_paid(p_code text, p_via text, p_actor_member uuid, p_actor_label text, p_ref jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  select * into o from public.shop_orders where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_via not in ('manual', 'webhook') then raise exception 'Origem de pagamento inválida.' using errcode = 'P0001'; end if;

  if o.status = 'paid' then return jsonb_build_object('ok', true, 'status', 'paid', 'already', true); end if;

  if o.status = 'cancelled' then
    insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
    values (o.organization_id, o.id, 'order', 'cancelled', 'cancelled', p_actor_member, coalesce(p_actor_label, 'sistema'),
            'PAGAMENTO RECEBIDO APÓS O CANCELAMENTO: reativar o pedido ou reembolsar o cliente');
    update public.shop_orders set payment_ref = payment_ref || coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('paid_after_cancel', true) where id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  update public.shop_orders
     set status = 'paid', paid_at = now(), paid_by = p_actor_member, paid_via = p_via, expires_at = null,
         payment_ref = payment_ref || coalesce(p_ref, '{}'::jsonb)
   where id = o.id;
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, o.id, 'order', o.status, 'paid', p_actor_member, coalesce(p_actor_label, case when p_via = 'webhook' then 'InfinitePay' else 'sistema' end),
          case when p_via = 'webhook' then 'confirmado automaticamente pela InfinitePay' end);
  return jsonb_build_object('ok', true, 'status', 'paid');
end $$;
revoke all on function public.shop_mark_paid(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.shop_mark_paid(text, text, uuid, text, jsonb) to service_role;

-- Dados mínimos para a função validar um pagamento: total e método. Nada de dados pessoais.
create or replace function public.shop_order_for_payment(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'code', code, 'status', status, 'total_cents', total_cents, 'payment_method', payment_method, 'payment_ref', payment_ref)
    from public.shop_orders where code = upper(trim(p_code))
$$;
revoke all on function public.shop_order_for_payment(text) from public, anon, authenticated;
grant execute on function public.shop_order_for_payment(text) to service_role;

-- Status do pedido para quem tem código + telefone (a tela de confirmação atualiza sozinha quando o pagamento é confirmado).
create or replace function public.shop_order_status(p_code text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_phone text; r record;
begin
  begin v_phone := public.shop_normalize_phone(p_phone);
  exception when others then return jsonb_build_object('ok', false); end;
  select status into r from public.shop_orders where code = upper(trim(p_code)) and customer_phone = v_phone;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'status', r.status);
end $$;
revoke all on function public.shop_order_status(text, text) from public, anon, authenticated;
grant execute on function public.shop_order_status(text, text) to service_role;
