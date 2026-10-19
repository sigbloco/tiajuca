-- Loja do bloco · base: permissão, catálogo, pontos de retirada, pedidos, sub-pedidos (estoque / encomenda), eventos.
-- Convenções do app: organization_id em tudo, sem DELETE em dados históricos, valores em CENTAVOS (integer).
-- Público (anon) só LÊ catálogo e pontos de retirada ativos. Pedidos NÃO são acessíveis pelo público: toda escrita/consulta
-- de cliente passa por Edge Functions (service role) e funções SQL próprias, nas próximas etapas.

insert into public.permissions (key, module, description) values
  ('shop.manage', 'loja', 'Gerenciar a loja: produtos, estoque, pontos de retirada e pedidos')
on conflict (key) do nothing;
-- Direção e Titular recebem pelo gatilho de `permissions`. Outros papéis: Acesso e papéis → permissão "shop.manage".

-- ───────────── pontos de retirada ─────────────
create table public.shop_pickup_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  address text not null check (length(trim(address)) > 0),
  opening_hours text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create trigger trg_shop_pickup_updated before update on public.shop_pickup_points for each row execute function public.set_updated_at();

-- ───────────── produtos ─────────────
create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  kind text not null check (kind in ('stock', 'made_to_order')),
  price_cents integer not null check (price_cents > 0),
  member_discount_pct numeric(5,2) not null default 0 check (member_discount_pct between 0 and 100),
  lead_time_days integer check (lead_time_days is null or lead_time_days > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, slug),
  check (kind = 'made_to_order' or lead_time_days is null)
);
create trigger trg_shop_products_updated before update on public.shop_products for each row execute function public.set_updated_at();

create table public.shop_product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, product_id uuid not null,
  storage_path text not null, alt text not null default '', sort_order int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (organization_id, product_id) references public.shop_products (organization_id, id)
);
create index shop_images_product_idx on public.shop_product_images (product_id, sort_order);

-- Variação (tamanho). Produto sem tamanho tem uma variação "Único". `stock` NULL = sob encomenda (sem controle).
create table public.shop_product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, product_id uuid not null,
  label text not null check (length(trim(label)) > 0),
  stock integer check (stock is null or stock >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id), unique (product_id, label),
  foreign key (organization_id, product_id) references public.shop_products (organization_id, id),
  check (stock is null or reserved <= stock)
);
create trigger trg_shop_variants_updated before update on public.shop_product_variants for each row execute function public.set_updated_at();

-- ───────────── pedidos ─────────────
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (code ~ '^[A-Z0-9]{6,12}$'),
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10,13}$'), -- só dígitos (DDI+DDD+número)
  customer_email text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  member_id uuid, -- preenchido quando o comprador estava logado como integrante ativo
  pickup_point_id uuid not null,
  payment_method text not null check (payment_method in ('pix', 'infinitepay')),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'payment_review', 'paid', 'cancelled')),
  subtotal_cents integer not null check (subtotal_cents > 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents > 0),
  expires_at timestamptz, -- só vale em "aguardando pagamento"; "em conferência" não expira
  paid_at timestamptz, paid_by uuid, paid_via text check (paid_via is null or paid_via in ('manual', 'webhook')),
  payment_ref jsonb not null default '{}'::jsonb, -- link/slug/transaction_nsu da InfinitePay etc.
  cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, code),
  foreign key (organization_id, member_id) references public.members (organization_id, id),
  foreign key (organization_id, pickup_point_id) references public.shop_pickup_points (organization_id, id),
  check (total_cents = subtotal_cents - discount_cents)
);
create index shop_orders_status_idx on public.shop_orders (organization_id, status, created_at desc);
create index shop_orders_expiry_idx on public.shop_orders (expires_at) where status = 'awaiting_payment';
create index shop_orders_phone_idx on public.shop_orders (customer_phone);
create trigger trg_shop_orders_updated before update on public.shop_orders for each row execute function public.set_updated_at();

create table public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, order_id uuid not null, product_id uuid not null, variant_id uuid not null,
  kind text not null check (kind in ('stock', 'made_to_order')),
  product_name text not null, variant_label text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents > 0),       -- preço público congelado
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  unit_final_cents integer not null check (unit_final_cents > 0),       -- o que o cliente paga por unidade
  created_at timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.shop_orders (organization_id, id),
  foreign key (organization_id, product_id) references public.shop_products (organization_id, id),
  foreign key (organization_id, variant_id) references public.shop_product_variants (organization_id, id)
);
create index shop_items_order_idx on public.shop_order_items (order_id);

-- Um por grupo de itens do pedido: o que tem em estoque e o que é sob encomenda andam em status separados.
create table public.shop_fulfillments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, order_id uuid not null,
  kind text not null check (kind in ('stock', 'made_to_order')),
  status text not null default 'pending' check (status in ('pending', 'in_preparation', 'ready', 'picked_up', 'cancelled')),
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (order_id, kind), unique (organization_id, id),
  foreign key (organization_id, order_id) references public.shop_orders (organization_id, id),
  check (kind = 'made_to_order' or status <> 'in_preparation') -- "em preparo" só existe para encomenda
);

create table public.shop_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, order_id uuid not null, fulfillment_id uuid,
  scope text not null check (scope in ('order', 'fulfillment')),
  from_status text, to_status text not null,
  actor_member_id uuid, actor_label text not null default 'sistema', -- 'cliente' | 'sistema' | 'webhook' | nome da pessoa
  note text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.shop_orders (organization_id, id)
);
create index shop_events_order_idx on public.shop_order_events (order_id, created_at);

-- Tentativas de consulta de pedido (código + telefone), para limitar adivinhação. Só service role.
create table public.shop_lookup_attempts (
  id bigint generated always as identity primary key,
  bucket text not null, -- 'ip:<hash>' ou 'code:<CODIGO>'
  created_at timestamptz not null default now()
);
create index shop_lookup_bucket_idx on public.shop_lookup_attempts (bucket, created_at desc);

-- ───────────── membro ativo (preço de integrante) ─────────────
-- Integrante ATIVO = tem cadastro não arquivado na organização e não está inativo no ciclo atual.
create or replace function public.shop_active_member_id(p_org uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
   where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null and not public.member_is_inactive(m.id)
   limit 1
$$;
revoke all on function public.shop_active_member_id(uuid, uuid) from public, anon, authenticated; -- Edge Functions (service role)

create or replace function public.shop_my_member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select public.shop_active_member_id(p_org, auth.uid())
$$;
revoke all on function public.shop_my_member_id(uuid) from public, anon;
grant execute on function public.shop_my_member_id(uuid) to authenticated;

-- ───────────── RLS / grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['shop_pickup_points', 'shop_products', 'shop_product_images', 'shop_product_variants',
                           'shop_orders', 'shop_order_items', 'shop_fulfillments', 'shop_order_events', 'shop_lookup_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['shop_pickup_points', 'shop_products', 'shop_product_variants'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
  grant select on public.shop_pickup_points, public.shop_products, public.shop_product_images, public.shop_product_variants to anon;
  grant select, insert, update, delete on public.shop_product_images to authenticated;
  -- pedidos: o admin só LÊ; mudanças de status passam por funções (etapa de pedidos), que gravam o evento.
  grant select on public.shop_orders, public.shop_order_items, public.shop_fulfillments, public.shop_order_events to authenticated;
  create trigger trg_audit_shop_orders after insert or update on public.shop_orders for each row execute function public.fn_audit();
end $$;

-- Catálogo: público vê o que está ativo; quem gerencia vê tudo.
create policy shop_pp_public on public.shop_pickup_points for select to anon, authenticated using (is_active);
create policy shop_pp_manage_sel on public.shop_pickup_points for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_pp_ins on public.shop_pickup_points for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_pp_upd on public.shop_pickup_points for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));

create policy shop_prod_public on public.shop_products for select to anon, authenticated using (is_active);
create policy shop_prod_manage_sel on public.shop_products for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_prod_ins on public.shop_products for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_prod_upd on public.shop_products for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));

create policy shop_var_public on public.shop_product_variants for select to anon, authenticated
  using (is_active and exists (select 1 from public.shop_products p where p.id = product_id and p.is_active));
create policy shop_var_manage_sel on public.shop_product_variants for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_var_ins on public.shop_product_variants for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
-- `reserved` é controlado só pelas funções de pedido; o admin ajusta `stock`, `label`, ordem e ativo.
create policy shop_var_upd on public.shop_product_variants for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));

create policy shop_img_public on public.shop_product_images for select to anon, authenticated
  using (exists (select 1 from public.shop_products p where p.id = product_id and p.is_active));
create policy shop_img_manage_sel on public.shop_product_images for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_img_ins on public.shop_product_images for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_img_upd on public.shop_product_images for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_img_del on public.shop_product_images for delete to authenticated using (public.has_permission(organization_id, 'shop.manage'));

-- Pedidos: leitura só para quem gerencia a loja. (O integrante verá os próprios pedidos por função, na etapa de pedidos.)
create policy shop_orders_sel on public.shop_orders for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_items_sel on public.shop_order_items for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_fulf_sel on public.shop_fulfillments for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_events_sel on public.shop_order_events for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
-- shop_lookup_attempts: sem policy nem grant (só service role).

-- Integridade do estoque: `reserved` nunca pode ser alterado diretamente por quem gerencia pelo painel.
create or replace function public.shop_guard_variant_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.reserved is distinct from old.reserved then
    raise exception 'A reserva de estoque é controlada pelos pedidos.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_shop_variant_guard before update on public.shop_product_variants for each row execute function public.shop_guard_variant_update();
