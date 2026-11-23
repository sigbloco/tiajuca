-- Etapa 8 da revisão: cidade do Pix e cor dos e-mails da loja deixam de ser fixas no código.
-- 1) shop_settings.pix_city (até 15 letras, limite do BR Code). As linhas existentes ficam com 'Rio de Janeiro' (o valor que o código usava): nada muda hoje.
-- 2) shop_get_public_store devolve a cidade em `pix` (o QR da tela usa).
-- 3) shop_mail_claim devolve a cidade em `settings` e o tema em `org` (o e-mail usa a cor da loja).
-- As funções são reescritas a partir da definição atual do banco, com troca conferida (falha se o trecho não existir).

alter table public.shop_settings add column pix_city text check (pix_city is null or char_length(btrim(pix_city)) between 1 and 15);
update public.shop_settings set pix_city = 'Rio de Janeiro' where pix_city is null;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.shop_get_public_store(text)'::regprocedure);
  n := replace(d, 'jsonb_build_object(''key'', s.pix_key, ''beneficiary'', s.pix_beneficiary)', 'jsonb_build_object(''key'', s.pix_key, ''beneficiary'', s.pix_beneficiary, ''city'', s.pix_city)');
  if n = d then raise exception 'shop_get_public_store: trecho do Pix não encontrado'; end if;
  execute n;

  d := pg_get_functiondef('public.shop_mail_claim(integer)'::regprocedure);
  n := replace(d, '''org'', jsonb_build_object(''name'', g.name)', '''org'', jsonb_build_object(''name'', g.name, ''theme'', g.theme)');
  if n = d then raise exception 'shop_mail_claim: trecho de org não encontrado'; end if;
  d := n;
  n := replace(d, '''pix_beneficiary'', s.pix_beneficiary,', '''pix_beneficiary'', s.pix_beneficiary, ''pix_city'', s.pix_city,');
  if n = d then raise exception 'shop_mail_claim: trecho de settings não encontrado'; end if;
  execute n;
end $$;
