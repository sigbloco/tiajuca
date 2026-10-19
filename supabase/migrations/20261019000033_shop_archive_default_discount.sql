-- Loja · (1) arquivar pedidos (some da lista do painel, mas o histórico e o cliente continuam; nada é apagado);
--        (2) desconto padrão de integrante, que já vem preenchido em produto novo (e pode ser mudado produto a produto).

alter table public.shop_orders add column archived_at timestamptz, add column archived_by uuid;
create index shop_orders_archived_idx on public.shop_orders (organization_id, archived_at);

alter table public.shop_settings
  add column default_member_discount_pct numeric(5,2) not null default 0 check (default_member_discount_pct between 0 and 100);

-- "Encerrado" = cancelado, ou pago e com TUDO retirado. Só pedidos encerrados podem ser arquivados (evita esconder reserva de estoque ativa).
create or replace function public.shop_order_is_finished(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_orders o
     where o.id = p_order
       and (o.status = 'cancelled'
            or (o.status = 'paid'
                and exists (select 1 from public.shop_fulfillments f where f.order_id = o.id)
                and not exists (select 1 from public.shop_fulfillments f where f.order_id = o.id and f.status <> 'picked_up'))))
$$;
revoke all on function public.shop_order_is_finished(uuid) from public, anon, authenticated;

create or replace function public.shop_admin_archive_order(p_order uuid, p_archive boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; a record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  select * into a from public.shop_admin_actor(o.organization_id);
  if p_archive then
    if not public.shop_order_is_finished(p_order) then
      raise exception 'Só dá para arquivar pedidos cancelados ou já totalmente retirados. Cancele ou conclua este pedido antes.' using errcode = 'P0001';
    end if;
    update public.shop_orders set archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, a.v_member) where id = p_order;
  else
    update public.shop_orders set archived_at = null, archived_by = null where id = p_order;
  end if;
  return jsonb_build_object('ok', true, 'archived', p_archive);
end $$;
revoke all on function public.shop_admin_archive_order(uuid, boolean) from public, anon;
grant execute on function public.shop_admin_archive_order(uuid, boolean) to authenticated;

-- Arquiva de uma vez todos os pedidos encerrados que ainda estão na lista. Devolve quantos foram.
create or replace function public.shop_admin_archive_finished(p_org uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare a record; n int;
begin
  select * into a from public.shop_admin_actor(p_org);
  with done as (
    update public.shop_orders o set archived_at = now(), archived_by = a.v_member
     where o.organization_id = p_org and o.archived_at is null and public.shop_order_is_finished(o.id)
    returning 1)
  select count(*) into n from done;
  return n;
end $$;
revoke all on function public.shop_admin_archive_finished(uuid) from public, anon;
grant execute on function public.shop_admin_archive_finished(uuid) to authenticated;
