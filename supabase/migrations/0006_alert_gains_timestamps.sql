-- ─────────────────────────────────────────────────────────────
-- 0006: video_hour_rates – wie video_hourly_gains (0005), aber zusätzlich mit
-- dem Zeitpunkt des aktuellen Stands (stats_updated_at), damit echte
-- „Aufrufe pro Stunde“ berechnet werden können.
-- Neue Funktion statt Ersetzen: kein löschender Befehl nötig.
-- (video_hourly_gains aus 0005 wird nicht mehr verwendet.)
-- ─────────────────────────────────────────────────────────────
create or replace function public.video_hour_rates(p_now timestamptz default now())
returns table (
  id text, channel_id text, title text, published_at timestamptz, thumbnail_url text,
  views_now bigint, now_at timestamptz, views_1h bigint, views_25h bigint
)
language sql stable security invoker set search_path = ''
as $$
  select
    v.id, v.channel_id, v.title, v.published_at, v.thumbnail_url,
    v.views, coalesce(v.stats_updated_at, p_now),
    h1.views, h25.views
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
  where v.removed_at is null and v.is_short;
$$;

revoke execute on function public.video_hour_rates(timestamptz) from public, anon, authenticated;
grant execute on function public.video_hour_rates(timestamptz) to service_role;
