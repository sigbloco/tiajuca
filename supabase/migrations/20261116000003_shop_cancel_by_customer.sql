-- Loja · o cliente cancela um pedido que ainda não foi pago (aguardando pagamento). Libera a reserva do estoque.
-- Dono = conta logada (user_id/e-mail) OU código + telefone da compra. Pedido em conferência/pago não pode ser cancelado aqui.
create or replace function public.shop_cancel_by_customer(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; v_phone text;
begin
  if p_user is not null then
    select * into o from public.shop_orders
     where (p_org is null or organization_id = p_org) and code = upper(trim(p_code))
       and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email))) for update;
  else
    begin v_phone := public.shop_normalize_phone(p_phone);
    exception when others then return jsonb_build_object('ok', false, 'reason', 'not_found'); end;
    select * into o from public.shop_orders
     where (p_org is null or organization_id = p_org) and code = upper(trim(p_code)) and customer_phone = v_phone for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status <> 'awaiting_payment' then return jsonb_build_object('ok', false, 'reason', 'locked', 'status', o.status); end if;
  perform public.shop_cancel_order(o.id, 'Cancelado pelo cliente', null, 'cliente');
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;
revoke all on function public.shop_cancel_by_customer(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.shop_cancel_by_customer(uuid, uuid, text, text, text) to service_role;
