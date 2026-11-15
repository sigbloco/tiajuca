-- Seção modelo padrão para o fim dos formulários de inscrição: explica o que acontece depois do envio. O texto pode ser editado em Formulários → Configurações → Seções modelo.
do $$
declare o record; v_form uuid; v_sec uuid;
begin
  for o in select id from public.organizations loop
    continue when exists (select 1 from public.form_section_templates where organization_id = o.id and name = 'Próximos passos');
    insert into public.forms (organization_id, title, slug, is_template)
    values (o.id, 'Próximos passos', 'modelo-' || substr(md5(random()::text), 1, 10), true) returning id into v_form;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
    values (o.id, v_form, 'sec_' || substr(md5(random()::text), 1, 8), 'Próximos passos', null, 'info', false, 1, '{"section":true}'::jsonb) returning id into v_sec;
    insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
    values (o.id, v_form, 'como_funciona', 'Depois de enviar',
            E'- Sua inscrição será analisada pela Direção.\n- Se for aprovada, o seu cadastro é criado e entraremos em contato com os próximos passos.\n- Você não precisa enviar de novo: acompanhe pelo contato informado.',
            'info', false, 2, '{}'::jsonb);
    insert into public.form_section_templates (organization_id, name, form_id, section_id) values (o.id, 'Próximos passos', v_form, v_sec);
  end loop;
end $$;
