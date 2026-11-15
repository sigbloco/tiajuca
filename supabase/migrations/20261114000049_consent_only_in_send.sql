-- O consentimento (texto de privacidade + aceite) fica só na seção fixa de Envio: some a opção "consentimento no fim da seção".
-- Quem tinha seção com consentimento passa a exigir o consentimento no Envio (forms.requires_consent).
update public.forms f set requires_consent = true
 where exists (select 1 from public.form_fields x where x.form_id = f.id and x.validation ? 'consent' and coalesce((x.validation ->> 'consent')::boolean, false));
update public.form_fields set validation = validation - 'consent' where validation ? 'consent';
