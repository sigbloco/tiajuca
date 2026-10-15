-- Estrutura artística INICIAL do Cordão da Tia Juca (editável depois pela Direção). Idempotente.
-- Suposição documentada: cada item listado vira um NAIPE (para controle de vagas) e, em Sopro/Percussão,
-- também um INSTRUMENTO de mesmo nome ligado ao naipe (um naipe pode ganhar outros instrumentos depois).
do $$
declare
  v_org uuid; v_sopro uuid; v_perc uuid; v_perf uuid; v_outras uuid; n text; i int;
begin
  select id into v_org from public.organizations where slug = 'tiajuca';
  if v_org is null then raise exception 'Execute antes seed/tiajuca.sql'; end if;
  perform public.seed_org_cycle_defaults(v_org);

  insert into public.areas (organization_id, name, sort_order) values
    (v_org, 'Sopro', 1), (v_org, 'Percussão', 2), (v_org, 'Performance', 3), (v_org, 'Outras funções', 4)
  on conflict (organization_id, name) do nothing;
  select id into v_sopro  from public.areas where organization_id = v_org and name = 'Sopro';
  select id into v_perc   from public.areas where organization_id = v_org and name = 'Percussão';
  select id into v_perf   from public.areas where organization_id = v_org and name = 'Performance';
  select id into v_outras from public.areas where organization_id = v_org and name = 'Outras funções';

  i := 0;
  foreach n in array array['Flauta','Clarinete','Sax Soprano','Sax Alto','Sax Tenor','Trompete','Trombone','Bombardino','Tuba'] loop
    i := i + 1;
    insert into public.sections (organization_id, area_id, name, sort_order) values (v_org, v_sopro, n, i)
      on conflict (organization_id, name) do nothing;
    insert into public.instruments (organization_id, area_id, section_id, name, sort_order)
      select v_org, v_sopro, s.id, n, i from public.sections s where s.organization_id = v_org and s.name = n
      on conflict (organization_id, name) do nothing;
  end loop;

  i := 0;
  foreach n in array array['Agogô','Caixa de guerra','Repique','Surdo','Tamborim','Timbal','Xequerê','Ganzá'] loop
    i := i + 1;
    insert into public.sections (organization_id, area_id, name, sort_order) values (v_org, v_perc, n, 20 + i)
      on conflict (organization_id, name) do nothing;
    insert into public.instruments (organization_id, area_id, section_id, name, sort_order)
      select v_org, v_perc, s.id, n, 20 + i from public.sections s where s.organization_id = v_org and s.name = n
      on conflict (organization_id, name) do nothing;
  end loop;

  insert into public.sections (organization_id, area_id, name, sort_order) values (v_org, v_perf, 'Pernalta', 40)
    on conflict (organization_id, name) do nothing;

  insert into public.artistic_functions (organization_id, area_id, name, sort_order) values
    (v_org, v_perf, 'Pernalta', 1), (v_org, v_outras, 'Produção', 2), (v_org, v_outras, 'Apoio', 3)
  on conflict (organization_id, name) do nothing;

  -- Níveis: ponto de partida editável (a lista oficial deve ser confirmada pela Direção).
  insert into public.skill_levels (organization_id, name, sort_order) values
    (v_org, 'Iniciante', 1), (v_org, 'Intermediário', 2), (v_org, 'Avançado', 3)
  on conflict (organization_id, name) do nothing;
end $$;
