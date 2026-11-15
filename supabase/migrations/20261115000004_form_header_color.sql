-- Cabeçalho do formulário: além da foto, pode ser uma cor chapada (hex #RRGGBB; nulo = vermelho da marca/foto).
alter table public.forms add column if not exists header_color text check (header_color is null or header_color ~ '^#[0-9a-fA-F]{6}$');
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''logo'', f.header_logo_size', '''logo'', f.header_logo_size, ''color'', f.header_color');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
