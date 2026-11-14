-- "Nível" deixa de ser um catálogo nas configurações: vira uma pergunta comum com opções, criada no formulário.
-- Perguntas que usavam o catálogo de níveis ficam com as opções escritas (copiadas do catálogo) e sem ligação com o cadastro.
update public.form_fields x
   set options = coalesce((
         select jsonb_agg(jsonb_build_object('value', lower(regexp_replace(translate(l.name, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[^a-zA-Z0-9]+', '_', 'g')), 'label', l.name) order by l.sort_order, l.name)
           from public.skill_levels l where l.organization_id = x.organization_id and l.is_active), '[]'::jsonb),
       member_mapping = null
 where x.member_mapping = 'link.skill_level';

-- Sem limite de respostas.
update public.forms set max_responses = null where max_responses is not null;
