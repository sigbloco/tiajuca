-- Vagas nos formulários: opções lotadas aparecem como "Esgotado - Lista de espera"; a vaga só é preenchida quando a Direção aprova
-- (quem está na lista de espera não conta). Aprovar "na lista de espera" avisa a pessoa por e-mail, sem dizer posição.
alter table public.forms add column if not exists waitlist_email_text text not null default 'Recebemos a sua inscrição e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a Direção avisa se uma vaga abrir.';
alter table public.form_send_defaults add column if not exists waitlist_email_text text not null default 'Recebemos a sua inscrição e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a Direção avisa se uma vaga abrir.';

alter table public.form_email_outbox drop constraint if exists form_email_outbox_template_check;
alter table public.form_email_outbox add constraint form_email_outbox_template_check check (template in ('submission_approved', 'submission_rejected', 'submission_waitlist'));

do $$
declare d text; n text;
begin
  -- Texto do e-mail de lista de espera no contexto de envio.
  d := pg_get_functiondef('public.form_mail_claim(int)'::regprocedure);
  n := replace(d, 'case r.template when ''submission_approved'' then fm.approved_email_text else fm.rejected_email_text end',
                  'case r.template when ''submission_approved'' then fm.approved_email_text when ''submission_waitlist'' then fm.waitlist_email_text else fm.rejected_email_text end');
  if n = d then raise exception 'form_mail_claim: trecho não encontrado'; end if;
  execute n;

  -- Aprovar: na lista de espera, guarda o instrumento esperado e manda o e-mail de lista de espera (não o de aprovação).
  d := pg_get_functiondef('public.approve_submission(uuid,text,text)'::regprocedure);
  n := replace(d, '''submission_approved'', coalesce(s.applicant_email, lower(m_email))',
                  'case when p_cycle_status = ''waitlist'' then ''submission_waitlist'' else ''submission_approved'' end, coalesce(s.applicant_email, lower(m_email))');
  if n = d then raise exception 'approve_submission (e-mail): trecho não encontrado'; end if;
  d := n;
  n := replace(d, 'perform public.set_member_cycle_status(v_member, f.cycle_id, p_cycle_status);',
                  'perform public.set_member_cycle_status(v_member, f.cycle_id, p_cycle_status, null, case when p_cycle_status = ''waitlist'' then l_inst end);');
  if n = d then raise exception 'approve_submission (status): trecho não encontrado'; end if;
  execute n;

  -- Formulário público: ids dos instrumentos lotados (ocupados >= limite no ciclo do formulário, ou no ciclo atual).
  d := pg_get_functiondef('public.get_public_form(text,text)'::regprocedure);
  n := replace(d, '''send_text'', f.send_text,',
                  '''send_text'', f.send_text, ''full_options'', (select coalesce(jsonb_agg(c.instrument_id), ''[]''::jsonb) from public.instrument_cycle_capacity c where c.organization_id = o.id and c.cycle_id = coalesce(f.cycle_id, (select cy.id from public.cycles cy where cy.organization_id = o.id and cy.is_current limit 1)) and public.instrument_occupied(c.instrument_id, c.cycle_id) >= c.capacity),');
  if n = d then raise exception 'get_public_form: trecho não encontrado'; end if;
  execute n;
end $$;
