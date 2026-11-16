-- Regência não é categoria colaborativa: é uma atividade artística controlada em Naipes (atribuição de regente do naipe).
-- Quem tinha a "categoria" Regência já tem a atribuição de regente em Naipes; as ligações antigas da categoria saem, e a categoria também.
delete from public.cycle_participations cp using public.artistic_functions f where f.id = cp.function_id and f.name = 'Regência' and f.kind = 'collab';
delete from public.member_artistic_links l using public.artistic_functions f where f.id = l.function_id and f.name = 'Regência' and f.kind = 'collab';
delete from public.fee_categories c using public.artistic_functions f where f.id = c.function_id and f.name = 'Regência' and f.kind = 'collab';
delete from public.artistic_functions where name = 'Regência' and kind = 'collab';
