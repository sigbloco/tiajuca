-- SEG-11: search_path fixo nas duas funções de gatilho que não tinham.
alter function public.set_updated_at() set search_path = '';
alter function public.enforce_member_adult() set search_path = '';

-- RPCs sem uso (nem front, nem Edge Functions, nem outras funções).
drop function public.create_member_invite(uuid, int);
drop function public.claim_member(text);
drop function public.absence_streaks(uuid, int);
drop function public.attendance_report(uuid, date, date, text);
drop function public.consecutive_absences(uuid);
drop function public.remove_member_cycle(uuid, uuid);
