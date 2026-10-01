-- ─────────────────────────────────────────────────────────────
-- 0002: Kanal-Aufrufe als Summe der Video-Aufrufe
-- YouTube aktualisiert die Gesamtaufrufe eines Kanals nur mit Stunden
-- Verzögerung; die Aufrufe einzelner Videos sind fast aktuell.
-- Für 24h-Gewinne, Kurven und Hochrechnung nutzen wir daher die Summe.
-- ─────────────────────────────────────────────────────────────
alter table public.channel_snapshots add column video_views bigint;

-- Vorhandene Schnappschüsse nachträglich berechnen
-- (je Video der letzte bekannte Stand zum Zeitpunkt des Schnappschusses).
update public.channel_snapshots c
set video_views = (
  select coalesce(sum(s.views), 0)
  from public.videos v
  join lateral (
    select vs.views from public.video_snapshots vs
    where vs.video_id = v.id and vs.taken_at <= c.taken_at
    order by vs.taken_at desc limit 1
  ) s on true
  where v.channel_id = c.channel_id and v.removed_at is null
)
where c.video_views is null;
