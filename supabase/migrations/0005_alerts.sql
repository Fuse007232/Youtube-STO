-- ─────────────────────────────────────────────────────────────
-- 0005: „Short geht ab“-Alarme (Phase 6)
-- ─────────────────────────────────────────────────────────────

create table public.alerts (
  id              bigint generated always as identity primary key,
  video_id        text not null references public.videos (id) on delete cascade,
  channel_id      text not null references public.channels (id) on delete cascade,
  kind            text not null check (kind in ('rocket', 'breakout')),
  detected_at     timestamptz not null default now(),
  views_last_hour bigint not null,
  baseline_hour   numeric,              -- Vergleichswert (Stundenschnitt)
  views_total     bigint not null,
  emailed_at      timestamptz,
  email_error     text
);
create index alerts_detected_idx on public.alerts (detected_at desc);
create index alerts_video_idx on public.alerts (video_id, detected_at desc);
alter table public.alerts enable row level security;

-- Pro Short: Aufrufe jetzt, vor 1 Stunde und vor 25 Stunden (letzter Messpunkt davor).
create or replace function public.video_hourly_gains(p_now timestamptz default now())
returns table (
  id text, channel_id text, title text, published_at timestamptz, thumbnail_url text,
  views_now bigint, views_1h bigint, views_25h bigint, first_seen timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select
    v.id, v.channel_id, v.title, v.published_at, v.thumbnail_url, v.views,
    h1.views, h25.views, f.taken_at
  from public.videos v
  left join lateral (
    select s.views from public.video_snapshots s
    where s.video_id = v.id and s.taken_at <= p_now - interval '1 hour'
    order by s.taken_at desc limit 1
  ) h1 on true
  left join lateral (
    select s.views from public.video_snapshots s
    where s.video_id = v.id and s.taken_at <= p_now - interval '25 hours'
    order by s.taken_at desc limit 1
  ) h25 on true
  left join lateral (
    select s.taken_at from public.video_snapshots s
    where s.video_id = v.id order by s.taken_at asc limit 1
  ) f on true
  where v.removed_at is null and v.is_short;
$$;

revoke execute on function public.video_hourly_gains(timestamptz) from public, anon, authenticated;
grant execute on function public.video_hourly_gains(timestamptz) to service_role;
