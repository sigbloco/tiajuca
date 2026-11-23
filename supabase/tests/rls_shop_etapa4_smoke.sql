-- Teste de fumaça da loja depois da etapa 4 da revisão (LOJA-19). Rodar como postgres (editor SQL ou execute_sql).
-- Tudo é desfeito no fim (o bloco termina com erro "RESULTADO: ..."). Usa a organização 'tiajuca', um produto sob encomenda
-- visível, um de pronta entrega com estoque e uma conta da Direção com shop.manage.
-- Esperado: cupom_ok=10.00; pedido1_cupom=TESTEETAPA4; cupom_esgotado=null; pedido2_recusado=O cupom ... número máximo;
--   cupom_volta_apos_cancelar=10.00; cupom_vencido=null; vencido_recusado=O cupom ... validade; fila_antes=1; fila_duplicado=0;
--   emails_e(5_antes)=5; sem_troca_pix_registro=null; reativado=awaiting_payment exp=true; troca_pix_registrada=true por_diretor=true;
--   estranho_altera_cupom=0; estranho_altera_pix=0; anonimizados>=1; pedido1=Anonimizado/...; consulta_antiga=false;
--   manutencao=true; report_payment_existe=false; anon_cria_pedido=false anon_anonimiza=false auth_usos=false anon_cupom=true;
--   status_antigo_recusado; limite=true,true,false; anon_ve_oculto=0;
--   reativar_estoque: reservado não dobra e o grupo já retirado continua "picked_up".
do $$
declare
  org uuid; dir_user uuid; dir_member uuid; var uuid; vs uuid; pp uuid; pps uuid;
  o1 jsonb; o3 jsonb; o6 jsonb; id1 uuid; id3 uuid; id6 uuid; n int; t timestamptz; changer uuid; log text := ''; s text; r1 int; r2 int;
  items jsonb;
begin
  select id into org from organizations where slug = 'tiajuca';
  select m.user_id, m.id into dir_user, dir_member from member_access_roles mar join access_roles ar on ar.id = mar.access_role_id join members m on m.id = mar.member_id
   where mar.organization_id = org and ar.key = 'direcao' and mar.revoked_at is null and m.user_id is not null limit 1;
  select v.id into var from shop_product_variants v join shop_products p on p.id = v.product_id
   where p.organization_id = org and p.kind = 'made_to_order' and p.is_active and not p.is_hidden and v.is_active limit 1;
  select p.id into pp from shop_pickup_points p where p.organization_id = org and p.is_active and shop_schedule_has_future(p.schedule)
     and (not exists (select 1 from shop_product_pickups pk join shop_product_variants v on v.product_id = pk.product_id where v.id = var)
          or p.id in (select pk.pickup_point_id from shop_product_pickups pk join shop_product_variants v on v.product_id = pk.product_id where v.id = var))
   limit 1;
  items := jsonb_build_array(jsonb_build_object('variant_id', var, 'quantity', 1));
  perform set_config('request.headers', '{"cf-connecting-ip":"9.9.9.9"}', true);

  -- Cupom: validade e limite de usos (D12)
  insert into shop_coupons (organization_id, code, discount_pct, is_active, max_uses) values (org, 'TESTEETAPA4', 10, true, 1);
  log := log || 'cupom_ok=' || coalesce(shop_coupon_check('tiajuca', 'TESTEETAPA4')::text, 'null') || '; ';
  o1 := shop_create_order(org, null, 'Teste Etapa4 A', '21900000001', 'a@teste.invalid', pp, 'pix', items, 48, 'TESTEETAPA4');
  select id into id1 from shop_orders where code = o1->>'code';
  log := log || 'pedido1_cupom=' || coalesce(o1->>'coupon_code', 'null') || '; ';
  log := log || 'cupom_esgotado=' || coalesce(shop_coupon_check('tiajuca', 'TESTEETAPA4')::text, 'null') || '; ';
  begin perform shop_create_order(org, null, 'Teste Etapa4 B', '21900000002', 'b@teste.invalid', pp, 'pix', items, 48, 'TESTEETAPA4'); log := log || 'pedido2=FALHOU(criou); ';
  exception when others then log := log || 'pedido2_recusado=' || left(sqlerrm, 45) || '; '; end;
  perform shop_cancel_order(id1, 'teste', null, 'teste');
  log := log || 'cupom_volta_apos_cancelar=' || coalesce(shop_coupon_check('tiajuca', 'TESTEETAPA4')::text, 'null') || '; ';
  update shop_coupons set valid_until = (now() at time zone 'America/Sao_Paulo')::date - 1 where code = 'TESTEETAPA4' and organization_id = org;
  log := log || 'cupom_vencido=' || coalesce(shop_coupon_check('tiajuca', 'TESTEETAPA4')::text, 'null') || '; ';
  begin perform shop_create_order(org, null, 'Teste Etapa4 C', '21900000003', 'c@teste.invalid', pp, 'pix', items, 48, 'TESTEETAPA4'); log := log || 'vencido=FALHOU(criou); ';
  exception when others then log := log || 'vencido_recusado=' || left(sqlerrm, 40) || '; '; end;

  -- Pedido duplicado não manda e-mail (LOJA-12)
  o3 := shop_create_order(org, null, 'Teste Etapa4 D', '21900000004', 'd@teste.invalid', pp, 'pix', items, 48, null);
  select id into id3 from shop_orders where code = o3->>'code';
  select count(*) into n from shop_email_outbox where order_id = id3 and status = 'pending'; log := log || 'fila_antes=' || n || '; ';
  perform shop_cancel_order(id3, 'Pedido duplicado', null, 'sistema');
  select count(*) into n from shop_email_outbox where order_id = id3; log := log || 'fila_duplicado=' || n || '; ';

  -- No máximo 5 "pedido recebido" por dia para o mesmo e-mail (LOJA-08)
  insert into shop_email_outbox (organization_id, order_id, template, to_email) select org, id3, 'order_created', 'e@teste.invalid' from generate_series(1, 5);
  perform shop_create_order(org, null, 'Teste Etapa4 E', '21900000005', 'e@teste.invalid', pp, 'pix', items, 48, null);
  select count(*) into n from shop_email_outbox where to_email = 'e@teste.invalid'; log := log || 'emails_e(5_antes)=' || n || '; ';

  -- Direção reativa (LOJA-17) e troca a chave Pix (LOJA-10)
  perform set_config('request.jwt.claims', json_build_object('sub', dir_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform shop_admin_reactivate_order(id3);
  update shop_settings set intro_text = intro_text where organization_id = org;
  select payment_changed_at into t from shop_settings where organization_id = org; log := log || 'sem_troca_pix_registro=' || coalesce(t::text, 'null') || '; ';
  update shop_settings set pix_key = pix_key || 'x' where organization_id = org;
  reset role;
  select status || ' exp=' || (expires_at > now())::text into s from shop_orders where id = id3; log := log || 'reativado=' || s || '; ';
  select payment_changed_at, payment_changed_by into t, changer from shop_settings where organization_id = org;
  log := log || 'troca_pix_registrada=' || (t is not null)::text || ' por_diretor=' || (changer = dir_member)::text || '; ';

  -- Conta sem shop.manage não mexe em cupom nem em Pix
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  update shop_coupons set discount_pct = 99 where organization_id = org; get diagnostics n = row_count; log := log || 'estranho_altera_cupom=' || n || '; ';
  update shop_settings set pix_key = 'x' where organization_id = org; get diagnostics n = row_count; log := log || 'estranho_altera_pix=' || n || '; ';
  reset role;

  -- Anonimização depois do prazo (LGPD-01)
  update shop_orders set created_at = now() - interval '6 years' where id = id1;
  n := shop_anonymize_old_orders(); log := log || 'anonimizados=' || n || '; ';
  select customer_name || '/' || customer_phone || '/' || customer_email into s from shop_orders where id = id1; log := log || 'pedido1=' || s || '; ';
  log := log || 'consulta_antiga=' || (shop_order_lookup(o1->>'code', '21900000001') ->> 'ok') || '; ';
  log := log || 'manutencao=' || (daily_privacy_maintenance() ? 'shop_orders_anonymized')::text || '; ';

  -- "Avisei que paguei" desligado (D6) e privilégios
  log := log || 'report_payment_existe=' || (to_regprocedure('public.shop_report_payment(text,text)') is not null)::text || '; ';
  log := log || 'anon_cria_pedido=' || has_function_privilege('anon', 'public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer,text)', 'execute')::text
     || ' anon_anonimiza=' || has_function_privilege('anon', 'public.shop_anonymize_old_orders()', 'execute')::text
     || ' auth_usos=' || has_function_privilege('authenticated', 'public.shop_coupon_uses(uuid,text)', 'execute')::text
     || ' anon_cupom=' || has_function_privilege('anon', 'public.shop_coupon_check(text,text)', 'execute')::text || '; ';
  begin update shop_orders set status = 'payment_review' where id = id1; log := log || 'status_antigo=FALHOU(aceitou); ';
  exception when check_violation then log := log || 'status_antigo_recusado; '; end;
  log := log || 'limite=' || shop_rate_limit('teste-etapa4', 2, '1 hour')::text || ',' || shop_rate_limit('teste-etapa4', 2, '1 hour')::text || ',' || shop_rate_limit('teste-etapa4', 2, '1 hour')::text || '; ';

  -- Produto oculto invisível ao visitante (LOJA-04)
  update shop_products set is_hidden = true where id = (select product_id from shop_product_variants where id = var);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from shop_products where id = (select product_id from shop_product_variants where id = var); log := log || 'anon_ve_oculto=' || n || '; ';
  reset role;
  update shop_products set is_hidden = false where id = (select product_id from shop_product_variants where id = var);

  -- Reativar não dobra a reserva de pronta entrega já retirada (LOJA-17)
  select v.id into vs from shop_product_variants v join shop_products p on p.id = v.product_id
   where p.organization_id = org and p.kind = 'stock' and p.is_active and not p.is_hidden and v.is_active and coalesce(v.stock, 0) - v.reserved >= 1
     and not exists (select 1 from shop_product_pickups pk where pk.product_id = p.id) limit 1;
  if vs is null then
    log := log || 'reativar_estoque=pulado (sem produto de pronta entrega com estoque e sem restrição de ponto)';
  else
    o6 := shop_create_order(org, null, 'Teste Etapa4 F', '21900000006', 'f@teste.invalid', pp, 'pix',
            jsonb_build_array(jsonb_build_object('variant_id', vs, 'quantity', 1), jsonb_build_object('variant_id', var, 'quantity', 1)), 48, null);
    select id into id6 from shop_orders where code = o6->>'code';
    perform shop_mark_paid(o6->>'code', 'manual', null, 'teste', '{}');
    update shop_fulfillments set status = 'ready' where order_id = id6 and kind = 'stock';
    update shop_fulfillments set status = 'picked_up' where order_id = id6 and kind = 'stock';
    perform shop_cancel_order(id6, 'teste', null, 'teste');
    select reserved into r1 from shop_product_variants where id = vs;
    perform set_config('request.jwt.claims', json_build_object('sub', dir_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform shop_admin_reactivate_order(id6);
    reset role;
    select reserved into r2 from shop_product_variants where id = vs;
    select string_agg(kind || ':' || status, ',' order by kind) into s from shop_fulfillments where order_id = id6;
    log := log || 'reativar_estoque: reservado ' || r1 || '→' || r2 || ' grupos=' || s;
  end if;
  raise exception 'RESULTADO: %', log;
end $$;
