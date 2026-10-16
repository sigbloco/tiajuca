-- Categoria de contribuição vigente de cada integrante (Aluno, Senior, Banda…), para filtros e telas como "Alunos".
-- Devolve só as pessoas que quem chama já pode ler (Direção: todas; Professor/Monitor: seu grupo; integrante: ele mesmo).
-- O nome da categoria não é dado sensível; valores e bolsas continuam restritos às telas de cobrança.

create or replace function public.list_member_categories(p_org uuid)
returns table (member_id uuid, category_id uuid, category_name text)
language sql stable security definer set search_path = '' as $$
  select a.member_id, c.id, c.name
    from public.member_fee_assignments a
    join public.fee_categories c on c.id = a.fee_category_id
   where a.organization_id = p_org and a.valid_to is null
     and public.is_org_member(p_org)
     and public.can_read_member(p_org, a.member_id)
$$;
revoke all on function public.list_member_categories(uuid) from public, anon;
grant execute on function public.list_member_categories(uuid) to authenticated;
