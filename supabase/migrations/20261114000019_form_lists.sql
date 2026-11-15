-- Listas universais do cadastro usadas nos formulários: gênero e cor/raça (níveis já existem em skill_levels).
create table public.gender_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id), unique (organization_id, name)
);
create table public.race_options (like public.gender_options including all);
alter table public.race_options add foreign key (organization_id) references public.organizations(id);

do $$
declare t text;
begin
  foreach t in array array['gender_options', 'race_options'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_permission(organization_id, ''forms.manage''))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.has_permission(organization_id, ''forms.manage'')) with check (public.has_permission(organization_id, ''forms.manage''))', t);
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- Valores iniciais: os que o formulário de inscrição já usava.
insert into public.gender_options (organization_id, name, sort_order)
select o.id, v.n, v.i from public.organizations o,
  (values ('Feminino', 1), ('Masculino', 2), ('Não-binário', 3), ('Outro', 4), ('Prefiro não informar', 5)) as v(n, i);
insert into public.race_options (organization_id, name, sort_order)
select o.id, v.n, v.i from public.organizations o,
  (values ('Branca', 1), ('Preta', 2), ('Parda', 3), ('Amarela', 4), ('Indígena', 5), ('Prefiro não informar', 6)) as v(n, i);
