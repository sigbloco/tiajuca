-- Variáveis nos textos dos formulários ({whatsapp}, {email}, {chave_pix}, {vencimento}): o formulário público recebe os valores atuais do bloco.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''show_confirmation'', f.confirmation_enabled,',
    '''show_confirmation'', f.confirmation_enabled, ''vars'', (select jsonb_build_object(''whatsapp'', s.contact_whatsapp, ''email'', s.contact_email, ''chave_pix'', s.pix_key, ''vencimento'', (select os.value #>> ''{}'' from public.org_settings os where os.organization_id = o.id and os.key = ''billing_due_day'')) from public.shop_settings s where s.organization_id = o.id),');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
