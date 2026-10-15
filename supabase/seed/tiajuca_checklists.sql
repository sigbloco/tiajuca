-- Modelo de checklist INICIAL do Cordão da Tia Juca: "Apresentação / Cortejo". A Direção edita/cria outros pelo app. Idempotente.
do $$
declare v_org uuid; v_tpl uuid; t text; i int := 0;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;
  insert into public.checklist_templates (organization_id, name) values (v_org, 'Apresentação / Cortejo')
    on conflict (organization_id, name) do nothing;
  select id into v_tpl from public.checklist_templates where organization_id = v_org and name = 'Apresentação / Cortejo';
  if not exists (select 1 from public.checklist_template_items where template_id = v_tpl) then
    foreach t in array array[
      'Comunicar a Riotur do nosso cortejo', 'Divulgação interna das apresentações', 'Contratação de fotógrafo',
      'Contratação de videomaker', 'Alimentação do cortejo', 'Hidratação', 'Tenda no cortejo',
      'Banheiro químico para o cortejo', 'Estandarte', 'Postagem no Instagram', 'Onde guardar os cases',
      'Recrutar apoios', 'Bike elétrica', 'Elias'] loop
      i := i + 1;
      insert into public.checklist_template_items (organization_id, template_id, title, sort_order) values (v_org, v_tpl, t, i);
    end loop;
  end if;
end $$;
