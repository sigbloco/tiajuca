-- A geração de cobranças passa a respeitar as funções isentas (como diz a tela Valores).
create or replace function public.generate_monthly_charges(p_org uuid, p_competence date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := date_trunc('month', p_competence)::date;
  v_end date := (date_trunc('month', p_competence) + interval '1 month - 1 day')::date;
  v_due_day int; v_created int; v_noprice int; v_total int;
begin
  perform public.require_billing(p_org);
  v_due_day := coalesce((select (value #>> '{}')::int from public.org_settings where organization_id = p_org and key = 'billing_due_day'), 10);

  with elig as (
    select distinct on (fa.member_id) fa.member_id, fa.fee_category_id,
      (select p.amount from public.fee_category_prices p
        where p.fee_category_id = fa.fee_category_id and p.valid_from <= v_comp and (p.valid_to is null or p.valid_to >= v_comp)
        order by p.valid_from desc limit 1) as base,
      coalesce((select s.percent from public.cycle_scholarships s where s.member_id = fa.member_id and s.cycle_id = fa.cycle_id limit 1), 0) as pct
    from public.cycle_fee_assignments fa
    join public.cycles cy on cy.id = fa.cycle_id and cy.is_active and cy.starts_on <= v_end and cy.ends_on >= v_comp
    join public.members m on m.id = fa.member_id and m.archived_at is null
    where fa.organization_id = p_org
      and exists (
        select 1 from public.member_cycles mc
        join public.member_cycle_statuses st on st.id = mc.status_id and st.counts_as_active
        where mc.member_id = fa.member_id and mc.cycle_id = fa.cycle_id)
      -- Quem tem função isenta no ciclo (ex.: Direção, Professor) não é cobrado, qualquer que seja a categoria principal.
      and not exists (
        select 1 from public.cycle_participations cp
        join public.artistic_functions af on af.id = cp.function_id and (af.is_exempt or af.exempt_locked)
        where cp.member_id = fa.member_id and cp.cycle_id = fa.cycle_id)
    order by fa.member_id, cy.starts_on desc
  ), ins as (
    insert into public.monthly_charges (organization_id, member_id, competence, fee_category_id, base_amount,
                                        scholarship_percent, scholarship_discount, final_amount, status, due_on)
    select p_org, e.member_id, v_comp, e.fee_category_id, e.base, e.pct,
           round(e.base * e.pct / 100, 2), e.base - round(e.base * e.pct / 100, 2),
           case when e.base - round(e.base * e.pct / 100, 2) <= 0 then 'exempt' else 'pending' end,
           public.next_business_day(p_org, v_comp + (v_due_day - 1))
    from elig e where e.base is not null
    on conflict (organization_id, member_id, competence) do nothing
    returning 1
  )
  select (select count(*) from ins), (select count(*) from elig where base is null), (select count(*) from elig where base is not null)
    into v_created, v_noprice, v_total;
  return jsonb_build_object('created', v_created, 'already_existing', v_total - v_created, 'skipped_no_price', v_noprice);
end $$;
