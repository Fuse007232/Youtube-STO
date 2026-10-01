-- ─────────────────────────────────────────────────────────────
-- 0009: Startkurve auch für Shorts, die wir erst später erfasst haben
-- ─────────────────────────────────────────────────────────────
-- Für „Aufrufe nach 24 Std.“ zählt nur ein Messpunkt kurz vor der 24-Std.-Marke
-- (≤ 2 Std. davor). Die Regel „erster Messpunkt ≤ 3 Std. nach Veröffentlichung“
-- aus 0008 hat unnötig Shorts ausgeschlossen und entfällt.
create or replace function public.video_first_day_views(p_hours integer default 24)
returns table (id text, channel_id text, published_at timestamptz, views_at bigint)
language sql stable security invoker set search_path = ''
as $$
  select v.id, v.channel_id, v.published_at, s.views
  from public.videos v
  join lateral (
    select vs.views, vs.taken_at from public.video_snapshots vs
    where vs.video_id = v.id and vs.taken_at <= v.published_at + make_interval(hours => p_hours)
    order by vs.taken_at desc limit 1
  ) s on true
  where v.removed_at is null
    and v.published_at is not null
    and v.published_at <= now() - make_interval(hours => p_hours)
    and s.taken_at >= v.published_at + make_interval(hours => p_hours) - interval '2 hours';
$$;

revoke execute on function public.video_first_day_views(integer) from public, anon, authenticated;
grant execute on function public.video_first_day_views(integer) to service_role;
