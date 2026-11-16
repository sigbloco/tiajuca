-- Pergunta universal: "Como você se identifica?" com Homem / Mulher / Pessoa não binária / Outro (sem "prefiro não informar": a resposta é opcional e pode ser desmarcada).
update public.gender_options set name = 'Mulher', sort_order = 1 where name = 'Feminino';
update public.gender_options set name = 'Homem', sort_order = 2 where name = 'Masculino';
update public.gender_options set name = 'Pessoa não binária', sort_order = 3 where name = 'Não-binário';
delete from public.gender_options where name = 'Prefiro não informar';

update public.member_sensitive_data set gender = case lower(gender)
  when 'feminino' then 'Mulher' when 'masculino' then 'Homem' when 'nao_binario' then 'Pessoa não binária' when 'não-binário' then 'Pessoa não binária'
  when 'outro' then 'Outro' else gender end
 where lower(gender) in ('feminino', 'masculino', 'nao_binario', 'não-binário', 'outro');
update public.member_sensitive_data set gender = null where lower(gender) = 'prefiro_nao_informar';

update public.form_fields set label = 'Como você se identifica?',
  options = '[{"value":"Homem","label":"Homem"},{"value":"Mulher","label":"Mulher"},{"value":"Pessoa não binária","label":"Pessoa não binária"},{"value":"Outro","label":"Outro"}]'::jsonb
 where member_mapping = 'sensitive.gender';

update public.form_versions v set snapshot = jsonb_set(v.snapshot, '{fields}', (
  select coalesce(jsonb_agg(case when fld ->> 'mapping' = 'sensitive.gender'
    then fld || jsonb_build_object('label', 'Como você se identifica?', 'options', '[{"value":"Homem","label":"Homem"},{"value":"Mulher","label":"Mulher"},{"value":"Pessoa não binária","label":"Pessoa não binária"},{"value":"Outro","label":"Outro"}]'::jsonb)
    else fld end order by ord), '[]'::jsonb)
  from jsonb_array_elements(v.snapshot -> 'fields') with ordinality as t(fld, ord)))
 where v.snapshot::text like '%sensitive.gender%';

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.create_default_registration_form(uuid)'::regprocedure);
  n := replace(d, '''Gênero'', ''single_select'', false, ''[{"value":"feminino","label":"Feminino"},{"value":"masculino","label":"Masculino"},{"value":"nao_binario","label":"Não-binário"},{"value":"outro","label":"Outro"},{"value":"prefiro_nao_informar","label":"Prefiro não informar"}]''',
    '''Como você se identifica?'', ''single_select'', false, ''[{"value":"Homem","label":"Homem"},{"value":"Mulher","label":"Mulher"},{"value":"Pessoa não binária","label":"Pessoa não binária"},{"value":"Outro","label":"Outro"}]''');
  if n = d then raise exception 'patch create_default_registration_form'; end if;
  execute n;
end $$;
