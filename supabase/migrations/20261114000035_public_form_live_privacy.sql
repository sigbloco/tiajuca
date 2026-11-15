-- O texto de privacidade passa a ser editado na seção de Envio e vale na hora (como os demais textos do envio), sem republicar.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''privacy_text'', v.snapshot -> ''privacy_text''', '''privacy_text'', to_jsonb(f.privacy_text)');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
