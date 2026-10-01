@AGENTS.md

# CLAUDE.md: YouTube-Shorts-Dashboard

Gedächtnis für Claude-Sessions. **Bei jeder Änderung an Architektur, Ordnern oder Widgets aktuell halten.**

## Projekt

Privates Dashboard für die 2 YouTube-Shorts-Kanäle des Nutzers: beide Kanäle nebeneinander, 24h-„Duell“ im Stil eines F1-Timing-Towers, Rennverlauf, Top-Shorts-Ranglisten, später YouTube-Analytics-Auswertungen. Dark Mode, flüssige Animationen.

- Kanäle: **Bra1nrotvault** (`UCJtW0caGhgqEWxNh2HcsGPg`, Kürzel BRV, ~102K Abos, ~350 Shorts) und **Granny Aura** (`UCSxDp-sHQ49VwIz0Ix9fusA`, GRA, ~28K Abos, ~100 Shorts). Zwei **verschiedene** Google-Konten (keine Brand-Konten). Nur Shorts, keine langen Videos.
- Vollständiger Plan, Phasen, Zugangsdaten, Klick-Anleitungen und Entscheidungen: **`docs/PLAN.md`**
- **Aktueller Stand:** Phase 1 (Dashboard mit Beispieldaten) gebaut, wartet auf Design-OK. Nächste Phase: 2 (YouTube Data API).

## Zusammenarbeit (wichtig)

- Der Nutzer ist **kein Profi-Entwickler** („Vibe Coding“). Immer auf **einfachem Deutsch** erklären, Fachbegriffe kurz übersetzen.
- **Phase für Phase** arbeiten. Nach jeder Phase: Zusammenfassung (was gebaut, wie testen, was kommt). Nach jedem fertigen Schritt committen (verständliche Nachricht).
- Wenn der Nutzer gebraucht wird: anhalten, Klick-für-Klick-Anleitung geben, auf Rückmeldung warten.
- Unklar? **Fragen statt raten.**
- Arbeits-Branch: `claude/youtube-shorts-dashboard-c6jkd9`. Vercel ist mit dem Repo verbunden und baut bei jedem Push automatisch.

## Feste Regeln

- **Keine Zugangsdaten** in Code, Repo oder Chat. Nur Umgebungsvariablen. `.env.example` mit leeren Platzhaltern pflegen; `.env*` (außer `.env.example`) steht in `.gitignore`. Dem Nutzer immer sagen, **wo** er Schlüssel sicher einträgt (Vercel → Settings → Environment Variables; Claude-Cloud-Umgebung → Edit → Umgebungsvariablen, wirkt erst in einer neuen Session).
- **Jedes Dashboard-Element ist ein Widget** (eigener Ordner) und wird zentral in `src/widgets/registry.ts` registriert.
- **YouTube-Kontingent sparen:** kein `search.list`. Uploads über die Upload-Playlist (`playlistItems.list`), Statistiken über `videos.list` mit bis zu 50 IDs pro Abfrage, beide Kanäle in einem `channels.list`-Aufruf.
- Das Dashboard liest **nur aus der eigenen Datenbank**, nie direkt live von YouTube (ab Phase 3).
- Supabase wird **nur serverseitig** angesprochen (Secret Key), nie aus dem Browser.
- Rechenlogik gehört als reine Funktion nach `src/lib/metrics/` und bekommt Tests.

## Befehle

```bash
npm run dev        # Entwicklung (http://localhost:3000)
npm run build      # Produktions-Build
npm run lint       # ESLint
npm run typecheck  # next typegen + tsc
npm test           # Vitest (src/**/*.test.ts)
```

Vor jedem Commit: `npm run lint && npm run typecheck && npm test && npm run build`.
Screenshots zum Prüfen: `npx next start -p 3123` und Playwright (global installiert, Chromium unter `/opt/pw-browsers`).
Achtung: Prozesse nicht mit `pkill -f next…` beenden (trifft die eigene Shell). Stattdessen PID per `ps aux | grep "next-serv[e]r"` holen und `kill`.

## Technik

- Next.js 16 (App Router, Turbopack) + TypeScript, Tailwind CSS 4, Recharts 3, Motion (`motion/react`, früher Framer Motion), Vitest. Supabase (Postgres) ab Phase 3, Vercel Hobby.
- **Next.js 16 hat Änderungen gegenüber älterem Wissen** (z. B. `proxy.ts` statt `middleware.ts`, async `params`/`cookies()`). Doku liegt in `node_modules/next/dist/docs/`, siehe `AGENTS.md`.
- **Zeitplaner (ab Phase 4):** Supabase Cron ruft alle 15 Min. `/api/cron/snapshot` (geschützt mit `CRON_SECRET`) auf. Grund: Vercel-Hobby-Cron nur 1×/Tag.

## Architektur

**Datenfluss:** `DataSource` (mock | youtube | database) → `buildDashboard()` rechnet aus Rohdaten (Schnappschuss-Verläufe + Shorts) die fertige `DashboardData` → Seite rendert sie serverseitig als Startwert → Browser holt jede Minute `/api/dashboard` → `DashboardDataProvider` verteilt die Daten an alle Widgets.

- `src/lib/data/types.ts`: **die** gemeinsame Datenform (`DashboardData`, `ChannelSummary`, `RankedShort`, `DataSource`).
- `src/lib/data/build-dashboard.ts`: Rohdaten → `DashboardData` (24h-Gewinne, Vortag, Bestwert, Tempo, Ranglisten). Gilt für alle Quellen.
- `src/lib/data/index.ts`: `getDataSource()` wählt die Quelle per `DATA_SOURCE` (Standard `mock`).
- `src/lib/data/mock/`: vorhersagbare Beispieldaten (fester Zufall, Upload-Plan, Tagesrhythmus, YouTube-Rundung der Abos).
- **Hochrechnung:** `useLiveChannel()` / `useLiveChannels()` im Provider: Aufrufe = letzter Schnappschuss + Tempo × vergangene Zeit (gedeckelt auf 1,5 × Intervall). Abos nie hochgerechnet.
- **Uhr:** `useNow()` tickt jede Sekunde (eigener Kontext, damit nur Nutzer neu zeichnen).
- **F1-Sektorfarben:** `src/lib/metrics/sector.ts`: lila = Bestwert im gespeicherten Verlauf, grün = besser als Vortag, gelb = schwächer, grau = kein Vergleich.
- **Vorbereitet für später:** `ChannelConfig.kind` (`own` | `competitor`), DB-Tabellen `alerts`, `oauth_connections`, `analytics_daily` (siehe PLAN §3.4).

## Ordnerstruktur

```
src/app/                    page.tsx (Dashboard), layout.tsx, globals.css (Design-Tokens)
src/app/api/dashboard/      GET → DashboardData (no-store)
src/components/dashboard/   Dashboard.tsx (Kopf + Raster), DashboardDataProvider.tsx (Daten, Uhr, Hochrechnung)
src/components/ui/          AnimatedNumber, WidgetCard, SegmentedControl, ChannelCode, LiveDot
src/config/app.ts           Zeitzone, Intervalle, Kontingent, Listenlänge
src/config/channels.ts      Kanäle (ID, Name, Kürzel, Teamfarbe, kind)
src/lib/data/               Datenform, Datenquellen, buildDashboard
src/lib/metrics/            Reine Rechenfunktionen + Tests
src/lib/format.ts           Deutsche Zahlen-/Zeitformate (Berliner Zeit)
src/widgets/                registry.ts, types.ts, je Widget ein Ordner
docs/PLAN.md                Projektplan
```

Geplant: `src/lib/youtube/` (Phase 2), `src/lib/db/` + `supabase/migrations/` (Phase 3), `src/app/api/cron/snapshot/` (Phase 3), `src/app/api/auth/youtube/` (Phase 5), `src/lib/alerts/` (Phase 6).

## Widgets

Aktuell registriert (Reihenfolge = Dashboard): `status-bar` (full), `channel-overview` (full), `duel-tower` (small), `trend-chart` (large), `top-shorts` (full).

### Neues Widget hinzufügen

1. Ordner `src/widgets/<widget-name>/` anlegen mit
   - `<Name>Widget.tsx`: Client-Komponente (`"use client"`), **ohne Props**. Daten über `useDashboardData()`, Uhr über `useNow()`, Live-Werte über `useLiveChannel(s)()`. Rahmen über `<WidgetCard title=… subtitle=… actions=…>`.
   - `index.ts`:
     ```ts
     import { defineWidget } from "../types";
     import { MeinWidget } from "./MeinWidget";
     export default defineWidget({
       id: "mein-widget",
       title: "Mein Widget",
       description: "Was es zeigt.",
       size: "medium", // small = 1/3, medium = 1/2, large = 2/3, full = ganze Breite
       component: MeinWidget,
     });
     ```
2. In `src/widgets/registry.ts` importieren und in `WIDGETS` an der gewünschten Stelle eintragen.
3. Fehlen Daten: zuerst `DashboardData` in `src/lib/data/types.ts` erweitern, dann `buildDashboard()` und **alle** Datenquellen (inkl. `mock`) anpassen. Rechenlogik nach `src/lib/metrics/` mit Test.

### Design-Regeln

- Nur Dark Mode. Farben als Tokens in `globals.css` (`bg`, `surface`, `ink`, `muted`, `sector-*`, `live`). Kanalfarben in `channels.ts` (BRV `#d95926`, GRA `#3987e5`; geprüft: kontraststark und für Farbenblinde unterscheidbar).
- Text immer in Text-Farben (`ink`/`ink-2`/`muted`), nie in der Kanalfarbe. Die Kanalfarbe sitzt als Streifen/Fläche daneben.
- Zahlen, die sich ändern: `AnimatedNumber` (Klasse `num` = gleich breite Ziffern, damit nichts wackelt).
- Diagramme: eine Y-Achse, dünne Linien (2px), Tooltip mit Fadenkreuz, Legende ab 2 Reihen, Ende der Linie direkt beschriftet.
- Animationen respektieren „Bewegung reduzieren“ (`MotionConfig reducedMotion="user"`).

## Umgebungsvariablen

Vollständige Liste mit Herkunft: `docs/PLAN.md` §5 und `.env.example`. Kurz: `DATA_SOURCE`, `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (später Push/E-Mail für Alarme).

## Cloud-Session-Hinweise

- Google-APIs, npm und Supabase (HTTPS) sind aus der Cloud erreichbar (geprüft).
- Kein Browser-Login möglich → OAuth (Phase 5) läuft über die Vercel-Adresse.
- Der Nutzer kann `localhost` der Cloud nicht öffnen → Vorschau über Vercel oder Screenshots.
