-- Loja · desfazer o aviso "já fiz o pagamento" (clique sem querer): volta de "em conferência" para "aguardando pagamento",
-- com novo prazo de reserva. Só enquanto a loja ainda não confirmou o pagamento. Dono = conta logada OU código + telefone.
create or replace function public.shop_unreport_payment(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; v_phone text; v_hours int;
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
  if o.status = 'awaiting_payment' then return jsonb_build_object('ok', true, 'status', 'awaiting_payment'); end if;
  if o.status <> 'payment_review' then return jsonb_build_object('ok', false, 'reason', 'locked', 'status', o.status); end if;
  select coalesce(reservation_hours, 48) into v_hours from public.shop_settings where organization_id = o.organization_id;
  update public.shop_orders set status = 'awaiting_payment', expires_at = now() + make_interval(hours => coalesce(v_hours, 48)) where id = o.id;
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
  values (o.organization_id, o.id, 'order', 'payment_review', 'awaiting_payment', 'cliente', 'cliente desfez o aviso de pagamento');
  return jsonb_build_object('ok', true, 'status', 'awaiting_payment');
end $$;
revoke all on function public.shop_unreport_payment(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.shop_unreport_payment(uuid, uuid, text, text, text) to service_role;
