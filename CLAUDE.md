# CLAUDE.md: YouTube-Shorts-Dashboard

Gedächtnis für Claude-Sessions. **Bei jeder Änderung an Architektur, Ordnern oder Widgets aktuell halten.**

## Projekt

Privates Dashboard für die 2 YouTube-Shorts-Kanäle des Nutzers: beide Kanäle nebeneinander, 24h-„Duell“ im Stil eines Rennsport-Timing-Towers, Top-Shorts-Ranglisten, später YouTube-Analytics-Auswertungen. Dark Mode, flüssige Animationen.

- Vollständiger Plan, Phasen, Zugangsdaten und Klick-Anleitungen: **`docs/PLAN.md`**
- Aktueller Stand: **Phase 0 (Planung) fertig**, wartet auf OK des Nutzers. Noch kein App-Code.

## Zusammenarbeit (wichtig)

- Der Nutzer ist **kein Profi-Entwickler** („Vibe Coding“). Immer auf **einfachem Deutsch** erklären, Fachbegriffe kurz übersetzen.
- **Phase für Phase** arbeiten. Nach jeder Phase: Zusammenfassung (was gebaut, wie testen, was kommt). Nach jedem fertigen Schritt committen (verständliche Nachricht).
- Wenn der Nutzer gebraucht wird: anhalten, Klick-für-Klick-Anleitung geben, auf Rückmeldung warten.
- Unklar? **Fragen statt raten.**
- Arbeits-Branch: `claude/youtube-shorts-dashboard-c6jkd9`. Produktion = `main` (nur per Pull Request, den der Nutzer mergt).

## Feste Regeln

- **Keine Zugangsdaten** in Code, Repo oder Chat. Nur Umgebungsvariablen. `.env.example` mit leeren Platzhaltern pflegen; `.env*` steht in `.gitignore`. Dem Nutzer immer sagen, **wo** er Schlüssel sicher einträgt (Vercel → Settings → Environment Variables; Claude-Cloud-Umgebung → Edit → Umgebungsvariablen, wirkt erst in einer neuen Session).
- **Jedes Dashboard-Element ist ein Widget** (eigene Datei/Ordner) und wird zentral in `src/widgets/registry.ts` registriert.
- **YouTube-Kontingent sparen:** kein `search.list`. Uploads über die Upload-Playlist (`playlistItems.list`), Statistiken über `videos.list` mit bis zu 50 IDs pro Abfrage, beide Kanäle in einem `channels.list`-Aufruf.
- Das Dashboard liest **nur aus der eigenen Datenbank**, nie direkt live von YouTube (ab Phase 3).
- Supabase wird **nur serverseitig** angesprochen (Secret Key), nie aus dem Browser.

## Architektur (geplant, siehe docs/PLAN.md §3)

- **Stack:** Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, Recharts 3, Motion (`motion/react`, früher Framer Motion), Supabase (Postgres), Vercel Hobby, Vitest.
- **Zeitplaner:** Supabase Cron ruft alle 15 Min. `/api/cron/snapshot` (geschützt mit `CRON_SECRET`) auf. Grund: Vercel-Hobby-Cron nur 1×/Tag.
- **Datenquellen-Schicht** (`src/lib/data/`): `mock` | `youtube` | `database`, umschaltbar per `DATA_SOURCE`. Widgets kennen nur die gemeinsame Form der Daten (`useDashboardData()`).
- **Schnappschüsse:** `channel_snapshots`, `video_snapshots`; 24h-/7d-Werte werden daraus berechnet (`src/lib/metrics/`, mit Tests). Verdichtung: 15 Min. → 3 Tage, stündlich → 30 Tage, täglich → immer; erste 48h jedes Shorts bleiben in 15-Min.-Auflösung.
- **Vorbereitet für später:** `channels.kind` (`own` | `competitor`), Tabelle `alerts`, `oauth_connections` (verschlüsselte Refresh-Tokens), `analytics_daily`.

## Ordnerstruktur (geplant)

```
src/app/            Seiten + API-Routen (dashboard, cron/snapshot, auth/youtube)
src/widgets/        Ein Ordner pro Widget + registry.ts + types.ts
src/components/ui/  Wiederverwendbare Bausteine (AnimatedCounter, Card, ...)
src/lib/data/       Datenquellen (mock / youtube / database)
src/lib/youtube/    Data API + Analytics API + Kontingent-Zähler
src/lib/db/         Supabase-Zugriff
src/lib/metrics/    Reine Rechenfunktionen + Tests
src/config/         channels.ts (Kanal-IDs, öffentlich)
supabase/migrations SQL-Dateien (Nutzer führt sie im Supabase SQL Editor aus)
docs/PLAN.md        Projektplan
```

## Neues Widget hinzufügen (geplanter Ablauf, wird in Phase 1 konkretisiert)

1. Ordner `src/widgets/<widget-name>/` mit einer Datei anlegen, die die Widget-Beschreibung exportiert (ID, Titel, Größe, Komponente).
2. In `src/widgets/registry.ts` importieren und in die Liste eintragen. Position in der Liste = Position im Dashboard.
3. Daten über `useDashboardData()` lesen. Fehlen Daten, zuerst die Datenquellen-Form in `src/lib/data/` erweitern (in allen Quellen inkl. `mock`).

## Umgebungsvariablen

Vollständige Liste mit Herkunft: `docs/PLAN.md` §5. Kurz: `DATA_SOURCE`, `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`.

## Cloud-Session-Hinweise

- Google-APIs, npm und Supabase (HTTPS) sind aus der Cloud erreichbar (geprüft in Phase 0).
- Kein Browser-Login möglich → OAuth (Phase 5) läuft über die Vercel-Adresse.
- Der Nutzer kann `localhost` der Cloud nicht öffnen → Vorschau über Vercel-Preview oder Screenshots (Playwright/Chromium ist vorinstalliert).
