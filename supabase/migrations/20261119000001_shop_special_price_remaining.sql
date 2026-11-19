-- Loja · (1) preço especial em reais para direção/professores/monitores; (2) contador "faltam N" configurável por produto;
-- (3) progresso da meta mínima nos itens dos pedidos (tela "Pedidos" e e-mails).
-- As funções existentes são reescritas por substituição de trecho (com conferência), para não retranscrever as definições inteiras.

alter table public.shop_products
  add column if not exists special_price_cents integer check (special_price_cents is null or special_price_cents > 0),
  add column if not exists show_remaining boolean not null default true,
  add column if not exists show_remaining_when integer check (show_remaining_when is null or show_remaining_when > 0);

comment on column public.shop_products.special_price_cents is 'Preço especial (centavos) para direção, professores e monitores; nulo = vale o preço de integrante.';
comment on column public.shop_products.show_remaining is 'Mostra na vitrine quantas unidades faltam para a produção começar (só com meta mínima).';
comment on column public.shop_products.show_remaining_when is 'Só mostra o contador quando faltarem até N unidades; nulo = sempre.';

-- Quem tem direito ao preço especial: integrante ativo com papel de acesso titular, direção, professor ou monitor.
create or replace function public.shop_is_special(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.shop_active_member_id(p_org, p_user) is not null
     and exists (
       select 1 from public.members m
         join public.member_access_roles mar on mar.member_id = m.id and mar.revoked_at is null
         join public.access_roles ar on ar.id = mar.access_role_id and ar.key in ('titular', 'direcao', 'professor', 'monitor')
        where m.organization_id = p_org and m.user_id = p_user and m.archived_at is null)
$$;
revoke all on function public.shop_is_special(uuid, uuid) from public, anon, authenticated;

create or replace function public.shop_my_is_special(p_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.shop_is_special(p_org, auth.uid()) $$;
revoke all on function public.shop_my_is_special(uuid) from public, anon;
grant execute on function public.shop_my_is_special(uuid) to authenticated;

-- Progresso da meta mínima de um produto: {min_units, confirmed_units} (unidades em pedidos PAGOS) ou nulo sem meta.
create or replace function public.shop_product_progress(p_product uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when sp.min_units is null then null else jsonb_build_object(
    'min_units', sp.min_units,
    'confirmed_units', coalesce((select sum(oi.quantity)::int from public.shop_order_items oi
                                   join public.shop_orders so on so.id = oi.order_id and so.organization_id = oi.organization_id
                                  where oi.product_id = sp.id and so.status = 'paid'), 0)) end
    from public.shop_products sp where sp.id = p_product
$$;
revoke all on function public.shop_product_progress(uuid) from public, anon, authenticated;

-- shop_create_order: preço especial no servidor.
do $m$
declare d text; n text;
begin
  select pg_get_functiondef('public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer)'::regprocedure) into d;
  n := d;
  n := replace(n, $r$v_member uuid; v_pp record;$r$, $r$v_member uuid; v_special boolean := false; v_pp record;$r$);
  n := replace(n, $r$if p_user is not null then v_member := public.shop_active_member_id(p_org, p_user); end if;$r$,
                  $r$if p_user is not null then v_member := public.shop_active_member_id(p_org, p_user); v_special := public.shop_is_special(p_org, p_user); end if;$r$);
  n := replace(n, $r$p.price_cents, p.member_discount_pct$r$, $r$p.price_cents, p.member_discount_pct, p.special_price_cents$r$);
  n := replace(n, $r$v_unit := round(v.price_cents * (100 - v_pct) / 100.0)::int;$r$,
                  $r$v_unit := round(v.price_cents * (100 - v_pct) / 100.0)::int;
      if v_special and v.special_price_cents is not null then
        v_unit := least(v.special_price_cents, v.price_cents);
        v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
      end if;$r$);
  if n = d or position('v_special := public.shop_is_special' in n) = 0 or position('p.special_price_cents' in n) = 0 or position('least(v.special_price_cents' in n) = 0 then
    raise exception 'shop_create_order: trecho esperado não encontrado';
  end if;
  execute n;
end $m$;

-- Vitrine: devolve preço especial e as opções do contador.
do $m$
declare d text; n text;
begin
  select pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure) into d;
  n := replace(d, $r$'member_discount_pct', p.member_discount_pct,$r$,
                  $r$'member_discount_pct', p.member_discount_pct, 'special_price_cents', p.special_price_cents, 'show_remaining', p.show_remaining, 'show_remaining_when', p.show_remaining_when,$r$);
  if n = d then raise exception 'shop_get_public_store: trecho esperado não encontrado'; end if;
  execute n;
end $m$;

-- Itens de pedido (tela "Pedidos" e e-mails) ganham o progresso da meta mínima dos produtos sob encomenda.
do $m$
declare fn text; d text; n text;
begin
  foreach fn in array array['public.shop_order_view(uuid)', 'public.shop_mail_claim(integer)'] loop
    select pg_get_functiondef(fn::regprocedure) into d;
    n := replace(d, $r$'unit_final_cents', i.unit_final_cents, 'kind', i.kind)$r$,
                    $r$'unit_final_cents', i.unit_final_cents, 'kind', i.kind, 'product_id', i.product_id, 'progress', case when i.kind = 'made_to_order' then public.shop_product_progress(i.product_id) end)$r$);
    if n = d then raise exception '%: trecho esperado não encontrado', fn; end if;
    execute n;
  end loop;
end $m$;
