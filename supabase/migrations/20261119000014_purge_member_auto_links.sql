-- Excluir de vez um integrante: limpa antes as ligações automáticas (papel de acesso e vaga na lista de espera de quem nunca entrou).
-- O resto (presença, cobrança, pedido, formulário...) continua protegido pelas chaves estrangeiras: se houver, tudo volta atrás e o item fica na lixeira.
create or replace function public.purge_trashed(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare perm text; v_org uuid; v_trashed boolean;
begin
  perm := case p_table
    when 'checklist_templates' then 'events.manage' when 'checklist_template_items' then 'events.manage'
    when 'drive_folders' then 'drive.manage'
    when 'members' then 'members.manage'
    when 'repertoires' then 'repertoire.manage' when 'songs' then 'repertoire.manage'
    when 'shop_pickup_points' then 'shop.manage' when 'shop_products' then 'shop.manage' when 'shop_stock_items' then 'shop.manage'
    when 'form_lists' then 'forms.manage' when 'form_list_items' then 'forms.manage'
    when 'social_networks' then 'forms.manage' when 'skill_levels' then 'forms.manage' when 'gender_options' then 'forms.manage' when 'race_options' then 'forms.manage'
    else null end;
  if perm is null then raise exception 'Este tipo de item não pode ser excluído de vez.' using errcode = 'P0001'; end if;
  if p_table = 'members' then
    execute 'select organization_id, archived_at is not null from public.members where id = $1' into v_org, v_trashed using p_id;
  else
    execute format('select organization_id, not is_active from public.%I where id = $1', p_table) into v_org, v_trashed using p_id;
  end if;
  if v_org is null then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  if not public.has_permission(v_org, perm) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if not coalesce(v_trashed, false) then raise exception 'Só dá para excluir de vez o que está na lixeira.' using errcode = 'P0001'; end if;
  if p_table = 'members' then
    delete from public.member_access_roles where member_id = p_id;
    delete from public.member_cycles where member_id = p_id and joined_on is null and left_on is null;
  end if;
  execute format('delete from public.%I where id = $1', p_table) using p_id;
end $$;
revoke all on function public.purge_trashed(text, uuid) from public, anon;
grant execute on function public.purge_trashed(text, uuid) to authenticated;
