-- Loja · dados da instância Cordão da Tia Juca. Rodar APÓS a migration 0022.
-- Pontos de retirada de EXEMPLO, inativos: edite endereço/horário no painel da loja e ative. Nenhum é exibido ao público até lá.

insert into public.shop_pickup_points (organization_id, name, address, opening_hours, sort_order, is_active)
select o.id, v.name, v.address, v.hours, v.ord, false
from public.organizations o
cross join (values
  ('Ponto de retirada 1 (a definir)', 'Endereço a definir', 'Horário a definir', 1),
  ('Ponto de retirada 2 (a definir)', 'Endereço a definir', 'Horário a definir', 2)
) as v(name, address, hours, ord)
where o.slug = 'tiajuca'
  and not exists (select 1 from public.shop_pickup_points p where p.organization_id = o.id and p.name = v.name);
