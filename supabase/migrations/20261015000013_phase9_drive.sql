-- SIGBloco · Fase 9 · Integração com Google Drive (busca de partituras em pasta institucional).
-- A credencial NUNCA fica no banco nem no front: é um segredo da Edge Function (GOOGLE_SERVICE_ACCOUNT_JSON, conta de serviço
-- da organização). O banco guarda apenas a pasta raiz permitida e o estado ligado/desligado.
-- A integração é opcional: sem ela, URL manual e Supabase Storage continuam funcionando.

-- Extrai o ID da pasta de um link do Drive (ou aceita o ID puro).
create or replace function public.parse_drive_folder_id(p_input text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    (regexp_match(trim(p_input), 'folders/([A-Za-z0-9_-]{10,})'))[1],
    (regexp_match(trim(p_input), '[?&]id=([A-Za-z0-9_-]{10,})'))[1],
    case when trim(p_input) ~ '^[A-Za-z0-9_-]{10,}$' then trim(p_input) end)
$$;

-- Lido pela Edge Function (com o JWT de quem busca) e pela tela de partituras. Exige permissão de editar repertório.
create or replace function public.drive_integration_config(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.integrations;
begin
  if not public.has_permission(p_org, 'repertoire.manage') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into i from public.integrations where organization_id = p_org and provider = 'google_drive';
  if i.id is null then return jsonb_build_object('configured', false, 'active', false); end if;
  return jsonb_build_object('configured', i.config ->> 'folder_id' is not null, 'active', i.is_active, 'folder_id', i.config ->> 'folder_id');
end $$;
revoke all on function public.drive_integration_config(uuid) from public, anon;
grant execute on function public.drive_integration_config(uuid) to authenticated;

create or replace function public.save_drive_integration(p_org uuid, p_folder text, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id text;
begin
  if not public.has_permission(p_org, 'settings.manage') then
    raise exception 'Sem permissão para alterar integrações.' using errcode = '42501';
  end if;
  v_id := public.parse_drive_folder_id(p_folder);
  if v_id is null then
    raise exception 'Link ou ID de pasta do Google Drive inválido.' using errcode = 'P0001';
  end if;
  insert into public.integrations (organization_id, provider, config, is_active)
  values (p_org, 'google_drive', jsonb_build_object('folder_id', v_id), coalesce(p_active, false))
  on conflict (organization_id, provider) do update set config = jsonb_build_object('folder_id', v_id), is_active = coalesce(p_active, false);
  return jsonb_build_object('folder_id', v_id, 'active', coalesce(p_active, false));
end $$;
revoke all on function public.save_drive_integration(uuid, text, boolean) from public, anon;
grant execute on function public.save_drive_integration(uuid, text, boolean) to authenticated;

create or replace function public.set_drive_integration_active(p_org uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission(p_org, 'settings.manage') then
    raise exception 'Sem permissão para alterar integrações.' using errcode = '42501';
  end if;
  update public.integrations set is_active = p_active where organization_id = p_org and provider = 'google_drive';
end $$;
revoke all on function public.set_drive_integration_active(uuid, boolean) from public, anon;
grant execute on function public.set_drive_integration_active(uuid, boolean) to authenticated;
