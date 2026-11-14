-- Formulários: opção "Outro" com texto livre, instrumento/nível com opções escritas (sem puxar do cadastro sozinho),
-- redes sociais com rede + usuário, e a pergunta de outros blocos 100% discursiva.

do $$
declare d text; n text;
begin
  -- 1) Publicar: as opções escritas no formulário valem sempre (não puxa mais instrumentos/funções/níveis sozinho quando está vazio).
  d := pg_get_functiondef('public.publish_form(uuid)'::regprocedure);
  n := replace(d, 'jsonb_array_length(x.options) = 0', 'false');
  if n = d then raise exception 'publish_form: trecho não encontrado'; end if;
  execute n;

  -- 2) Enviar: aceita "outro: texto" nos campos de seleção que permitem "Outro" (validation.other).
  d := pg_get_functiondef('public.submit_public_form(text,text,jsonb,boolean,text,uuid,jsonb)'::regprocedure);
  n := replace(d,
    $a$if jsonb_typeof(val) <> 'string' or not exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = txt) then$a$,
    $b$if jsonb_typeof(val) <> 'string' or not (exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = txt)
           or (coalesce((fld -> 'validation' ->> 'other')::boolean, false) and txt like 'outro:%' and length(txt) <= 300)) then$b$);
  if n = d then raise exception 'submit_public_form (única): trecho não encontrado'; end if;
  d := n;
  n := replace(d,
    $a$where not exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = x)) then$a$,
    $b$where not exists (select 1 from jsonb_array_elements(fld -> 'options') o where o ->> 'value' = x)
             and not (coalesce((fld -> 'validation' ->> 'other')::boolean, false) and x like 'outro:%' and length(x) <= 300)) then$b$);
  if n = d then raise exception 'submit_public_form (múltipla): trecho não encontrado'; end if;
  execute n;

  -- 3) Aprovar: "outros blocos" preenchido conta como "já tocou"; ligação com instrumento/função/nível ignora o que não for um código válido.
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, 'function_ans::uuid;', $x$(case when function_ans ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then function_ans::uuid end);$x$);
  if n = d then raise exception 'approve_submission (uuid): trecho não encontrado'; end if;
  d := n;
  n := replace(d, 'if m_full is null or length(trim(m_full)) = 0 then', E'if m_other is not null and btrim(m_other) <> '''' then m_played := true; end if;\n  if m_full is null or length(trim(m_full)) = 0 then');
  if n = d then raise exception 'approve_submission (outros blocos): trecho não encontrado'; end if;
  execute n;
end $$;

-- Redes sociais: um campo de texto longo com a marca "social" (rede + usuário, várias).
update public.form_fields
   set label = 'Redes sociais', field_type = 'long_text', validation = validation || '{"social":true}'::jsonb
 where member_mapping = 'member.social_handle' and field_type in ('short_text', 'long_text');

-- Outros blocos: uma pergunta só, discursiva (liga em "Quais outros blocos"); a pergunta de baixo sai.
update public.form_fields
   set label = 'Toca ou já tocou em outros blocos? Quais?', field_type = 'long_text', options = '[]'::jsonb, condition = null, member_mapping = 'member.other_blocks', required = false
 where field_key = 'played_other';
delete from public.form_fields x
 where x.field_key = 'other_blocks'
   and exists (select 1 from public.form_fields y where y.form_id = x.form_id and y.field_key = 'played_other' and y.member_mapping = 'member.other_blocks');

-- Instrumento e nível: opções escritas (valor = código do cadastro, para continuar ligando ao integrante). Nível é autodeclaração.
update public.form_fields x
   set options = coalesce((select jsonb_agg(jsonb_build_object('value', i.id, 'label', i.name) order by i.sort_order, i.name)
                             from public.instruments i where i.organization_id = x.organization_id and i.is_active), '[]'::jsonb)
 where x.member_mapping = 'link.instrument' and jsonb_array_length(x.options) = 0;
update public.form_fields x
   set options = coalesce((select jsonb_agg(jsonb_build_object('value', l.id, 'label', l.name) order by l.sort_order, l.name)
                             from public.skill_levels l where l.organization_id = x.organization_id and l.is_active), '[]'::jsonb),
       member_mapping = 'link.skill_level',
       description = coalesce(x.description, 'Autodeclaração: escolha o nível que você acredita ter.')
 where x.field_key = 'level' and x.member_mapping is null;

-- Fecha buracos na ordem.
update public.form_fields x set sort_order = n.rn
  from (select id, row_number() over (partition by form_id order by sort_order, created_at) as rn from public.form_fields) n
 where n.id = x.id and x.sort_order <> n.rn;
