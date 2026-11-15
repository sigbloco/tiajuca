-- Categoria de Financeiro (fee_categories) passa a apontar para a categoria de Organização (artistic_functions) pelo id, não pelo nome:
-- renomear uma delas atualiza a outra pela ligação, e a chave de significado (system_key) fica uma só por categoria.
alter table public.fee_categories add column if not exists function_id uuid references public.artistic_functions(id) on delete set null;
create unique index if not exists fee_categories_function_uq on public.fee_categories (function_id) where function_id is not null;
update public.fee_categories c set function_id = f.id
  from (select distinct on (organization_id, name) id, organization_id, name from public.artistic_functions
         order by organization_id, name, case kind when 'artistic' then 1 when 'collab' then 2 else 3 end) f
 where c.function_id is null and f.organization_id = c.organization_id and f.name = c.name
   and not exists (select 1 from public.fee_categories x where x.function_id = f.id);
