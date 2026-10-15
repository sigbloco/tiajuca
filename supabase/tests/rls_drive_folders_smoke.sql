-- Teste das pastas do Drive. Rodar APÓS a migration 0018. Esperado: erro "TESTES_OK_ROLLBACK".
begin;

do $$
declare
  org_a uuid; org_b uuid; n int; f_role uuid; f_sec uuid; f_inst uuid; f_none uuid; sec uuid; inst uuid; inst2 uuid; role_prof uuid;
  u_dir uuid := gen_random_uuid(); u_prof uuid := gen_random_uuid(); u_mon uuid := gen_random_uuid(); u_int uuid := gen_random_uuid(); u_dirb uuid := gen_random_uuid();
  m_dir uuid; m_prof uuid; m_mon uuid; m_int uuid; m_dirb uuid;
begin
  insert into public.organizations (name, short_name, slug) values ('Org A', 'A', 'dv-a') returning id into org_a;
  insert into public.organizations (name, short_name, slug) values ('Org B', 'B', 'dv-b') returning id into org_b;
  perform public.seed_org_defaults(org_a); perform public.seed_org_defaults(org_b);
  insert into public.role_permissions (access_role_id, permission_key, scope)
    select id, 'drive.read', 'org' from public.access_roles where organization_id in (org_a, org_b) on conflict do nothing;
  insert into public.role_permissions (access_role_id, permission_key, scope)
    select id, 'drive.manage', 'org' from public.access_roles where organization_id in (org_a, org_b) and key = 'direcao' on conflict do nothing;

  insert into auth.users (id, email) values (u_dir,'d@dv.local'),(u_prof,'p@dv.local'),(u_mon,'m@dv.local'),(u_int,'i@dv.local'),(u_dirb,'db@dv.local');
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_dir,'Dir') returning id into m_dir;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_prof,'Prof') returning id into m_prof;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_mon,'Mon') returning id into m_mon;
  insert into public.members (organization_id, user_id, full_name) values (org_a,u_int,'Int') returning id into m_int;
  insert into public.members (organization_id, user_id, full_name) values (org_b,u_dirb,'DirB') returning id into m_dirb;
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_dir, id from public.access_roles where organization_id = org_a and key = 'direcao';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_prof, id from public.access_roles where organization_id = org_a and key = 'professor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_a, m_mon, id from public.access_roles where organization_id = org_a and key = 'monitor';
  insert into public.member_access_roles (organization_id, member_id, access_role_id)
    select org_b, m_dirb, id from public.access_roles where organization_id = org_b and key = 'direcao';
  select id into role_prof from public.access_roles where organization_id = org_a and key = 'professor';
  insert into public.sections (organization_id, name) values (org_a, 'Sopro') returning id into sec;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec, 'Trompete') returning id into inst;
  insert into public.instruments (organization_id, section_id, name) values (org_a, sec, 'Tuba') returning id into inst2;
  insert into public.member_artistic_links (organization_id, member_id, instrument_id) values (org_a, m_int, inst);
  insert into public.member_artistic_links (organization_id, member_id, instrument_id) values (org_a, m_mon, inst2);

  -- ── Direção cadastra pastas e regras ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.drive_folders (organization_id, name, url) values (org_a, 'Só professores', 'https://drive.google.com/drive/folders/abc') returning id into f_role;
  insert into public.drive_folders (organization_id, name, url) values (org_a, 'Naipe de sopro', 'https://drive.google.com/drive/folders/def') returning id into f_sec;
  insert into public.drive_folders (organization_id, name, url) values (org_a, 'Só trompetes', 'https://drive.google.com/drive/folders/ghi') returning id into f_inst;
  insert into public.drive_folders (organization_id, name, url) values (org_a, 'Sem regra', 'https://drive.google.com/drive/folders/jkl') returning id into f_none;
  begin insert into public.drive_folders (organization_id, name, url) values (org_a, 'Golpe', 'https://exemplo.com/x');
    raise exception 'FALHOU: aceitou url fora do Google Drive' using errcode = 'XX999'; exception when check_violation then null; end;
  insert into public.drive_folder_access (organization_id, folder_id, access_role_id) values (org_a, f_role, role_prof);
  insert into public.drive_folder_access (organization_id, folder_id, section_id) values (org_a, f_sec, sec);
  insert into public.drive_folder_access (organization_id, folder_id, instrument_id) values (org_a, f_inst, inst);
  begin insert into public.drive_folder_access (organization_id, folder_id, access_role_id, section_id) values (org_a, f_none, role_prof, sec);
    raise exception 'FALHOU: aceitou dois alvos na mesma regra' using errcode = 'XX999'; exception when check_violation then null; end;
  select count(*) into n from public.drive_folders; if n <> 4 then raise exception 'FALHOU: Direção deveria ver as 4 pastas (viu %)', n; end if;
  delete from public.drive_folder_access where folder_id = f_none;

  -- ── Professor: só a pasta do papel ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  select count(*) into n from public.drive_folders; if n <> 1 then raise exception 'FALHOU: professor deveria ver 1 pasta (viu %)', n; end if;
  begin insert into public.drive_folders (organization_id, name, url) values (org_a, 'X', 'https://drive.google.com/x');
    raise exception 'FALHOU: professor criou pasta' using errcode = 'XX999'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.drive_folder_access; if n <> 0 then raise exception 'FALHOU: professor leu regras (%)', n; end if;

  -- ── Integrante (Trompete): naipe + instrumento, não a do papel nem a sem regra ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_int, 'role','authenticated')::text, true);
  select count(*) into n from public.drive_folders; if n <> 2 then raise exception 'FALHOU: integrante de trompete deveria ver 2 pastas (viu %)', n; end if;

  -- ── Monitor (Tuba): só a do naipe ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_mon, 'role','authenticated')::text, true);
  select count(*) into n from public.drive_folders; if n <> 1 then raise exception 'FALHOU: monitor de tuba deveria ver 1 pasta (viu %)', n; end if;

  -- ── Outra organização: nada ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dirb, 'role','authenticated')::text, true);
  select count(*) into n from public.drive_folders; if n <> 0 then raise exception 'FALHOU: outra org viu pastas (%)', n; end if;

  -- ── Desativar some para quem não gerencia ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dir, 'role','authenticated')::text, true);
  update public.drive_folders set is_active = false where id = f_role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role','authenticated')::text, true);
  select count(*) into n from public.drive_folders; if n <> 0 then raise exception 'FALHOU: pasta desativada ainda visível ao professor (%)', n; end if;

  reset role;
  raise exception 'TESTES_OK_ROLLBACK';
end $$;

rollback;
