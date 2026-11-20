-- Trazida do banco (DRIFT-01): aplicada pelo editor em 15/11/2026 sem arquivo no repositório.
-- É a única migration que cria public.form_vars (as outras só a remendam).
create or replace function public.form_vars(p_form uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'key', c.system_key, 'price', p.amount) order by c.sort_order, c.name), '[]'::jsonb)
                     from public.fee_categories c join lateral (select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date) order by pr.valid_from desc limit 1) p on true
                    where c.organization_id = f.organization_id and c.is_active),
    'valor_field', (select fld.field_key from public.form_fields fld where fld.form_id = f.id and fld.is_active and fld.member_mapping = 'link.function' limit 1),
    'prices', (select coalesce(jsonb_object_agg(c.function_id::text, p.amount), '{}'::jsonb)
                 from public.fee_categories c join lateral (select pr.amount from public.fee_category_prices pr where pr.fee_category_id = c.id and pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date) order by pr.valid_from desc limit 1) p on true
                where c.organization_id = f.organization_id and c.function_id is not null),
    'whatsapp', s.contact_whatsapp, 'email', s.contact_email, 'chave_pix', s.pix_key,
    'vencimento', (select os.value #>> '{}' from public.org_settings os where os.organization_id = f.organization_id and os.key = 'billing_due_day'))
    from public.shop_settings s where s.organization_id = f.organization_id);
end $$;
revoke all on function public.form_vars(uuid) from public, anon;
grant execute on function public.form_vars(uuid) to authenticated;
