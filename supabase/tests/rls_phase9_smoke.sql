-- Teste de fumaça da Fase 9 (configuração da integração com o Drive). Rodar APÓS migration 0013.
-- A Edge Function e a conta de serviço do Google não são testáveis aqui (dependem de credenciais externas).
-- Resultado esperado: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; r jsonb; song uuid; rep uuid;
  u_dir uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_st1 uuid; m_dirb uuid;
begin
  if public.parse_drive_folder_id('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing') <> '1AbCdEfGhIjKlMnOp' then raise exception 'FALHOU: parse do link de pasta'; end if;
  if public.parse_drive_folder_id('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp') <> '1AbCdEfGhIjKlMnOp' then raise exception 'FALHOU: parse do link com id='; end if;
  if public.parse_drive_folder_id('1AbCdEfGhIjKlMnOp') <> '1AbCdEfGhIjKlMnOp' then raise exception 'FALHOU: parse do ID puro'; end if;
  if public.parse_drive_folder_id('abc') is not null or public.parse_drive_folder_id('https://exemplo.com/x') is not null then raise exception 'FALHOU: aceitou valor que não é pasta do Drive'; end if;

  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p9-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p9-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  insert into auth.users (id, email) values (u_dir,'d@p9.local'),(u_st1,'s@p9.local'),(u_dirb,'db@p9.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st1,'Aluno1') returning id into m_st1;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_st1, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id=org_b and key='direcao';

  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  r := public.drive_integration_config(org_a);
  if (r ->> 'configured')::boolean then raise exception 'FALHOU: não deveria estar configurado de início'; end if;
  begin perform public.save_drive_integration(org_a, 'abc', true); raise exception 'FALHOU: aceitou pasta inválida' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  r := public.save_drive_integration(org_a, 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing', true);
  if r ->> 'folder_id' <> '1AbCdEfGhIjKlMnOp' then raise exception 'FALHOU: pasta não normalizada'; end if;
  r := public.drive_integration_config(org_a);
  if not (r ->> 'configured')::boolean or not (r ->> 'active')::boolean or r ->> 'folder_id' <> '1AbCdEfGhIjKlMnOp' then raise exception 'FALHOU: configuração não refletida %', r; end if;
  perform public.set_drive_integration_active(org_a, false);
  if (public.drive_integration_config(org_a) ->> 'active')::boolean then raise exception 'FALHOU: desativar não funcionou'; end if;
  perform public.save_drive_integration(org_a, '1AbCdEfGhIjKlMnOp', true); -- idempotente (upsert)
  select count(*) into n from public.integrations where organization_id = org_a and provider = 'google_drive'; if n <> 1 then raise exception 'FALHOU: deveria existir 1 integração, existem %', n; end if;
  if exists (select 1 from public.integrations where config ? 'private_key' or config ? 'client_email') then raise exception 'FALHOU: credencial no banco'; end if;
  -- anexo vindo do Drive (link + id externo)
  insert into public.repertoires (organization_id, name) values (org_a, 'R') returning id into rep;
  insert into public.songs (organization_id, repertoire_id, title) values (org_a, rep, 'M') returning id into song;
  insert into public.song_attachments (organization_id, song_id, kind, url, source, external_ref, file_name)
    values (org_a, song, 'score', 'https://drive.google.com/file/d/xyz/view', 'gdrive', 'xyz', 'partitura.pdf');
  select count(*) into n from public.audit_logs where entity_type = 'integrations'; if n < 1 then raise exception 'FALHOU: alteração da integração não foi auditada'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.drive_integration_config(org_a); raise exception 'FALHOU: aluno leu a configuração do Drive' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin perform public.save_drive_integration(org_a, '1AbCdEfGhIjKlMnOp', true); raise exception 'FALHOU: aluno alterou integração' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin perform public.set_drive_integration_active(org_a, true); raise exception 'FALHOU: aluno ativou integração' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.integrations; if n <> 0 then raise exception 'FALHOU: aluno viu integrações'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.drive_integration_config(org_a); raise exception 'FALHOU: Direção B leu config da org A' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin perform public.save_drive_integration(org_a, '1AbCdEfGhIjKlMnOp', true); raise exception 'FALHOU: Direção B alterou integração da org A' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.integrations; if n <> 0 then raise exception 'FALHOU: Direção B viu integrações da org A'; end if;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin perform public.drive_integration_config(org_a); raise exception 'FALHOU: anon executou drive_integration_config' using errcode = 'XX999'; exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
