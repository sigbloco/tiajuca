-- Teste de fumaça da gestão de papéis (migration 0014): conceder/revogar e proteção do último diretor.
-- Resultado esperado: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; n int;
  u_d1 uuid := gen_random_uuid(); u_d2 uuid := gen_random_uuid(); u_pr uuid := gen_random_uuid(); u_st uuid := gen_random_uuid(); u_db uuid := gen_random_uuid();
  m_d1 uuid; m_d2 uuid; m_pr uuid; m_st uuid; m_db uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p10-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p10-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  insert into auth.users (id, email) values (u_d1,'d1@p10.local'),(u_d2,'d2@p10.local'),(u_pr,'p@p10.local'),(u_st,'s@p10.local'),(u_db,'db@p10.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_d1,'Diretor1') returning id into m_d1;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_d2,'Diretor2') returning id into m_d2;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_pr,'Prof') returning id into m_pr;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st,'Aluno') returning id into m_st;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_db,'DirB') returning id into m_db;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_d1, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_st, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_db, id from public.access_roles where organization_id=org_b and key='direcao';

  -- ── Diretor 1 (único): concede, é idempotente, mas não pode se remover nem arquivar ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_d1, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.grant_access_role(m_pr, 'professor');
  perform public.grant_access_role(m_pr, 'professor');
  select count(*) into n from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id
    where mar.member_id = m_pr and ar.key = 'professor' and mar.revoked_at is null;
  if n <> 1 then raise exception 'FALHOU: conceder duas vezes deveria manter 1 papel ativo, há %', n; end if;
  perform public.grant_access_role(m_pr, 'monitor'); -- papéis acumuláveis
  select count(*) into n from public.member_access_roles where member_id = m_pr and revoked_at is null;
  if n <> 2 then raise exception 'FALHOU: papéis deveriam acumular (2), há %', n; end if;
  perform public.revoke_access_role(m_pr, 'monitor');
  begin perform public.grant_access_role(m_pr, 'inexistente'); raise exception 'FALHOU: aceitou papel inválido' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;

  begin perform public.revoke_access_role(m_d1, 'direcao'); raise exception 'FALHOU: removeu o último diretor pela RPC' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not ilike '%último diretor%' then raise; end if; end;
  begin update public.member_access_roles set revoked_at = now() where member_id = m_d1;
    raise exception 'FALHOU: removeu o último diretor por update direto' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin update public.members set archived_at = now() where id = m_d1;
    raise exception 'FALHOU: arquivou o último diretor' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;

  -- ── Com um segundo diretor, um pode sair; o que sobrar fica protegido ──
  perform public.grant_access_role(m_d2, 'direcao');
  select count(*) into n from public.audit_logs where entity_type = 'member_access_roles';
  if n < 4 then raise exception 'FALHOU: mudanças de papel não estão auditadas (%)', n; end if;
  perform public.revoke_access_role(m_d1, 'direcao');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_d1, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.grant_access_role(m_pr, 'direcao'); raise exception 'FALHOU: ex-diretor ainda concede papéis' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_d2, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.revoke_access_role(m_d2, 'direcao'); raise exception 'FALHOU: o novo único diretor conseguiu se remover' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;

  -- ── Quem não é Direção não mexe em papéis (nem por INSERT direto); outra organização também não ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.grant_access_role(m_st, 'direcao'); raise exception 'FALHOU: aluno se promoveu pela RPC' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_access_role(m_d2, 'direcao'); raise exception 'FALHOU: aluno revogou Direção' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin insert into public.member_access_roles (organization_id, member_id, access_role_id)
      select org_a, m_st, id from public.access_roles where organization_id = org_a and key = 'direcao';
    raise exception 'FALHOU: aluno se promoveu por INSERT direto' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_db, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.grant_access_role(m_st, 'direcao'); raise exception 'FALHOU: Direção B concedeu papel na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_access_role(m_d2, 'direcao'); raise exception 'FALHOU: Direção B revogou papel na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
