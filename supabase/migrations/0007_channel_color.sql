-- ─────────────────────────────────────────────────────────────
-- 0007: Teamfarbe pro Kanal (Konkurrenz-Vergleich, Phase 6.3)
-- Konkurrenten stehen in public.channels mit kind = 'competitor'.
-- ─────────────────────────────────────────────────────────────
alter table public.channels add column if not exists color text;
