-- Loja · pontos de retirada POR PRODUTO (mais de um). Produto sem nenhum ponto marcado vale para todos os pontos.
-- Ex.: camisa com o Rafael, adesivo com o Marcelo, ambos também no ensaio. No checkout só aparecem os pontos comuns a todos os itens.
create table public.shop_product_pickups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, product_id uuid not null, pickup_point_id uuid not null,
  unique (product_id, pickup_point_id),
  foreign key (organization_id, product_id) references public.shop_products (organization_id, id) on delete cascade,
  foreign key (organization_id, pickup_point_id) references public.shop_pickup_points (organization_id, id) on delete cascade
);
create index shop_product_pickups_point_idx on public.shop_product_pickups (pickup_point_id);
alter table public.shop_product_pickups enable row level security;
revoke all on public.shop_product_pickups from anon, authenticated;
grant select, insert, update, delete on public.shop_product_pickups to authenticated;
create policy shop_pk_sel on public.shop_product_pickups for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_pk_ins on public.shop_product_pickups for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_pk_upd on public.shop_product_pickups for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_pk_del on public.shop_product_pickups for delete to authenticated using (public.has_permission(organization_id, 'shop.manage'));

-- Texto do ponto "combinar com uma pessoa": telefone só com dígitos e "ensaio" no fim.
create or replace function public.shop_pickup_compose() returns trigger
language plpgsql set search_path = '' as $$
declare v_name text := nullif(trim(coalesce(new.contact_name, '')), ''); v_phone text := nullif(trim(coalesce(new.contact_phone, '')), '');
        v_digits text := nullif(regexp_replace(coalesce(new.contact_phone, ''), '\D', '', 'g'), '');
begin
  if new.kind = 'person' then
    new.address := 'Combine a entrega direto com ' || coalesce(v_name, 'o responsável') || coalesce(' (' || v_digits || ')', '') || '. Pode ser encontro ao vivo, entrega por aplicativo ou ensaio.';
  else
    new.address := trim(coalesce(new.place_address, new.address, ''))
      || case when v_name is not null then ' — procure por ' || v_name || coalesce(' (' || v_phone || ')', '') else '' end;
  end if;
  return new;
end $$;
update public.shop_pickup_points set kind = kind where kind = 'person';

do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  newdef := replace(def, '''address'', pp.address,', '''address'', pp.address, ''kind'', pp.kind, ''contact_name'', pp.contact_name, ''contact_phone'', pp.contact_phone,');
  if newdef = def then raise exception 'shop_get_public_store: pontos de retirada não encontrados'; end if;
  def := newdef;
  newdef := replace(def, '''lead_time_days'', p.lead_time_days,',
    '''lead_time_days'', p.lead_time_days, ''pickup_ids'', coalesce((select jsonb_agg(pk.pickup_point_id) from public.shop_product_pickups pk where pk.product_id = p.id), ''[]''::jsonb),');
  if newdef = def then raise exception 'shop_get_public_store: lead_time_days não encontrado'; end if;
  execute newdef;

  def := pg_get_functiondef('public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer)'::regprocedure);
  newdef := replace(def, 'if not found then raise exception ''Um item do carrinho não está mais à venda. Atualize o carrinho.'' using errcode = ''P0001''; end if;',
    'if not found then raise exception ''Um item do carrinho não está mais à venda. Atualize o carrinho.'' using errcode = ''P0001''; end if;'
    || ' if exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id)'
    || ' and not exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id and pk.pickup_point_id = p_pickup) then'
    || ' raise exception ''% não pode ser retirado no ponto escolhido. Escolha outro ponto de retirada.'', v.name using errcode = ''P0001''; end if;');
  if newdef = def then raise exception 'shop_create_order: trecho não encontrado'; end if;
  execute newdef;
end $$;
