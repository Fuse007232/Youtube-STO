-- ─────────────────────────────────────────────────────────────
-- 0011: Rennbericht + Wächter (Phase 7)
-- ─────────────────────────────────────────────────────────────
-- Merkt sich jede verschickte Meldung, damit nichts doppelt kommt.
-- key z. B. „report:2026-10-02“, „removed:<video-id>“, „quota:2026-10-02“.
create table if not exists public.notifications (
  key        text primary key,
  kind       text not null check (kind in ('report', 'watch')),
  summary    text not null default '',
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
alter table public.notifications enable row level security;

-- Shorts der eigenen Kanäle, die seit p_since verschwunden sind (gelöscht/privat/gesperrt)
create or replace function public.removed_own_videos(p_since timestamptz)
returns table (id text, channel_id text, title text, removed_at timestamptz, views bigint)
language sql stable security invoker set search_path = ''
as $$
  select v.id, v.channel_id, v.title, v.removed_at, v.views
  from public.videos v
  join public.channels c on c.id = v.channel_id and c.kind = 'own'
  where v.removed_at is not null and v.removed_at >= p_since;
$$;
revoke execute on function public.removed_own_videos(timestamptz) from public, anon, authenticated;
grant execute on function public.removed_own_videos(timestamptz) to service_role;
