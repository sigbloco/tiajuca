-- Condição por SEÇÃO (ex.: naipe do integrante): uma seção oculta esconde todas as perguntas dela (e elas não são exigidas no envio).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.submit_public_form(text,text,jsonb,boolean,text,uuid,jsonb)'::regprocedure);
  n := replace(d, 'v_member uuid;', 'v_member uuid; sec_hidden boolean := false;');
  if n = d then raise exception 'patch sec: declare'; end if; d := n;
  n := replace(d, E'    continue when t = ''info'';\n    cond := fld -> ''condition'';', $q$    cond := fld -> 'condition';
    if t = 'info' then
      if coalesce((fld -> 'validation' ->> 'section')::boolean, false) then
        sec_hidden := false;
        if cond is not null and jsonb_typeof(cond) = 'object' then
          pv := case when cond ->> 'field' = '_naipe' then v_section::text else clean ->> (cond ->> 'field') end;
          sec_hidden := not coalesce(case cond ->> 'op' when 'neq' then pv is distinct from (cond ->> 'value') else pv is not distinct from (cond ->> 'value') end, false);
        end if;
      end if;
      continue;
    end if;$q$);
  if n = d then raise exception 'patch sec: info'; end if; d := n;
  n := replace(d, 'continue when not vis;', 'continue when not vis or sec_hidden;');
  if n = d then raise exception 'patch sec: vis'; end if;
  execute n;
end $$;
