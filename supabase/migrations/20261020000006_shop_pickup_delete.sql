-- Pontos de retirada podem ser excluídos por quem gerencia a loja. Se já houver pedidos com o ponto, o banco recusa (FK) e o app sugere desativar.
grant delete on public.shop_pickup_points to authenticated;
create policy shop_pp_del on public.shop_pickup_points for delete to authenticated using (public.has_permission(organization_id, 'shop.manage'));
