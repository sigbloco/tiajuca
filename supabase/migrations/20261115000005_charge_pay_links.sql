-- Mensalidades: link de pagamento da InfinitePay por cobrança e baixa automática quando o pagamento é aprovado.
-- A InfiniteTag é a mesma das configurações da loja (shop_settings.infinitepay_handle).
alter table public.monthly_charges
  add column if not exists pay_code text unique check (pay_code is null or pay_code ~ '^[A-Z0-9]{10}$'),
  add column if not exists pay_link_url text,
  add column if not exists pay_ref jsonb not null default '{}'::jsonb;

-- Quem cuida do financeiro pede os dados para gerar o link (cria o código de pagamento da cobrança se ainda não existe).
create or replace function public.charge_pay_info(p_charge uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.monthly_charges; code text; s record; m record; o record;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  if c.status <> 'pending' then raise exception 'Só cobranças pendentes têm link de pagamento.' using errcode = 'P0001'; end if;
  if c.final_amount <= 0 then raise exception 'Cobrança sem valor.' using errcode = 'P0001'; end if;
  code := c.pay_code;
  if code is null then
    loop
      code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.monthly_charges where pay_code = code);
    end loop;
    update public.monthly_charges set pay_code = code where id = c.id;
  end if;
  select infinitepay_handle, public_site_url into s from public.shop_settings where organization_id = c.organization_id;
  select coalesce(display_name, full_name) as display_name into m from public.members where id = c.member_id;
  select slug into o from public.organizations where id = c.organization_id;
  return jsonb_build_object('code', code, 'amount_cents', round(c.final_amount * 100)::int, 'competence', c.competence, 'member_name', m.display_name,
    'org_slug', o.slug, 'handle', s.infinitepay_handle, 'public_site_url', s.public_site_url, 'pay_link_url', c.pay_link_url);
end $$;
revoke all on function public.charge_pay_info(uuid) from public, anon;
grant execute on function public.charge_pay_info(uuid) to authenticated;

create or replace function public.charge_set_pay_link(p_charge uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where id = p_charge;
  if c.id is null then raise exception 'Cobrança não encontrada.' using errcode = 'P0002'; end if;
  perform public.require_billing(c.organization_id);
  update public.monthly_charges set pay_link_url = p_url where id = p_charge;
end $$;
revoke all on function public.charge_set_pay_link(uuid, text) from public, anon;
grant execute on function public.charge_set_pay_link(uuid, text) to authenticated;

-- Para a função que recebe o aviso: só o necessário para validar (sem dados pessoais).
create or replace function public.charge_for_payment(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'status', c.status, 'amount_cents', round(c.final_amount * 100)::int,
                            'handle', (select s.infinitepay_handle from public.shop_settings s where s.organization_id = c.organization_id))
    from public.monthly_charges c where c.pay_code = upper(trim(p_code))
$$;
revoke all on function public.charge_for_payment(text) from public, anon, authenticated;
grant execute on function public.charge_for_payment(text) to service_role;

-- Baixa automática (idempotente). Se a cobrança foi cancelada/isentada, só guarda o registro do pagamento para conferência.
create or replace function public.charge_mark_paid_by_link(p_code text, p_ref jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.monthly_charges;
begin
  select * into c from public.monthly_charges where pay_code = upper(trim(p_code)) for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if c.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if c.status <> 'pending' then
    update public.monthly_charges set pay_ref = pay_ref || coalesce(p_ref, '{}'::jsonb) || jsonb_build_object('paid_while', c.status) where id = c.id;
    return jsonb_build_object('ok', false, 'reason', c.status);
  end if;
  update public.monthly_charges
     set status = 'paid', paid_on = (now() at time zone coalesce((select timezone from public.organizations where id = c.organization_id), 'America/Sao_Paulo'))::date,
         payment_method = 'InfinitePay', pay_ref = pay_ref || coalesce(p_ref, '{}'::jsonb)
   where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.charge_mark_paid_by_link(text, jsonb) from public, anon, authenticated;
grant execute on function public.charge_mark_paid_by_link(text, jsonb) to service_role;
