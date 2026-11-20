-- Etapa 3 da revisão, parte 2: apaga as tabelas antigas de cobrança, depois de conferir que o ciclo atual bate (relatório antes × depois)
-- e de um backup manual ("Antes da etapa 3: tabelas antigas de cobrança"). Decisões do usuário em 20/11/2026: apagar as tabelas antigas
-- e o calculador antigo da distribuição (COB-06).

-- 1. Pontes da tela antiga (a tela nova usa set_cycle_scholarship, set_cycle_fee_price e grava a categoria do ciclo direto).
drop function if exists public.assign_fee_category(uuid, uuid, date);
drop function if exists public.set_scholarship(uuid, numeric, date, uuid, text);
drop function if exists public.set_fee_price(uuid, numeric, date);

-- 2. Tabelas antigas por data (o ciclo atual estava igual nas tabelas por ciclo; o histórico fica no backup).
drop table if exists public.member_fee_assignments;
drop table if exists public.fee_category_prices;
drop table if exists public.scholarships;

-- 3. Classificações antigas (COB-08): o perfil do bloco usa o Tipo da categoria. Nenhum integrante nem evento as usava.
drop table if exists public.member_classifications;
drop table if exists public.classifications;
alter table public.activity_audiences drop constraint if exists activity_audiences_kind_check;
alter table public.activity_audiences add constraint activity_audiences_kind_check check (kind = any (array['section', 'instrument', 'member', 'category']));

create or replace function public.seed_org_defaults(p_org uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  insert into public.access_roles (organization_id, key, name, rank, is_system) values
    (p_org, 'direcao',    'Direção',    40, true),
    (p_org, 'professor',  'Professor',  30, true),
    (p_org, 'monitor',    'Monitor',    20, true),
    (p_org, 'integrante', 'Integrante', 10, true)
  on conflict (organization_id, key) do nothing;

  -- Direção: todas as permissões, escopo organização.
  insert into public.role_permissions (access_role_id, permission_key, scope)
  select ar.id, p.key, 'org' from public.access_roles ar cross join public.permissions p
  where ar.organization_id = p_org and ar.key = 'direcao'
  on conflict do nothing;

  -- Demais papéis (matriz E da proposta).
  for r in
    select * from (values
      ('professor','members.read','group'), ('professor','member_cycles.read','group'),
      ('professor','member_cycles.manage','group'), ('professor','capacity.read','org'),
      ('professor','events.read','org'), ('professor','events.manage','group'),
      ('professor','attendance.read','group'), ('professor','attendance.record','group'),
      ('professor','repertoire.read','org'), ('professor','billing.read','own'),
      ('professor','staff_payments.read','own'), ('professor','pix.manage','own'),
      ('monitor','members.read','group'), ('monitor','member_cycles.read','group'),
      ('monitor','member_cycles.manage','group'), ('monitor','capacity.read','group'),
      ('monitor','events.read','org'), ('monitor','attendance.read','group'),
      ('monitor','attendance.record','group'), ('monitor','repertoire.read','org'),
      ('monitor','billing.read','own'), ('monitor','staff_payments.read','own'),
      ('monitor','pix.manage','own'),
      ('integrante','members.read','own'), ('integrante','events.read','org'),
      ('integrante','attendance.read','own'), ('integrante','repertoire.read','org'),
      ('integrante','billing.read','own')
    ) as t(role_key, perm, scope)
  loop
    insert into public.role_permissions (access_role_id, permission_key, scope)
    select ar.id, r.perm, r.scope::public.permission_scope
    from public.access_roles ar where ar.organization_id = p_org and ar.key = r.role_key
    on conflict do nothing;
  end loop;

  insert into public.org_settings (organization_id, key, value) values
    (p_org, 'member_directory_visibility', '"all_members"'::jsonb),
    (p_org, 'billing_due_day', '10'::jsonb),
    (p_org, 'minimum_member_age', '18'::jsonb)
  on conflict do nothing;
end $$;

-- 4. Restore: a tradução da tabela antiga member_fee_assignments sai (a tabela não existe mais; o restore ignora tabelas que não existem).
create or replace function public.backup_upgrade_tables(p_tables jsonb)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare v jsonb := p_tables;
begin
  -- 20261119000003/06 (categorias por naipe): no ciclo atual e nos futuros, categoria de outro naipe é barrada.
  -- Atribuição antiga em categoria de outro naipe passa para a categoria do mesmo Tipo do naipe da pessoa (o que a reclassificação fez).
  if jsonb_typeof(v -> 'cycle_fee_assignments') = 'array' then
    v := jsonb_set(v, '{cycle_fee_assignments}', (
      select coalesce(jsonb_agg(case when alt.id is not null then jsonb_set(fa, '{fee_category_id}', to_jsonb(alt.id)) else fa end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'cycle_fee_assignments') fa
        left join public.cycles cy on cy.id = (fa ->> 'cycle_id')::uuid and cy.ends_on >= current_date
        left join public.fee_categories fc on fc.id = (fa ->> 'fee_category_id')::uuid and cy.id is not null
        left join lateral (
          select coalesce(array_agg(distinct coalesce(i.section_id, af.section_id)) filter (where coalesce(i.section_id, af.section_id) is not null), '{}') as secs
            from jsonb_array_elements(coalesce(v -> 'cycle_participations', '[]'::jsonb)) cp
            left join public.instruments i on i.id = (cp ->> 'instrument_id')::uuid
            left join public.artistic_functions af on af.id = (cp ->> 'function_id')::uuid
           where cp ->> 'member_id' = fa ->> 'member_id' and cp ->> 'cycle_id' = fa ->> 'cycle_id') ms on fc.id is not null
        left join lateral (
          select x.id from public.fee_categories x
           where fc.section_id is not null and fc.base_key is not null and cardinality(ms.secs) > 0 and not (fc.section_id = any (ms.secs))
             and x.organization_id = fc.organization_id and x.base_key = fc.base_key and x.section_id = any (ms.secs)
           order by x.name limit 1) alt on true));
  end if;
  -- 20261113000003_function_kinds: kind 'artistic' virou 'collab' (Regência) ou 'payer' (demais).
  if jsonb_typeof(v -> 'artistic_functions') = 'array' then
    v := jsonb_set(v, '{artistic_functions}', (
      select coalesce(jsonb_agg(case when f ->> 'kind' = 'artistic'
                                     then jsonb_set(f, '{kind}', to_jsonb(case when lower(f ->> 'name') in ('regência', 'regencia') then 'collab' else 'payer' end))
                                     else f end), '[]'::jsonb)
        from jsonb_array_elements(v -> 'artistic_functions') f));
  end if;
  return v;
end $$;

-- 5. COB-06: calculador antigo da distribuição, sem uso (a distribuição é feita na página Equipe). Os destinos ficam: os pagamentos da equipe usam.
drop function if exists public.compute_distribution(uuid, date);
drop function if exists public.replicate_distribution_rules(uuid);
drop table if exists public.distribution_rules;
drop function if exists public.check_distribution_percent_sum();
