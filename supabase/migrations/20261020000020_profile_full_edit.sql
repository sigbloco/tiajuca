-- "Meu perfil": o integrante altera todos os próprios dados cadastrais (menos a data de inscrição).
-- Redes sociais: várias, uma por linha em social_handle.
create or replace function public.update_my_profile(p_member uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_self(p_member) then
    raise exception 'Você só pode editar o seu próprio cadastro.' using errcode = '42501';
  end if;
  update public.members set
    full_name           = case when p_patch ? 'full_name'           then coalesce(nullif(trim(p_patch ->> 'full_name'), ''), full_name) else full_name end,
    display_name        = case when p_patch ? 'display_name'        then nullif(trim(p_patch ->> 'display_name'), '') else display_name end,
    email               = case when p_patch ? 'email'               then nullif(lower(trim(p_patch ->> 'email')), '') else email end,
    birth_date          = case when p_patch ? 'birth_date'          then nullif(p_patch ->> 'birth_date', '')::date else birth_date end,
    phone               = case when p_patch ? 'phone'               then nullif(trim(p_patch ->> 'phone'), '') else phone end,
    social_handle       = case when p_patch ? 'social_handle'       then nullif(trim(p_patch ->> 'social_handle'), '') else social_handle end,
    affective_relation  = case when p_patch ? 'affective_relation'  then nullif(trim(p_patch ->> 'affective_relation'), '') else affective_relation end,
    played_other_blocks = case when p_patch ? 'played_other_blocks' then (p_patch ->> 'played_other_blocks')::boolean else played_other_blocks end,
    other_blocks        = case when p_patch ? 'other_blocks'        then nullif(trim(p_patch ->> 'other_blocks'), '') else other_blocks end
  where id = p_member;
end $$;
