-- Formulários em seções. Uma seção é um campo "info" com validation {"section": true} (título = nome da seção, descrição = texto).
-- O bloco de consentimento é um campo "info" com validation {"consent": true}. Campos "info" já são ignorados nas respostas e na validação.

-- Organiza o formulário de inscrição padrão em 4 seções: Introdução · Sobre você · Participação · Tá acabando.
create or replace function public._apply_form_sections(p_form uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null then return; end if;
  -- Perguntas que ficam de fora desta versão (desativadas, não apagadas) e condições que dependiam delas.
  update public.form_fields set is_active = false where form_id = p_form and field_key in ('email', 'is_pcd', 'pcd_description', 'plays');
  update public.form_fields set condition = null where form_id = p_form and field_key in ('instrument', 'level');
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
  select f.organization_id, p_form, x.k, x.l, x.d, 'info', false, 0, x.v
  from (values
    ('sec_intro', 'Introdução', null::text, '{"section":true}'::jsonb),
    ('intro_texto', 'Seja bem-vindo(a)!', coalesce(f.description, 'Preencha seus dados para se inscrever. A Direção entrará em contato.'), '{}'::jsonb),
    ('sec_sobre', 'Sobre você', null, '{"section":true}'::jsonb),
    ('sec_participacao', 'Participação', null, '{"section":true}'::jsonb),
    ('consent', 'Estou ciente e concordo', null, '{"consent":true}'::jsonb),
    ('sec_fim', 'Tá acabando', null, '{"section":true}'::jsonb)
  ) as x(k, l, d, v)
  on conflict (form_id, field_key) do nothing;
  update public.forms set description = null where id = p_form;
  update public.form_fields x set sort_order = o.n
  from unnest(array['sec_intro', 'intro_texto',
    'sec_sobre', 'full_name', 'display_name', 'phone', 'social', 'birth_date', 'gender', 'is_trans', 'race',
    'sec_participacao', 'instrument', 'level', 'played_other', 'other_blocks', 'consent',
    'sec_fim', 'affective',
    'email', 'is_pcd', 'pcd_description', 'plays']) with ordinality as o(k, n)
  where x.form_id = p_form and x.field_key = o.k;
end $$;
revoke all on function public._apply_form_sections(uuid) from public, anon, authenticated;

-- Formulários de inscrição já criados.
do $$
declare r record;
begin
  for r in select id from public.forms f where f.slug = 'inscricao' and exists (select 1 from public.form_fields x where x.form_id = f.id and x.field_key = 'full_name')
                 and not exists (select 1 from public.form_fields x where x.form_id = f.id and x.field_key = 'sec_intro') loop
    perform public._apply_form_sections(r.id);
  end loop;
end $$;

-- Formulário padrão de novas organizações já nasce em seções.
create or replace function public.create_default_registration_form(p_org uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_form uuid; i int := 0;
  y jsonb := '[{"value":"yes","label":"Sim"},{"value":"no","label":"Não"}]';
begin
  select id into v_form from public.forms where organization_id = p_org and slug = 'inscricao';
  if v_form is not null then return v_form; end if;
  insert into public.forms (organization_id, title, description, slug, privacy_text)
  values (p_org, 'Inscrição de novos integrantes', 'Preencha seus dados para se inscrever. A Direção entrará em contato.', 'inscricao',
    'Usaremos seus dados apenas para analisar sua inscrição e, se aprovada, para o cadastro no bloco. Informações como gênero, cor/raça e deficiência são sensíveis, ficam restritas à Direção e não aparecem em listas ou relatórios comuns. Você pode pedir a correção ou exclusão dos seus dados a qualquer momento. (Texto-base: revise com assessoria jurídica antes de publicar.)')
  returning id into v_form;
  insert into public.form_fields (organization_id, form_id, field_key, label, field_type, required, sort_order, options, condition, member_mapping)
  select p_org, v_form, x.k, x.l, x.t, x.r, row_number() over (), coalesce(x.o, '[]'::jsonb), x.c, x.m
  from (values
    ('full_name', 'Nome completo', 'short_text', true, null::jsonb, null::jsonb, 'member.full_name'),
    ('display_name', 'Como prefere ser chamado(a)?', 'short_text', false, null, null, 'member.display_name'),
    ('email', 'E-mail', 'email', true, null, null, 'member.email'),
    ('phone', 'Celular (WhatsApp)', 'phone', true, null, null, 'member.phone'),
    ('social', 'Rede social (Instagram)', 'short_text', false, null, null, 'member.social_handle'),
    ('birth_date', 'Data de nascimento', 'date', true, null, null, 'member.birth_date'),
    ('gender', 'Gênero', 'single_select', false, '[{"value":"feminino","label":"Feminino"},{"value":"masculino","label":"Masculino"},{"value":"nao_binario","label":"Não-binário"},{"value":"outro","label":"Outro"},{"value":"prefiro_nao_informar","label":"Prefiro não informar"}]'::jsonb, null, 'sensitive.gender'),
    ('is_trans', 'Você se considera trans?', 'yes_no', false, y, null, 'sensitive.is_trans'),
    ('race', 'Como você identifica sua cor/raça?', 'single_select', false, '[{"value":"branca","label":"Branca"},{"value":"preta","label":"Preta"},{"value":"parda","label":"Parda"},{"value":"amarela","label":"Amarela"},{"value":"indigena","label":"Indígena"},{"value":"prefiro_nao_informar","label":"Prefiro não informar"}]'::jsonb, null, 'sensitive.race_color'),
    ('is_pcd', 'Você é PCD (pessoa com deficiência)?', 'yes_no', false, y, null, 'sensitive.is_pcd'),
    ('pcd_description', 'Qual?', 'short_text', false, null, '{"field":"is_pcd","op":"eq","value":"yes"}'::jsonb, 'sensitive.pcd_description'),
    ('plays', 'Toca ou já tocou algum instrumento?', 'yes_no', false, y, null, null),
    ('instrument', 'Instrumento', 'single_select', false, null, '{"field":"plays","op":"eq","value":"yes"}'::jsonb, 'link.instrument'),
    ('level', 'Nível', 'single_select', false, null, '{"field":"plays","op":"eq","value":"yes"}'::jsonb, 'link.skill_level'),
    ('played_other', 'Toca ou já tocou com outros blocos?', 'yes_no', false, y, null, 'member.played_other_blocks'),
    ('other_blocks', 'Quais blocos?', 'short_text', false, null, '{"field":"played_other","op":"eq","value":"yes"}'::jsonb, 'member.other_blocks'),
    ('affective', 'Qual é a sua relação com a Grande Tijuca?', 'long_text', false, null, null, 'member.affective_relation')
  ) as x(k, l, t, r, o, c, m);
  perform public._apply_form_sections(v_form);
  return v_form;
end $$;
revoke all on function public.create_default_registration_form(uuid) from public, anon, authenticated;
