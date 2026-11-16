-- Ajuste: álbuns e pedidos da loja NÃO são por ciclo (voltam ao que eram).
drop trigger if exists trg_cycle_shop_orders on public.shop_orders;
drop trigger if exists trg_cycle_site_albums on public.site_albums;
alter table public.shop_orders drop column if exists cycle_id;
alter table public.site_albums drop column if exists cycle_id;

-- Lançamentos: o livro-caixa expõe o ciclo de cada linha (lançamentos, mensalidades e pagamentos da equipe).
create or replace view public.v_finance_ledger with (security_invoker = true) as
 SELECT e.organization_id,
    'entry:'::text || e.id AS ref,
    e.occurred_on,
    e.kind,
    e.amount,
    e.description,
    c.name AS category,
    'lancamento'::text AS source,
    e.cycle_id
   FROM financial_entries e
     JOIN finance_categories c ON c.id = e.category_id
  WHERE e.status = 'posted'::text AND has_permission(e.organization_id, 'finance.read'::text)
UNION ALL
 SELECT ch.organization_id,
    'charge:'::text || ch.id AS ref,
    ch.paid_on AS occurred_on,
    'income'::text AS kind,
    ch.final_amount AS amount,
    'Mensalidade — '::text || COALESCE(m.display_name, m.full_name) AS description,
    'Mensalidades'::text AS category,
    'mensalidade'::text AS source,
    ch.cycle_id
   FROM monthly_charges ch
     JOIN members m ON m.id = ch.member_id
  WHERE ch.status = 'paid'::text AND ch.paid_on IS NOT NULL AND has_permission(ch.organization_id, 'finance.read'::text)
UNION ALL
 SELECT p.organization_id,
    'staff:'::text || p.id AS ref,
    p.paid_on AS occurred_on,
    'expense'::text AS kind,
    p.amount,
    'Pagamento da equipe — '::text || COALESCE(m.display_name, m.full_name) AS description,
    'Pagamentos da equipe'::text AS category,
    'equipe'::text AS source,
    p.cycle_id
   FROM staff_payments p
     JOIN members m ON m.id = p.member_id
  WHERE p.status = 'paid'::text AND p.paid_on IS NOT NULL AND has_permission(p.organization_id, 'finance.read'::text);

-- Regras de distribuição por CICLO: cada ciclo tem as suas (e dá para replicar do anterior).
alter table public.distribution_rules add column if not exists cycle_id uuid references public.cycles (id);
update public.distribution_rules r set cycle_id = public._cycle_on(r.organization_id, r.valid_from) where r.cycle_id is null;
create index if not exists distribution_rules_cycle_idx on public.distribution_rules (cycle_id);
create trigger trg_cycle_distribution_rules before insert on public.distribution_rules for each row execute function public._set_cycle_from_date('valid_from');

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.check_distribution_percent_sum()'::regprocedure);
  n := replace(d, 'and r.base = new.base and r.id <> new.id;', 'and r.base = new.base and r.id <> new.id and r.cycle_id is not distinct from new.cycle_id;');
  if n = d then raise exception 'patch sum'; end if;
  execute n;

  d := pg_get_functiondef('public.compute_distribution(uuid,date)'::regprocedure);
  n := replace(d, 'declare v_from date :=', 'declare v_cycle uuid; v_from date :=');
  if n = d then raise exception 'patch dist: declare'; end if; d := n;
  n := replace(d, 'perform public.require_finance(p_org, ''finance.read'');', 'perform public.require_finance(p_org, ''finance.read'');' || E'\n  v_cycle := public._cycle_on(p_org, v_from);');
  if n = d then raise exception 'patch dist: cycle'; end if; d := n;
  n := replace(d, 'r.valid_from <= v_end and (r.valid_to is null or r.valid_to >= v_from)', '(case when r.cycle_id is not null then r.cycle_id = v_cycle else r.valid_from <= v_end and (r.valid_to is null or r.valid_to >= v_from) end)');
  if n = d then raise exception 'patch dist: rules'; end if;
  execute n;
end $$;

create or replace function public.replicate_distribution_rules(p_cycle uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare cy public.cycles; prev public.cycles; r public.distribution_rules; n int := 0;
begin
  select * into cy from public.cycles where id = p_cycle;
  if cy.id is null then raise exception 'Ciclo não encontrado.' using errcode = 'P0002'; end if;
  perform public.require_finance(cy.organization_id, 'finance.manage');
  if exists (select 1 from public.distribution_rules where cycle_id = cy.id and is_active) then raise exception 'Este ciclo já tem regras.' using errcode = 'P0001'; end if;
  select * into prev from public.cycles where organization_id = cy.organization_id and starts_on < cy.starts_on order by starts_on desc limit 1;
  if prev.id is null then raise exception 'Não há ciclo anterior para replicar.' using errcode = 'P0001'; end if;
  for r in select * from public.distribution_rules where cycle_id = prev.id and is_active order by priority, created_at loop
    insert into public.distribution_rules (organization_id, destination_id, mode, percent, fixed_amount, base, priority, valid_from, valid_to, is_active, cycle_id)
    values (r.organization_id, r.destination_id, r.mode, r.percent, r.fixed_amount, r.base, r.priority, cy.starts_on, null, true, cy.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.replicate_distribution_rules(uuid) from public, anon;
grant execute on function public.replicate_distribution_rules(uuid) to authenticated;
