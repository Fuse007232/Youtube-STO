-- ─────────────────────────────────────────────────────────────
-- 0012: Produktion („Boxengasse“, Phase 9)
-- ─────────────────────────────────────────────────────────────

-- Geplante / vorproduzierte Shorts. day = geplanter Veröffentlichungstag (Berliner Datum);
-- leer = Ideen-Parkplatz (noch kein Tag).
create table if not exists public.production_items (
  id         bigint generated always as identity primary key,
  channel_id text not null references public.channels (id) on delete cascade,
  day        date,
  title      text not null default '',
  status     text not null default 'idea' check (status in ('idea', 'produced', 'scheduled', 'published')),
  note       text not null default '',
  link       text,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists production_items_day_idx on public.production_items (day);
alter table public.production_items enable row level security;

-- Tagesziel je Kanal (Shorts pro Tag)
create table if not exists public.production_targets (
  channel_id text primary key references public.channels (id) on delete cascade,
  per_day    integer not null default 1 check (per_day between 0 and 10),
  updated_at timestamptz not null default now()
);
alter table public.production_targets enable row level security;
