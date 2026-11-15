-- O perfil do titular passa a ser o perfil do bloco: e-mail, WhatsApp e redes sociais dele alimentam a Loja (contatos) e o Site (links).
create or replace function public.bloco_links(p_phone text, p_email text, p_social text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare res jsonb := '[]'::jsonb; line text; k text; d text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if d <> '' then res := res || jsonb_build_array(jsonb_build_object('kind', 'whatsapp', 'label', '', 'value', d)); end if;
  for line in select btrim(x) from regexp_split_to_table(coalesce(p_social, ''), chr(10)) x loop
    continue when line = '';
    k := case when line ~* 'instagram[.]com' then 'instagram' when line ~* 'youtu[.]?be' then 'youtube' when line ~* 'facebook[.]com' then 'facebook'
              when line ~* 'tiktok[.]com' then 'tiktok' when line ~* 'spotify[.]com' then 'spotify' else 'site' end;
    res := res || jsonb_build_array(jsonb_build_object('kind', k, 'label', '', 'value', line));
  end loop;
  if nullif(btrim(coalesce(p_email, '')), '') is not null then res := res || jsonb_build_array(jsonb_build_object('kind', 'email', 'label', '', 'value', lower(btrim(p_email)))); end if;
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
  update public.site_settings set links = public.bloco_links(new.phone, new.email, new.social_handle) where organization_id = new.organization_id;
  return new;
end $$;
drop trigger if exists trg_sync_bloco_contacts on public.members;
create trigger trg_sync_bloco_contacts after update of email, phone, social_handle on public.members for each row execute function public.trg_sync_bloco_contacts();

-- Valores que já estavam na Loja e no Site passam para o perfil do titular.
update public.members m set phone = '21990698483',
  social_handle = 'https://instagram.com/cordaodatiajuca' || chr(10) || 'https://www.youtube.com/@cordaodatiajuca'
 where exists (select 1 from public.member_access_roles mar join public.access_roles ar on ar.id = mar.access_role_id where mar.member_id = m.id and ar.key = 'titular');
