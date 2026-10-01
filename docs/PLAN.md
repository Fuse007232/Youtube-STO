# Projektplan: YouTube-Shorts-Dashboard

> Stand: Phase 5 gebaut (Google-Login + YouTube Analytics). Wartet auf Google-Zugangsdaten in Vercel und das Verbinden beider Kanäle.
> Dieses Dokument wird nach jeder Phase aktualisiert (Status-Tabelle unten).

---

## 1. Überblick

**Ziel:** Eine private Web-App (Dashboard), die beide YouTube-Shorts-Kanäle auf einen Blick zeigt: im Dark Mode, modern, flüssig animiert, mit einer Duell-Ansicht im Stil eines Live-Timing-Towers aus dem Rennsport.

**Grundidee, wie die Zahlen „live“ werden:**
YouTube hat keine Echtzeit-Schnittstelle. Deshalb holt ein Hintergrund-Job alle 15 Minuten die aktuellen Zahlen und speichert sie als **Schnappschuss** (Momentaufnahme) in einer Datenbank. Alles Weitere, also 24h-Gewinne, Verlaufskurven und Ranglisten, rechnet die App selbst aus diesen Schnappschüssen aus. Das Dashboard fragt nur die eigene Datenbank ab, nie direkt YouTube. Dadurch verbraucht das Öffnen des Dashboards **kein** YouTube-Kontingent.

```
  alle 15 Min.                                  jede Minute
┌──────────────┐   holt Zahlen   ┌──────────┐  speichert  ┌──────────┐   liest   ┌───────────┐
│ Zeitplaner   │ ──────────────▶ │ YouTube  │ ──────────▶ │ Supabase │ ◀──────── │ Dashboard │
│ (Cron)       │  über unsere    │ Data API │             │ Datenbank│           │ (Browser) │
└──────────────┘  App auf Vercel └──────────┘             └──────────┘           └───────────┘
```

### Status der Phasen

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Planung (dieses Dokument) | ✅ fertig |
| 1 | Grundgerüst + Dashboard mit Beispieldaten | ✅ fertig (Design abgenommen) |
| 2 | Echte Zahlen über die YouTube Data API | ✅ fertig (Zahlen geprüft) |
| 3 | Supabase-Datenbank, Schnappschüsse, 24h-Duell | ✅ fertig (erste Schnappschüsse am 01.10.2026 ab 18:50) |
| 4 | Veröffentlichung auf Vercel (inkl. Passwortschutz und Zeitplaner) | ✅ fertig (Login aktiv, Cron seit 01.10. 19:15) |
| 5 | OAuth-Login + YouTube Analytics API | ✅ gebaut, wartet auf Google-Einrichtung + Verbinden |
| 6 | Extras (Alarm, beste Upload-Zeit, Konkurrenz) | ⏳ offen |

---

## 2. Technik und Begründung

| Baustein | Wahl | Warum / Anmerkung |
|---|---|---|
| Web-Framework | **Next.js 16** (App Router) mit **TypeScript** | Seiten und Server-Funktionen (API-Routen) in einem Projekt; läuft ideal auf Vercel. TypeScript findet Tippfehler, bevor du sie siehst. |
| Styling | **Tailwind CSS 4** | Schnell, konsistentes Dark-Mode-Design. |
| Diagramme | **Recharts 3** | Wie vorgeschlagen. |
| Animationen | **Motion** (früher „Framer Motion“) | Gleiche Bibliothek, heißt inzwischen nur anders (`motion`). |
| Datenbank | **Supabase** (Postgres) | Kostenloser Plan reicht. Wir greifen **nur vom Server** darauf zu, nie direkt aus dem Browser. Das ist sicherer, weil kein Datenbank-Schlüssel im Browser landet. |
| Hosting | **Vercel** (Hobby, kostenlos) | Automatisch neue Version bei jedem Push. |
| Zeitplaner (alle 15 Min.) | **Supabase Cron** ⚠️ *Abweichung* | Vercel erlaubt im kostenlosen Plan Cron-Jobs nur **einmal pro Tag**. Supabase Cron kann alle 15 Minuten unsere Vercel-Adresse aufrufen. Alternativen siehe unten. |
| Tests | **Vitest** | Für die Rechenlogik (24h-Gewinne, Ranglisten), damit Zahlen stimmen. |

**Alternativen zum Zeitplaner** (falls Supabase Cron Probleme macht):
- GitHub Actions (geplanter Workflow): bei privaten Repos reicht das Gratis-Kontingent nicht für alle 15 Minuten, außerdem oft verspätet.
- cron-job.org (externer Gratis-Dienst): funktioniert, ist aber ein weiterer Account.

**Kosten:** Alles läuft im Gratis-Bereich (Vercel Hobby, Supabase Free, Google API mit Tageskontingent).

---

## 3. Architektur (vorbereitet auf späteren Ausbau)

### 3.1 Widget-System (dein Wunsch: „Datei anlegen und eintragen, fertig“)

- Jedes Element im Dashboard ist ein **Widget** in einem eigenen Ordner unter `src/widgets/`.
- Jedes Widget beschreibt sich selbst: ID, Titel, Größe im Raster (klein / mittel / breit / volle Breite) und die Komponente, die es anzeigt.
- Alle Widgets stehen in **einer** zentralen Liste: `src/widgets/registry.ts`. Die Reihenfolge dort ist die Reihenfolge im Dashboard.
- Widgets holen sich ihre Daten nicht selbst bei YouTube, sondern aus einem gemeinsamen **Daten-Topf** (`useDashboardData()`), der sich jede Minute aktualisiert. So gibt es keine doppelten Abfragen.

### 3.2 Austauschbare Datenquelle

Die Widgets wissen nicht, woher die Daten kommen. Dazwischen sitzt eine „Datenquelle“ mit fester Form:
- **Phase 1:** `MockDataSource`: realistische Beispieldaten (2 Kanäle, ~40 Shorts, 7 Tage Verlauf).
- **Phase 2:** `YouTubeDataSource`: direkt von der YouTube Data API (mit Zwischenspeicher).
- **Ab Phase 3:** `DatabaseDataSource`: aus den Supabase-Schnappschüssen.

Automatische Wahl (mit `YOUTUBE_API_KEY` → `youtube`, sonst `mock`), erzwingbar per `DATA_SOURCE=mock|youtube|database`. Die Beispieldaten bleiben erhalten. Damit kann man Design-Änderungen jederzeit ohne Internet testen.

### 3.3 Geplante Ordnerstruktur

```
src/
  app/                    Seiten und Server-Routen (Next.js)
    page.tsx              Das Dashboard
    api/dashboard/        Liefert alle Dashboard-Daten (liest DB)
    api/cron/snapshot/    Wird alle 15 Min. aufgerufen, speichert Schnappschuss
    api/auth/youtube/     OAuth-Login pro Kanal (Phase 5)
  widgets/
    registry.ts           ZENTRALE Widget-Liste
    types.ts              Wie ein Widget aussehen muss
    channel-overview/     Beide Kanäle nebeneinander
    duel-tower/           24h-Duell als Timing-Tower
    trend-chart/          Verlaufskurven
    top-shorts/           Rangliste (24h / 7 Tage / gesamt)
    ...
  components/ui/          Bausteine: AnimatedCounter, Card, Tabs, ...
  lib/
    data/                 Datenquellen (mock / youtube / database)
    youtube/              YouTube Data API + Analytics API + Kontingent-Zähler
    db/                   Supabase-Zugriff
    metrics/              Reine Rechenfunktionen (24h-Gewinn, Rangliste) + Tests
    alerts/               (Phase 6) Alarm-Regeln + Benachrichtigungswege
  config/
    channels.ts           Die beiden Kanal-IDs (öffentlich, kein Geheimnis)
supabase/
  migrations/             SQL-Dateien für die Datenbank-Tabellen
docs/
  PLAN.md                 Dieser Plan
CLAUDE.md                 Gedächtnis für spätere Claude-Sessions
.env.example              Liste aller Umgebungsvariablen (leer)
```

### 3.4 Geplante Datenbank-Tabellen

| Tabelle | Inhalt | Ab Phase |
|---|---|---|
| `channels` | Kanal-ID, Name, Bild, Upload-Playlist, **`kind` = eigener Kanal oder Konkurrent** | 3 |
| `channel_snapshots` | Zeitpunkt, Abos, Gesamtaufrufe, Anzahl Videos | 3 |
| `videos` | Video-ID, Kanal, Titel, Thumbnail, Länge, Veröffentlichungszeit, ist-Short | 3 |
| `video_snapshots` | Zeitpunkt, Aufrufe, Likes, Kommentare pro Video | 3 |
| `quota_log` | Verbrauchte API-Einheiten pro Lauf | 3 |
| `oauth_connections` | Pro Kanal das (verschlüsselte) Google-Refresh-Token | 5 |
| `analytics_daily` | Tägliche Analytics-Werte pro Kanal/Video | 5 |
| `alerts` | Ausgelöste Alarme (z. B. „Short geht ab“) | 6 |

Die Spalte `kind` und die Tabelle `alerts` sind schon so geplant, dass Konkurrenz-Kanäle und Alarme später ohne Umbau dazukommen.

### 3.5 Sparsamer Umgang mit dem YouTube-Kontingent

Tageskontingent: **10.000 Einheiten**. Wir nutzen **kein** `search.list` (kostet 100 Einheiten).

| Abfrage | Kosten | Wofür |
|---|---|---|
| `channels.list` (beide Kanäle in **einer** Abfrage) | 1 | Abos, Aufrufe, Anzahl Videos, ID der Upload-Playlist |
| `playlistItems.list` (50 Videos pro Seite) | 1 pro Seite | Liste der Uploads |
| `videos.list` (bis 50 IDs pro Abfrage) | 1 pro 50 Videos | Aufrufe/Likes/Länge pro Video |

**Strategie:**
- Alle 15 Min.: Kanalzahlen (1) + neueste 50 Uploads pro Kanal (2) + Statistiken der Videos der letzten 7 Tage (~2).
- Jede Stunde: Statistiken **aller** Videos (bei 350 + 100 Shorts = 9 Abfragen).
- Einmal täglich: komplette Upload-Liste neu einlesen (Titel-Änderungen, gelöschte Videos).
- **Rechnung:** ca. 96 × 5 + 24 × 9 + 9 ≈ **700 Einheiten/Tag**, also unter 10 % des Kontingents. Genug Luft für Konkurrenz-Kanäle.
- Jeder Lauf schreibt seinen Verbrauch in `quota_log`. Das Dashboard zeigt eine kleine Kontingent-Anzeige.

### 3.6 Speicherplatz (Supabase Free = 500 MB)

Schnappschüsse wachsen schnell. Deshalb wird **verdichtet** (Fachwort: Downsampling):
- 15-Minuten-Werte: 3 Tage lang aufheben (reicht für 24h-Duell und Kurven)
- danach Stundenwerte: 30 Tage
- danach Tageswerte: für immer
- **Ausnahme:** Die ersten 48 Stunden jedes Shorts bleiben in 15-Minuten-Auflösung für immer gespeichert. Das ist die Grundlage für „Short geht ab“-Alarme und die beste Upload-Uhrzeit.

Geschätzter Bedarf: deutlich unter 100 MB pro Jahr.

### 3.7 Bekannte Einschränkungen (eingeplant)

- **Keine Echtzeit:** Schnappschüsse alle 15 Min. Zwischen zwei Schnappschüssen zeigt das Dashboard eine **Hochrechnung** (Aufrufe ticken im zuletzt gemessenen Tempo weiter, markiert mit „≈ live hochgerechnet“). **Entschieden: ja.** Abos werden nicht hochgerechnet (gerundet).
- **Gerundete Abozahlen:** Öffentlich zeigt YouTube nur 3 gültige Stellen (z. B. 12.300 statt 12.347). Bei kleinen 24h-Änderungen zeigt das Duell deshalb oft „±0“. Ab Phase 5 holen wir die **exakten** Abo-Gewinne über die Analytics API (aber mit 1–2 Tagen Verzögerung). Das Dashboard kennzeichnet beides.
- **Analytics-Verzögerung:** 1–2 Tage. Der tägliche Abruf holt deshalb immer die letzten 3 Tage neu.
- **Shorts erkennen:** Die API hat kein „ist ein Short“-Feld. **Entschieden:** Beide Kanäle laden nur Shorts hoch → alle Uploads zählen als Shorts, keine Erkennung nötig.
- **Aufrufe bei Shorts:** Seit 2025 zählt YouTube bei Shorts jede Wiedergabe (auch Wiederholungen). In der Analytics API gibt es zusätzlich „engaged views“. Wir zeigen das ab Phase 5 getrennt.

---

## 4. Die Phasen im Detail

### Phase 1: Grundgerüst + Dashboard mit Beispieldaten

**Ziel:** Du siehst früh das Design und die Animationen, ganz ohne Accounts und Schlüssel.

**Arbeitsschritte (mache ich):**
1. Next.js-Projekt mit TypeScript, Tailwind, Recharts, Motion, ESLint, Vitest anlegen.
2. `.gitignore` (inkl. aller `.env`-Dateien) und `.env.example` mit leeren Platzhaltern.
3. Widget-System (`types.ts`, `registry.ts`) und Dashboard-Raster.
4. Beispieldaten-Generator: 2 Kanäle, ~40 Shorts, 7 Tage Verlauf in 15-Min.-Schritten, leicht „lebendig“ (Zahlen ändern sich bei jeder Aktualisierung).
5. Erste Widgets:
   - **Kanal-Übersicht:** beide Kanäle nebeneinander (Abos, Gesamtaufrufe, Anzahl Videos), animiertes Hochzählen.
   - **Duell-Tower (24h):** Timing-Tower im Rennsport-Stil. Position, Kanal, Abstand („Gap“), Farbcodes (lila = Bestwert, grün = besser als zuletzt, gelb = schlechter).
   - **Verlaufskurven:** Aufrufe/Abos der letzten 24h beider Kanäle übereinander.
   - **Top-Shorts-Rangliste:** Umschalter 24h / 7 Tage / gesamt, mit Positionswechsel-Animation.
   - **Statusleiste:** „Letzte Aktualisierung vor X Min.“, Datenquelle (Beispiel/echt).
6. Automatische Aktualisierung jede Minute + animierte Zähler.
7. `CLAUDE.md` mit Anleitung „Neues Widget hinzufügen“ aktualisieren.

**Was ich alleine kann:** alles oben.
**Wo ich dich brauche:**
- Feedback zum Design.
- *Optional, aber empfohlen:* Vercel schon jetzt mit dem Repo verbinden (Anleitung D unten, ca. 5 Min.). Dann bekommst du bei jedem Push einen Vorschau-Link und kannst das Dashboard selbst anklicken, auch am Handy. Ohne Vercel schicke ich dir Screenshots, denn diese Cloud-Session hat keinen Link, den du im Browser öffnen könntest.

**Fertig, wenn:**
- `npm run build`, `npm run lint` und `npm test` laufen fehlerfrei durch. ✅
- Du hast das Dashboard gesehen (Vorschau-Link oder Screenshots) und gibst dein OK zum Design. ✅

**Ergebnis Phase 1:** Widgets `status-bar`, `channel-overview`, `duel-tower`, `trend-chart`, `top-shorts`; Beispieldaten realistisch für BRV (~102K Abos, ~350 Shorts) und GRA (~28K Abos, ~100 Shorts) inkl. YouTube-Rundung der Abos; 28 Tests.

---

### Phase 2: Echte Zahlen über die YouTube Data API

**Ziel:** Kanal-Übersicht und „Top-Shorts gesamt“ zeigen echte Zahlen.

**Arbeitsschritte (mache ich):**
1. YouTube-Baustein in `src/lib/youtube/`: `channels.list`, `playlistItems.list`, `videos.list` (50er-Pakete), mit Kontingent-Zähler.
2. Shorts-Erkennung: entfällt (beide Kanäle laden nur Shorts hoch).
3. `YouTubeDataSource` mit 10-Minuten-Zwischenspeicher (damit Neuladen kein Kontingent frisst).
4. 24h-Werte gibt es ohne Datenbank nicht. **Entscheidung beim Bauen:** statt Beispielzahlen mit echten zu mischen, zeigen die Widgets ehrlich nur echte Werte: Duell-Tower als **Gesamtstand-Duell**, Rennverlauf mit Hinweis „startet mit der Datenbank“, Top-Shorts nur „Gesamt“. Mit Phase 3 schaltet alles automatisch auf die 24h-Ansicht um (`hasHistory`).
5. Tests mit einer nachgebauten YouTube-API (funktionieren auch ohne Schlüssel).

**Wo ich dich brauche:**
- Google-Cloud-Projekt + API-Schlüssel anlegen → **Anleitung A**
- Kanal-IDs nachschauen → **Anleitung B**
- Schlüssel sicher hinterlegen → **Anleitung C** (für mich in der Cloud) und **Anleitung D** (Vercel)

**Hinweis zur Cloud-Session:** Ich habe geprüft: Diese Cloud-Umgebung erreicht die Google-APIs. Neue Umgebungsvariablen werden aber erst in einer **neuen** Session sichtbar. Ich baue Phase 2 deshalb so, dass ich sie mit Beispiel-Antworten testen kann. Den Echt-Test machen wir über die Vercel-Vorschau oder in der nächsten Session.

**Fertig, wenn:** Das Dashboard zeigt die echten Abos, Aufrufe und Video-Anzahlen beider Kanäle und die echten Top-Shorts (gesamt). Der Kontingent-Verbrauch pro Abruf wird angezeigt.

**Ergebnis Phase 2:**
- Datenquelle wird automatisch gewählt: `YOUTUBE_API_KEY` vorhanden → echte Zahlen, sonst Beispieldaten. `DATA_SOURCE=mock` erzwingt Beispieldaten.
- Ein Abruf kostet 21 Einheiten (bei 332 + 101 Shorts) und wird 10 Min. zwischengespeichert → höchstens ca. 3.000 Einheiten/Tag (pro laufender Server-Instanz). Ab Phase 3 holt nur noch der Zeitplaner Daten.
- Tempo: Abfragen laufen parallel; abgelaufene Zahlen werden sofort gezeigt und im Hintergrund aufgefrischt; beim allerersten Laden erscheint ein Ladebildschirm. Richtig schnell wird es ab Phase 3 (Dashboard liest nur noch aus der Datenbank).
- Kanalbilder und Vorschaubilder kommen direkt von YouTube; Klick auf einen Short öffnet ihn auf YouTube.
- Verständliche Fehlerseite (z. B. „Schlüssel ungültig“, „Kontingent aufgebraucht“, „API nicht aktiviert“).
- 52 Tests.

---

### Phase 3: Supabase-Datenbank, Schnappschüsse, 24h-Duell

**Ziel:** Zahlen werden gespeichert. 24h-Gewinne, Kurven und Ranglisten (24h / 7 Tage) werden aus echten Schnappschüssen berechnet.

**Arbeitsschritte (mache ich):**
1. SQL-Dateien für die Tabellen aus Abschnitt 3.4 (`supabase/migrations/`).
2. Server-Route `/api/cron/snapshot`: holt Zahlen (Strategie aus 3.5) und speichert sie. Geschützt durch ein Geheimwort (`CRON_SECRET`), damit niemand Fremdes sie auslösen kann.
3. Rechenfunktionen mit Tests: Gewinn seit 24h, Ranglisten 24h/7d, Kurvendaten.
4. Verdichtungs-Job (siehe 3.6).
5. `DatabaseDataSource` und Duell-Tower auf echte Daten umstellen.
6. Snapshots in dieser Phase **von Hand auslösen** (ich kann das aus der Cloud-Session, sobald die Schlüssel dort hinterlegt sind). Der automatische 15-Minuten-Takt kommt in Phase 4, weil er eine feste öffentliche Adresse braucht.

**Wo ich dich brauche:**
- ~~Supabase-Projekt anlegen~~ und ~~SQL ausführen~~ → hat Claude über die Supabase-Verbindung erledigt
- Geheimen Supabase-Schlüssel + `CRON_SECRET` hinterlegen (Anleitung E Schritt 5, Anleitung K, dann C + D)

**Fertig, wenn:** In Supabase unter „Table Editor“ siehst du Zeilen in `channel_snapshots` und `video_snapshots`, und das Dashboard liest aus der Datenbank. Echte 24h-Werte gibt es, sobald 24 Stunden Schnappschüsse vorliegen (also nach Phase 4).

**Ergebnis Phase 3:**
- Supabase-Projekt **youtube-dashboard** (`kdqxslwojkvhffhjctrv`, Frankfurt) – von Claude über die Supabase-Verbindung angelegt. Tabellen per Migration `supabase/migrations/0001_init.sql` (bereits ausgeführt, Anleitung F entfällt).
- Tabellen: `channels`, `channel_snapshots`, `videos`, `video_snapshots`, `snapshot_runs` (Protokoll inkl. Kontingent). RLS an, keine Policies → nur der Server-Schlüssel hat Zugriff.
- SQL-Funktionen: `video_rankings()` (24h/7d-Aufrufe je Short, „seit Messbeginn“, falls noch kein Messpunkt vor Fensterbeginn) und `compact_video_snapshots()` (Verdichtung, 1× täglich nach einem vollen Lauf).
- `/api/cron/snapshot` (geschützt mit `CRON_SECRET`): schneller Lauf (~5 Einheiten) bzw. höchstens stündlich ein voller Lauf (~20 Einheiten). Video-Schnappschüsse nur bei geänderten Aufrufen.
- **Selbstauslöser:** Ist der letzte Schnappschuss älter als 18 Min., stößt das Öffnen des Dashboards im Hintergrund einen an. Ersetzt den Zeitplaner nicht (sonst Lücken, wenn niemand schaut), sorgt aber dafür, dass schon vor Phase 4 Daten entstehen.
- Gibt es noch keinen Schnappschuss, zeigt das Dashboard solange die Zahlen direkt von YouTube.
- Widgets beschriften ehrlich „seit X Std.“, solange noch keine 24h gemessen sind.
- Vercel-Funktionen laufen in Frankfurt (`fra1`), nah an der Datenbank.
- **Kanal-Aufrufe = Summe der Short-Aufrufe** (Migration `0002`, Spalte `channel_snapshots.video_views`): Die Gesamtaufrufe der YouTube-Kanalstatistik hinken Stunden hinterher (gemessen: ~430.000 Aufrufe bei BRV), die Aufrufe der einzelnen Shorts sind fast aktuell.
- Echttest: voller Lauf 20 Einheiten (433 Shorts), schneller Lauf 5 Einheiten; `/api/cron/snapshot` ohne Geheimwort → 401.
- 70 Tests.

---

### Phase 4: Veröffentlichung auf Vercel

**Ziel:** Das Dashboard läuft dauerhaft unter einer festen Adresse, ist passwortgeschützt und sammelt automatisch alle 15 Minuten Daten.

**Entscheidung:** eigener Passwortschutz (Variante B) statt Vercel-Login.
**Feste Adresse:** https://youtube-sto.vercel.app. Diese Hauptadresse war **nicht** durch „Vercel Authentication“ geschützt, denn der Schutz gilt nur für die Vorschau-Adressen. Deshalb kam der Passwortschutz hier dringend dazu. Der Zeitplaner braucht dadurch keinen Vercel-Durchlass.

**Arbeitsschritte (gemacht):**
1. Passwortschutz:
   - `src/proxy.ts` ist der Türsteher. Login-Seite `/login` (F1-Stil), angemeldet bleiben per signiertem Cookie (30 Tage). Abmelden-Knopf oben rechts.
   - Zusätzlich prüfen Seite und `/api/dashboard` selbst. Ohne eingetragenes Passwort ist online alles gesperrt (sicherer Standard).
   - Passwort ändern meldet alle Geräte ab. Falsche Eingaben werden gebremst.
2. Zeitplaner: Migration `0003_cron_schedule.sql`. Supabase Cron (`pg_cron` + `pg_net`) ruft alle 15 Min. `GET https://youtube-sto.vercel.app/api/cron/snapshot` auf. Das Geheimwort liest er aus dem Supabase-Tresor (Vault, Name `cron_secret`), nicht aus dem Code.
3. Kein Pull Request nötig: Der Arbeits-Branch ist bei Vercel bereits die Produktions-Branch.

**Wo ich dich brauche:**
- `DASHBOARD_PASSWORD` + `SESSION_SECRET` in Vercel eintragen → **Anleitung D** (+ Anleitung K für das Geheimwort)
- `cron_secret` im Supabase-Tresor anlegen → **Anleitung G**

**Fertig, wenn:** Du öffnest https://youtube-sto.vercel.app, musst dich mit Passwort anmelden, in `snapshot_runs` erscheint alle 15 Min. ein Lauf mit `trigger = cron`, und nach 24 Stunden zeigt das Duell echte 24h-Gewinne.

**Ergebnis:** Login funktioniert (vom Nutzer bestätigt). Von außen geprüft: `/` → Login, `/api/dashboard` und `/api/cron/snapshot` ohne Berechtigung → 401. Erster automatischer Lauf am 01.10.2026 um 19:15 Uhr (HTTP 200, 5 Einheiten). Volles 24h-Duell ab 02.10.2026 ca. 18:50 Uhr.

---

### Phase 5: OAuth-Login + YouTube Analytics API

**Ziel:** Tiefere Daten: Zuschauerbindung, exakter Abo-Gewinn pro Short, Watchtime, Herkunft der Zuschauer (Länder, Traffic-Quellen), engaged views.

**Arbeitsschritte (mache ich):**
1. Einstellungsseite „Kanäle verbinden“: pro Kanal ein Knopf „Mit YouTube verbinden“.
2. OAuth-Ablauf (Fachwort für: „Google fragt dich, ob die App deine Kanal-Statistiken lesen darf“). Das Refresh-Token (eine Art Dauer-Erlaubnis) wird **verschlüsselt** in `oauth_connections` gespeichert.
3. Analytics-Abruf über den Zeitplaner höchstens alle 6 Std. (holt immer 35 Tage neu, wegen der Verzögerung) und sofort nach dem Verbinden; Knopf „Analytics jetzt abrufen“ in den Einstellungen.
4. Neue Widgets: Analytics-Übersicht (Abos netto exakt, Aufrufe, Engaged Views, Watchtime, Ø Wiedergabe, Ø angesehen + Abos pro Tag), Abo-Magneten (Abo-Gewinn pro Short, Abos/1.000 Aufrufe), Zuschauer-Herkunft (Traffic-Quellen, Länder).
5. *Später (nicht in Phase 5 gebaut):* Duell zusätzlich mit exakten Abo-Gewinnen „Stand vorgestern“; Zuschauerbindungs-Kurve pro Short (eigene Abfrage je Video).

**Wo ich dich brauche:**
- OAuth in Google Cloud einrichten → **Anleitung I**
- Beide Kanäle im Dashboard verbinden → **Anleitung J**

**Wichtig zur Cloud:** Der Google-Login braucht einen echten Browser und eine feste Rückkehr-Adresse. Das geht nicht in dieser Cloud-Session, aber problemlos über die Vercel-Adresse. Deshalb kommt Phase 5 bewusst **nach** Vercel.

**Fertig, wenn:** Beide Kanäle stehen auf „verbunden“ und die Analytics-Widgets zeigen Daten von vorgestern und früher.

**Technik (gebaut):** Migration `0004_analytics.sql` (`oauth_connections`, `analytics_daily`, `analytics_videos`, `analytics_breakdowns`), Refresh-Tokens AES-256-GCM-verschlüsselt (`TOKEN_ENCRYPTION_KEY`), signierter OAuth-„state“, Prüfung „richtiges Google-Konto für diesen Kanal?“, Einstellungsseite `/settings`, Routen `/api/auth/youtube/start|callback|disconnect`, `/api/analytics/refresh`. Analytics kostet kein Data-API-Kontingent. 97 Tests.

---

### Phase 6: Extras

Jedes Extra ist ein eigener kleiner Schritt:
1. **„Short geht ab“-Alarm:** Nach jedem Schnappschuss wird geprüft, ob ein Short in der letzten Stunde deutlich schneller wächst als üblich (verglichen mit den Startkurven deiner bisherigen Shorts). Treffer landen in `alerts` und werden dir geschickt. **Entschieden:** bevorzugt **Push aufs Handy** (Web-Push: Dashboard zum Startbildschirm hinzufügen, auf dem iPhone nötig), sonst **E-Mail** (z. B. über den Dienst Resend, Variable `RESEND_API_KEY`).
2. **Beste Upload-Uhrzeit:** Auswertung der ersten 24/48h jedes Shorts nach Wochentag und Uhrzeit (Heatmap).
3. **Konkurrenz-Vergleich:** Konkurrenz-Kanäle per ID eintragen (`kind = competitor`), gleiche Schnappschüsse, eigenes Widget.

**Wo ich dich brauche:** Push-Benachrichtigungen auf dem Handy erlauben (bzw. E-Mail-Dienst einrichten), Liste der Konkurrenz-Kanäle.

---

## 5. Alle Zugangsdaten (Umgebungsvariablen)

**Grundregel:** Kein Schlüssel kommt in den Code, ins Repo oder in den Chat. `.env`-Dateien stehen in der `.gitignore`. Die Datei `.env.example` listet nur die **Namen** (leer).

| Variable | Was ist das? | Woher? | Ab Phase | Wo eintragen? |
|---|---|---|---|---|
| `DATA_SOURCE` | Optional: `mock`, `youtube` oder `database`. Leer = automatisch (mit `YOUTUBE_API_KEY` echte Zahlen, sonst Beispieldaten) | Kein Geheimnis | 1 | nur bei Bedarf |
| `YOUTUBE_API_KEY` | Schlüssel für öffentliche YouTube-Zahlen | Anleitung A | 2 | Vercel, Claude-Umgebung |
| `SUPABASE_URL` | Adresse deiner Datenbank | Anleitung E | 3 | Vercel, Claude-Umgebung |
| `SUPABASE_SECRET_KEY` | Geheimer Server-Schlüssel der Datenbank (`sb_secret_…`) | Anleitung E | 3 | Vercel, Claude-Umgebung |
| `CRON_SECRET` | Geheimwort, damit nur dein Zeitplaner Schnappschüsse auslösen darf | Selbst erzeugen (Anleitung K) | 3 | Vercel, Claude-Umgebung, Supabase-Tresor als `cron_secret` (Anleitung G) |
| `DASHBOARD_PASSWORD` | Dein Login-Passwort fürs Dashboard | Selbst ausdenken (lang, mind. 12 Zeichen; ändern meldet alle Geräte ab) | 4 | Vercel |
| `SESSION_SECRET` | Geheimnis zum Signieren des Login-Cookies | Selbst erzeugen (Anleitung K) | 4 | Vercel |
| `GOOGLE_CLIENT_ID` | OAuth-Kennung deiner App | Anleitung I | 5 | Vercel |
| `GOOGLE_CLIENT_SECRET` | OAuth-Geheimnis deiner App | Anleitung I | 5 | Vercel |
| `TOKEN_ENCRYPTION_KEY` | Schlüssel zum Verschlüsseln der Refresh-Tokens | Selbst erzeugen (Anleitung K) | 5 | Vercel |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Schlüsselpaar für Web-Push aufs Handy | erzeuge ich, du trägst es ein | 6 | Vercel |
| `RESEND_API_KEY`, `ALERT_EMAIL_TO` | Nur falls Alarm per E-Mail | später | 6 | Vercel |

**Keine Geheimnisse (dürfen in den Code / Chat):** die beiden Kanal-IDs (`UC…`). Die stehen in `src/config/channels.ts`.

**Die drei Orte, an denen Schlüssel sicher liegen:**
1. **Vercel** → für die echte, laufende App (Anleitung D).
2. **Claude-Cloud-Umgebung** → nur damit ich in einer Session mit echten Daten testen kann (Anleitung C).
3. **Lokal** (nur falls du die App irgendwann auf deinem eigenen PC startest) → Datei `.env.local` im Projektordner, die nie ins Repo kommt.

---

## 6. Klick-für-Klick-Anleitungen

> Google, Vercel und Supabase ändern ihre Oberflächen manchmal. Wenn ein Knopf anders heißt, schick mir einen Screenshot (**ohne** sichtbare Schlüssel) und ich lotse dich durch.

### Anleitung A: Google-Cloud-Projekt + YouTube-API-Schlüssel (Phase 2)
1. Öffne https://console.cloud.google.com und melde dich mit deinem Google-Konto an.
2. Oben links neben „Google Cloud“ auf die Projektauswahl klicken → **„Neues Projekt“** → Name: `youtube-dashboard` → **„Erstellen“**. Danach sicherstellen, dass oben dieses Projekt ausgewählt ist.
3. Menü ☰ → **„APIs & Dienste“** → **„Bibliothek“** → nach **„YouTube Data API v3“** suchen → anklicken → **„Aktivieren“**.
4. Dasselbe für **„YouTube Analytics API“** (brauchen wir erst in Phase 5, schadet aber nicht).
5. Menü ☰ → **„APIs & Dienste“** → **„Anmeldedaten“** → oben **„+ Anmeldedaten erstellen“** → **„API-Schlüssel“**.
6. Beim neuen Schlüssel auf **„Schlüssel bearbeiten“** (bzw. den Namen anklicken):
   - Name: `dashboard-server`
   - **API-Einschränkungen** → „Schlüssel einschränken“ → nur **„YouTube Data API v3“** anhaken.
   - Anwendungseinschränkungen: **„Keine“** (Vercel hat wechselnde Adressen).
   - **„Speichern“**.
7. Schlüssel kopieren und **direkt** in Vercel (Anleitung D) und die Claude-Umgebung (Anleitung C) als `YOUTUBE_API_KEY` eintragen. **Nicht** in den Chat.

### Anleitung B: Kanal-IDs finden (Phase 2)
1. Auf https://studio.youtube.com den ersten Kanal öffnen (oben rechts Profilbild → „Konto wechseln“, falls nötig).
2. Links **„Einstellungen“** → **„Kanal“** → **„Erweiterte Einstellungen“** → dort steht die **Kanal-ID** (beginnt mit `UC`).
   *Alternative:* https://www.youtube.com/account_advanced
3. Für den zweiten Kanal wiederholen.
4. Die beiden IDs darfst du mir in den Chat schreiben. Sie sind öffentlich.

### Anleitung C: Schlüssel für Claude in der Cloud hinterlegen
1. In der Claude-App oben in der Titelleiste der Session das Menü der **Cloud-Umgebung** öffnen → **„Bearbeiten“ / „Edit“**.
2. Bei den **Umgebungsvariablen** je Zeile `NAME=wert` eintragen, z. B. `YOUTUBE_API_KEY=…`.
3. Speichern. **Wichtig:** Die Werte sind erst in einer **neuen** Session sichtbar. Sag mir Bescheid, dann machen wir dort weiter. Die `CLAUDE.md` sorgt dafür, dass die neue Session sofort Bescheid weiß.

### Anleitung D: Vercel einrichten + Umgebungsvariablen (Phase 1 optional / Phase 4)
1. https://vercel.com → **„Sign Up“** → **„Continue with GitHub“** → Hobby-Plan wählen.
2. **„Add New…“** → **„Project“** → bei „Import Git Repository“ das Repo **`fuse007232/youtube-sto`** wählen → **„Import“**.
   Falls es fehlt: **„Adjust GitHub App Permissions“** → Zugriff auf dieses Repo erlauben.
3. Framework erkennt Vercel automatisch (Next.js) → **„Deploy“**.
4. Umgebungsvariablen: Projekt öffnen → **„Settings“** → **„Environment Variables“** → **Key** (z. B. `YOUTUBE_API_KEY`) und **Value** eintragen → bei Environments **Production** und **Preview** anhaken → **„Save“**.
5. Nach dem Ändern von Variablen: **„Deployments“** → beim neuesten Eintrag **„⋯“** → **„Redeploy“** (sonst wirken neue Werte nicht).
6. Vorschau-Links: Jeder Push auf meinen Arbeits-Branch erzeugt eine Vorschau. Du findest sie unter „Deployments“. Vorschauen sind standardmäßig nur für dich (eingeloggt bei Vercel) sichtbar.

### Anleitung E: Supabase-Projekt anlegen (Phase 3)
1. https://supabase.com → **„Start your project“** → mit GitHub anmelden.
2. Organisation anlegen (Plan: **Free**).
3. **„New project“**: Name `youtube-dashboard`, **Database Password** über „Generate a password“ erzeugen und in deinem Passwort-Manager speichern. Region: **Central EU (Frankfurt)** → **„Create new project“**. Kurz warten.
4. Links **„Project Settings“** (Zahnrad) → **„Data API“**: **Project URL** kopieren → als `SUPABASE_URL` eintragen.
5. **„Project Settings“** → **„API Keys“** → unter **„Secret keys“** einen Schlüssel erzeugen/anzeigen (`sb_secret_…`) → als `SUPABASE_SECRET_KEY` eintragen (Vercel + Claude-Umgebung). Diesen Schlüssel niemals teilen.

### Anleitung F: SQL in Supabase ausführen (Phase 3, und bei Datenbank-Änderungen)
1. Im Supabase-Projekt links **„SQL Editor“** → **„+ New query“**.
2. Den Inhalt der Datei, die ich dir nenne (z. B. `supabase/migrations/0001_init.sql`), auf GitHub öffnen → „Raw“ / Kopieren-Knopf → in den Editor einfügen.
3. **„Run“**. Unten muss „Success“ stehen.
4. Kontrolle: links **„Table Editor“** → die neuen Tabellen sind sichtbar.

### Anleitung G: Geheimwort für den Zeitplaner im Supabase-Tresor ablegen (Phase 4)
Den Zeitplaner selbst hat Claude schon eingerichtet. Er braucht nur noch das Geheimwort.
1. https://supabase.com/dashboard → Projekt **youtube-dashboard** öffnen.
2. Links **„Integrations“** → **„Vault“** (falls nicht sichtbar: oben in der Suche „Vault“ eingeben).
3. Reiter **„Secrets“** → **„Add new secret“**.
4. **Name:** `cron_secret` (genau so, klein geschrieben).
   **Secret:** denselben Wert wie `CRON_SECRET` in Vercel.
   Beschreibung optional, z. B. „Zeitplaner Dashboard“.
5. **„Save“**.
6. Kontrolle: Nach der nächsten Viertelstunde steht in **Table Editor → `snapshot_runs`** ein neuer Lauf mit `trigger = cron`. Claude kann das auch für dich prüfen.

Falls du das `CRON_SECRET` nicht mehr hast: Erzeuge ein neues (Anleitung K), trage es in Vercel ein (dann Redeploy) und hier im Tresor.

### Anleitung H: Pull Request mergen (Phase 4 und später)
1. Ich schicke dir den Link zum Pull Request.
2. Auf GitHub unten **„Merge pull request“** → **„Confirm merge“**.
3. Vercel baut danach automatisch die Produktions-Version (dauert ca. 1–2 Min.).

### Anleitung I: OAuth in Google Cloud einrichten (Phase 5)
1. https://console.cloud.google.com → Projekt `youtube-dashboard` wählen.
2. Menü ☰ → **„APIs & Dienste“** → **„Bibliothek“** → **„YouTube Analytics API“** → **„Aktivieren“** (falls noch nicht aktiv).
3. Menü ☰ → **„APIs & Dienste“** → **„OAuth-Zustimmungsbildschirm“** (heißt evtl. **„Google Auth Platform“**) → **„Jetzt starten“**: App-Name `Mein YouTube Dashboard`, Support-E-Mail, Zielgruppe **„Extern“**, Kontakt-E-Mail → zustimmen → **„Erstellen“**.
4. **„Datenzugriff“** → **„Bereiche hinzufügen oder entfernen“** → `.../auth/yt-analytics.readonly` und `.../auth/youtube.readonly` anhaken → **„Aktualisieren“** → **„Speichern“**.
5. **„Branding“** ausfüllen (sonst ist „App veröffentlichen“ ausgegraut): Support-E-Mail, **kein Logo** (Logo erzwingt eine Google-Prüfung), Startseite `https://youtube-sto.vercel.app`, Datenschutzerklärung `https://youtube-sto.vercel.app/datenschutz`, autorisierte Domain `youtube-sto.vercel.app`, Entwickler-E-Mail → Speichern.
   Dann **„Zielgruppe“** → **„App veröffentlichen“** → Status **„In Produktion“** (sonst laufen Freigaben nach 7 Tagen ab).
   Notausgang: Status „Test“ lassen und unter „Zielgruppe → Testnutzer“ beide Google-Konten eintragen (dann alle 7 Tage neu verbinden).
6. **„Clients“** → **„+ Client erstellen“** → **„Webanwendung“**, Name `dashboard`, **Autorisierte Weiterleitungs-URI:** `https://youtube-sto.vercel.app/api/auth/youtube/callback` → **„Erstellen“**.
7. **Client-ID** und **Clientschlüssel** sofort kopieren (der Schlüssel wird evtl. nur einmal angezeigt) → in Vercel als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET`, dazu `TOKEN_ENCRYPTION_KEY` (Anleitung K) → Redeploy.

### Anleitung J: Beide Kanäle im Dashboard verbinden (Phase 5)
1. https://youtube-sto.vercel.app → oben rechts **„Einstellungen“**.
2. Bei **Bra1nrotvault** → **„Mit YouTube verbinden“**.
3. Google fragt nach dem Konto → das **Google-Konto von Bra1nrotvault** wählen (ggf. „Anderes Konto verwenden“).
4. Warnung „Google hat diese App nicht überprüft“ → **„Erweitert“** → **„Weiter zu Mein YouTube Dashboard (unsicher)“** – es ist deine eigene App.
5. Beide Häkchen (YouTube-Analytics-Berichte ansehen, YouTube-Konto ansehen) erlauben → **„Weiter“**. Zurück im Dashboard steht „✓ verbunden“.
6. Dasselbe für **Granny Aura** – diesmal mit dem **anderen Google-Konto**. Wählst du das falsche Konto, sagt das Dashboard es dir und speichert nichts.
7. Nach ca. einer Minute zeigen die Analytics-Widgets die ersten Daten.

### Anleitung K: Geheimwörter erzeugen (`CRON_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`)
Am einfachsten: Passwort-Manager → neues Passwort, **mindestens 40 Zeichen**, nur Buchstaben und Zahlen. Für jede Variable ein **eigenes**.
*(Alternative, falls du ein Terminal hast: `openssl rand -hex 32`.)*

---

## 7. Entscheidungen (deine Antworten vom 01.10.2026)

| Thema | Entscheidung |
|---|---|
| Kanäle | **Bra1nrotvault** `UCJtW0caGhgqEWxNh2HcsGPg` (~102K Abos, ~350 Shorts) · **Granny Aura** `UCSxDp-sHQ49VwIz0Ix9fusA` (~28K Abos, ~100 Shorts) |
| Google-Konten | Zwei verschiedene Google-Konten (keine Brand-Konten) → in Phase 5 je Kanal mit dem jeweiligen Konto verbinden |
| Videos | Nur Shorts → alle Uploads zählen als Shorts |
| Vorschau | Vercel ist verbunden (Anleitung D erledigt) |
| Hochrechnung | Ja, als „≈ live hochgerechnet“ markiert |
| „24 Stunden“ | Gleitend: die letzten 24h bis jetzt |
| Zeitzone | Europe/Berlin |
| Design | F1-Timing-Tower (Positionen, Abstände, lila/grün/gelb) |
| Dashboard-Schutz | Einfaches Passwort |
| Alarme (Phase 6) | Push aufs Handy, sonst E-Mail |

## 8. Offene Fragen

Aktuell keine. Neue Fragen kommen hier dazu.
