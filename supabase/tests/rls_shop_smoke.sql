-- Teste de fumaça da Loja. Rodar APÓS a migration 0022 (usa a organização 'tiajuca').
-- Resultado esperado: erro "RESULTADO: ..." com todos os itens "OK"/valores esperados (a transação é desfeita pelo erro).
-- Esperado: direcao_cria=OK; reserved_direto=bloqueado OK; ajusta_estoque=OK; anon_ve_produto_inativo=0; anon_ve_ponto_ativo=1;
--           anon_orders=negado OK; anon_insere=negado OK; anon_ve_produto_ativo=1; anon_ve_variacao=1; integrante_insere=negado OK;
--           integrante_ve_pedidos=0; integrante_ativo_reconhecido=true; prazo_em_estoque=bloqueado OK; reserved>stock=bloqueado OK
do $$
declare
  org uuid; u_dir uuid := gen_random_uuid(); u_int uuid := gen_random_uuid(); m_dir uuid; m_int uuid;
  prod uuid; var uuid; pp uuid; n int; ok boolean; log text := '';
begin
  select id into org from public.organizations where slug = 'tiajuca';
  insert into auth.users (id, email) values (u_dir, 'dir@shoptest.local'), (u_int, 'int@shoptest.local');
  insert into public.members (organization_id, user_id, full_name) values (org, u_dir, 'Dir T') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org, u_int, 'Int T') returning id into m_int;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org, m_dir, id from public.access_roles where organization_id = org and key = 'direcao';

  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.shop_pickup_points (organization_id, name, address, is_active) values (org, 'PP teste', 'Rua X', true) returning id into pp;
  insert into public.shop_products (organization_id, slug, name, kind, price_cents, member_discount_pct, is_active) values (org, 'camisa-teste', 'Camisa', 'stock', 5000, 10, false) returning id into prod;
  insert into public.shop_product_variants (organization_id, product_id, label, stock) values (org, prod, 'M', 5) returning id into var;
  log := log || 'direcao_cria=OK; ';
  begin update public.shop_product_variants set reserved = 1 where id = var; log := log || 'reserved_direto=FALHOU(permitiu); ';
  exception when insufficient_privilege then log := log || 'reserved_direto=bloqueado OK; '; end;
  update public.shop_product_variants set stock = 8 where id = var; log := log || 'ajusta_estoque=OK; ';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from public.shop_products where id = prod; log := log || 'anon_ve_produto_inativo=' || n || '; ';
  select count(*) into n from public.shop_pickup_points where id = pp; log := log || 'anon_ve_ponto_ativo=' || n || '; ';
  begin perform 1 from public.shop_orders limit 1; log := log || 'anon_orders=FALHOU(permitiu); ';
  exception when insufficient_privilege then log := log || 'anon_orders=negado OK; '; end;
  begin insert into public.shop_products (organization_id, slug, name, kind, price_cents) values (org, 'x', 'x', 'stock', 100); log := log || 'anon_insere=FALHOU; ';
  exception when insufficient_privilege then log := log || 'anon_insere=negado OK; '; end;
  reset role;

  update public.shop_products set is_active = true where id = prod;
  set local role anon;
  select count(*) into n from public.shop_products where id = prod; log := log || 'anon_ve_produto_ativo=' || n || '; ';
  select count(*) into n from public.shop_product_variants where product_id = prod; log := log || 'anon_ve_variacao=' || n || '; ';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_int, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.shop_products (organization_id, slug, name, kind, price_cents) values (org, 'y', 'y', 'stock', 100); log := log || 'integrante_insere=FALHOU; ';
  exception when insufficient_privilege then log := log || 'integrante_insere=negado OK; '; end;
  select count(*) into n from public.shop_orders; log := log || 'integrante_ve_pedidos=' || n || '; ';
  select public.shop_my_member_id(org) is not null into ok; log := log || 'integrante_ativo_reconhecido=' || ok || '; ';
  reset role;

  begin insert into public.shop_products (organization_id, slug, name, kind, price_cents, lead_time_days) values (org, 'z', 'z', 'stock', 100, 5); log := log || 'prazo_em_estoque=FALHOU; ';
  exception when check_violation then log := log || 'prazo_em_estoque=bloqueado OK; '; end;
  begin update public.shop_product_variants set stock = 1, reserved = 2 where id = var; log := log || 'reserved>stock=FALHOU; ';
  exception when check_violation then log := log || 'reserved>stock=bloqueado OK; '; end;

  raise exception 'RESULTADO: %', log;
end $$;
