-- Tipo de formulário: Inscrição (avaliação, aprovação, e-mails) ou Geral (enquetes, pedidos: sem aprovação nem e-mails de resultado).
alter table public.forms add column if not exists kind text not null default 'enrollment' check (kind in ('enrollment', 'general'));
