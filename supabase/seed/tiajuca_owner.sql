-- Titular do Cordão da Tia Juca: usuário institucional do bloco. Controla tudo dentro do bloco, inclusive a Direção.
-- A conta precisa existir (cadastro + vínculo de conta). Executar no SQL Editor (sem usuário logado). Idempotente.
select public.set_organization_titular('tiajuca', 'cordaodatiajuca@gmail.com');
