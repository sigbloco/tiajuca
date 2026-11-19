-- Calendário: evento "À confirmar" (com o que falta confirmar). Independe do status (agendado/realizado/cancelado).
alter table public.activities
  add column if not exists to_confirm boolean not null default false,
  add column if not exists to_confirm_note text check (to_confirm_note is null or length(to_confirm_note) <= 200);
comment on column public.activities.to_confirm is 'Evento ainda não confirmado (data, horário ou local podem mudar): aparece com o aviso "À confirmar".';
comment on column public.activities.to_confirm_note is 'O que falta confirmar (ex.: horário, local).';
