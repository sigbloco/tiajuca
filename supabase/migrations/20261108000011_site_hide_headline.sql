-- Site · o título da página inicial pode ficar escondido (a logo basta); o texto continua no código da página, para buscadores e leitores de tela.
alter table public.site_settings add column hide_headline boolean not null default false;
