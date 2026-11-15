-- Perguntas novas ligadas ao cadastro: o que a pessoa responde vai para "Outras informações" no fim da ficha do integrante (members.extra_info).
alter table public.members add column if not exists extra_info jsonb not null default '{}'::jsonb;

-- Nova ligação possível nas perguntas do formulário.
do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid = 'public.form_fields'::regclass and conname = 'form_fields_member_mapping_check';
  if d is null then raise exception 'constraint não encontrada'; end if;
  alter table public.form_fields drop constraint form_fields_member_mapping_check;
  d := replace(d, '''link.skill_level''::text]', '''link.skill_level''::text, ''member.custom''::text]');
  if position('member.custom' in d) = 0 then raise exception 'lista de ligações não reconhecida: %', d; end if;
  execute 'alter table public.form_fields add constraint form_fields_member_mapping_check ' || d;
end $$;

do $$
declare d text; n text;
begin
  -- Publicar: várias perguntas podem ir para "Outras informações" (as demais ligações continuam únicas).
  d := pg_get_functiondef('public.publish_form(uuid)'::regprocedure);
  n := replace(d, 'and member_mapping is not null', 'and member_mapping is not null and member_mapping <> ''member.custom''');
  if n = d then raise exception 'publish_form: trecho não encontrado'; end if;
  execute n;

  -- Aprovar: a resposta entra em extra_info com o texto da pergunta como título.
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, 'm_other text;', 'm_other text; m_extra jsonb := ''{}''::jsonb;');
  if n = d then raise exception 'approve_submission: declare não encontrado'; end if;
  d := n;
  n := replace(d, 'when ''member.other_blocks'' then m_other := function_ans;', 'when ''member.other_blocks'' then m_other := function_ans;' || E'\n      when ''member.custom'' then m_extra := m_extra || jsonb_build_object(fld ->> ''label'', function_ans);');
  if n = d then raise exception 'approve_submission: case não encontrado'; end if;
  d := n;
  n := replace(d, 'played_other_blocks, other_blocks)', 'played_other_blocks, other_blocks, extra_info)');
  if n = d then raise exception 'approve_submission: colunas não encontradas'; end if;
  d := n;
  n := replace(d, 'm_played, nullif(trim(m_other), '''')', 'm_played, nullif(trim(m_other), ''''), m_extra');
  if n = d then raise exception 'approve_submission: valores não encontrados'; end if;
  execute n;
end $$;

-- "Toca ou já tocou algum instrumento?": pergunta de texto livre, ligada a "Outras informações", antes de "outros blocos".
update public.form_fields
   set label = 'Toca ou já tocou algum instrumento?', field_type = 'long_text', options = '[]'::jsonb, condition = null,
       member_mapping = 'member.custom', is_active = true, required = false
 where field_key = 'plays';
update public.form_fields x set sort_order = n.rn
  from (select f.id, row_number() over (partition by f.form_id order by case when f.field_key = 'plays' then (select o.sort_order from public.form_fields o where o.form_id = f.form_id and o.field_key = 'played_other') - 0.5 else f.sort_order end, f.created_at) as rn
          from public.form_fields f) n
 where n.id = x.id and x.sort_order <> n.rn;
