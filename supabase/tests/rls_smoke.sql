-- Teste de fumaça do RLS (Fase 1). Rodar no SQL Editor do Supabase (como postgres) APÓS as migrations.
-- Cria 2 organizações e 5 usuários fictícios, simula cada um via JWT e verifica o isolamento.
-- Tudo termina em ROLLBACK: nada permanece no banco. Qualquer falha lança exceção "FALHOU: ...".
begin;

do $$
declare
  org_a uuid; org_b uuid;
  u_dir_a uuid := gen_random_uuid(); u_int_a uuid := gen_random_uuid(); u_prof_a uuid := gen_random_uuid();
  u_dir_b uuid := gen_random_uuid(); u_out uuid := gen_random_uuid();
  m_dir_a uuid; m_int_a uuid; m_prof_a uuid; m_dir_b uuid;
  n int;

begin
  -- ── preparação (como postgres) ──
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'org-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'org-b') returning id into org_b;
  perform public.seed_org_defaults(org_a);
  perform public.seed_org_defaults(org_b);

  insert into auth.users (id, email) values
    (u_dir_a, 'dir.a@teste.local'), (u_int_a, 'int.a@teste.local'), (u_prof_a, 'prof.a@teste.local'),
    (u_dir_b, 'dir.b@teste.local'), (u_out, 'fora@teste.local');

  insert into public.members (organization_id, user_id, full_name) values (org_a, u_dir_a, 'Diretor A') returning id into m_dir_a;
  insert into public.members (organization_id, user_id, full_name) values (org_a, u_int_a, 'Integrante A') returning id into m_int_a;
  insert into public.members (organization_id, user_id, full_name) values (org_a, u_prof_a, 'Professor A') returning id into m_prof_a;
  insert into public.members (organization_id, user_id, full_name) values (org_b, u_dir_b, 'Diretor B') returning id into m_dir_b;

  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir_a,  id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_int_a,  id from public.access_roles where organization_id = org_a and key = 'integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof_a, id from public.access_roles where organization_id = org_a and key = 'professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dir_b,  id from public.access_roles where organization_id = org_b and key = 'direcao';

  -- ── 1. Direção A: vê os 3 membros da própria org e nenhum da org B ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members;
  if n <> 3 then raise exception 'FALHOU: Direção A deveria ver 3 membros, viu %', n; end if;
  select count(*) into n from public.members where organization_id = org_b;
  if n <> 0 then raise exception 'FALHOU: Direção A viu membros da org B (%)', n; end if;
  select count(*) into n from public.audit_logs;
  if n = 0 then raise exception 'FALHOU: Direção A deveria ver auditoria'; end if;
  raise notice 'OK 1: Direção A isolada na própria organização e vê auditoria';

  -- ── 2. Direção A não consegue criar membro na org B ──
  begin
    insert into public.members (organization_id, full_name) values (org_b, 'Intruso');
    raise exception 'FALHOU: Direção A inseriu membro na org B';
  exception when insufficient_privilege then
    raise notice 'OK 2: insert cross-org bloqueado';
  end;

  -- ── 3. Menor de idade rejeitado ──
  begin
    insert into public.members (organization_id, full_name, birth_date)
      values (org_a, 'Menor', (current_date - interval '10 years')::date);
    raise exception 'FALHOU: menor de idade foi aceito';
  exception when check_violation then
    raise notice 'OK 3: menor de 18 anos bloqueado';
  end;

  -- ── 4. Integrante A: vê só a si; não cria membro, não concede papel, não lê auditoria ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_int_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members;
  if n <> 1 then raise exception 'FALHOU: Integrante deveria ver só a si, viu %', n; end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'FALHOU: Integrante viu auditoria'; end if;
  begin
    insert into public.members (organization_id, full_name) values (org_a, 'Novo');
    raise exception 'FALHOU: Integrante criou membro';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.member_access_roles (organization_id, member_id, access_role_id)
      select org_a, m_int_a, id from public.access_roles where organization_id = org_a and key = 'direcao';
    raise exception 'FALHOU: Integrante se promoveu a Direção';
  exception when insufficient_privilege then null; end;
  perform public.update_my_profile(m_int_a, '{"phone":"21999990000"}'::jsonb);
  begin
    perform public.update_my_profile(m_dir_a, '{"phone":"1"}'::jsonb);
    raise exception 'FALHOU: Integrante editou perfil de outro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 4: Integrante restrito (leitura própria, sem escrita administrativa)';

  -- ── 5. Dados sensíveis: titular grava; Direção A lê; Professor e Direção B não ──
  insert into public.member_sensitive_data (member_id, organization_id, gender, race_color)
    values (m_int_a, org_a, 'feminino', 'parda');
  select count(*) into n from public.member_sensitive_data;
  if n <> 1 then raise exception 'FALHOU: titular deveria ler os próprios sensíveis'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.member_sensitive_data;
  if n <> 0 then raise exception 'FALHOU: Professor leu dados sensíveis (%)', n; end if;
  select count(*) into n from public.members;
  if n <> 1 then raise exception 'FALHOU: Professor (sem grupo na Fase 1) deveria ver só a si, viu %', n; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.member_sensitive_data;
  if n <> 0 then raise exception 'FALHOU: Direção B leu sensíveis da org A'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.member_sensitive_data;
  if n <> 1 then raise exception 'FALHOU: Direção A deveria ler sensíveis da própria org'; end if;
  raise notice 'OK 5: dados sensíveis isolados (titular + Direção da mesma org)';

  -- ── 6. Direção B não enxerga nada da org A (membros, papéis, configurações) ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu membros da org A'; end if;
  select count(*) into n from public.access_roles where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu papéis da org A'; end if;
  select count(*) into n from public.audit_logs where organization_id = org_a;
  if n <> 0 then raise exception 'FALHOU: Direção B viu auditoria da org A'; end if;
  raise notice 'OK 6: Direção B sem acesso à org A';

  -- ── 7. Usuário sem vínculo não vê nada ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.members;
  if n <> 0 then raise exception 'FALHOU: usuário sem vínculo viu membros'; end if;
  select count(*) into n from public.organizations;
  if n <> 0 then raise exception 'FALHOU: usuário sem vínculo viu organizações'; end if;
  raise notice 'OK 7: usuário sem vínculo não vê nada';

  -- ── 8. anon: sem acesso às tabelas, mas get_public_org funciona ──
  reset role;
  set local role anon;
  begin
    perform 1 from public.members limit 1;
    raise exception 'FALHOU: anon leu members';
  exception when insufficient_privilege then null; end;
  if public.get_public_org('org-a') is null then raise exception 'FALHOU: get_public_org anon'; end if;
  raise notice 'OK 8: anon bloqueado nas tabelas; identidade pública disponível';

  reset role;
  raise notice 'TODOS OS TESTES DE RLS PASSARAM';
end $$;

rollback;
