-- Listas do cadastro: agora dá para criar outras listas e mudar a ordem de todas (as 3 originais seguem não deletáveis).
create table public.form_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  kind text not null check (kind in ('system', 'custom')),
  source text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, source)
);
create table public.form_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  list_id uuid not null references public.form_lists(id) on delete cascade,
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index form_list_items_list_idx on public.form_list_items (list_id);

do $$
declare t text;
begin
  foreach t in array array['form_lists', 'form_list_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_permission(organization_id, ''forms.manage''))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.has_permission(organization_id, ''forms.manage'')) with check (public.has_permission(organization_id, ''forms.manage''))', t);
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- As listas originais entram como linhas (para terem ordem), uma vez por organização.
insert into public.form_lists (organization_id, name, kind, source, sort_order)
select o.id, v.n, 'system', v.s, v.i from public.organizations o,
  (values ('Níveis', 'skill_levels', 1), ('Gênero', 'gender_options', 2), ('Cor/raça', 'race_options', 3)) as v(n, s, i);
