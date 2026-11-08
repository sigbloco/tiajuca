-- Participação remunerada: vínculo só com função (como a colaborativa), marcado como remunerado.
alter table public.member_artistic_links add column if not exists is_paid boolean not null default false;
