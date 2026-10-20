-- Equipe de naipe/subnaipe/instrumento: além de professor e monitor, também há o regente.
alter type public.staff_kind add value if not exists 'regente';
