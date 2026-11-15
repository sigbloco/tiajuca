-- Cabeçalho do formulário: tamanho da logo calibrável (32 a 200 px; padrão 80).
alter table public.forms add column if not exists header_logo_size int not null default 80 check (header_logo_size between 32 and 200);
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''height'', f.header_height', '''height'', f.header_height, ''logo'', f.header_logo_size');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
