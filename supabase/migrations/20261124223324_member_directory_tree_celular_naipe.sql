-- Celular só para quem é do mesmo naipe: na lista do integrante ativo, o telefone de outra pessoa só vem quando
-- os dois têm algum naipe em comum no ciclo atual (pela participação ou pela equipe: professor, monitor, regente).
-- Sem naipe em comum, o telefone vem vazio; redes sociais continuam para todos.

-- Naipes de uma pessoa num ciclo (participação e equipe). Só o banco usa.
create or replace function public.member_section_ids(p_member uuid, p_cycle uuid)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(array_agg(distinct s.id), '{}') from (
    select coalesce(i.section_id, f.section_id) as id
      from public.cycle_participations cp
      left join public.instruments i on i.id = cp.instrument_id
      left join public.artistic_functions f on f.id = cp.function_id
     where cp.member_id = p_member and cp.cycle_id = p_cycle
    union all
    select coalesce(a.section_id, i.section_id)
      from public.staff_assignments a
      left join public.instruments i on i.id = a.instrument_id
     where a.member_id = p_member and a.cycle_id = p_cycle and a.valid_to is null
  ) s where s.id is not null
$function$;
revoke all on function public.member_section_ids(uuid, uuid) from public, anon, authenticated;

create or replace function public.member_directory_tree(p_org uuid)
returns table(
  member_id uuid, full_name text, display_name text,
  phone text,      -- só de quem tem naipe em comum com quem pede (e o próprio)
  social_handle text,
  birth_md text,   -- só dia e mês ('MM-DD'), sem o ano
  kinds text[],    -- professor, monitor, regente, aluno, senior, musico (para os filtros e selos)
  parts jsonb      -- [{instrument_id, function_id}] do ciclo atual, sem função remunerada
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_cycle uuid;
  v_me uuid;
  v_secs uuid[];
begin
  if not public.is_org_member(p_org) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if coalesce((select s.value #>> '{}' from public.org_settings s where s.organization_id = p_org and s.key = 'member_directory_visibility'), 'all_members') <> 'all_members' then return; end if;
  select c.id into v_cycle from public.cycles c where c.organization_id = p_org and c.is_current and c.is_active limit 1;
  if v_cycle is null then return; end if;
  v_me := public.current_member_id(p_org);
  -- Quem pede precisa estar ativo no ciclo atual.
  if not exists (
    select 1 from public.member_cycles mc
      join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
     where mc.cycle_id = v_cycle and mc.member_id = v_me
  ) then return; end if;
  v_secs := public.member_section_ids(v_me, v_cycle);

  return query
    select m.id, m.full_name, m.display_name,
           case when m.id = v_me or public.member_section_ids(m.id, v_cycle) && v_secs then m.phone end,
           m.social_handle,
           case when m.birth_date is null then null else to_char(m.birth_date, 'MM-DD') end,
           array(
             select distinct x.k from (
               select a.staff_kind::text as k from public.staff_assignments a
                where a.member_id = m.id and a.cycle_id = v_cycle and a.valid_to is null
               union all
               select coalesce(fc.base_key, fc.system_key) from public.cycle_fee_assignments fa
                 join public.fee_categories fc on fc.id = fa.fee_category_id
                where fa.member_id = m.id and fa.cycle_id = v_cycle
               union all
               select coalesce(fc.base_key, fc.system_key) from public.cycle_extra_categories ce
                 join public.fee_categories fc on fc.id = ce.fee_category_id
                where ce.member_id = m.id and ce.cycle_id = v_cycle
             ) x where x.k in ('professor', 'monitor', 'regente', 'aluno', 'senior', 'musico')
           ),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'instrument_id', cp.instrument_id,
                      'function_id', case when coalesce(f.kind, '') = 'paid' then null else cp.function_id end))
               from public.cycle_participations cp
               left join public.artistic_functions f on f.id = cp.function_id
              where cp.member_id = m.id and cp.cycle_id = v_cycle
                and (cp.instrument_id is not null or coalesce(f.kind, '') <> 'paid')
           ), '[]'::jsonb)
      from public.members m
     where m.organization_id = p_org and m.archived_at is null
       and exists (
         select 1 from public.member_cycles mc
           join public.member_cycle_statuses s on s.id = mc.status_id and s.counts_as_active
          where mc.member_id = m.id and mc.cycle_id = v_cycle)
     order by m.full_name;
end
$function$;

revoke all on function public.member_directory_tree(uuid) from public, anon;
grant execute on function public.member_directory_tree(uuid) to authenticated;
