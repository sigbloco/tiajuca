-- O consentimento deixa de ser um campo e passa a ser uma opção da seção (validation.consent na seção).
do $$
declare r record; hdr uuid;
begin
  for r in select id, form_id, sort_order from public.form_fields where field_type = 'info' and (validation ->> 'consent') = 'true' loop
    select h.id into hdr from public.form_fields h
     where h.form_id = r.form_id and h.field_type = 'info' and (h.validation ->> 'section') = 'true' and h.sort_order < r.sort_order
     order by h.sort_order desc limit 1;
    if hdr is not null then update public.form_fields set validation = validation || '{"consent":true}'::jsonb where id = hdr; end if;
    delete from public.form_fields where id = r.id;
  end loop;
  update public.form_fields x set sort_order = n.rn
    from (select id, row_number() over (partition by form_id order by sort_order, created_at) as rn from public.form_fields) n
   where n.id = x.id and x.sort_order <> n.rn;
end $$;

-- Formulário padrão: a seção "Participação" já termina com o consentimento.
create or replace function public._apply_form_sections(p_form uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form;
  if f.id is null then return; end if;
  update public.form_fields set is_active = false where form_id = p_form and field_key in ('email', 'is_pcd', 'pcd_description', 'plays');
  update public.form_fields set condition = null where form_id = p_form and field_key in ('instrument', 'level');
  insert into public.form_fields (organization_id, form_id, field_key, label, description, field_type, required, sort_order, validation)
  select f.organization_id, p_form, x.k, x.l, x.d, 'info', false, 0, x.v
  from (values
    ('sec_intro', 'Introdução', null::text, '{"section":true}'::jsonb),
    ('intro_texto', 'Seja bem-vindo(a)!', coalesce(f.description, 'Preencha seus dados para se inscrever. A Direção entrará em contato.'), '{}'::jsonb),
    ('sec_sobre', 'Sobre você', null, '{"section":true}'::jsonb),
    ('sec_participacao', 'Participação', null, '{"section":true,"consent":true}'::jsonb),
    ('sec_fim', 'Tá acabando', null, '{"section":true}'::jsonb)
  ) as x(k, l, d, v)
  on conflict (form_id, field_key) do nothing;
  update public.forms set description = null where id = p_form;
  update public.form_fields x set sort_order = o.n
  from unnest(array['sec_intro', 'intro_texto',
    'sec_sobre', 'full_name', 'display_name', 'phone', 'social', 'birth_date', 'gender', 'is_trans', 'race',
    'sec_participacao', 'instrument', 'level', 'played_other', 'other_blocks',
    'sec_fim', 'affective',
    'email', 'is_pcd', 'pcd_description', 'plays']) with ordinality as o(k, n)
  where x.form_id = p_form and x.field_key = o.k;
end $$;
revoke all on function public._apply_form_sections(uuid) from public, anon, authenticated;
