-- Categorias que o sistema usa por significado (Aluno, Músico, Senior...) ganham uma chave fixa: renomear a categoria não quebra filtros, chips nem seleção.
alter table public.fee_categories add column if not exists system_key text;
create unique index if not exists fee_categories_system_key_uq on public.fee_categories (organization_id, system_key) where system_key is not null;
update public.fee_categories set system_key = case
  when name in ('Aluno') then 'aluno'
  when name in ('Músico', 'Músico convidado') then 'musico'
  when name in ('Senior', 'Sênior') then 'senior'
  when name = 'Professor' then 'professor'
  when name = 'Monitor' then 'monitor'
  when name = 'Isento' then 'isento' end
 where system_key is null;
