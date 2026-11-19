-- Nome do checklist por evento: começa com o nome do modelo aplicado e pode ser mudado em cada evento.
alter table public.activities add column if not exists checklist_name text;

create or replace function public.apply_checklist_template(p_activity uuid, p_template uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare a public.activities; n int; v_max int; v_name text;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  select name into v_name from public.checklist_templates where id = p_template and organization_id = a.organization_id and is_active;
  if v_name is null then
    raise exception 'Modelo inválido.' using errcode = 'P0002';
  end if;
  select coalesce(max(sort_order), 0) into v_max from public.activity_checklist_items where activity_id = p_activity;
  insert into public.activity_checklist_items (organization_id, activity_id, source_template_item_id, title, description, sort_order)
  select a.organization_id, p_activity, i.id, i.title, i.description, v_max + row_number() over (order by i.sort_order, i.title)
  from public.checklist_template_items i
  where i.template_id = p_template and i.is_active
    and not exists (select 1 from public.activity_checklist_items x where x.activity_id = p_activity and x.source_template_item_id = i.id and x.is_active);
  get diagnostics n = row_count;
  -- O nome do modelo vira o nome do checklist deste evento (só se ainda não tiver nome).
  update public.activities set checklist_name = v_name where id = p_activity and checklist_name is null;
  return n;
end $function$;

create or replace function public.set_checklist_name(p_activity uuid, p_name text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare a public.activities;
begin
  select * into a from public.activities where id = p_activity;
  if a.id is null or not public.has_permission(a.organization_id, 'events.manage') then
    raise exception 'Sem permissão para alterar o checklist.' using errcode = '42501';
  end if;
  update public.activities set checklist_name = nullif(btrim(coalesce(p_name, '')), '') where id = p_activity;
end $function$;

revoke all on function public.set_checklist_name(uuid, text) from public, anon;
grant execute on function public.set_checklist_name(uuid, text) to authenticated;
