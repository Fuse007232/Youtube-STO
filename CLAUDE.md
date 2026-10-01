@AGENTS.md

# CLAUDE.md: YouTube-Shorts-Dashboard

Gedächtnis für Claude-Sessions. **Bei jeder Änderung an Architektur, Ordnern oder Widgets aktuell halten.**

## Projekt

Privates Dashboard für die 2 YouTube-Shorts-Kanäle des Nutzers: beide Kanäle nebeneinander, 24h-„Duell“ im Stil eines F1-Timing-Towers, Rennverlauf, Top-Shorts-Ranglisten, später YouTube-Analytics-Auswertungen. Dark Mode, flüssige Animationen.

- Kanäle: **Bra1nrotvault** (`UCJtW0caGhgqEWxNh2HcsGPg`, Kürzel BRV, YouTube-Titel „Brainrot Vault“, Stand 01.10.2026: ~103K Abos, ~213 Mio. Aufrufe, 332 Shorts) und **Granny Aura** (`UCSxDp-sHQ49VwIz0Ix9fusA`, GRA, ~28,7K Abos, ~45 Mio. Aufrufe, 101 Shorts). Zwei **verschiedene** Google-Konten (keine Brand-Konten). Nur Shorts, keine langen Videos.
- Vollständiger Plan, Phasen, Zugangsdaten, Klick-Anleitungen und Entscheidungen: **`docs/PLAN.md`**
- **Aktueller Stand:** Phase 3 fertig: Datenbank läuft, Dashboard zeigt „LIVE · DATENBANK“. `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` sind in Vercel UND in der Claude-Cloud-Umgebung gesetzt → Schnappschuss von hier testbar: `npx next start -p 3123` und `curl -H "Authorization: Bearer $CRON_SECRET" -H "x-snapshot-trigger: manual" localhost:3123/api/cron/snapshot` (Werte nie ausgeben). Nächste Phase: 4 (Zeitplaner alle 15 Min. + Schutz). Phase 1 fertig (Design abgenommen). Phase 2 fertig: echte Zahlen laufen auf Vercel (`YOUTUBE_API_KEY` ist in Vercel und in der Claude-Cloud-Umgebung eingetragen; in der Cloud erst ab einer neuen Session sichtbar). ~21 Einheiten pro Abruf. Nächste Phase: 3 (Supabase + Schnappschüsse).
- **Supabase:** Projekt `youtube-dashboard`, ID/ref `kdqxslwojkvhffhjctrv`, Region eu-central-1, URL `https://kdqxslwojkvhffhjctrv.supabase.co` (Organisation „Fuse007232's Org“). Das andere Projekt „Kanalpult“ gehört NICHT zu diesem Dashboard – nicht anfassen. Das Supabase-MCP hat Zugriff (Migrationen, SQL, Advisors); geheime Schlüssel liefert es nicht.
- **Vercel:** Projekt `youtube-sto` (Team-Scope `felixpensel3-3483s-projects`). Der Branch `claude/youtube-shorts-dashboard-c6jkd9` ist dort die **Production**-Branch. Das Vercel-MCP kann Deployments lesen (`list_deployments` mit `projectId` ohne `teamId`); team-gebundene Aufrufe (z. B. Umgebungsvariablen, `web_fetch_vercel_url`) sind nicht autorisiert. **Alle Vercel-Adressen (auch Production) sind durch „Vercel Authentication“ geschützt** → nur der eingeloggte Nutzer sieht das Dashboard; `curl` von hier liefert 302. Für Phase 4 beachten: Supabase Cron braucht dann einen „Protection Bypass for Automation“-Header oder der Schutz wird durch den eigenen Passwortschutz ersetzt.

## Zusammenarbeit (wichtig)

- Der Nutzer ist **kein Profi-Entwickler** („Vibe Coding“). Immer auf **einfachem Deutsch** erklären, Fachbegriffe kurz übersetzen.
- **Phase für Phase** arbeiten. Nach jeder Phase: Zusammenfassung (was gebaut, wie testen, was kommt). Nach jedem fertigen Schritt committen (verständliche Nachricht).
- Wenn der Nutzer gebraucht wird: anhalten, Klick-für-Klick-Anleitung geben, auf Rückmeldung warten.
- Unklar? **Fragen statt raten.**
- Arbeits-Branch: `claude/youtube-shorts-dashboard-c6jkd9`. Vercel ist mit dem Repo verbunden und baut bei jedem Push automatisch. `vercel.json` legt `framework: nextjs` fest (das Vercel-Projekt wurde angelegt, als das Repo noch leer war, und stand auf „Other“). Node-Version: `engines.node = 22.x`. `regions: ["fra1"]` (Frankfurt, nah an Supabase).

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
Screenshots zum Prüfen: `npx next start -p 3123` und Playwright (global installiert, Chromium unter `/opt/pw-browsers`; `ignoreHTTPSErrors: true`, sonst blockiert der Cloud-Proxy externe Bilder).
YouTube-Ansicht ohne echten Schlüssel testen: einen nachgebauten API-Server starten und `YOUTUBE_API_KEY=test-key YOUTUBE_API_BASE_URL=http://localhost:<port>/youtube/v3 npx next start` (die öffentlichen RSS-Feeds `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` liefern echte Titel/Aufrufe der neuesten 15 Videos ohne Kontingent). `YOUTUBE_API_BASE_URL` nie in Vercel setzen.
Achtung: Prozesse nicht mit `pkill -f …` oder einem `grep`-Muster beenden, das in derselben Befehlszeile vorkommt (trifft die eigene Shell → Exit 144). Server in einem eigenen Bash-Aufruf starten und in einem separaten Aufruf per PID beenden.

## Technik

- Next.js 16 (App Router, Turbopack) + TypeScript, Tailwind CSS 4, Recharts 3, Motion (`motion/react`, früher Framer Motion), Vitest. Supabase (Postgres) ab Phase 3, Vercel Hobby.
- **Next.js 16 hat Änderungen gegenüber älterem Wissen** (z. B. `proxy.ts` statt `middleware.ts`, async `params`/`cookies()`). Doku liegt in `node_modules/next/dist/docs/`, siehe `AGENTS.md`.
- **Zeitplaner (ab Phase 4):** Supabase Cron ruft alle 15 Min. `/api/cron/snapshot` (geschützt mit `CRON_SECRET`) auf. Grund: Vercel-Hobby-Cron nur 1×/Tag.

## Architektur

**Datenfluss:** `DataSource` (mock | youtube | database) → `buildDashboard()` rechnet aus Rohdaten (Schnappschuss-Verläufe + Shorts) die fertige `DashboardData` → Seite rendert sie serverseitig als Startwert → Browser holt jede Minute `/api/dashboard` → `DashboardDataProvider` verteilt die Daten an alle Widgets.

- `src/lib/data/types.ts`: **die** gemeinsame Datenform (`DashboardData`, `ChannelSummary`, `RankedShort`, `DataSource`).
- `src/lib/data/build-dashboard.ts`: Rohdaten → `DashboardData` (24h-Gewinne, Vortag, Bestwert, Tempo, Ranglisten). Gilt für alle Quellen.
- `src/lib/data/index.ts`: `getDataSource()` verdrahtet die Quellen; Auswahl in `resolve-kind.ts`: `DATA_SOURCE` falls gesetzt, sonst `database` (wenn `SUPABASE_URL` + `SUPABASE_SECRET_KEY`), sonst `youtube` (wenn `YOUTUBE_API_KEY`), sonst `mock`.
- `src/lib/data/database/DatabaseDataSource.ts` (Phase 3): liest 8 Tage Kanal-Verlauf + `video_rankings()` + Läufe (Kontingent). Kein Schnappschuss → Fallback YouTube direkt. Letzter Schnappschuss > 18 Min. alt → `onStale` (Selbstauslöser per `after()` → `runSnapshotIfDue`).
- `src/lib/db/`: `store.ts` (Schnittstellen `SnapshotStore`/`DashboardReader`), `SupabaseStore.ts` (Umsetzung, liest in 1000er-Seiten), `supabase.ts` (Server-Client, `server-only`), `__fixtures__/MemoryStore.ts` (Test-Datenbank, bildet die SQL-Regeln nach).
- **Kanal-Aufrufe für Gewinne/Kurven/Hochrechnung = Summe der Short-Aufrufe** (`channel_snapshots.video_views`, Migration 0002); die YouTube-Kanalstatistik `views` hinkt Stunden hinterher und dient nur als Rückfall.
- `src/lib/snapshot/run-snapshot.ts`: ein Lauf. `quick` (Kanäle + neueste 50 Uploads + Shorts der letzten 7 Tage) oder `full` (alle Shorts, höchstens stündlich); Video-Schnappschuss nur bei geänderten Aufrufen; entfernte Videos markieren; nach `full` 1× täglich verdichten. `runSnapshotIfDue` überspringt, wenn in den letzten 12 Min. schon ein Lauf startete.
- `src/app/api/cron/snapshot/route.ts`: GET/POST, `Authorization: Bearer <CRON_SECRET>`, optional `?mode=quick|full`.
- `supabase/migrations/`: SQL-Migrationen. Neue Migrationen als nächste Nummer anlegen UND per Supabase-MCP `apply_migration` ausführen (gleicher Inhalt).
- `src/lib/data/youtube/YouTubeDataSource.ts` (Phase 2): holt Kanäle + alle Uploads + Video-Statistiken (Kanäle und 50er-Pakete parallel), Zwischenspeicher pro Instanz: <10 Min. frisch, bis 1 Std. „stale-while-revalidate“ (alte Zahlen sofort, Auffrischen im Hintergrund über Next.js `after()`), `hasHistory: false` (nur aktueller Stand).
- `src/lib/youtube/`: `client.ts` (channels/playlistItems/videos, 50er-Pakete, zählt Einheiten), `parse.ts`, `errors.ts` (deutsche Fehlertexte), `quota.ts` (Tageszähler, Reset Mitternacht Pazifik). Test-Doppel: `__fixtures__/fake-youtube.ts`.
- **`historyHours`** in `DashboardData`: wie viele Stunden Verlauf es gibt. Unter 24 → Widgets beschriften „seit X Std.“ (`formatWindowLabel`).
- **`hasHistory`** in `DashboardData`: false = keine Schnappschüsse → Duell-Tower zeigt Gesamtstand, Rennverlauf zeigt Platzhalter, Top-Shorts nur „Gesamt“, Kanal-Karten ohne 24h-Werte. Neue Widgets müssen diesen Fall ebenfalls behandeln.
- `src/lib/data/mock/`: vorhersagbare Beispieldaten (fester Zufall, Upload-Plan, Tagesrhythmus, YouTube-Rundung der Abos). Bleibt dauerhaft für Design-Tests (`DATA_SOURCE=mock`).
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
src/lib/data/               Datenform, Datenquellen (mock/, youtube/), buildDashboard, resolve-kind
src/lib/youtube/            YouTube-Data-API-Client, Parser, Fehlertexte, Kontingent-Zähler
src/lib/db/                 Datenbank-Schnittstelle + Supabase-Umsetzung
src/lib/snapshot/           Schnappschuss-Lauf (quick/full, Verdichtung)
src/app/api/cron/snapshot/  Endpunkt für den Zeitplaner
supabase/migrations/        SQL-Migrationen (über Supabase-MCP angewendet)
src/components/dashboard/SetupError.tsx  Fehlerseite, wenn Daten nicht ladbar sind
src/app/loading.tsx         Ladebildschirm („Formationsrunde“, F1-Startampel)
src/lib/metrics/            Reine Rechenfunktionen + Tests
src/lib/format.ts           Deutsche Zahlen-/Zeitformate (Berliner Zeit)
src/widgets/                registry.ts, types.ts, je Widget ein Ordner
docs/PLAN.md                Projektplan
```

Geplant: `src/app/api/auth/youtube/` (Phase 5), `src/lib/alerts/` (Phase 6).

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
