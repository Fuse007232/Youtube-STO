-- ─────────────────────────────────────────────────────────────
-- 0008: Beste Upload-Uhrzeit („Boxenstrategie“, Phase 6.2)
-- ─────────────────────────────────────────────────────────────

-- Aufrufe eines Shorts nach genau p_hours Stunden (Startkurve).
-- Nur Shorts, die wir früh genug erfasst haben (erster Messpunkt ≤ 3 Std. nach
-- Veröffentlichung) und mit einem Messpunkt kurz vor der Marke (≤ 2 Std. davor).
create or replace function public.video_first_day_views(p_hours integer default 24)
returns table (id text, channel_id text, published_at timestamptz, views_at bigint)
language sql stable security invoker set search_path = ''
as $$
  select v.id, v.channel_id, v.published_at, s.views
  from public.videos v
  join lateral (
    select min(fs.taken_at) as first_at from public.video_snapshots fs where fs.video_id = v.id
  ) f on true
  join lateral (
    select vs.views, vs.taken_at from public.video_snapshots vs
    where vs.video_id = v.id and vs.taken_at <= v.published_at + make_interval(hours => p_hours)
    order by vs.taken_at desc limit 1
  ) s on true
  where v.removed_at is null
    and v.published_at is not null
    and v.published_at <= now() - make_interval(hours => p_hours)
    and f.first_at <= v.published_at + interval '3 hours'
    and s.taken_at >= v.published_at + make_interval(hours => p_hours) - interval '2 hours';
$$;

-- Wann bekommt ein Kanal seine Aufrufe? Summe der Aufrufe und der gemessenen Zeit
-- je Stunde des Tages (Berliner Zeit), aus den Kanal-Schnappschüssen der letzten p_days Tage.
create or replace function public.channel_hourly_activity(p_days integer default 14)
returns table (channel_id text, hour integer, views numeric, hours numeric)
language sql stable security invoker set search_path = ''
as $$
  with s as (
    select
      cs.channel_id,
      cs.taken_at,
      coalesce(cs.video_views, cs.views) as v,
      lag(coalesce(cs.video_views, cs.views)) over w as pv,
      lag(cs.taken_at) over w as pt
    from public.channel_snapshots cs
    where cs.taken_at > now() - make_interval(days => p_days)
    window w as (partition by cs.channel_id order by cs.taken_at)
  )
  select
    s.channel_id,
    extract(hour from ((s.pt + (s.taken_at - s.pt) / 2) at time zone 'Europe/Berlin'))::int,
    sum(s.v - s.pv)::numeric,
    (sum(extract(epoch from (s.taken_at - s.pt))) / 3600)::numeric
  from s
  where s.pv is not null and s.taken_at - s.pt <= interval '75 minutes' and s.v >= s.pv
  group by 1, 2;
$$;

revoke execute on function public.video_first_day_views(integer) from public, anon, authenticated;
revoke execute on function public.channel_hourly_activity(integer) from public, anon, authenticated;
grant execute on function public.video_first_day_views(integer) to service_role;
grant execute on function public.channel_hourly_activity(integer) to service_role;
