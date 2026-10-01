-- ─────────────────────────────────────────────────────────────
-- 0001_init: Grundtabellen für Schnappschüsse (Phase 3)
-- Zugriff NUR über den geheimen Server-Schlüssel (umgeht RLS).
-- RLS ist überall an und es gibt keine Policies → der öffentliche
-- Schlüssel (publishable/anon) kann nichts lesen oder schreiben.
-- ─────────────────────────────────────────────────────────────

-- Kanäle (eigene und später Konkurrenz)
create table public.channels (
  id                  text primary key,                    -- YouTube-Kanal-ID (UC…)
  name                text not null,
  code                text,                                -- F1-Kürzel, z. B. BRV
  kind                text not null default 'own' check (kind in ('own', 'competitor')),
  uploads_playlist_id text,
  avatar_url          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Kanalzahlen alle 15 Minuten (klein → wird nie verdichtet)
create table public.channel_snapshots (
  channel_id  text not null references public.channels (id) on delete cascade,
  taken_at    timestamptz not null,
  subscribers bigint not null,
  views       bigint not null,
  video_count integer not null,
  primary key (channel_id, taken_at)
);

-- Videos (Shorts) mit dem jeweils neuesten Stand
create table public.videos (
  id               text primary key,                       -- YouTube-Video-ID
  channel_id       text not null references public.channels (id) on delete cascade,
  title            text not null default '',
  published_at     timestamptz,
  thumbnail_url    text,
  duration_sec     integer not null default 0,
  is_short         boolean not null default true,
  views            bigint not null default 0,
  likes            bigint not null default 0,
  comments         bigint not null default 0,
  stats_updated_at timestamptz,
  removed_at       timestamptz,                            -- nicht mehr in der Upload-Liste
  created_at       timestamptz not null default now()
);
create index videos_channel_published_idx on public.videos (channel_id, published_at desc);

-- Videozahlen im Zeitverlauf (wird verdichtet, siehe compact_video_snapshots)
create table public.video_snapshots (
  video_id text not null references public.videos (id) on delete cascade,
  taken_at timestamptz not null,
  views    bigint not null,
  likes    bigint,
  comments bigint,
  primary key (video_id, taken_at)
);
create index video_snapshots_taken_at_idx on public.video_snapshots (taken_at);

-- Protokoll aller Läufe (Schnappschüsse, Verdichtung) inkl. API-Verbrauch
create table public.snapshot_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  mode        text not null check (mode in ('quick', 'full', 'compact')),
  trigger     text,                                        -- cron | dashboard | manual
  units       integer not null default 0,                  -- verbrauchte YouTube-Einheiten
  videos      integer not null default 0,                  -- aktualisierte Videos
  ok          boolean,
  error       text
);
create index snapshot_runs_started_idx on public.snapshot_runs (started_at desc);

alter table public.channels          enable row level security;
alter table public.channel_snapshots enable row level security;
alter table public.videos            enable row level security;
alter table public.video_snapshots   enable row level security;
alter table public.snapshot_runs     enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Rangliste: pro Short die Aufrufe gesamt, in 24h und in 7 Tagen.
-- Fehlt ein Messpunkt vor Fensterbeginn:
--   - Short ist jünger als das Fenster → Basis 0
--   - sonst → erster Messpunkt (= „seit Messbeginn“)
-- ─────────────────────────────────────────────────────────────
create or replace function public.video_rankings(p_now timestamptz default now())
returns table (
  id text, channel_id text, title text, published_at timestamptz, thumbnail_url text,
  duration_sec integer, views bigint, likes bigint, views_24h bigint, views_7d bigint
)
language sql stable security invoker set search_path = ''
as $$
  select
    v.id, v.channel_id, v.title, v.published_at, v.thumbnail_url, v.duration_sec, v.views, v.likes,
    greatest(0, v.views - coalesce(
      b24.views,
      case when v.published_at > p_now - interval '24 hours' then 0 end,
      first_s.views,
      v.views))::bigint as views_24h,
    greatest(0, v.views - coalesce(
      b7.views,
      case when v.published_at > p_now - interval '7 days' then 0 end,
      first_s.views,
      v.views))::bigint as views_7d
  from public.videos v
  left join lateral (
    select s.views from public.video_snapshots s
    where s.video_id = v.id and s.taken_at <= p_now - interval '24 hours'
    order by s.taken_at desc limit 1
  ) b24 on true
  left join lateral (
    select s.views from public.video_snapshots s
    where s.video_id = v.id and s.taken_at <= p_now - interval '7 days'
    order by s.taken_at desc limit 1
  ) b7 on true
  left join lateral (
    select s.views from public.video_snapshots s
    where s.video_id = v.id
    order by s.taken_at asc limit 1
  ) first_s on true
  where v.removed_at is null and v.is_short;
$$;

-- ─────────────────────────────────────────────────────────────
-- Verdichtung der Video-Schnappschüsse (spart Speicher):
--   jünger als 3 Tage      → alles behalten (15 Min.)
--   3 bis 30 Tage          → ein Wert pro Stunde
--   älter als 30 Tage      → ein Wert pro Tag
--   erste 48h jedes Shorts → immer alles behalten („Startkurve“)
-- ─────────────────────────────────────────────────────────────
create or replace function public.compact_video_snapshots(p_now timestamptz default now())
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  deleted integer;
begin
  with ranked as (
    select
      s.video_id, s.taken_at, v.published_at,
      row_number() over (partition by s.video_id, date_trunc('hour', s.taken_at) order by s.taken_at) as rn_hour,
      row_number() over (partition by s.video_id, date_trunc('day', s.taken_at) order by s.taken_at) as rn_day
    from public.video_snapshots s
    join public.videos v on v.id = s.video_id
    where s.taken_at < p_now - interval '3 days'
  )
  delete from public.video_snapshots d
  using ranked r
  where d.video_id = r.video_id
    and d.taken_at = r.taken_at
    and (r.published_at is null or r.taken_at >= r.published_at + interval '48 hours')
    and (
      (r.taken_at >= p_now - interval '30 days' and r.rn_hour > 1)
      or (r.taken_at < p_now - interval '30 days' and r.rn_day > 1)
    );
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- Funktionen nur für den Server-Schlüssel, nicht öffentlich
revoke execute on function public.video_rankings(timestamptz) from public, anon, authenticated;
revoke execute on function public.compact_video_snapshots(timestamptz) from public, anon, authenticated;
grant execute on function public.video_rankings(timestamptz) to service_role;
grant execute on function public.compact_video_snapshots(timestamptz) to service_role;
