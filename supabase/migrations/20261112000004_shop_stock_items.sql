-- Loja · ESTOQUE INDEPENDENTE dos produtos + KITS.
-- O estoque passa a ser cadastrado à parte (shop_stock_items: ex. "Adesivo X", "Botton Y"). Cada variação de produto aponta
-- para os itens que consome por unidade vendida (shop_variant_stock: ex. kit "2 adesivos + 1 botton" = 2 × Adesivo X + 1 × Botton Y).
-- Assim o avulso e o kit baixam o MESMO estoque.
--
-- Compatibilidade: as funções de pedido já existentes continuam mexendo em shop_product_variants.stock/reserved. Essa coluna passa a ser
-- só um "marcador" (valor alto) e um gatilho repassa cada reserva / baixa / devolução aos itens de estoque, multiplicada pela quantidade.

create table public.shop_stock_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  stock integer check (stock is null or stock >= 0),            -- NULL = ilimitado
  reserved integer not null default 0 check (reserved >= 0),
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (stock is null or reserved <= stock)
);
create trigger trg_shop_stock_items_updated before update on public.shop_stock_items for each row execute function public.set_updated_at();

create table public.shop_variant_stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, variant_id uuid not null, stock_item_id uuid not null,
  quantity integer not null default 1 check (quantity between 1 and 50),
  sort_order int not null default 0,
  unique (variant_id, stock_item_id),
  foreign key (organization_id, variant_id) references public.shop_product_variants (organization_id, id) on delete cascade,
  foreign key (organization_id, stock_item_id) references public.shop_stock_items (organization_id, id)
);
create index shop_variant_stock_item_idx on public.shop_variant_stock (stock_item_id);

alter table public.shop_products add column is_kit boolean not null default false;
alter table public.shop_products add column kit_component_photos boolean not null default true;
alter table public.shop_products add check (not is_kit or kind = 'stock');

alter table public.shop_stock_items enable row level security;
alter table public.shop_variant_stock enable row level security;
revoke all on public.shop_stock_items, public.shop_variant_stock from anon, authenticated;
grant select, insert, update on public.shop_stock_items to authenticated;
grant select, insert, update, delete on public.shop_variant_stock to authenticated;
create trigger trg_audit_shop_stock_items after insert or update on public.shop_stock_items for each row execute function public.fn_audit();

create policy shop_si_sel on public.shop_stock_items for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_si_ins on public.shop_stock_items for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_si_upd on public.shop_stock_items for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_vs_sel on public.shop_variant_stock for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_vs_ins on public.shop_variant_stock for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_vs_upd on public.shop_variant_stock for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_vs_del on public.shop_variant_stock for delete to authenticated using (public.has_permission(organization_id, 'shop.manage'));

-- `reserved` do item só muda pelos pedidos.
create or replace function public.shop_guard_item_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.reserved is distinct from old.reserved then
    raise exception 'A reserva de estoque é controlada pelos pedidos.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_shop_item_guard before update on public.shop_stock_items for each row execute function public.shop_guard_item_update();

-- Só produto de pronta entrega usa estoque.
create or replace function public.shop_variant_stock_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shop_product_variants v join public.shop_products p on p.id = v.product_id
                  where v.id = new.variant_id and p.kind = 'stock') then
    raise exception 'Só produtos de pronta entrega usam estoque.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_shop_vs_check before insert or update on public.shop_variant_stock for each row execute function public.shop_variant_stock_check();

-- Os itens de uma variação não mudam enquanto houver pedidos em andamento com ela (as reservas já foram repassadas aos itens).
create or replace function public.shop_variant_stock_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare vid uuid := coalesce(new.variant_id, old.variant_id);
begin
  if exists (select 1 from public.shop_product_variants v where v.id = vid and v.reserved > 0) then
    raise exception 'Há pedidos em andamento com este produto. Mude os itens de estoque depois que forem retirados ou cancelados.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

-- ───────────── dados atuais: cada variação em estoque vira um item de estoque ─────────────
do $$
declare r record; v_item uuid; v_name text; n int;
begin
  for r in
    select v.id as vid, v.organization_id as org, p.name as pname, v.label, v.stock, v.reserved, v.sort_order,
           (select count(*) from public.shop_product_variants v3 where v3.product_id = p.id) as cnt
      from public.shop_product_variants v join public.shop_products p on p.id = v.product_id
     where p.kind = 'stock' order by p.sort_order, p.name, v.sort_order
  loop
    v_name := case when r.cnt = 1 and lower(r.label) in ('único', 'unico') then r.pname else r.pname || ' · ' || r.label end;
    insert into public.shop_stock_items (organization_id, name, stock, reserved) values (r.org, left(v_name, 120), r.stock, r.reserved) returning id into v_item;
    insert into public.shop_variant_stock (organization_id, variant_id, stock_item_id, quantity) values (r.org, r.vid, v_item, 1);
    update public.shop_product_variants set stock = 1000000 where id = r.vid;
  end loop;
end $$;

-- (o bloqueio entra depois da migração dos dados, que insere itens em variações com reservas)
create trigger trg_shop_vs_lock before insert or update or delete on public.shop_variant_stock for each row execute function public.shop_variant_stock_lock();

-- Repassa aos itens a mudança de estoque/reserva da variação (reservar, baixar na retirada, devolver, desfazer).
create or replace function public.shop_variant_propagate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare dS int := coalesce(new.stock, 0) - coalesce(old.stock, 0); dR int := new.reserved - old.reserved; c record; it record;
begin
  if dS = 0 and dR = 0 then return new; end if;
  for c in select vs.stock_item_id, vs.quantity from public.shop_variant_stock vs where vs.variant_id = new.id order by vs.stock_item_id loop
    select * into it from public.shop_stock_items where id = c.stock_item_id for update;
    if dR > 0 and it.stock is not null and it.stock - it.reserved < dR * c.quantity then
      raise exception 'Estoque insuficiente de % (restam % unidade(s)).', it.name, greatest(it.stock - it.reserved, 0) using errcode = 'P0001';
    end if;
    update public.shop_stock_items
       set stock = case when stock is null then null else stock + dS * c.quantity end, reserved = reserved + dR * c.quantity
     where id = c.stock_item_id;
  end loop;
  return new;
end $$;
create trigger trg_shop_variant_propagate after update on public.shop_product_variants
  for each row when (old.stock is distinct from new.stock or old.reserved is distinct from new.reserved) execute function public.shop_variant_propagate();

-- ───────────── vitrine pública ─────────────
-- Disponível = quanto os itens permitem (menor razão estoque/quantidade); kit mostra o que traz e junta fotos dos avulsos (opcional).
do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);

  newdef := replace(def, 'greatest(coalesce(v.stock, 0) - v.reserved, 0)',
    '(select coalesce(min(case when not it.is_active then 0 when it.stock is null then 1000 else greatest(it.stock - it.reserved, 0) / vs.quantity end), 0)::int '
    || 'from public.shop_variant_stock vs join public.shop_stock_items it on it.id = vs.stock_item_id where vs.variant_id = v.id)');
  if newdef = def then raise exception 'available não encontrado'; end if;
  def := newdef;

  newdef := replace(def, '''lead_time_days'', p.lead_time_days,',
    '''lead_time_days'', p.lead_time_days, ''is_kit'', p.is_kit, ''components'', case when p.is_kit then coalesce((select jsonb_agg(jsonb_build_object('
    || '''name'', it.name, ''quantity'', vs.quantity) order by vs.sort_order, it.name) '
    || 'from public.shop_variant_stock vs join public.shop_product_variants kv on kv.id = vs.variant_id '
    || 'join public.shop_stock_items it on it.id = vs.stock_item_id where kv.product_id = p.id), ''[]''::jsonb) end,');
  if newdef = def then raise exception 'lead_time_days não encontrado'; end if;
  def := newdef;

  newdef := replace(def, 'where i.product_id = p.id), ''[]''::jsonb)',
    'where i.product_id = p.id), ''[]''::jsonb) || case when p.is_kit and p.kit_component_photos then coalesce((select jsonb_agg(x.path order by x.ord) '
    || 'from (select distinct on (im.storage_path) im.storage_path as path, vs.sort_order * 1000 + im.sort_order as ord '
    || 'from public.shop_variant_stock vs join public.shop_product_variants kv on kv.id = vs.variant_id and kv.product_id = p.id '
    || 'join public.shop_variant_stock vs2 on vs2.stock_item_id = vs.stock_item_id '
    || 'join public.shop_product_variants v2 on v2.id = vs2.variant_id and v2.product_id <> p.id '
    || 'join public.shop_products p2 on p2.id = v2.product_id and p2.is_active and not p2.is_kit '
    || 'and (select count(*) from public.shop_variant_stock cnt where cnt.variant_id = v2.id) = 1 '
    || 'join public.shop_product_images im on im.product_id = p2.id order by im.storage_path) x), ''[]''::jsonb) else ''[]''::jsonb end');
  if newdef = def then raise exception 'images não encontrado'; end if;
  execute newdef;
end $$;
