-- "Toca ou já tocou algum instrumento?": texto livre no cadastro (parte de "Outras informações" do perfil).
alter table public.members add column if not exists played_instrument text;
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.update_my_profile(uuid,jsonb)'::regprocedure);
  n := replace(d, E'other_blocks        = case when p_patch ? ''other_blocks''        then nullif(trim(p_patch ->> ''other_blocks''), '''') else other_blocks end',
    E'other_blocks        = case when p_patch ? ''other_blocks''        then nullif(trim(p_patch ->> ''other_blocks''), '''') else other_blocks end,\n    played_instrument   = case when p_patch ? ''played_instrument''   then nullif(trim(p_patch ->> ''played_instrument''), '''') else played_instrument end');
  if n = d then raise exception 'update_my_profile: trecho não encontrado'; end if;
  execute n;
end $$;
