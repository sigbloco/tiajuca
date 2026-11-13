-- Converte o antigo "palpite pelo título" em público explícito.
-- Evento/recorrência SEM público cujo título cita exatamente UM naipe ativo ganha esse naipe como público.
-- Não mexe em quem já tem público nem em títulos sem naipe (ou com mais de um).

create or replace function public._plain(t text) returns text language sql immutable as $$
  select lower(translate(t, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'))
$$;

-- eventos
insert into public.activity_audiences (organization_id, activity_id, kind, ref_id)
select a.organization_id, a.id, 'section', m.section_id
from public.activities a
cross join lateral (
  select (array_agg(s.id))[1] as section_id, count(*) as n
  from public.sections s
  where s.organization_id = a.organization_id and s.is_active
    and position(public._plain(s.name) in public._plain(a.title)) > 0
) m
where m.n = 1
  and not exists (select 1 from public.activity_audiences au where au.activity_id = a.id)
on conflict do nothing;

-- recorrências
update public.recurrence_rules r
set audiences = jsonb_build_array(jsonb_build_object('kind', 'section', 'ref', m.section_id))
from (
  select r2.id, (array_agg(s.id))[1] as section_id, count(*) as n
  from public.recurrence_rules r2
  join public.sections s on s.organization_id = r2.organization_id and s.is_active
   and position(public._plain(s.name) in public._plain(r2.title)) > 0
  where jsonb_array_length(r2.audiences) = 0
  group by r2.id
) m
where m.id = r.id and m.n = 1;

drop function public._plain(text);
