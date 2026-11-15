-- Aniversários para todos os integrantes, sem expor mais do que a regra permite:
-- dia e mês para qualquer um da organização; o ano (e portanto a idade) só para Titular, Direção e professores/monitores.
-- E-mail e data de nascimento completa continuam só pelo RLS de `members` (quem não é equipe lê apenas o próprio cadastro).
create or replace function public.birthday_list(p_org uuid)
returns table (member_id uuid, full_name text, display_name text, month_day text, birth_year int)
language plpgsql stable security definer set search_path = '' as $$
declare v_staff boolean;
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_staff := coalesce(public.is_staff(p_org), false);
  return query
    select m.id, m.full_name, m.display_name, to_char(m.birth_date, 'MM-DD'),
           case when v_staff then extract(year from m.birth_date)::int end
      from public.members m
     where m.organization_id = p_org and m.archived_at is null and m.birth_date is not null;
end $$;
revoke all on function public.birthday_list(uuid) from public, anon;
grant execute on function public.birthday_list(uuid) to authenticated;
