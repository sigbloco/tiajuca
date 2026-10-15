-- Teste de fumaça da Fase 6 (repertório, anexos, bucket privado por organização, isolamento).
-- Rodar APÓS migration 0010. Resultado esperado: erro "TESTES_OK_ROLLBACK" (= tudo passou).
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; rep uuid; rep_old uuid; s1 uuid; s2 uuid; pub boolean;
  u_dir uuid := gen_random_uuid(); u_st1 uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_st1 uuid; m_dirb uuid; sec uuid; inst uuid;
begin
  select public into pub from storage.buckets where id = 'org-files';
  if pub is distinct from false then raise exception 'FALHOU: bucket org-files deveria existir e ser privado'; end if;

  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'p6-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'p6-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  insert into auth.users (id, email) values (u_dir,'d@p6.local'),(u_st1,'s@p6.local'),(u_dirb,'db@p6.local');
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

  -- ── Direção cria repertório, músicas e anexos ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.repertoires (organization_id, name, color) values (org_a, 'Carnaval', 'primary') returning id into rep;
  insert into public.repertoires (organization_id, name, is_active) values (org_a, 'Antigo', false) returning id into rep_old;
  insert into public.songs (organization_id, repertoire_id, title, artist, sort_order) values (org_a, rep, 'Música 1', 'Autor', 1) returning id into s1;
  insert into public.songs (organization_id, repertoire_id, title, sort_order, is_active) values (org_a, rep, 'Música 2 (inativa)', 2, false) returning id into s2;
  insert into public.song_attachments (organization_id, song_id, instrument_id, kind, url) values (org_a, s1, inst, 'score', 'https://exemplo.com/p.pdf');
  insert into public.song_attachments (organization_id, song_id, section_id, kind, storage_path, source)
    values (org_a, s1, sec, 'score', org_a::text || '/musicas/' || s1::text || '/a.pdf', 'storage');
  begin
    insert into public.song_attachments (organization_id, song_id, kind, url) values (org_a, s1, 'score', 'ftp://exemplo.com/x');
    raise exception 'FALHOU: aceitou URL que não é http(s)' using errcode = 'XX999';
  exception when check_violation then null; end;
  begin
    insert into public.song_attachments (organization_id, song_id, kind, storage_path) values (org_a, s1, 'score', org_b::text || '/musicas/x.pdf');
    raise exception 'FALHOU: aceitou arquivo fora da pasta da organização' using errcode = 'XX999';
  exception when check_violation then null; end;
  begin
    insert into public.song_attachments (organization_id, song_id, kind) values (org_a, s1, 'score');
    raise exception 'FALHOU: aceitou anexo sem URL nem arquivo' using errcode = 'XX999';
  exception when check_violation then null; end;
  select count(*) into n from public.repertoires; if n <> 2 then raise exception 'FALHOU: Direção deveria ver 2 repertórios, viu %', n; end if;
  select count(*) into n from public.songs; if n <> 2 then raise exception 'FALHOU: Direção deveria ver as 2 músicas, viu %', n; end if;

  -- Storage: arquivo na pasta da própria organização
  insert into storage.objects (bucket_id, name) values ('org-files', org_a::text || '/musicas/' || s1::text || '/a.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('org-files', org_b::text || '/musicas/invasao.pdf');
    raise exception 'FALHOU: Direção A gravou arquivo na pasta da org B' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Integrante: lê o ativo, não vê inativos, não escreve ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_st1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.repertoires; if n <> 1 then raise exception 'FALHOU: integrante deveria ver 1 repertório ativo, viu %', n; end if;
  select count(*) into n from public.songs; if n <> 1 then raise exception 'FALHOU: integrante deveria ver só a música ativa, viu %', n; end if;
  select count(*) into n from public.song_attachments; if n <> 2 then raise exception 'FALHOU: integrante deveria ver os 2 anexos, viu %', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'org-files'; if n <> 1 then raise exception 'FALHOU: integrante deveria ver o arquivo da própria org'; end if;
  begin insert into public.repertoires (organization_id, name) values (org_a, 'Intruso'); raise exception 'FALHOU: integrante criou repertório' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;
  begin
    update public.songs set title = 'hackeada' where id = s1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALHOU: integrante editou música' using errcode = 'XX999'; end if;
  end;
  begin insert into storage.objects (bucket_id, name) values ('org-files', org_a::text || '/musicas/x.pdf'); raise exception 'FALHOU: integrante enviou arquivo' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  -- ── Direção de outra organização ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.repertoires; if n <> 0 then raise exception 'FALHOU: Direção B viu repertórios da org A'; end if;
  select count(*) into n from public.songs; if n <> 0 then raise exception 'FALHOU: Direção B viu músicas da org A'; end if;
  select count(*) into n from public.song_attachments; if n <> 0 then raise exception 'FALHOU: Direção B viu anexos da org A'; end if;
  select count(*) into n from storage.objects where bucket_id = 'org-files'; if n <> 0 then raise exception 'FALHOU: Direção B viu arquivos da org A'; end if;
  begin insert into public.songs (organization_id, repertoire_id, title) values (org_a, rep, 'x'); raise exception 'FALHOU: Direção B criou música na org A' using errcode = 'XX999';
  exception when insufficient_privilege then null; end;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
