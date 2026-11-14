-- Cabeçalho do formulário: posição, zoom e altura da foto dentro da moldura.
alter table public.forms
  add column if not exists header_pos_x numeric not null default 50 check (header_pos_x between 0 and 100),
  add column if not exists header_pos_y numeric not null default 50 check (header_pos_y between 0 and 100),
  add column if not exists header_zoom numeric not null default 1 check (header_zoom between 1 and 4),
  add column if not exists header_height int not null default 104 check (header_height between 64 and 320);

create or replace function public.get_public_form(p_org_slug text, p_form_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.organizations; f public.forms; v public.form_versions; st text;
begin
  select * into o from public.organizations where slug = p_org_slug and is_active;
  if o.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into f from public.forms where organization_id = o.id and slug = p_form_slug and status in ('published', 'closed');
  if f.id is null or f.published_version_id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into v from public.form_versions where id = f.published_version_id;
  st := public._form_state(f);
  return jsonb_build_object(
    'state', st,
    'organization', jsonb_build_object('name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'form', jsonb_build_object(
      'title', v.snapshot -> 'title', 'description', v.snapshot -> 'description', 'privacy_text', v.snapshot -> 'privacy_text',
      'requires_consent', v.snapshot -> 'requires_consent', 'closes_at', f.closes_at,
      'header', jsonb_build_object('image_url', f.header_image_url, 'x', f.header_pos_x, 'y', f.header_pos_y, 'zoom', f.header_zoom, 'height', f.header_height),
      'fields', case when st = 'open' then (select coalesce(jsonb_agg(fld - 'mapping'), '[]'::jsonb) from jsonb_array_elements(v.snapshot -> 'fields') fld) else '[]'::jsonb end));
end $$;
revoke all on function public.get_public_form(text, text) from public;
grant execute on function public.get_public_form(text, text) to anon, authenticated;
