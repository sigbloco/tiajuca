-- Loja · (1) Pix, contatos da loja e remetente dos e-mails passam a ser editáveis no painel (shop_settings), para o servidor também
-- poder usá-los nos e-mails; (2) fila de e-mails ("outbox"): cada mudança de status relevante enfileira um aviso ao cliente.
-- O envio é feito pela Edge Function `shop-mailer` por uma camada de provedor trocável (SMTP do Gmail hoje; Resend depois).

alter table public.shop_settings
  add column pix_key text check (pix_key is null or length(trim(pix_key)) between 3 and 140),
  add column pix_beneficiary text check (pix_beneficiary is null or length(trim(pix_beneficiary)) between 2 and 140),
  add column contact_whatsapp text check (contact_whatsapp is null or contact_whatsapp ~ '^55[0-9]{10,11}$'),
  add column contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column directors jsonb not null default '[]'::jsonb check (jsonb_typeof(directors) = 'array'),
  add column mail_from_name text check (mail_from_name is null or length(trim(mail_from_name)) between 1 and 80),
  add column mail_from_email text check (mail_from_email is null or mail_from_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Vitrine: devolve também Pix e contatos (públicos). Pix só aparece como método se tiver chave e favorecido.
create or replace function public.shop_get_public_store(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'logo_path', o.logo_path, 'theme', o.theme),
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
        'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description, 'kind', p.kind,
        'price_cents', p.price_cents, 'member_discount_pct', p.member_discount_pct, 'lead_time_days', p.lead_time_days,
        'images', coalesce((select jsonb_agg(i.storage_path order by i.sort_order, i.created_at)
                              from public.shop_product_images i where i.product_id = p.id), '[]'::jsonb),
        'variants', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', v.id, 'label', v.label,
                        'available', case when p.kind = 'stock' then greatest(coalesce(v.stock, 0) - v.reserved, 0) end)
                      order by v.sort_order, v.label)
                    from public.shop_product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb)
      ) order by p.sort_order, p.name)
      from public.shop_products p where p.organization_id = o.id and p.is_active), '[]'::jsonb),
    'pickup_points', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'address', pp.address, 'opening_hours', pp.opening_hours)
                       order by pp.sort_order, pp.name)
      from public.shop_pickup_points pp where pp.organization_id = o.id and pp.is_active), '[]'::jsonb)
  )
  from public.organizations o where o.slug = p_slug and o.is_active
$$;

create or replace function public.shop_get_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('payment_methods', to_jsonb(payment_methods), 'infinitepay_handle', infinitepay_handle, 'public_site_url', public_site_url,
                               'pix_key', pix_key, 'pix_beneficiary', pix_beneficiary)
       from public.shop_settings where organization_id = p_org),
    jsonb_build_object('payment_methods', jsonb_build_array(), 'infinitepay_handle', null, 'public_site_url', null, 'pix_key', null, 'pix_beneficiary', null))
$$;

-- ───────────── fila de e-mails ─────────────
create table public.shop_email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, order_id uuid not null, event_id uuid not null,
  template text not null check (template in ('order_created', 'payment_review', 'paid', 'cancelled', 'fulfillment_in_preparation', 'fulfillment_ready', 'fulfillment_picked_up')),
  to_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text, sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, template),
  foreign key (organization_id, order_id) references public.shop_orders (organization_id, id)
);
create index shop_outbox_pending_idx on public.shop_email_outbox (next_attempt_at) where status = 'pending';
alter table public.shop_email_outbox enable row level security;
revoke all on public.shop_email_outbox from anon, authenticated;
grant select on public.shop_email_outbox to authenticated;
create policy shop_outbox_sel on public.shop_email_outbox for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));

-- Qual aviso cada evento gera. Só avanços (voltar um passo por engano não manda e-mail).
create or replace function public.shop_enqueue_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text; v_email text;
begin
  if new.scope = 'order' then
    t := case
      when new.from_status is null and new.to_status = 'awaiting_payment' then 'order_created'
      when new.from_status = 'awaiting_payment' and new.to_status = 'payment_review' then 'payment_review'
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
  insert into public.shop_email_outbox (organization_id, order_id, event_id, template, to_email)
  values (new.organization_id, new.order_id, new.id, t, v_email) on conflict (event_id, template) do nothing;
  return new;
end $$;
create trigger trg_shop_enqueue_email after insert on public.shop_order_events for each row execute function public.shop_enqueue_email();

-- Pega até p_limit e-mails pendentes (reserva por 10 min para outro processo não enviar em dobro) e monta o contexto de cada um.
create or replace function public.shop_mail_claim(p_limit int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; out jsonb := '[]'::jsonb; ctx jsonb;
begin
  for r in
    select b.* from public.shop_email_outbox b
     where b.status = 'pending' and b.next_attempt_at <= now() and b.attempts < 5
     order by b.created_at limit greatest(1, least(p_limit, 50)) for update skip locked
  loop
    update public.shop_email_outbox set attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes' where id = r.id;
    select jsonb_build_object(
      'outbox_id', r.id, 'template', r.template, 'to_email', r.to_email,
      'kind', (select e.note from public.shop_order_events e where e.id = r.event_id and e.scope = 'fulfillment'),
      'cancel_reason', o.cancel_reason,
      'order', jsonb_build_object('code', o.code, 'customer_name', o.customer_name, 'status', o.status, 'payment_method', o.payment_method,
                                  'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents, 'total_cents', o.total_cents, 'expires_at', o.expires_at,
                                  'payment_url', o.payment_ref ->> 'link_url',
                                  'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                                              'unit_final_cents', i.unit_final_cents, 'kind', i.kind) order by i.created_at), '[]'::jsonb) from public.shop_order_items i where i.order_id = o.id)),
      'pickup', jsonb_build_object('name', pp.name, 'address', pp.address, 'opening_hours', pp.opening_hours),
      'org', jsonb_build_object('name', g.name),
      'settings', jsonb_build_object('pix_key', s.pix_key, 'pix_beneficiary', s.pix_beneficiary, 'public_site_url', s.public_site_url,
                                     'contact_whatsapp', s.contact_whatsapp, 'contact_email', s.contact_email, 'directors', s.directors,
                                     'mail_from_name', s.mail_from_name, 'mail_from_email', s.mail_from_email))
      into ctx
      from public.shop_orders o
      join public.shop_pickup_points pp on pp.id = o.pickup_point_id
      join public.organizations g on g.id = o.organization_id
      left join public.shop_settings s on s.organization_id = o.organization_id
     where o.id = r.order_id;
    out := out || jsonb_build_array(ctx);
  end loop;
  return out;
end $$;
revoke all on function public.shop_mail_claim(int) from public, anon, authenticated;
grant execute on function public.shop_mail_claim(int) to service_role;

create or replace function public.shop_mail_done(p_id uuid, p_ok boolean, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.shop_email_outbox
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         next_attempt_at = case when p_ok then next_attempt_at else now() + (attempts * interval '5 minutes') end
   where id = p_id
$$;
revoke all on function public.shop_mail_done(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.shop_mail_done(uuid, boolean, text) to service_role;
