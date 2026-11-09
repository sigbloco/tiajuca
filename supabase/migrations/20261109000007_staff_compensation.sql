-- Cada atribuição da equipe (professor/monitor/regente) é uma colaboração remunerada ou voluntária.
-- Aparece tanto em Naipes e instrumentos quanto na ficha do integrante; a página Equipe (Financeiro) lista só as remuneradas.
alter table public.staff_assignments add column if not exists compensation text not null default 'volunteer' check (compensation in ('paid', 'volunteer'));
