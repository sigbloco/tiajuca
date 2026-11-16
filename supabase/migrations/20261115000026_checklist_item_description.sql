-- Cada tarefa de checklist pode ter uma linha de descrição (no modelo e, copiada, no evento).
alter table public.checklist_template_items add column if not exists description text;
alter table public.activity_checklist_items add column if not exists description text;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.apply_checklist_template(uuid,uuid)'::regprocedure);
  n := replace(d, '(organization_id, activity_id, source_template_item_id, title, sort_order)', '(organization_id, activity_id, source_template_item_id, title, description, sort_order)');
  if n = d then raise exception 'patch apply: cols'; end if; d := n;
  n := replace(d, 'p_activity, i.id, i.title, v_max', 'p_activity, i.id, i.title, i.description, v_max');
  if n = d then raise exception 'patch apply: vals'; end if;
  execute n;
end $$;
