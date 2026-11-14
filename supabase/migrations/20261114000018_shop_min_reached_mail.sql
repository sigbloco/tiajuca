-- Loja · aviso por e-mail a quem comprou quando um produto sob encomenda atinge o mínimo de unidades pagas (a produção começa).
-- Uma vez por produto: quando as unidades pagas chegam ao mínimo, todo pedido pago com o produto recebe o aviso.

alter table public.shop_products
  add column if not exists notify_min_reached boolean not null default true,
  add column if not exists min_notified_at timestamptz;

-- Fila: novo tipo de aviso, ligado ao produto (não a um evento do pedido).
alter table public.shop_email_outbox drop constraint if exists shop_email_outbox_template_check;
alter table public.shop_email_outbox add constraint shop_email_outbox_template_check
  check (template in ('order_created', 'payment_review', 'paid', 'cancelled', 'fulfillment_in_preparation', 'fulfillment_ready', 'fulfillment_picked_up', 'production_started'));
alter table public.shop_email_outbox alter column event_id drop not null;
alter table public.shop_email_outbox add column if not exists product_id uuid references public.shop_products(id) on delete cascade;
create unique index if not exists shop_outbox_production_uq on public.shop_email_outbox (order_id, product_id) where template = 'production_started';

-- Confere, para cada produto do pedido, se o mínimo foi atingido agora; se sim (e se o aviso está ligado), enfileira o e-mail para todos os compradores.
create or replace function public.shop_check_min_reached(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; pr public.shop_products; total int;
begin
  for r in select distinct oi.product_id from public.shop_order_items oi where oi.order_id = p_order and oi.product_id is not null loop
    select * into pr from public.shop_products where id = r.product_id and min_units is not null and notify_min_reached and min_notified_at is null for update;
    continue when not found;
    select coalesce(sum(oi.quantity), 0)::int into total
      from public.shop_order_items oi join public.shop_orders so on so.id = oi.order_id
     where oi.product_id = pr.id and (so.status = 'paid' or so.id = p_order);
    if total >= pr.min_units then
      update public.shop_products set min_notified_at = now() where id = pr.id;
      insert into public.shop_email_outbox (organization_id, order_id, event_id, template, to_email, product_id)
      select so.organization_id, so.id, null, 'production_started', so.customer_email, pr.id
        from public.shop_orders so
       where so.organization_id = pr.organization_id and (so.status = 'paid' or so.id = p_order)
         and exists (select 1 from public.shop_order_items oi where oi.order_id = so.id and oi.product_id = pr.id)
      on conflict do nothing;
    end if;
  end loop;
end $$;
revoke all on function public.shop_check_min_reached(uuid) from public, anon, authenticated;

do $$
declare d text; n text;
begin
  -- Ao confirmar o pagamento de um pedido, confere o mínimo dos produtos dele.
  d := pg_get_functiondef('public.shop_enqueue_email()'::regprocedure);
  n := replace(d, E'begin\n  if new.scope = ''order'' then', E'begin\n  if new.scope = ''order'' and new.to_status = ''paid'' and new.from_status is distinct from ''paid'' then\n    perform public.shop_check_min_reached(new.order_id);\n  end if;\n  if new.scope = ''order'' then');
  if n = d then raise exception 'shop_enqueue_email: trecho não encontrado'; end if;
  execute n;

  -- O envio recebe o nome do produto, o mínimo e o prazo.
  d := pg_get_functiondef('public.shop_mail_claim(integer)'::regprocedure);
  n := replace(d, '''cancel_reason'', o.cancel_reason,',
    '''cancel_reason'', o.cancel_reason, ''product'', (select jsonb_build_object(''name'', sp.name, ''min_units'', sp.min_units, ''lead_time_days'', sp.lead_time_days) from public.shop_products sp where sp.id = r.product_id),');
  if n = d then raise exception 'shop_mail_claim: trecho não encontrado'; end if;
  execute n;
end $$;
