-- Quem gerencia a loja pode excluir uma variação (se já houver pedido com ela, o banco recusa e o app orienta a desativar).
grant delete on public.shop_product_variants to authenticated;
create policy shop_var_del on public.shop_product_variants for delete to authenticated
  using (public.has_permission(organization_id, 'shop.manage'));
