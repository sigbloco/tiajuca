-- Loja · tudo editável no painel:
--  (1) Pontos de retirada com AGENDA: dias fixos da semana (ex.: ensaios às segundas) e/ou datas únicas (eventos), com horário;
--  (2) Título da loja e cores próprias (sobrepõem as do bloco só na loja); texto de abertura da vitrine;
--  (3) Prazo da reserva (horas) e tempo de guarda dos dados (aviso de privacidade).
-- O texto da agenda ("Segundas, das 19h às 22h · Sáb 07/11/2026 (Feijoada), das 10h às 14h") é montado AQUI, no banco, e entregue
-- no campo `opening_hours` de todos os payloads (vitrine, pedido, consulta e e-mails). Datas únicas já passadas deixam de aparecer; um ponto que só tem
-- datas passadas some do checkout.

alter table public.shop_pickup_points add column schedule jsonb not null default '[]'::jsonb;

-- Formato de cada item de `schedule`:
--   {"type":"weekly","weekday":1,"start":"19:00","end":"22:00","label":"Ensaio"}   (weekday: 0=domingo … 6=sábado)
--   {"type":"date","date":"2026-11-07","start":"10:00","end":"14:00","label":"Feijoada"}
-- start/end/label são opcionais.
create or replace function public.shop_schedule_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare s jsonb;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20 then return false; end if;
  for s in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    if s ->> 'type' = 'weekly' then
      if (s ->> 'weekday') !~ '^[0-6]$' then return false; end if;
    elsif s ->> 'type' = 'date' then
      if (s ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      perform (s ->> 'date')::date;
    else
      return false;
    end if;
    if s ? 'start' and (s ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if s ? 'end' and (s ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if s ? 'start' and s ? 'end' and (s ->> 'start') >= (s ->> 'end') then return false; end if;
    if s ? 'label' and length(s ->> 'label') > 60 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
alter table public.shop_pickup_points add constraint shop_pickup_schedule_ok check (public.shop_schedule_valid(schedule));

create or replace function public.shop_time_text(t text) returns text
language sql immutable set search_path = '' as $$
  select case when t is null then null
              when substr(t, 4, 2) = '00' then (substr(t, 1, 2))::int || 'h'
              else (substr(t, 1, 2))::int || 'h' || substr(t, 4, 2) end
$$;

create or replace function public.shop_slot_hours(s jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when s ? 'start' and s ? 'end' then 'das ' || public.shop_time_text(s ->> 'start') || ' às ' || public.shop_time_text(s ->> 'end')
    when s ? 'start' then 'a partir das ' || public.shop_time_text(s ->> 'start')
    when s ? 'end' then 'até às ' || public.shop_time_text(s ->> 'end')
    else null end
$$;

-- Há pelo menos um dia possível de retirada? Sem agenda cadastrada = sempre disponível (vale o texto livre).
create or replace function public.shop_schedule_has_future(p jsonb) returns boolean
language sql stable set search_path = '' as $$
  select p is null or jsonb_array_length(p) = 0 or exists (
    select 1 from jsonb_array_elements(p) s
     where s ->> 'type' = 'weekly'
        or (s ->> 'type' = 'date' and (s ->> 'date')::date >= (now() at time zone 'America/Sao_Paulo')::date))
$$;

create or replace function public.shop_pickup_when(p_schedule jsonb, p_note text) returns text
language sql stable set search_path = '' as $$
  select nullif(concat_ws(' · ',
    (select string_agg(
        (array['Domingos', 'Segundas', 'Terças', 'Quartas', 'Quintas', 'Sextas', 'Sábados'])[(s ->> 'weekday')::int + 1]
        || coalesce(' (' || nullif(s ->> 'label', '') || ')', '') || coalesce(', ' || public.shop_slot_hours(s), ''),
        ' · ' order by ((s ->> 'weekday')::int + 6) % 7, s ->> 'start')
       from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) s where s ->> 'type' = 'weekly'),
    (select string_agg(
        (array['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'])[extract(dow from (s ->> 'date')::date)::int + 1] || ' ' || to_char((s ->> 'date')::date, 'DD/MM/YYYY')
        || coalesce(' (' || nullif(s ->> 'label', '') || ')', '') || coalesce(', ' || public.shop_slot_hours(s), ''),
        ' · ' order by s ->> 'date', s ->> 'start')
       from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) s
      where s ->> 'type' = 'date' and (s ->> 'date')::date >= (now() at time zone 'America/Sao_Paulo')::date),
    nullif(trim(coalesce(p_note, '')), '')), '')
$$;

-- ───────────── configurações da loja ─────────────
alter table public.shop_settings
  add column store_title text check (store_title is null or length(trim(store_title)) between 1 and 60),
  add column theme_primary text check (theme_primary is null or theme_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add column theme_secondary text check (theme_secondary is null or theme_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  add column intro_text text check (intro_text is null or length(intro_text) <= 400),
  add column reservation_hours int not null default 48 check (reservation_hours between 1 and 720),
  add column privacy_retention_years int not null default 5 check (privacy_retention_years between 1 and 20);

create or replace function public.shop_get_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('payment_methods', to_jsonb(payment_methods), 'infinitepay_handle', infinitepay_handle, 'public_site_url', public_site_url,
                               'pix_key', pix_key, 'pix_beneficiary', pix_beneficiary, 'reservation_hours', reservation_hours)
       from public.shop_settings where organization_id = p_org),
    jsonb_build_object('payment_methods', jsonb_build_array(), 'infinitepay_handle', null, 'public_site_url', null, 'pix_key', null, 'pix_beneficiary', null, 'reservation_hours', 48))
$$;

create or replace function public.shop_get_public_store(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'logo_path', o.logo_path, 'theme', o.theme),
    'title', coalesce((select s.store_title from public.shop_settings s where s.organization_id = o.id), 'Loja ' || o.short_name),
    'theme_override', (select case when s.theme_primary is not null or s.theme_secondary is not null
                                   then jsonb_build_object('primary', s.theme_primary, 'secondary', s.theme_secondary) end
                         from public.shop_settings s where s.organization_id = o.id),
    'intro_text', (select s.intro_text from public.shop_settings s where s.organization_id = o.id),
    'reservation_hours', coalesce((select s.reservation_hours from public.shop_settings s where s.organization_id = o.id), 48),
    'privacy_retention_years', coalesce((select s.privacy_retention_years from public.shop_settings s where s.organization_id = o.id), 5),
    'payment_methods', coalesce((
      select to_jsonb(array_remove(array[
               case when 'pix' = any (s.payment_methods) and s.pix_key is not null and s.pix_beneficiary is not null then 'pix' end,
               case when 'infinitepay' = any (s.payment_methods) and s.infinitepay_handle is not null and s.public_site_url is not null then 'infinitepay' end], null))
        from public.shop_settings s where s.organization_id = o.id), '[]'::jsonb),
    'pix', (select case when s.pix_key is not null and s.pix_beneficiary is not null then jsonb_build_object('key', s.pix_key, 'beneficiary', s.pix_beneficiary) end
              from public.shop_settings s where s.organization_id = o.id),
    'contact', coalesce((select jsonb_build_object('whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'directors', s.directors)
                           from public.shop_settings s where s.organization_id = o.id),
                        jsonb_build_object('whatsapp', null, 'email', null, 'directors', '[]'::jsonb)),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description, 'kind', p.kind,
        'price_cents', p.price_cents, 'member_discount_pct', p.member_discount_pct, 'lead_time_days', p.lead_time_days,
        'images', coalesce((select jsonb_agg(i.storage_path order by i.sort_order, i.created_at)
                              from public.shop_product_images i where i.product_id = p.id), '[]'::jsonb),
        'variants', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', v.id, 'label', v.label,
                        'available', case when p.kind = 'stock' then greatest(coalesce(v.stock, 0) - v.reserved, 0) end)
                      order by v.sort_order, v.label)
                    from public.shop_product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb)
      ) order by p.sort_order, p.name)
      from public.shop_products p where p.organization_id = o.id and p.is_active), '[]'::jsonb),
    'pickup_points', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'address', pp.address,
                                          'opening_hours', coalesce(public.shop_pickup_when(pp.schedule, pp.opening_hours), ''))
                       order by pp.sort_order, pp.name)
      from public.shop_pickup_points pp where pp.organization_id = o.id and pp.is_active and public.shop_schedule_has_future(pp.schedule)), '[]'::jsonb)
  )
  from public.organizations o where o.slug = p_slug and o.is_active
$$;

-- Os payloads de pedido, consulta e e-mail passam a usar o texto da agenda no lugar do horário livre.
do $$
declare def text; newdef text;
begin
  def := pg_get_functiondef('public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer)'::regprocedure);
  newdef := replace(def, 'from public.shop_pickup_points where id = p_pickup and organization_id = p_org and is_active;',
                         'from public.shop_pickup_points where id = p_pickup and organization_id = p_org and is_active and public.shop_schedule_has_future(schedule);');
  if newdef = def then raise exception 'shop_create_order: trecho do ponto de retirada não encontrado'; end if;
  def := newdef;
  newdef := replace(def, '''opening_hours'', v_pp.opening_hours', '''opening_hours'', coalesce(public.shop_pickup_when(v_pp.schedule, v_pp.opening_hours), '''')');
  if newdef = def then raise exception 'shop_create_order: retorno do ponto de retirada não encontrado'; end if;
  execute newdef;

  def := pg_get_functiondef('public.shop_mail_claim(integer)'::regprocedure);
  newdef := replace(def, '''opening_hours'', pp.opening_hours', '''opening_hours'', coalesce(public.shop_pickup_when(pp.schedule, pp.opening_hours), '''')');
  if newdef = def then raise exception 'shop_mail_claim: trecho não encontrado'; end if;
  execute newdef;

  def := pg_get_functiondef('public.shop_order_lookup(text,text)'::regprocedure);
  newdef := replace(def, 'pp.opening_hours as pp_hours', 'coalesce(public.shop_pickup_when(pp.schedule, pp.opening_hours), '''') as pp_hours');
  if newdef = def then raise exception 'shop_order_lookup: trecho não encontrado'; end if;
  execute newdef;
end $$;
