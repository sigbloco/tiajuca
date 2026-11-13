-- Regência fica na seção Artística.
update public.artistic_functions set kind = 'artistic' where lower(name) in ('regência', 'regencia');
