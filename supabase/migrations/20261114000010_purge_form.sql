-- Formulários: apagar = status "archived" (lixeira). Excluir de vez só se não houver respostas (elas são dados de pessoas e ficam guardadas).
create or replace function public.purge_form(p_form uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null or not public.has_permission(f.organization_id, 'forms.manage') then
    raise exception 'Sem permissão para apagar este formulário.' using errcode = '42501';
  end if;
  if f.status <> 'archived' then
    raise exception 'Mande o formulário para a lixeira antes de excluir de vez.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.form_submissions s where s.form_id = f.id) then
    raise exception 'Este formulário tem respostas e não pode ser excluído de vez. Ele fica na lixeira.' using errcode = 'P0001';
  end if;
  update public.forms set published_version_id = null where id = f.id;
  delete from public.form_upload_tokens where form_id = f.id;
  delete from public.form_fields where form_id = f.id;
  delete from public.form_versions where form_id = f.id;
  delete from public.forms where id = f.id;
end $$;
revoke all on function public.purge_form(uuid) from public, anon;
grant execute on function public.purge_form(uuid) to authenticated;
