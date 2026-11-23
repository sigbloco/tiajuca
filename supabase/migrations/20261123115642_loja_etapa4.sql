-- Etapa 4 da revisão: loja.
-- LOJA-02/LOJA-14 (D6: "avisei que paguei" desligado de vez), LOJA-06 (D12: cupom com validade e limite de usos, limite por IP),
-- LOJA-08 (e-mail de pedido por destinatário), LOJA-10 (aviso de troca dos dados de recebimento), LOJA-12 (pedido duplicado sem e-mail),
-- LOJA-13 (D10: taxa do cartão no painel), LOJA-15 (limite sem corrida), LOJA-17 (reativar só o que foi cancelado),
-- LGPD-01 (D5: anonimizar pedidos depois do prazo do aviso).

-- ───────────── D6: "pagamento em conferência" deixa de existir ─────────────
-- Nenhum pedido está nesse estado hoje (conferido antes da migration). Quem paga por Pix manda o comprovante; a loja marca como pago.
drop function if exists public.shop_report_payment_owned(uuid, uuid, text, text);
drop function if exists public.shop_report_payment(text, text);

do $$ begin
  if exists (select 1 from public.shop_orders where status = 'payment_review') then
    raise exception 'Há pedidos em "pagamento em conferência": resolva-os antes desta migration.';
  end if;
end $$;
alter table public.shop_orders drop constraint shop_orders_status_check;
alter table public.shop_orders add constraint shop_orders_status_check check (status in ('awaiting_payment', 'paid', 'cancelled'));
delete from public.shop_email_outbox where template = 'payment_review' and status = 'pending';
alter table public.shop_email_outbox drop constraint shop_email_outbox_template_check;
alter table public.shop_email_outbox add constraint shop_email_outbox_template_check check (template in
  ('order_created', 'paid', 'cancelled', 'fulfillment_in_preparation', 'fulfillment_ready', 'fulfillment_picked_up', 'production_started'));

-- LOJA-17: reativar volta a "aguardando pagamento" com um prazo novo, e só refaz a reserva e o andamento do que foi cancelado
-- (um grupo já retirado continua retirado). Se o cliente já pagou, a loja marca como pago em seguida.
create or replace function public.shop_admin_reactivate_order(p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o record; a record; it record; v record; v_hours int;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if o.status <> 'cancelled' then raise exception 'Só é possível reativar pedidos cancelados.' using errcode = 'P0001'; end if;

  for it in
    select i.variant_id, i.quantity, i.product_name, i.variant_label
      from public.shop_order_items i
      join public.shop_fulfillments f on f.order_id = i.order_id and f.kind = i.kind
     where i.order_id = p_order and i.kind = 'stock' and f.status = 'cancelled'
     order by i.variant_id
  loop
    select * into v from public.shop_product_variants where id = it.variant_id for update;
    if coalesce(v.stock, 0) - v.reserved < it.quantity then
      raise exception 'Sem estoque para reativar: % (%) tem só % disponível.', it.product_name, it.variant_label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
    end if;
    update public.shop_product_variants set reserved = reserved + it.quantity where id = it.variant_id;
  end loop;

  select coalesce((select s.reservation_hours from public.shop_settings s where s.organization_id = o.organization_id), 48) into v_hours;
  update public.shop_orders set status = 'awaiting_payment', cancel_reason = null, expires_at = now() + make_interval(hours => v_hours) where id = p_order;
  update public.shop_fulfillments set status = 'pending', updated_at = now(), updated_by = a.v_member where order_id = p_order and status = 'cancelled';
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, 'order', 'cancelled', 'awaiting_payment', a.v_member, a.v_label, 'pedido reativado');
  return jsonb_build_object('ok', true, 'status', 'awaiting_payment');
end $$;

-- ───────────── LOJA-15: limite sem corrida e sem DELETE a cada chamada ─────────────
create or replace function public.shop_rate_limit(p_bucket text, p_max integer, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  -- Uma chamada por vez em cada contador: duas requisições simultâneas não passam juntas do limite.
  perform pg_advisory_xact_lock(hashtextextended('shop_rate_limit:' || p_bucket, 0));
  select count(*) into n from public.shop_lookup_attempts where bucket = p_bucket and created_at > now() - p_window;
  if n >= p_max then return false; end if;
  insert into public.shop_lookup_attempts (bucket) values (p_bucket);
  return true;
end $$;
create index if not exists shop_lookup_attempts_bucket_idx on public.shop_lookup_attempts (bucket, created_at);

-- A limpeza das tentativas antigas vai para a tarefa de 15 em 15 minutos.
create or replace function public.shop_expire_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.shop_orders where status = 'awaiting_payment' and expires_at < now() order by expires_at limit 200 loop
    if public.shop_cancel_order(r.id, 'Prazo para pagamento expirado', null, 'sistema') then n := n + 1; end if;
  end loop;
  delete from public.shop_lookup_attempts where created_at < now() - interval '2 days';
  return n;
end $$;

-- ───────────── LOJA-06 (D12): cupom com validade e limite de usos ─────────────
alter table public.shop_coupons
  add column if not exists valid_until date,
  add column if not exists max_uses integer check (max_uses is null or max_uses > 0);
comment on column public.shop_coupons.valid_until is 'Último dia de uso (horário de Brasília). Nulo = sem validade.';
comment on column public.shop_coupons.max_uses is 'Quantos pedidos não cancelados podem usar o cupom. Nulo = sem limite.';

/** IP de quem chamou a API (cabeçalho do Cloudflare, que o cliente não consegue forjar). Nulo se não houver. */
create or replace function public.shop_request_ip()
returns text language sql stable set search_path = '' as $$
  select nullif(btrim(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip'),
    split_part((nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ',', 1))), '')
$$;
revoke all on function public.shop_request_ip() from public, anon, authenticated;

/** Usos que contam no limite: pedidos não cancelados que ficaram com o cupom. */
create or replace function public.shop_coupon_uses(p_org uuid, p_code text)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.shop_orders where organization_id = p_org and coupon_code = p_code and status <> 'cancelled'
$$;
revoke all on function public.shop_coupon_uses(uuid, text) from public, anon, authenticated;

-- Limite por IP (30 conferências a cada 10 minutos). O contador da loja inteira, que deixava qualquer um travar os cupons de todos, saiu.
create or replace function public.shop_coupon_check(p_slug text, p_code text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_ip text := public.shop_request_ip(); c public.shop_coupons;
begin
  select id into v_org from public.organizations where slug = p_slug and is_active;
  if v_org is null then return null; end if;
  if not public.shop_rate_limit('coupon-ip|' || coalesce(encode(extensions.digest(v_ip, 'sha256'), 'hex'), 'sem-ip|' || p_slug),
                                case when v_ip is null then 120 else 30 end, interval '10 minutes') then return null; end if;
  select * into c from public.shop_coupons
   where organization_id = v_org and code = upper(trim(coalesce(p_code, ''))) and is_active;
  if c.id is null then return null; end if;
  if c.valid_until is not null and c.valid_until < (now() at time zone 'America/Sao_Paulo')::date then return null; end if;
  if c.max_uses is not null and public.shop_coupon_uses(v_org, c.code) >= c.max_uses then return null; end if;
  return c.discount_pct;
end $$;

-- shop_create_order: igual ao anterior, mais a validade e o limite de usos do cupom (com a linha do cupom travada,
-- para dois pedidos simultâneos não passarem do limite). O preço especial (D2) fica como está.
create or replace function public.shop_create_order(p_org uuid, p_user uuid, p_name text, p_phone text, p_email text, p_pickup uuid, p_method text, p_items jsonb, p_hours integer, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.shop_normalize_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_member uuid; v_special boolean := false; v_pp record; v_order uuid; v_code text;
  r record; v_unit int; v_pct numeric; v_sub int := 0; v_total int := 0; v_open int; v_kinds text[] := '{}';
  v_items jsonb := '[]'::jsonb; v_coupon public.shop_coupons; v_coupon_off int := 0; v_unit2 int;
begin
  if v_name = '' or length(v_name) > 120 then raise exception 'Informe o seu nome.' using errcode = 'P0001'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'Informe um e-mail válido.' using errcode = 'P0001'; end if;
  if p_method not in ('pix', 'infinitepay') then raise exception 'Método de pagamento inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'O carrinho está vazio ou grande demais.' using errcode = 'P0001';
  end if;

  select * into v_pp from public.shop_pickup_points where id = p_pickup and organization_id = p_org and is_active and public.shop_schedule_has_future(schedule);
  if not found then raise exception 'Escolha um ponto de retirada válido.' using errcode = 'P0001'; end if;

  select count(*) into v_open from public.shop_orders
   where organization_id = p_org and status = 'awaiting_payment' and (customer_phone = v_phone or lower(customer_email) = v_email);
  if v_open >= 3 then raise exception 'Você já tem pedidos aguardando pagamento. Conclua ou aguarde o prazo deles antes de fazer outro.' using errcode = 'P0001'; end if;

  if p_user is not null then v_member := public.shop_active_member_id(p_org, p_user); v_special := public.shop_is_special(p_org, p_user); end if;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    select * into v_coupon from public.shop_coupons where organization_id = p_org and code = upper(trim(p_coupon)) and is_active for update;
    if v_coupon.id is null then raise exception 'Cupom inválido ou desativado.' using errcode = 'P0001'; end if;
    if v_coupon.valid_until is not null and v_coupon.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'O cupom % passou da validade. Tire o cupom para continuar.', v_coupon.code using errcode = 'P0001';
    end if;
    if v_coupon.max_uses is not null and public.shop_coupon_uses(p_org, v_coupon.code) >= v_coupon.max_uses then
      raise exception 'O cupom % já foi usado o número máximo de vezes. Tire o cupom para continuar.', v_coupon.code using errcode = 'P0001';
    end if;
  end if;

  v_code := public.shop_new_order_code();
  insert into public.shop_orders (organization_id, code, customer_name, customer_phone, customer_email, member_id, pickup_point_id,
                                  payment_method, subtotal_cents, discount_cents, total_cents, expires_at)
  values (p_org, v_code, v_name, v_phone, v_email, v_member, p_pickup, p_method, 1, 0, 1, now() + make_interval(hours => p_hours))
  returning id into v_order;

  for r in
    select x.variant_id, sum(x.quantity)::int as qty
      from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity int)
     group by x.variant_id order by x.variant_id
  loop
    declare v record;
    begin
      if r.qty is null or r.qty < 1 or r.qty > 20 then raise exception 'Quantidade inválida no carrinho.' using errcode = 'P0001'; end if;
      select v2.id as variant_id, v2.label, v2.stock, v2.reserved, p.id as product_id, p.name, p.kind, p.price_cents, p.member_discount_pct, p.special_price_cents
        into v
        from public.shop_product_variants v2
        join public.shop_products p on p.id = v2.product_id and p.organization_id = v2.organization_id
       where v2.id = r.variant_id and v2.organization_id = p_org and v2.is_active and p.is_active and not p.is_hidden
         for update of v2;
      if not found then raise exception 'Um item do carrinho não está mais à venda. Atualize o carrinho.' using errcode = 'P0001'; end if;
      if exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id)
         and not exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id and pk.pickup_point_id = p_pickup) then
        raise exception '% não pode ser retirado no ponto escolhido. Escolha outro ponto de retirada.', v.name using errcode = 'P0001';
      end if;

      if v.kind = 'stock' then
        if coalesce(v.stock, 0) - v.reserved < r.qty then
          raise exception 'Estoque insuficiente para % (%). Restam % unidade(s).', v.name, v.label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
        end if;
        update public.shop_product_variants set reserved = reserved + r.qty where id = v.variant_id;
      end if;

      v_pct := case when v_member is not null then v.member_discount_pct else 0 end;
      v_unit := round(v.price_cents * (100 - v_pct) / 100.0)::int;
      if v_special and v.special_price_cents is not null then
        v_unit := least(v.special_price_cents, v.price_cents);
        v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
      end if;
      if v_coupon.id is not null then
        v_unit2 := round(v.price_cents * (100 - v_coupon.discount_pct) / 100.0)::int;
        if v_unit2 > 0 and v_unit2 < v_unit then
          v_coupon_off := v_coupon_off + (v_unit - v_unit2) * r.qty;
          v_unit := v_unit2;
          v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
        end if;
      end if;
      if v_unit <= 0 then raise exception 'Preço inválido para %.', v.name using errcode = 'P0001'; end if;

      insert into public.shop_order_items (organization_id, order_id, product_id, variant_id, kind, product_name, variant_label,
                                           quantity, unit_price_cents, discount_pct, unit_final_cents)
      values (p_org, v_order, v.product_id, v.variant_id, v.kind, v.name, v.label, r.qty, v.price_cents, v_pct, v_unit);

      v_sub := v_sub + v.price_cents * r.qty;
      v_total := v_total + v_unit * r.qty;
      if not (v.kind = any (v_kinds)) then v_kinds := v_kinds || v.kind; end if;
      v_items := v_items || jsonb_build_object('name', v.name, 'variant', v.label, 'quantity', r.qty, 'unit_final_cents', v_unit, 'kind', v.kind);
    end;
  end loop;

  update public.shop_orders set subtotal_cents = v_sub, discount_cents = v_sub - v_total, total_cents = v_total,
         coupon_code = case when v_coupon_off > 0 then v_coupon.code end, coupon_pct = case when v_coupon_off > 0 then v_coupon.discount_pct end, coupon_discount_cents = v_coupon_off
   where id = v_order;
  insert into public.shop_fulfillments (organization_id, order_id, kind) select p_org, v_order, unnest(v_kinds);
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
  values (p_org, v_order, 'order', null, 'awaiting_payment', 'cliente', case when v_member is not null then 'preço de integrante' end);

  return jsonb_build_object(
    'code', v_code, 'status', 'awaiting_payment', 'payment_method', p_method,
    'subtotal_cents', v_sub, 'discount_cents', v_sub - v_total, 'total_cents', v_total,
    'coupon_code', case when v_coupon_off > 0 then v_coupon.code end, 'coupon_discount_cents', v_coupon_off,
    'expires_at', (select expires_at from public.shop_orders where id = v_order), 'is_member_price', v_member is not null,
    'pickup', jsonb_build_object('name', v_pp.name, 'address', v_pp.address, 'opening_hours', coalesce(public.shop_pickup_when(v_pp.schedule, v_pp.opening_hours), '')),
    'items', v_items, 'kinds', to_jsonb(v_kinds));
end $$;
revoke all on function public.shop_create_order(uuid, uuid, text, text, text, uuid, text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.shop_create_order(uuid, uuid, text, text, text, uuid, text, jsonb, integer, text) to service_role;

-- ───────────── E-mails: LOJA-08 (destinatário) e LOJA-12 (pedido duplicado) ─────────────
-- "Pedido recebido" vai no máximo 5 vezes por dia para o mesmo e-mail (quem digita o e-mail de outra pessoa não vira disparador de spam).
-- O pedido continua criado e aparece na tela; só o e-mail deixa de sair.
create or replace function public.shop_enqueue_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text; v_email text;
begin
  if new.scope = 'order' and new.to_status = 'paid' and new.from_status is distinct from 'paid' then
    perform public.shop_check_min_reached(new.order_id);
  end if;
  if new.scope = 'order' then
    t := case
      when new.from_status is null and new.to_status = 'awaiting_payment' then 'order_created'
      when new.from_status is distinct from 'paid' and new.to_status = 'paid' then 'paid'
      when new.from_status is distinct from 'cancelled' and new.to_status = 'cancelled' then 'cancelled'
    end;
  else
    t := case
      when (new.from_status, new.to_status) in (('pending', 'in_preparation')) then 'fulfillment_in_preparation'
      when (new.from_status, new.to_status) in (('pending', 'ready'), ('in_preparation', 'ready')) then 'fulfillment_ready'
      when (new.from_status, new.to_status) in (('ready', 'picked_up')) then 'fulfillment_picked_up'
    end;
  end if;
  if t is null then return new; end if;
  select customer_email into v_email from public.shop_orders where id = new.order_id;
  if t = 'order_created' and (select count(*) from public.shop_email_outbox b
                               where b.template = 'order_created' and lower(b.to_email) = lower(v_email) and b.created_at > now() - interval '1 day') >= 5 then
    return new;
  end if;
  insert into public.shop_email_outbox (organization_id, order_id, event_id, template, to_email)
  values (new.organization_id, new.order_id, new.id, t, v_email) on conflict (event_id, template) do nothing;
  return new;
end $$;
create index if not exists shop_email_outbox_to_email_idx on public.shop_email_outbox (lower(to_email), created_at) where template = 'order_created';

-- Pedido descartado por ser duplicado (ou que não conseguiu iniciar o pagamento): o cliente não recebe "recebido" nem "cancelado".
create or replace function public.shop_cancel_order(p_order uuid, p_reason text, p_actor_member uuid, p_actor_label text)
returns boolean language plpgsql security definer set search_path = '' as $$
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
  if p_reason in ('Falha ao iniciar o pagamento', 'Pedido duplicado') then
    delete from public.shop_email_outbox where order_id = p_order and status = 'pending';
  end if;
  return true;
end $$;

-- ───────────── LOJA-13 (D10): taxa do cartão configurável ─────────────
alter table public.shop_settings add column if not exists credit_fees_pct numeric[] not null
  default '{4.2,6.09,7.01,7.91,8.8,9.67,12.59,13.42,14.25,15.06,15.87,16.66}';
alter table public.shop_settings add constraint shop_settings_credit_fees_check check (
  cardinality(credit_fees_pct) between 1 and 12 and 0 <= all (credit_fees_pct) and 50 > all (credit_fees_pct));
comment on column public.shop_settings.credit_fees_pct is 'Taxa da InfinitePay no crédito, em %, de 1x até Nx (repassada a quem paga no cartão).';

-- ───────────── LOJA-10: quem mudou os dados de recebimento, e quando ─────────────
alter table public.shop_settings
  add column if not exists payment_changed_at timestamptz,
  add column if not exists payment_changed_by uuid references public.members(id) on delete set null;

create or replace function public.shop_settings_payment_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.pix_key is distinct from old.pix_key or new.pix_beneficiary is distinct from old.pix_beneficiary
     or new.infinitepay_handle is distinct from old.infinitepay_handle or new.payment_methods is distinct from old.payment_methods then
    new.payment_changed_at := now();
    new.payment_changed_by := (select m.id from public.members m where m.organization_id = new.organization_id and m.user_id = auth.uid() limit 1);
  else
    new.payment_changed_at := old.payment_changed_at;
    new.payment_changed_by := old.payment_changed_by;
  end if;
  return new;
end $$;
revoke all on function public.shop_settings_payment_changed() from public, anon, authenticated;
drop trigger if exists trg_shop_settings_payment_changed on public.shop_settings;
create trigger trg_shop_settings_payment_changed before insert or update on public.shop_settings
  for each row execute function public.shop_settings_payment_changed();

-- Vitrine: acrescenta só a taxa do cartão ('credit_fees_pct'); o resto é igual ao anterior.
create or replace function public.shop_get_public_store(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'logo_path', o.logo_path, 'theme', o.theme),
    'featured_title', coalesce((select s.featured_title from public.shop_settings s where s.organization_id = o.id), 'Destaques'), 'intro_text', (select s.intro_text from public.shop_settings s where s.organization_id = o.id),
    'reservation_hours', coalesce((select s.reservation_hours from public.shop_settings s where s.organization_id = o.id), 48),
    'privacy_retention_years', coalesce((select s.privacy_retention_years from public.shop_settings s where s.organization_id = o.id), 5),
    'credit_fees_pct', coalesce((select to_jsonb(s.credit_fees_pct) from public.shop_settings s where s.organization_id = o.id), '[4.2,6.09,7.01,7.91,8.8,9.67,12.59,13.42,14.25,15.06,15.87,16.66]'::jsonb),
    'payment_methods', coalesce((
      select to_jsonb(array_remove(array[
               case when 'pix' = any (s.payment_methods) and s.pix_key is not null and s.pix_beneficiary is not null then 'pix' end,
               case when 'infinitepay' = any (s.payment_methods) and s.infinitepay_handle is not null and s.public_site_url is not null then 'infinitepay' end], null))
        from public.shop_settings s where s.organization_id = o.id), '[]'::jsonb),
    'pix', (select case when s.pix_key is not null and s.pix_beneficiary is not null then jsonb_build_object('key', s.pix_key, 'beneficiary', s.pix_beneficiary) end
              from public.shop_settings s where s.organization_id = o.id),
    'contact', coalesce((select jsonb_build_object('whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'directors', s.directors)
                           from public.shop_settings s where s.organization_id = o.id),
                        jsonb_build_object('whatsapp', null, 'email', null, 'directors', '[]'::jsonb)),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'is_featured', p.is_featured, 'slug', p.slug, 'name', p.name, 'description', p.description, 'kind', p.kind,
        'price_cents', p.price_cents, 'member_discount_pct', p.member_discount_pct, 'special_price_cents', p.special_price_cents, 'show_remaining', p.show_remaining, 'show_remaining_when', p.show_remaining_when, 'lead_time_days', p.lead_time_days, 'pickup_ids', coalesce((select jsonb_agg(pk.pickup_point_id) from public.shop_product_pickups pk where pk.product_id = p.id), '[]'::jsonb), 'is_kit', p.is_kit, 'components', case when p.is_kit then coalesce((select jsonb_agg(jsonb_build_object('name', it.name, 'quantity', vs.quantity) order by vs.sort_order, it.name) from public.shop_variant_stock vs join public.shop_product_variants kv on kv.id = vs.variant_id join public.shop_stock_items it on it.id = vs.stock_item_id where kv.product_id = p.id), '[]'::jsonb) end, 'min_units', p.min_units, 'suggested_ids', to_jsonb(p.suggested_ids), 'confirmed_units', case when p.min_units is null then null else coalesce((select sum(oi.quantity)::int from public.shop_order_items oi join public.shop_orders so on so.id = oi.order_id and so.organization_id = oi.organization_id where oi.product_id = p.id and so.status = 'paid'), 0) end,
        'images', coalesce((select jsonb_agg(i.storage_path order by i.sort_order, i.created_at)
                              from public.shop_product_images i where i.product_id = p.id), '[]'::jsonb) || case when p.is_kit and p.kit_component_photos then coalesce((select jsonb_agg(x.path order by x.ord) from (select distinct on (im.storage_path) im.storage_path as path, vs.sort_order * 1000 + im.sort_order as ord from public.shop_variant_stock vs join public.shop_product_variants kv on kv.id = vs.variant_id and kv.product_id = p.id join public.shop_variant_stock vs2 on vs2.stock_item_id = vs.stock_item_id join public.shop_product_variants v2 on v2.id = vs2.variant_id and v2.product_id <> p.id join public.shop_products p2 on p2.id = v2.product_id and p2.is_active and not p2.is_kit and (select count(*) from public.shop_variant_stock cnt where cnt.variant_id = v2.id) = 1 join public.shop_product_images im on im.product_id = p2.id order by im.storage_path) x), '[]'::jsonb) else '[]'::jsonb end,
        'variants', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', v.id, 'label', v.label,
                        'available', case when p.kind = 'stock' then (select coalesce(min(case when not it.is_active then 0 when it.stock is null then 1000 else greatest(it.stock - it.reserved, 0) / vs.quantity end), 0)::int from public.shop_variant_stock vs join public.shop_stock_items it on it.id = vs.stock_item_id where vs.variant_id = v.id) end)
                      order by v.sort_order, v.label)
                    from public.shop_product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb)
      ) order by p.sort_order, p.name)
      from public.shop_products p where p.organization_id = o.id and p.is_active and not p.is_hidden), '[]'::jsonb),
    'pickup_points', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'address', pp.address, 'kind', pp.kind, 'contact_name', pp.contact_name, 'contact_phone', pp.contact_phone,
                                          'opening_hours', coalesce(public.shop_pickup_when(pp.schedule, pp.opening_hours), ''))
                       order by pp.sort_order, pp.name)
      from public.shop_pickup_points pp where pp.organization_id = o.id and pp.is_active and public.shop_schedule_has_future(pp.schedule)), '[]'::jsonb)
  )
  from public.organizations o where o.slug = p_slug and o.is_active
$$;

-- ───────────── LGPD-01 (D5): anonimizar pedidos depois do prazo do aviso de privacidade ─────────────
alter table public.shop_orders add column if not exists anonymized_at timestamptz;

-- Pedidos pagos ou cancelados criados há mais tempo que o prazo (Loja → Configurações → Guarda dos dados) perdem nome, telefone,
-- e-mail e o vínculo com a conta/cadastro. Valores, itens e datas ficam para o controle financeiro. Depois disso o pedido
-- não aparece mais em "Meus pedidos" nem pela consulta com código e telefone.
create or replace function public.shop_anonymize_old_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with old as (
    select o.id from public.shop_orders o
      left join public.shop_settings s on s.organization_id = o.organization_id
     where o.anonymized_at is null and o.status in ('paid', 'cancelled')
       and o.created_at < now() - make_interval(years => coalesce(s.privacy_retention_years, 5))
     limit 1000
  ), upd as (
    update public.shop_orders o set
      customer_name = 'Anonimizado', customer_phone = '0000000000', customer_email = 'anonimizado@anonimizado.invalid',
      user_id = null, member_id = null, client_request_id = null, anonymized_at = now()
     from old where o.id = old.id
    returning o.id
  ), mail as (
    delete from public.shop_email_outbox b using upd where b.order_id = upd.id
  )
  select count(*) into n from upd;
  return n;
end $$;
revoke all on function public.shop_anonymize_old_orders() from public, anon, authenticated;

create or replace function public.daily_privacy_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o record; v_paths text[]; v_backups int; v_audit int; v_subs int := 0; v_orders int;
begin
  -- Backups manuais e importados: 12 meses (os automáticos já giram pelos 20 mais recentes).
  delete from public.backups where kind <> 'auto' and created_at < now() - interval '12 months';
  get diagnostics v_backups = row_count;
  -- Auditoria: 24 meses.
  delete from public.audit_logs where created_at < now() - interval '24 months';
  get diagnostics v_audit = row_count;
  -- Inscrições antigas não aprovadas: mesmos prazos do botão (6 meses pendente, 12 meses recusada/arquivada).
  for o in select id from public.organizations where is_active loop
    v_paths := public._purge_old_submissions(o.id);
    if cardinality(v_paths) > 0 then
      insert into public.storage_delete_queue (organization_id, bucket, path)
      select o.id, 'form-uploads', p from unnest(v_paths) p;
      v_subs := v_subs + cardinality(v_paths);
    end if;
  end loop;
  -- Loja: pedidos mais velhos que o prazo do aviso de privacidade.
  v_orders := public.shop_anonymize_old_orders();
  return jsonb_build_object('backups', v_backups, 'audit_logs', v_audit, 'files_queued', v_subs, 'shop_orders_anonymized', v_orders);
end $$;
revoke all on function public.daily_privacy_maintenance() from public, anon, authenticated;
