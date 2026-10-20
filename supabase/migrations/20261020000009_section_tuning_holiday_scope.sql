-- Naipe: se os instrumentos têm afinação (Bb, Eb…); Feriado: nacional, estadual ou municipal (RJ).
alter table public.sections add column has_tuning boolean not null default true;
update public.sections set has_tuning = false where name ~* 'percuss|perform';
alter table public.holidays add column scope text not null default 'national' check (scope in ('national', 'state', 'city'));
