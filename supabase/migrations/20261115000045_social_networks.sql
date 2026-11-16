-- Lista "Redes sociais": nome + modelo do endereço ({handle} = o usuário que a pessoa digita).
create table public.social_networks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null default gen_random_uuid()::text,
  name text not null,
  url_template text not null check (position('{handle}' in url_template) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
alter table public.social_networks enable row level security;
create policy social_networks_select on public.social_networks for select to authenticated using (public.is_org_member(organization_id));
create policy social_networks_insert on public.social_networks for insert to authenticated with check (public.has_permission(organization_id, 'forms.manage'));
create policy social_networks_update on public.social_networks for update to authenticated using (public.has_permission(organization_id, 'forms.manage')) with check (public.has_permission(organization_id, 'forms.manage'));
create trigger trg_audit_social_networks after insert or update on public.social_networks for each row execute function public.fn_audit();

insert into public.social_networks (organization_id, key, name, url_template, sort_order)
select o.id, v.k, v.n, v.u, v.i from public.organizations o,
  (values
    ('instagram', 'Instagram', 'https://www.instagram.com/{handle}', 1),
    ('tiktok', 'TikTok', 'https://www.tiktok.com/@{handle}', 2),
    ('youtube', 'YouTube', 'https://www.youtube.com/@{handle}', 3),
    ('facebook', 'Facebook', 'https://www.facebook.com/{handle}', 4),
    ('x', 'X (Twitter)', 'https://x.com/{handle}', 5),
    ('linkedin', 'LinkedIn', 'https://www.linkedin.com/in/{handle}', 6),
    ('threads', 'Threads', 'https://www.threads.net/@{handle}', 7),
    ('bluesky', 'Bluesky', 'https://bsky.app/profile/{handle}', 8),
    ('spotify', 'Spotify', 'https://open.spotify.com/user/{handle}', 9),
    ('soundcloud', 'SoundCloud', 'https://soundcloud.com/{handle}', 10),
    ('twitch', 'Twitch', 'https://www.twitch.tv/{handle}', 11),
    ('pinterest', 'Pinterest', 'https://www.pinterest.com/{handle}', 12)
  ) as v(k, n, u, i);

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.purge_trashed(text,uuid)'::regprocedure);
  n := replace(d, 'when ''skill_levels'' then ''forms.manage''', 'when ''social_networks'' then ''forms.manage'' when ''skill_levels'' then ''forms.manage''');
  if n = d then raise exception 'patch purge_trashed'; end if;
  execute n;
end $$;
