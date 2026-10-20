-- Funções: algumas são fixas (não excluem nem desativam) e podem dar isenção. As categorias de contribuição passam a refletir as funções.
alter table public.artistic_functions
  add column is_fixed boolean not null default false,
  add column is_exempt boolean not null default false,
  add column exempt_locked boolean not null default false;

-- "Mestre de bateria" é a mesma coisa que Regência.
update public.artistic_functions set name = 'Regência', section_id = null where name = 'Mestre de bateria';

insert into public.artistic_functions (organization_id, name, sort_order)
select o.id, v.name, v.ord from public.organizations o,
  (values ('Professor', 2), ('Monitor', 3), ('Regência', 4), ('Músico', 5), ('Senior', 6), ('Aluno', 7), ('Redes sociais', 8), ('Apoio', 9), ('Produção', 10)) v(name, ord)
where not exists (select 1 from public.artistic_functions f where f.organization_id = o.id and lower(f.name) = lower(v.name));

update public.artistic_functions set sort_order = case name
  when 'Direção' then 1 when 'Professor' then 2 when 'Monitor' then 3 when 'Regência' then 4 when 'Músico' then 5
  when 'Senior' then 6 when 'Aluno' then 7 when 'Redes sociais' then 8 when 'Apoio' then 9 when 'Produção' then 10 else 99 end;
update public.artistic_functions set is_fixed = true where name in ('Direção', 'Regência', 'Músico'); -- Professor e Monitor não são fixos; só a isenção deles é.
update public.artistic_functions set is_exempt = true, exempt_locked = true where name in ('Direção', 'Professor', 'Monitor');
-- Fora da lista combinada: fica guardada (os vínculos existentes são mantidos), mas desativada.
update public.artistic_functions set is_active = false where name = 'Escritora';

-- Contribuições: "Isento" é o primeiro item; categorias que não são função ficam desativadas (o histórico de cobranças continua).
update public.fee_categories set name = 'Isento', sort_order = 0 where name = 'Isento (equipe)';
update public.fee_categories set is_active = false where name in ('Banda', 'Pernalta', 'Monitor');
insert into public.fee_categories (organization_id, name, sort_order)
select o.id, v.name, v.ord from public.organizations o, (values ('Regência', 20), ('Redes sociais', 21), ('Apoio', 22), ('Produção', 23)) v(name, ord)
where not exists (select 1 from public.fee_categories c where c.organization_id = o.id and lower(c.name) = lower(v.name));

-- Decisão posterior: nada é fixo; tudo é editável. Direção, Professor e Monitor continuam isentos por padrão (a caixa Isento pode ser desmarcada).
update public.artistic_functions set is_fixed = false, exempt_locked = false;
