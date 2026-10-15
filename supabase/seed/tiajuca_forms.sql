-- Cria o RASCUNHO "Inscrição de novos integrantes" (slug: inscricao) para o Cordão da Tia Juca.
-- Campos conforme o cadastro do integrante, com condicionais (PCD → Qual?; toca instrumento → Instrumento/Nível) e
-- ligação com o cadastro. A Direção revisa o texto de privacidade, ajusta e PUBLICA pelo app. Idempotente.
do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;
  perform public.create_default_registration_form(v_org);
end $$;
