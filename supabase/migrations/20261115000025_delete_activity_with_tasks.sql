-- Excluir de vez um evento da lixeira falhava (erro genérico) quando ele tinha tarefas (checklist): a chave estrangeira não apaga junto.
-- Agora as tarefas do evento saem com ele. Eventos com presença registrada continuam protegidos.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.delete_activity(uuid)'::regprocedure);
  n := replace(d, '  delete from public.activities where id = a.id;', E'  delete from public.activity_checklist_items where activity_id = a.id;\n  delete from public.activities where id = a.id;');
  if n = d then raise exception 'patch delete_activity'; end if;
  execute n;
end $$;
