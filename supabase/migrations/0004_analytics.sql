-- ─────────────────────────────────────────────────────────────
-- 0004: YouTube Analytics (Phase 5)
-- Verbindungen pro Kanal (OAuth) + Analytics-Daten.
-- Refresh-Tokens liegen nur VERSCHLÜSSELT in der Datenbank
-- (AES-256-GCM, Schlüssel TOKEN_ENCRYPTION_KEY nur in Vercel).
-- ─────────────────────────────────────────────────────────────

create table public.oauth_connections (
  channel_id        text primary key references public.channels (id) on delete cascade,
  refresh_token_enc text not null,
  scopes            text not null default '',
  connected_at      timestamptz not null default now(),
  last_used_at      timestamptz,
  last_error        text
);

-- Tageswerte pro Kanal (Analytics hat 1–2 Tage Verzögerung)
create table public.analytics_daily (
  channel_id       text not null references public.channels (id) on delete cascade,
  day              date not null,
  views            bigint not null default 0,
  engaged_views    bigint,
  minutes_watched  bigint not null default 0,
  avg_view_sec     numeric not null default 0,
  avg_view_pct     numeric not null default 0,
  subs_gained      integer not null default 0,
  subs_lost        integer not null default 0,
  likes            integer not null default 0,
  shares           integer not null default 0,
  comments         integer not null default 0,
  fetched_at       timestamptz not null default now(),
  primary key (channel_id, day)
);

-- Werte pro Short über einen Zeitraum (z. B. letzte 28 Tage)
create table public.analytics_videos (
  video_id        text not null,
  channel_id      text not null references public.channels (id) on delete cascade,
  period          text not null,                 -- '28d'
  end_date        date not null,
  views           bigint not null default 0,
  minutes_watched bigint not null default 0,
  avg_view_sec    numeric not null default 0,
  avg_view_pct    numeric not null default 0,
  subs_gained     integer not null default 0,
  likes           integer not null default 0,
  shares          integer not null default 0,
  fetched_at      timestamptz not null default now(),
  primary key (video_id, period)
);
create index analytics_videos_channel_idx on public.analytics_videos (channel_id, period);

-- Aufschlüsselungen (Traffic-Quellen, Länder) über einen Zeitraum
create table public.analytics_breakdowns (
  channel_id      text not null references public.channels (id) on delete cascade,
  kind            text not null check (kind in ('traffic', 'country')),
  key             text not null,
  period          text not null,                 -- '28d'
  end_date        date not null,
  views           bigint not null default 0,
  minutes_watched bigint not null default 0,
  fetched_at      timestamptz not null default now(),
  primary key (channel_id, kind, key, period)
);

alter table public.oauth_connections    enable row level security;
alter table public.analytics_daily      enable row level security;
alter table public.analytics_videos     enable row level security;
alter table public.analytics_breakdowns enable row level security;

-- Läufe dürfen jetzt auch „analytics“ sein
alter table public.snapshot_runs drop constraint if exists snapshot_runs_mode_check;
alter table public.snapshot_runs add constraint snapshot_runs_mode_check
  check (mode in ('quick', 'full', 'compact', 'analytics'));
