-- Estrutura INICIAL do Cordão da Tia Juca (editável pela Direção). Idempotente.
-- Naipes: Sopro, Percussão, Performance. Instrumentos dentro dos naipes. Subnaipes (ex.: Metais, Leves)
-- NÃO são semeados: a Direção os cria e define quais instrumentos pertencem a cada um.
do $$
declare
  v_org uuid; v_sopro uuid; v_perc uuid; v_perf uuid; n text; i int;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;
  perform public.seed_org_cycle_defaults(v_org);

  insert into public.sections (organization_id, name, sort_order) values
    (v_org, 'Sopro', 1), (v_org, 'Percussão', 2), (v_org, 'Performance', 3)
  on conflict (organization_id, name) do nothing;
  select id into v_sopro from public.sections where organization_id = v_org and name = 'Sopro';
  select id into v_perc  from public.sections where organization_id = v_org and name = 'Percussão';
  select id into v_perf  from public.sections where organization_id = v_org and name = 'Performance';

  i := 0;
  foreach n in array array['Flauta','Clarinete','Sax Soprano','Sax Alto','Sax Tenor','Trompete','Trombone','Bombardino','Tuba'] loop
    i := i + 1;
    insert into public.instruments (organization_id, section_id, name, sort_order) values (v_org, v_sopro, n, i)
      on conflict (organization_id, name) do nothing;
  end loop;

  i := 0;
  foreach n in array array['Agogô','Caixa de guerra','Repique','Surdo','Tamborim','Timbal','Xequerê','Ganzá'] loop
    i := i + 1;
    insert into public.instruments (organization_id, section_id, name, sort_order) values (v_org, v_perc, n, i)
      on conflict (organization_id, name) do nothing;
  end loop;

  insert into public.instruments (organization_id, section_id, name, sort_order) values (v_org, v_perf, 'Pernalta', 1)
    on conflict (organization_id, name) do nothing;

  -- Funções (não são instrumentos). 'Pernalta' é instrumento do naipe Performance, não função.
  delete from public.artistic_functions where organization_id = v_org and name = 'Pernalta';
  insert into public.artistic_functions (organization_id, name, sort_order) values
    (v_org, 'Produção', 1), (v_org, 'Apoio', 2)
  on conflict (organization_id, name) do nothing;

  insert into public.skill_levels (organization_id, name, sort_order) values
    (v_org, 'Iniciante', 1), (v_org, 'Intermediário', 2), (v_org, 'Avançado', 3)
  on conflict (organization_id, name) do nothing;
end $$;

-- Subnaipes da Percussão (a Direção define quais instrumentos pertencem a cada um, em Configurações → Instrumentos).
insert into public.subsections (organization_id, section_id, name, sort_order)
select s.organization_id, s.id, n.name, n.ord
from public.sections s
cross join (values ('Graves', 1), ('Leves', 2), ('Agudos', 3), ('Chocalhos', 4)) as n(name, ord)
where s.name = 'Percussão' and s.organization_id = (select id from public.organizations where slug = 'tiajuca')
on conflict (organization_id, name) do nothing;
