-- ─────────────────────────────────────────────────────────────
-- 0010: Kommentar-Puls (Phase 7)
-- ─────────────────────────────────────────────────────────────

-- Gespeicherte YouTube-Kommentare (nur Hauptkommentare, keine Antworten)
create table if not exists public.comments (
  id           text primary key,                       -- YouTube-Kommentar-ID
  video_id     text not null references public.videos (id) on delete cascade,
  channel_id   text not null references public.channels (id) on delete cascade,
  author       text not null default '',
  text         text not null default '',
  likes        integer not null default 0,
  replies      integer not null default 0,
  published_at timestamptz not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists comments_channel_published_idx on public.comments (channel_id, published_at desc);
create index if not exists comments_video_likes_idx on public.comments (video_id, likes desc);
alter table public.comments enable row level security;

-- Neue Kommentare je Short in den letzten 24 Std. (aus den Video-Schnappschüssen).
-- Gibt es noch keinen Messpunkt von vor 24 Std., zählt der früheste Messpunkt.
create or replace function public.video_comment_gains(p_now timestamptz default now())
returns table (id text, channel_id text, comments_now bigint, comments_before bigint)
language sql stable security invoker set search_path = ''
as $$
  select * from (
    select
      v.id,
      v.channel_id,
      v.comments,
      coalesce(
        (select vs.comments from public.video_snapshots vs
          where vs.video_id = v.id and vs.taken_at <= p_now - interval '24 hours' and vs.comments is not null
          order by vs.taken_at desc limit 1),
        (select vs.comments from public.video_snapshots vs
          where vs.video_id = v.id and vs.comments is not null
          order by vs.taken_at asc limit 1)
      ) as before
    from public.videos v
    join public.channels c on c.id = v.channel_id and c.kind = 'own'
    where v.removed_at is null
  ) g
  where g.comments > coalesce(g.before, g.comments);
$$;
revoke execute on function public.video_comment_gains(timestamptz) from public, anon, authenticated;
grant execute on function public.video_comment_gains(timestamptz) to service_role;

-- Läufe: neue Art „comments“ (Kommentar-Abruf, zählt ins YouTube-Kontingent)
alter table public.snapshot_runs drop constraint if exists snapshot_runs_mode_check;
alter table public.snapshot_runs add constraint snapshot_runs_mode_check
  check (mode in ('quick', 'full', 'compact', 'analytics', 'comments'));
