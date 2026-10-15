-- Teste de fumaça da Fase 8 (formulário público, validação no servidor, upload com token, aprovação, retenção, isolamento).
-- Rodar APÓS migration 0012. Resultado esperado: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; frm uuid; draft uuid; ver1 uuid; ver2 uuid; inst uuid; lvl uuid; sec uuid; ctype uuid; cyc uuid;
  res jsonb; tok jsonb; sub1 uuid; sub2 uuid; sub3 uuid; mem uuid; msg text; bd text := to_char(current_date - interval '30 years', 'YYYY-MM-DD');
  u_dir uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_st1 uuid; m_dirb uuid; opts jsonb; ans jsonb; path text; fld uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p8-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p8-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b); perform public.seed_org_cycle_defaults(org_a);
  insert into auth.users (id, email) values (u_dir,'d@p8.local'),(u_st1,'s@p8.local'),(u_dirb,'db@p8.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_st1,'Aluno1') returning id into m_st1;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id=org_a and key='direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_st1, id from public.access_roles where organization_id=org_a and key='integrante';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id=org_b and key='direcao';
  insert into public.sections (organization_id, name) values (org_a, 'Percussão') returning id into sec;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec, 'Tamborim') returning id into inst;
  insert into public.skill_levels (organization_id, name) values (org_a, 'Iniciante') returning id into lvl;
  select id into ctype from public.cycle_types where organization_id=org_a and key='carnaval';
  insert into public.cycles (organization_id, cycle_type_id, name, starts_on, ends_on, is_current) values (org_a, ctype, 'Carnaval', current_date - 30, current_date + 120, true) returning id into cyc;
  frm := public.create_default_registration_form(org_a);
  update public.forms set cycle_id = cyc where id = frm;
  insert into public.forms (organization_id, title, slug) values (org_a, 'Rascunho', 'rascunho') returning id into draft;

  -- ── Direção publica; mapeamento duplicado é recusado; opções do catálogo entram na versão ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.form_fields (organization_id, form_id, field_key, label, field_type, member_mapping, sort_order) values (org_a, frm, 'email2', 'Outro e-mail', 'email', 'member.email', 99) returning id into fld;
  begin perform public.publish_form(frm); raise exception 'FALHOU: publicou com dois campos ligados ao mesmo dado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  update public.form_fields set is_active = false where id = fld;
  ver1 := public.publish_form(frm);
  select snapshot -> 'fields' into opts from public.form_versions where id = ver1;
  if not exists (select 1 from jsonb_array_elements(opts) f where f ->> 'key' = 'instrument' and f -> 'options' -> 0 ->> 'value' = inst::text) then
    raise exception 'FALHOU: opções de instrumento não vieram do cadastro na versão publicada'; end if;
  begin perform public.publish_form(draft); raise exception 'FALHOU: publicou formulário sem campos' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;

  -- ── Público (anon): vê o formulário publicado, sem o mapeamento interno; não vê rascunho; não toca tabelas ──
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  res := public.get_public_form('p8-a', 'inscricao');
  if res ->> 'state' <> 'open' then raise exception 'FALHOU: formulário deveria estar aberto: %', res ->> 'state'; end if;
  if jsonb_path_exists(res, '$.form.fields[*].mapping') then raise exception 'FALHOU: mapeamento interno vazou para o público'; end if;
  if (public.get_public_form('p8-a', 'rascunho') ->> 'state') <> 'not_found' then raise exception 'FALHOU: rascunho visível ao público'; end if;
  if (public.get_public_form('p8-b', 'inscricao') ->> 'state') <> 'not_found' then raise exception 'FALHOU: organização errada deveria dar não encontrado'; end if;
  begin perform 1 from public.forms limit 1; raise exception 'FALHOU: anon leu forms' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.form_submissions limit 1; raise exception 'FALHOU: anon leu respostas' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin insert into public.form_submissions (organization_id, form_id, form_version_id) values (org_a, frm, ver1); raise exception 'FALHOU: anon gravou direto' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  ans := jsonb_build_object('full_name', 'Maria Teste', 'email', 'Maria@Teste.com', 'phone', '(21) 99999-0000', 'birth_date', bd, 'gender', 'feminino',
    'is_trans', 'no', 'is_pcd', 'no', 'pcd_description', 'deveria ser ignorado', 'plays', 'yes', 'instrument', inst::text, 'level', lvl::text, 'affective', 'Moro na Tijuca');
  res := public.submit_public_form('p8-a', 'inscricao', ans, true);
  if (res ->> 'message') is null then raise exception 'FALHOU: envio válido não devolveu mensagem'; end if;

  -- validações do servidor
  begin perform public.submit_public_form('p8-a', 'inscricao', ans, true); raise exception 'FALHOU: aceitou e-mail duplicado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not ilike '%já recebemos%' then raise; end if; end;
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || '{"email":"outro@teste.com"}'::jsonb, false); raise exception 'FALHOU: aceitou sem consentimento' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.submit_public_form('p8-a', 'inscricao', (ans - 'full_name') || '{"email":"b@teste.com"}'::jsonb, true); raise exception 'FALHOU: aceitou sem campo obrigatório' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || jsonb_build_object('email', 'c@teste.com', 'birth_date', to_char(current_date - interval '10 years', 'YYYY-MM-DD')), true); raise exception 'FALHOU: aceitou menor de idade' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not ilike '%18 anos%' then raise; end if; end;
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || jsonb_build_object('email', 'd@teste.com', 'instrument', gen_random_uuid()::text), true); raise exception 'FALHOU: aceitou opção inexistente' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || '{"email":"nao-e-email"}'::jsonb, true); raise exception 'FALHOU: aceitou e-mail inválido' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || jsonb_build_object('email', 'e@teste.com', 'full_name', repeat('x', 400)), true); raise exception 'FALHOU: aceitou texto gigante' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
  -- honeypot: finge sucesso, não grava
  perform public.submit_public_form('p8-a', 'inscricao', ans || '{"email":"bot@teste.com"}'::jsonb, true, 'sou robô');

  -- ── confere o que foi gravado (como dono) ──
  reset role;
  select count(*) into n from public.form_submissions where form_id = frm;
  if n <> 1 then raise exception 'FALHOU: deveria haver exatamente 1 inscrição gravada, há %', n; end if;
  select id into sub1 from public.form_submissions where form_id = frm;
  if (select answers ? 'pcd_description' from public.form_submissions where id = sub1) then raise exception 'FALHOU: resposta de campo condicional oculto foi guardada'; end if;
  if (select applicant_email from public.form_submissions where id = sub1) <> 'maria@teste.com' then raise exception 'FALHOU: e-mail não normalizado'; end if;
  if (select form_version_id from public.form_submissions where id = sub1) <> ver1 then raise exception 'FALHOU: resposta não aponta para a versão publicada'; end if;

  -- ── upload anônimo só com token; envio com arquivo; nova versão preserva respostas antigas ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.form_fields (organization_id, form_id, field_key, label, field_type, sort_order) values (org_a, frm, 'doc', 'Documento', 'file', 100);
  ver2 := public.publish_form(frm);
  if ver2 = ver1 then raise exception 'FALHOU: republicar deveria criar nova versão'; end if;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  tok := public.begin_form_upload('p8-a', 'inscricao');
  path := org_a::text || '/' || (tok ->> 'token') || '/doc.pdf';
  insert into storage.objects (bucket_id, name) values ('form-uploads', path);
  begin insert into storage.objects (bucket_id, name) values ('form-uploads', org_a::text || '/' || gen_random_uuid()::text || '/doc.pdf');
    raise exception 'FALHOU: anon enviou arquivo sem token válido' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('form-uploads', org_b::text || '/' || (tok ->> 'token') || '/doc.pdf');
    raise exception 'FALHOU: anon enviou arquivo na pasta de outra organização' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  select count(*) into n from storage.objects where bucket_id = 'form-uploads';
  if n <> 0 then raise exception 'FALHOU: anon consegue ler arquivos de inscrição'; end if;
  res := public.submit_public_form('p8-a', 'inscricao', ans || '{"email":"ana@teste.com","full_name":"Ana Arquivo"}'::jsonb, true, null, (tok ->> 'token')::uuid,
    jsonb_build_array(jsonb_build_object('field_key', 'doc', 'path', path, 'name', 'doc.pdf', 'mime', 'application/pdf', 'size', 1000)));
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || '{"email":"x@teste.com"}'::jsonb, true, null, (tok ->> 'token')::uuid,
      jsonb_build_array(jsonb_build_object('field_key', 'doc', 'path', path, 'name', 'doc.pdf', 'mime', 'application/pdf', 'size', 1000)));
    raise exception 'FALHOU: token de upload foi reutilizado' using errcode = 'XX999'; exception when sqlstate 'P0001' then null; end;
  reset role;
  select id into sub2 from public.form_submissions where applicant_email = 'ana@teste.com';
  select count(*) into n from public.form_submission_files where submission_id = sub2; if n <> 1 then raise exception 'FALHOU: arquivo não vinculado à inscrição'; end if;
  if (select form_version_id from public.form_submissions where id = sub2) <> ver2 then raise exception 'FALHOU: nova inscrição deveria usar a versão 2'; end if;
  if (select form_version_id from public.form_submissions where id = sub1) <> ver1 then raise exception 'FALHOU: inscrição antiga mudou de versão'; end if;

  -- ── Aluno e outra organização não veem nem aprovam ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.form_submissions; if n <> 0 then raise exception 'FALHOU: aluno viu inscrições'; end if;
  select count(*) into n from public.forms; if n <> 0 then raise exception 'FALHOU: aluno viu formulários'; end if;
  begin perform public.approve_submission(sub1); raise exception 'FALHOU: aluno aprovou inscrição' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin perform public.publish_form(frm); raise exception 'FALHOU: aluno publicou formulário' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.form_submissions; if n <> 0 then raise exception 'FALHOU: Direção B viu inscrições da org A'; end if;
  begin perform public.approve_submission(sub1); raise exception 'FALHOU: Direção B aprovou inscrição da org A' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  begin perform public.purge_old_submissions(org_a); raise exception 'FALHOU: Direção B aplicou retenção na org A' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  select count(*) into n from storage.objects where bucket_id = 'form-uploads'; if n <> 0 then raise exception 'FALHOU: Direção B viu arquivos da org A'; end if;

  -- ── Direção aprova: o integrante nasce da inscrição (mapeamento), com sensível separado e consentimento ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'form-uploads'; if n <> 1 then raise exception 'FALHOU: Direção deveria ver o arquivo enviado'; end if;
  mem := public.approve_submission(sub1, 'ok', 'waitlist');
  if not exists (select 1 from public.members where id = mem and full_name = 'Maria Teste' and lower(email) = 'maria@teste.com' and phone = '21999990000' and birth_date::text = bd) then
    raise exception 'FALHOU: integrante não foi criado a partir do mapeamento'; end if;
  if not exists (select 1 from public.member_sensitive_data where member_id = mem and gender = 'feminino' and is_trans = false and is_pcd = false and pcd_description is null) then
    raise exception 'FALHOU: dados sensíveis não foram para a tabela restrita'; end if;
  if not exists (select 1 from public.member_artistic_links where member_id = mem and instrument_id = inst and skill_level_id = lvl) then raise exception 'FALHOU: vínculo artístico não criado'; end if;
  if not exists (select 1 from public.consent_records where member_id = mem and purpose = 'inscricao') then raise exception 'FALHOU: consentimento não registrado'; end if;
  if not exists (select 1 from public.member_cycles mc join public.member_cycle_statuses s on s.id = mc.status_id where mc.member_id = mem and s.key = 'waitlist') then raise exception 'FALHOU: status no ciclo (lista de espera) não definido'; end if;
  if (select status from public.form_submissions where id = sub1) <> 'approved' then raise exception 'FALHOU: inscrição deveria estar aprovada'; end if;
  begin perform public.approve_submission(sub1); raise exception 'FALHOU: aprovou duas vezes' using errcode = 'XX999'; exception when sqlstate 'P0001' then null; end;
  -- e-mail já existente entre os integrantes impede duplicar cadastro
  insert into public.members (organization_id, full_name, email) values (org_a, 'Ana Antiga', 'ana@teste.com');
  begin perform public.approve_submission(sub2); raise exception 'FALHOU: criou integrante duplicado' using errcode = 'XX999'; exception when unique_violation then null; end;
  perform public.review_submission(sub2, 'rejected', 'duplicada');
  if (select status from public.form_submissions where id = sub2) <> 'rejected' then raise exception 'FALHOU: rejeição'; end if;

  -- ── Encerramento e limite de respostas ──
  update public.forms set max_responses = 1 where id = frm;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  if (public.get_public_form('p8-a', 'inscricao') ->> 'state') <> 'full' then raise exception 'FALHOU: limite de respostas não fechou o formulário (1 inscrição ativa já atinge o limite)'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.forms set max_responses = null, status = 'closed' where id = frm;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin perform public.submit_public_form('p8-a', 'inscricao', ans || '{"email":"tarde@teste.com"}'::jsonb, true); raise exception 'FALHOU: aceitou envio com inscrições encerradas' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;

  -- ── Retenção: rejeitada há 13 meses é anonimizada ──
  reset role;
  update public.form_submissions set reviewed_at = now() - interval '13 months' where id = sub2;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  perform public.purge_old_submissions(org_a);
  if (select answers <> '{}'::jsonb or applicant_email is not null from public.form_submissions where id = sub2) then raise exception 'FALHOU: retenção não anonimizou a resposta'; end if;
  if (select status from public.form_submissions where id = sub1) <> 'approved' or (select answers = '{}'::jsonb from public.form_submissions where id = sub1) then
    raise exception 'FALHOU: retenção não deve tocar inscrições aprovadas'; end if;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
