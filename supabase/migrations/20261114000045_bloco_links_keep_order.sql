-- O Site pode reordenar e ocultar (olho) os links que vêm do perfil do bloco; ao salvar o perfil, a ordem e o "oculto" são mantidos.
drop function if exists public.bloco_links(text, text, text);
create or replace function public.bloco_links(p_phone text, p_email text, p_social text, p_existing jsonb default '[]'::jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare fresh jsonb := '[]'::jsonb; res jsonb := '[]'::jsonb; line text; k text; d text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'); e jsonb; f jsonb;
begin
  if d <> '' then fresh := fresh || jsonb_build_array(jsonb_build_object('kind', 'whatsapp', 'label', '', 'value', d)); end if;
  for line in select btrim(x) from regexp_split_to_table(coalesce(p_social, ''), chr(10)) x loop
    continue when line = '';
    k := case when line ~* 'instagram[.]com' then 'instagram' when line ~* 'youtu[.]?be' then 'youtube' when line ~* 'facebook[.]com' then 'facebook'
              when line ~* 'tiktok[.]com' then 'tiktok' when line ~* 'spotify[.]com' then 'spotify' when line ~* '(x|twitter)[.]com' then 'x'
              when line ~* 'linkedin[.]com' then 'linkedin' else 'site' end;
    fresh := fresh || jsonb_build_array(jsonb_build_object('kind', k, 'label', '', 'value', line));
  end loop;
  if nullif(btrim(coalesce(p_email, '')), '') is not null then fresh := fresh || jsonb_build_array(jsonb_build_object('kind', 'email', 'label', '', 'value', lower(btrim(p_email)))); end if;
  -- Mantém a ordem e o "oculto" que o Site já tem; o que é novo entra no fim; o que saiu do perfil sai.
  for e in select * from jsonb_array_elements(coalesce(p_existing, '[]'::jsonb)) loop
    for f in select * from jsonb_array_elements(fresh) loop
      if f ->> 'kind' = e ->> 'kind' and f ->> 'value' = e ->> 'value' then
        res := res || jsonb_build_array(f || jsonb_build_object('hidden', coalesce((e ->> 'hidden')::boolean, false)));
        exit;
      end if;
    end loop;
  end loop;
  for f in select * from jsonb_array_elements(fresh) loop
    if not exists (select 1 from jsonb_array_elements(res) r where r ->> 'kind' = f ->> 'kind' and r ->> 'value' = f ->> 'value') then res := res || jsonb_build_array(f); end if;
  end loop;
  return res;
end $$;

create or replace function public.trg_sync_bloco_contacts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  if not exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id where mar.member_id = new.id and ar.key = 'titular') then return new; end if;
  update public.shop_settings set
    contact_whatsapp = case when d = '' then contact_whatsapp when d like '55%' and length(d) >= 12 then d else '55' || d end,
    contact_email = coalesce(nullif(lower(btrim(coalesce(new.email, ''))), ''), contact_email)
   where organization_id = new.organization_id;
  update public.site_settings set links = public.bloco_links(new.phone, new.email, new.social_handle, links) where organization_id = new.organization_id;
  return new;
end $$;
