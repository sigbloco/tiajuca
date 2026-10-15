-- Teste de fumaça: Titular do bloco + edição da matriz de permissões (migration 0015). Resultado esperado: "TESTES_OK_ROLLBACK".
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; r_dir uuid; r_prof uuid; r_tit uuid;
  u_d uuid := gen_random_uuid(); u_t uuid := gen_random_uuid(); u_pr uuid := gen_random_uuid(); u_st uuid := gen_random_uuid(); u_db uuid := gen_random_uuid();
  m_d uuid; m_t uuid; m_pr uuid; m_st uuid; m_db uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p11-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p11-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  insert into auth.users (id, email) values (u_d,'d@p11.local'),(u_t,'titular@p11.local'),(u_pr,'p@p11.local'),(u_st,'s@p11.local'),(u_db,'db@p11.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_d,'Dir') returning id into m_d;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_t,'Titular') returning id into m_t;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_pr,'Prof') returning id into m_pr;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st,'Aluno') returning id into m_st;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_db,'DirB') returning id into m_db;
  insert into public.members (organization_id, full_name) values (org_a,'Sem Conta');
  insert into public.member_access_roles (organization_id, member_id, access_role_id) select org_a, m_d, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id) select org_a, m_pr, id from public.access_roles where organization_id=org_a and key='professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id) select org_a, m_st, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id) select org_b, m_db, id from public.access_roles where organization_id=org_b and key='direcao';
  select id into r_dir from public.access_roles where organization_id = org_a and key = 'direcao';
  select id into r_prof from public.access_roles where organization_id = org_a and key = 'professor';
  select id into r_tit from public.access_roles where organization_id = org_a and key = 'titular';
  if r_tit is null then raise exception 'FALHOU: papel titular não foi criado junto com a organização'; end if;
  select count(*) into n from public.role_permissions where access_role_id = r_tit; select count(*) into n from public.role_permissions where access_role_id = r_tit having count(*) = (select count(*) from public.permissions);
  if n is null or n = 0 then raise exception 'FALHOU: titular deveria ter todas as permissões'; end if;

  -- nova permissão do catálogo vai sozinha para Direção e Titular
  insert into public.permissions (key, module, description) values ('teste.novo', 'teste', 'Permissão de teste');
  select count(*) into n from public.role_permissions where permission_key = 'teste.novo' and scope = 'org' and access_role_id in (select id from public.access_roles where key in ('direcao', 'titular'));
  if n < 4 then raise exception 'FALHOU: nova permissão não chegou a Direção e Titular (%)', n; end if;

  -- o titular é designado pelo banco (sem usuário logado); pela interface/API não
  perform public.set_organization_titular('p11-a', 'titular@p11.local');
  if not public.has_active_titular(org_a) then raise exception 'FALHOU: titular não foi designado'; end if;

  -- ── Direção edita papéis não-críticos; críticos e a própria Direção são protegidos ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_d, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.set_role_permission(org_a, 'professor', 'events.manage', 'org');
  if not exists (select 1 from public.role_permissions where access_role_id = r_prof and permission_key = 'events.manage' and scope = 'org') then raise exception 'FALHOU: escopo não alterado'; end if;
  perform public.set_role_permission(org_a, 'professor', 'repertoire.manage', 'group');
  perform public.set_role_permission(org_a, 'professor', 'repertoire.manage', null);
  if exists (select 1 from public.role_permissions where access_role_id = r_prof and permission_key = 'repertoire.manage') then raise exception 'FALHOU: permissão não foi removida'; end if;
  begin perform public.set_role_permission(org_a, 'professor', 'events.manage', 'tudo'); raise exception 'FALHOU: aceitou escopo inválido' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
  begin perform public.set_role_permission(org_a, 'professor', 'finance.read', 'org'); raise exception 'FALHOU: deu financeiro ao Professor' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not ilike '%exclusiva da Direção%' then raise; end if; end;
  begin insert into public.role_permissions (access_role_id, permission_key, scope) values (r_prof, 'members.sensitive.read', 'org');
    raise exception 'FALHOU: INSERT direto liberou dado sensível ao Professor' using errcode = 'XX999'; exception when sqlstate 'P0001' then null; end;
  begin perform public.set_role_permission(org_a, 'direcao', 'roles.manage', null); raise exception 'FALHOU: tirou permissão da Direção' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin update public.role_permissions set scope = 'own' where access_role_id = r_dir and permission_key = 'roles.manage'; raise exception 'FALHOU: reduziu escopo da Direção' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin delete from public.role_permissions where access_role_id = r_tit and permission_key = 'audit.read'; raise exception 'FALHOU: apagou permissão do Titular' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  select count(*) into n from public.audit_logs where entity_type = 'role_permissions'; if n < 2 then raise exception 'FALHOU: edição de permissões não foi auditada (%)', n; end if;

  -- ── Com titular no bloco, a Direção NÃO mexe na Direção nem na titularidade ──
  begin perform public.grant_access_role(m_pr, 'direcao'); raise exception 'FALHOU: Direção concedeu Direção' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not ilike '%titular do bloco%' then raise; end if; end;
  begin perform public.revoke_access_role(m_d, 'direcao'); raise exception 'FALHOU: Direção removeu Direção' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.revoke_access_role(m_t, 'titular'); raise exception 'FALHOU: Direção removeu o titular' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin update public.member_access_roles set revoked_at = now() where member_id = m_t; raise exception 'FALHOU: Direção revogou titular por UPDATE direto' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin insert into public.member_access_roles (organization_id, member_id, access_role_id) values (org_a, m_d, r_tit); raise exception 'FALHOU: Direção se fez titular por INSERT direto' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin insert into public.member_access_roles (organization_id, member_id, access_role_id) values (org_a, m_pr, r_dir); raise exception 'FALHOU: Direção concedeu Direção por INSERT direto' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin update public.members set archived_at = now() where id = m_t; raise exception 'FALHOU: arquivou o titular' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.transfer_titular(org_a, m_d); raise exception 'FALHOU: Direção transferiu titularidade' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.set_organization_titular('p11-a', 'd@p11.local'); raise exception 'FALHOU: designou titular pela interface' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  -- ainda pode gerir papéis comuns
  perform public.grant_access_role(m_pr, 'monitor'); perform public.revoke_access_role(m_pr, 'monitor');

  -- ── Titular controla a Direção ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_t, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.has_permission(org_a, 'finance.read') or not public.has_permission(org_a, 'roles.manage') then raise exception 'FALHOU: titular deveria ter todas as permissões'; end if;
  perform public.grant_access_role(m_pr, 'direcao');
  if not exists (select 1 from public.member_access_roles where member_id = m_pr and access_role_id = r_dir and revoked_at is null) then raise exception 'FALHOU: titular não concedeu Direção'; end if;
  perform public.revoke_access_role(m_pr, 'direcao');
  perform public.revoke_access_role(m_d, 'direcao'); -- o titular pode remover até a Direção atual (sobra ele como administrador)
  perform public.grant_access_role(m_d, 'direcao');
  begin perform public.revoke_access_role(m_t, 'titular'); raise exception 'FALHOU: titular removeu a si mesmo' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.grant_access_role(m_pr, 'titular'); raise exception 'FALHOU: concedeu titular fora da transferência' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.transfer_titular(org_a, m_t); raise exception 'FALHOU: transferiu para si mesmo' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.transfer_titular(org_a, (select id from public.members where organization_id = org_a and user_id is null limit 1)); raise exception 'FALHOU: transferiu para quem não tem conta' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  perform public.transfer_titular(org_a, m_d);
  if public.caller_is_titular(org_a) then raise exception 'FALHOU: ex-titular continua titular'; end if;

  -- ── Depois da transferência: antigo titular perde tudo; o novo manda ──
  begin perform public.grant_access_role(m_pr, 'direcao'); raise exception 'FALHOU: ex-titular ainda concede papéis' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_d, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.caller_is_titular(org_a) then raise exception 'FALHOU: novo titular não reconhecido'; end if;
  perform public.grant_access_role(m_pr, 'direcao');

  -- ── Quem não é Direção/Titular nem outro bloco consegue algo ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_role_permission(org_a, 'integrante', 'events.manage', 'org'); raise exception 'FALHOU: aluno editou permissões' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin insert into public.role_permissions (access_role_id, permission_key, scope) values (r_prof, 'attendance.record', 'org'); raise exception 'FALHOU: aluno gravou direto em role_permissions' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.transfer_titular(org_a, m_st); raise exception 'FALHOU: aluno transferiu titularidade' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_db, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_role_permission(org_a, 'professor', 'events.manage', null); raise exception 'FALHOU: Direção B editou papéis da org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.grant_access_role(m_st, 'direcao'); raise exception 'FALHOU: Direção B concedeu papel na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
