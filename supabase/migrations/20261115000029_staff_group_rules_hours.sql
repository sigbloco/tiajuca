-- Pagamento da equipe:
--  1) % de um GRUPO (Direção, Professor, Monitor…) dividida igualmente entre as pessoas dele, "do todo" ou de um naipe;
--  2) horas do mês de cada regra por hora (preenchidas sozinhas pelas aulas do Calendário; aqui fica a correção manual).

create table public.staff_group_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cycle_id uuid not null,
  group_key text not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  scope text not null default 'all' check (scope in ('all', 'section')),
  section_id uuid,
  created_at timestamptz not null default now(),
  unique (cycle_id, group_key),
  foreign key (organization_id, cycle_id) references public.cycles (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  check ((scope = 'all' and section_id is null) or (scope = 'section' and section_id is not null))
);
create table public.staff_pay_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rule_id uuid not null references public.staff_pay_rules (id) on delete cascade,
  competence date not null,
  hours numeric(6,2) not null check (hours >= 0),
  created_at timestamptz not null default now(),
  unique (rule_id, competence)
);

do $$
declare t text;
begin
  foreach t in array array['staff_group_rules', 'staff_pay_hours'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(organization_id, ''finance.read''))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(organization_id, ''finance.manage''))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(organization_id, ''finance.manage'')) with check (public.has_permission(organization_id, ''finance.manage''))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(organization_id, ''finance.manage''))', t || '_del', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;
end $$;
