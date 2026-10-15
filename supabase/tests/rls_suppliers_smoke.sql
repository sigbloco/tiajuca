-- Teste de fumaça de Fornecedores. Rodar APÓS a migration 0016. Resultado esperado: erro "TESTES_OK_ROLLBACK".
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; cat uuid; sup uuid;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_mon uuid := gen_random_uuid();
  u_int uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_mon uuid; m_int uuid; m_dirb uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'sup-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'sup-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  -- organizações criadas depois da migration recebem as permissões pelo mesmo caminho da migration
  insert into public.role_permissions (access_role_id, permission_key, scope)
    select id, 'suppliers.read', 'org' from public.access_roles where organization_id in (org_a, org_b) and key in ('direcao', 'professor', 'monitor') on conflict do nothing;
  insert into public.role_permissions (access_role_id, permission_key, scope)
    select id, 'suppliers.manage', 'org' from public.access_roles where organization_id in (org_a, org_b) and key = 'direcao' on conflict do nothing;

  insert into auth.users (id, email) values (u_dir,'d@sup.local'),(u_prof,'p@sup.local'),(u_mon,'m@sup.local'),(u_int,'i@sup.local'),(u_dirb,'db@sup.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_mon,'Mon') returning id into m_mon;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_int,'Int') returning id into m_int;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof, id from public.access_roles where organization_id=org_a and key='professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_mon, id from public.access_roles where organization_id=org_a and key='monitor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_int, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id=org_b and key='direcao';

  -- ── Direção cria categoria e fornecedor ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.supplier_categories (organization_id, name) values (org_a, 'Sonorização') returning id into cat;
  insert into public.suppliers (organization_id, category_id, name, phone) values (org_a, cat, 'EAB', '21982518603') returning id into sup;
  begin insert into public.suppliers (organization_id, category_id, name, website) values (org_a, cat, 'X', 'javascript:alert(1)');
    raise exception 'FALHOU: aceitou site sem http' using errcode = 'XX999'; exception when check_violation then null; end;
  begin insert into public.supplier_categories (organization_id, name) values (org_a, 'Sonorização');
    raise exception 'FALHOU: aceitou categoria duplicada' using errcode = 'XX999'; exception when unique_violation then null; end;
  update public.suppliers set is_active = false where id = sup;
  update public.suppliers set is_active = true where id = sup;

  -- ── Professor e Monitor leem, mas não escrevem ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  select count(*) into n from public.suppliers; if n <> 1 then raise exception 'FALHOU: professor deveria ver o fornecedor (viu %)', n; end if;
  begin insert into public.suppliers (organization_id, category_id, name) values (org_a, cat, 'Y');
    raise exception 'FALHOU: professor inseriu' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  select count(*) into n from public.suppliers; if n <> 1 then raise exception 'FALHOU: monitor deveria ver o fornecedor (viu %)', n; end if;
  update public.suppliers set name = 'Hackeado' where id = sup;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FALHOU: monitor editou fornecedor'; end if;

  -- ── Integrante não vê ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_int, 'role','authenticated')::text, true);
  select count(*) into n from public.suppliers; if n <> 0 then raise exception 'FALHOU: integrante viu fornecedores (%)', n; end if;
  select count(*) into n from public.supplier_categories; if n <> 0 then raise exception 'FALHOU: integrante viu categorias (%)', n; end if;

  -- ── Outra organização não vê nem escreve ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  select count(*) into n from public.suppliers; if n <> 0 then raise exception 'FALHOU: outra org viu fornecedores (%)', n; end if;
  begin insert into public.suppliers (organization_id, category_id, name) values (org_a, cat, 'Z');
    raise exception 'FALHOU: outra org inseriu' using errcode = 'XX999'; exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
