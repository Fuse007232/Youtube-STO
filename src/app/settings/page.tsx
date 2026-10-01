import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_CONFIG } from "@/config/app";
import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { COMPETITOR_CONFIG } from "@/config/competitors";
import { isEmailConfigured, maskEmail } from "@/lib/alerts/email";
import { isAuthenticated } from "@/lib/auth/server";
import type { NotificationRow, OAuthConnectionRow } from "@/lib/db/store";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { formatAgo, formatDate, formatDayClock } from "@/lib/format";
import { REPORT_HOUR } from "@/lib/report/run-report";
import { isOAuthConfigured } from "@/lib/youtube/oauth";

export const metadata: Metadata = { title: "Einstellungen · Shorts Live Timing" };
export const dynamic = "force-dynamic";

/** Zeitpunkt der Anfrage (Seite wird pro Aufruf frisch gerendert). */
function requestTime(): number {
  return Date.now();
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  if (!(await isAuthenticated())) redirect("/login?next=/settings");
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const error = str("error");
  const connectedId = str("connected");
  const disconnectedId = str("disconnected");
  const refreshed = str("refreshed");
  const mailed = str("mailed");
  const reported = str("reported");
  const added = str("added");
  const removed = str("removed");
  const emailReady = isEmailConfigured();
  const alertCfg = APP_CONFIG.alerts;

  const oauthReady = isOAuthConfigured();
  const dbReady = isSupabaseConfigured();
  let connections: OAuthConnectionRow[] = [];
  let competitors: ChannelConfig[] = [];
  let notifications: NotificationRow[] = [];
  let loadError: string | null = null;
  if (dbReady) {
    try {
      const store = new SupabaseStore(getSupabase());
      [connections, competitors, notifications] = await Promise.all([
        store.getConnections(),
        store.getCompetitors(),
        store.getRecentNotifications(20).catch(() => []),
      ]);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  const now = requestTime();
  const nameOf = (id?: string) => CHANNELS.find((c) => c.id === id)?.name ?? id;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="f1-heading text-[11px] text-live">Boxengasse</p>
          <h1 className="f1-heading text-2xl text-ink sm:text-3xl">Einstellungen</h1>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink"
        >
          ← Zum Dashboard
        </Link>
      </header>

      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-sector-worse/40 bg-sector-worse/10 p-4 text-sm text-ink">
          ⚠ {error}
        </p>
      ) : null}
      {connectedId ? (
        <p role="status" className="mb-4 rounded-xl border border-sector-improved/40 bg-sector-improved/10 p-4 text-sm text-ink">
          ✓ „{nameOf(connectedId)}“ ist verbunden. Die ersten Analytics-Daten werden gerade abgerufen – in etwa einer
          Minute sind sie im Dashboard.
        </p>
      ) : null}
      {disconnectedId ? (
        <p role="status" className="mb-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
          Verbindung zu „{nameOf(disconnectedId)}“ wurde getrennt.
        </p>
      ) : null}
      {added ? (
        <p role="status" className="mb-4 rounded-xl border border-sector-improved/40 bg-sector-improved/10 p-4 text-sm text-ink">
          ✓ „{added}“ wird jetzt beobachtet. Die ersten Zahlen erscheinen in ca. einer Minute in der Fahrerwertung,
          24h-Werte nach 24 Stunden.
        </p>
      ) : null}
      {removed ? (
        <p role="status" className="mb-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
          „{removed}“ wurde samt seinen Daten entfernt.
        </p>
      ) : null}
      {mailed ? (
        <p role="status" className="mb-4 rounded-xl border border-sector-improved/40 bg-sector-improved/10 p-4 text-sm text-ink">
          ✓ Test-E-Mail wurde verschickt – schau in dein Postfach (ggf. auch in den Spam-Ordner).
        </p>
      ) : null}
      {reported ? (
        <p role="status" className="mb-4 rounded-xl border border-sector-improved/40 bg-sector-improved/10 p-4 text-sm text-ink">
          ✓ Test-Rennbericht wurde verschickt – schau in dein Postfach.
        </p>
      ) : null}
      {refreshed ? (
        <p role="status" className="mb-4 rounded-xl border border-sector-improved/40 bg-sector-improved/10 p-4 text-sm text-ink">
          ✓ Analytics-Daten wurden neu abgerufen.
        </p>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface/80 p-5">
        <h2 className="f1-heading text-sm text-ink">YouTube Analytics · Kanäle verbinden</h2>
        <p className="mt-1 text-xs text-muted">
          Für exakte Abo-Gewinne, Watchtime, Zuschauerbindung und Herkunft braucht das Dashboard pro Kanal eine
          Lese-Erlaubnis von Google. Jeder Kanal wird mit <b className="text-ink-2">seinem eigenen Google-Konto</b>{" "}
          verbunden. Das Dashboard kann nur lesen, nichts verändern.
        </p>

        {!oauthReady ? (
          <p className="mt-4 rounded-xl border border-line bg-bg/40 p-4 text-sm text-ink-2">
            Google-Login ist noch nicht eingerichtet: Bitte <code>GOOGLE_CLIENT_ID</code>,{" "}
            <code>GOOGLE_CLIENT_SECRET</code> und <code>TOKEN_ENCRYPTION_KEY</code> in Vercel eintragen und neu
            veröffentlichen.
          </p>
        ) : null}
        {loadError ? <p className="mt-4 text-sm text-sector-worse">Datenbank-Fehler: {loadError}</p> : null}

        <ul className="mt-4 space-y-3">
          {CHANNELS.filter((c) => c.kind === "own").map((c) => {
            const conn = connections.find((x) => x.channelId === c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-bg/40 p-4">
                <span className="h-10 w-1.5 rounded-[2px]" style={{ backgroundColor: c.color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {c.name} <span className="font-mono text-xs text-muted">{c.code}</span>
                  </p>
                  {conn ? (
                    conn.lastError ? (
                      <p className="text-xs text-sector-worse">⚠ {conn.lastError}</p>
                    ) : (
                      <p className="text-xs text-sector-improved">
                        ● Verbunden seit {formatDate(conn.connectedAt)}
                        {conn.lastUsedAt ? (
                          <span className="text-muted"> · zuletzt abgerufen {formatAgo(conn.lastUsedAt, now)}</span>
                        ) : (
                          <span className="text-muted"> · erster Abruf läuft</span>
                        )}
                      </p>
                    )
                  ) : (
                    <p className="text-xs text-muted">○ Nicht verbunden</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {oauthReady ? (
                    <a
                      href={`/api/auth/youtube/start?channel=${encodeURIComponent(c.id)}`}
                      className="rounded-lg bg-live px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
                    >
                      {conn ? "Neu verbinden" : "Mit YouTube verbinden"}
                    </a>
                  ) : null}
                  {conn ? (
                    <form method="post" action="/api/auth/youtube/disconnect">
                      <input type="hidden" name="channel" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-line px-3 py-2 text-xs text-muted transition hover:border-line-strong hover:text-ink-2"
                      >
                        Trennen
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {connections.length > 0 ? (
          <form method="post" action="/api/analytics/refresh" className="mt-4">
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-2 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              ↻ Analytics jetzt abrufen
            </button>
            <span className="ml-3 text-xs text-muted">Läuft sonst automatisch alle 6 Stunden.</span>
          </form>
        ) : null}
      </section>

      <section id="konkurrenz" className="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface/80 p-5">
        <h2 className="f1-heading text-sm text-ink">Konkurrenz · Fahrerwertung</h2>
        <p className="mt-1 text-xs text-muted">
          Füge Shorts-Kanäle hinzu, die du beobachten willst. Es werden nur öffentliche Zahlen genutzt (Abos, Aufrufe,
          Uploads) – YouTube Analytics gibt es nur für eigene Kanäle. Pro Konkurrent werden die neuesten{" "}
          {COMPETITOR_CONFIG.maxPlaylistPages * 50} Shorts beobachtet.
        </p>

        <form method="post" action="/api/competitors/add" className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            name="query"
            required
            placeholder="Kanal-Link, @Handle oder Short-Link"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-bg/60 px-3 py-2 text-sm text-ink outline-none focus:border-ink-2"
            disabled={competitors.length >= COMPETITOR_CONFIG.maxCompetitors}
          />
          <button
            type="submit"
            disabled={competitors.length >= COMPETITOR_CONFIG.maxCompetitors}
            className="rounded-lg bg-live px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            + Hinzufügen
          </button>
        </form>
        <p className="mt-1 text-[11px] text-muted">
          Beispiele: <code>@kanalname</code>, <code>https://www.youtube.com/@kanalname</code>,{" "}
          <code>https://youtube.com/shorts/…</code>
        </p>

        {competitors.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {competitors.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg/40 px-3 py-2">
                <span className="h-6 w-1.5 rounded-[2px]" style={{ backgroundColor: c.color }} aria-hidden />
                <span className="font-mono text-xs font-bold text-ink">{c.code}</span>
                <a
                  href={`https://www.youtube.com/channel/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-ink-2 hover:text-ink"
                >
                  {c.name}
                </a>
                <form method="post" action="/api/competitors/remove">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="name" value={c.name} />
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink-2"
                  >
                    Entfernen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-[11px] text-muted">
          {competitors.length} von {COMPETITOR_CONFIG.maxCompetitors} Plätzen belegt · geschätztes YouTube-Kontingent:{" "}
          ca. {(1000 + competitors.length * COMPETITOR_CONFIG.estimatedUnitsPerDay).toLocaleString("de-DE")} von 10.000
          Einheiten pro Tag
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface/80 p-5">
        <h2 className="f1-heading text-sm text-ink">Boxenfunk · „Short geht ab“-Alarm per E-Mail</h2>
        <p className="mt-1 text-xs text-muted">
          Nach jedem Schnappschuss (alle 15 Min.) werden alle Shorts geprüft. Pro Short höchstens eine E-Mail in{" "}
          {alertCfg.cooldownHours} Stunden; mehrere Treffer kommen in einer gemeinsamen E-Mail.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-ink-2">
          <li>
            🚀 <b className="text-ink">Raketenstart:</b> Short jünger als {alertCfg.rocketMaxAgeHours} Std. schafft in der
            letzten Stunde mind. {Math.round(alertCfg.rocketShareOfChannel * 100)} % der üblichen Kanal-Aufrufe pro Stunde.
          </li>
          <li>
            📈 <b className="text-ink">Ausbruch:</b> älterer Short schafft in der letzten Stunde mind.{" "}
            {alertCfg.breakoutFactor}× seinen Stundenschnitt der 24 Stunden davor.
          </li>
          <li>
            Immer mindestens {alertCfg.minViewsPerHour.toLocaleString("de-DE")} Aufrufe pro Stunde.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg/40 p-4">
          {emailReady ? (
            <>
              <p className="flex-1 text-sm text-sector-improved">
                ● E-Mail eingerichtet · an {maskEmail(process.env.ALERT_EMAIL_TO)}
              </p>
              <form method="post" action="/api/alerts/test">
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-2 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink"
                >
                  ✉ Test-E-Mail senden
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-ink-2">
              ○ E-Mail noch nicht eingerichtet: <code>RESEND_API_KEY</code> und <code>ALERT_EMAIL_TO</code> in Vercel
              eintragen und neu veröffentlichen. Alarme erscheinen trotzdem im Dashboard („Boxenfunk“).
            </p>
          )}
        </div>
      </section>

      <section id="rennbericht" className="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface/80 p-5">
        <h2 className="f1-heading text-sm text-ink">Rennbericht & Wächter</h2>
        <ul className="mt-2 space-y-1 text-xs text-ink-2">
          <li>
            🏁 <b className="text-ink">Rennbericht:</b> jeden Morgen ab {REPORT_HOUR} Uhr per E-Mail – die letzten 24 Std. je
            Kanal, bester Short, Fahrerwertung, Alarme, Konkurrenz-Radar und Boxenstrategie.
          </li>
          <li>
            🛠️ <b className="text-ink">Wächter:</b> meldet sofort, wenn ein Short verschwindet (gelöscht/privat/gesperrt), die
            Analytics-Verbindung abläuft, das Kontingent fast leer ist, Schnappschüsse fehlschlagen oder der Zeitplaner pausiert.
            Jedes Problem nur einmal. Zusätzlich prüft Vercel 1× täglich unabhängig, ob der Zeitplaner läuft.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg/40 p-4">
          {emailReady ? (
            <>
              <p className="flex-1 text-sm text-ink-2">
                Letzter Rennbericht:{" "}
                {(() => {
                  const r = notifications.find((n) => n.kind === "report" && n.sentAt);
                  return r?.sentAt ? <b className="text-ink">{formatDayClock(r.sentAt)}</b> : <span className="text-muted">noch keiner</span>;
                })()}
              </p>
              <form method="post" action="/api/report/test">
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-2 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink"
                >
                  🏁 Rennbericht jetzt senden
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-ink-2">○ Braucht die E-Mail-Einrichtung (siehe Boxenfunk oben).</p>
          )}
        </div>
        {notifications.some((n) => n.kind === "watch") ? (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">Letzte Wächter-Meldungen</p>
            <ul className="mt-1 divide-y divide-line text-xs">
              {notifications
                .filter((n) => n.kind === "watch")
                .slice(0, 8)
                .map((n) => (
                  <li key={n.key} className="flex justify-between gap-3 py-1.5">
                    <span className="text-ink-2">{n.summary}</span>
                    <span className="shrink-0 text-muted">{formatAgo(n.createdAt, now)}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Bisher keine Wächter-Meldungen – alles im grünen Bereich.</p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface/60 p-5 text-xs text-muted">
        <h2 className="f1-heading mb-2 text-sm text-ink">Gut zu wissen</h2>
        <ul className="list-disc space-y-1 pl-4">
          <li>Analytics-Daten kommen von YouTube mit 1–2 Tagen Verzögerung.</li>
          <li>
            Beim Google-Login erscheint „Google hat diese App nicht überprüft“ – das ist deine eigene App:{" "}
            „Erweitert“ → „Weiter zu Mein YouTube Dashboard“.
          </li>
          <li>
            Erlaubnis jederzeit widerrufbar: hier „Trennen“ oder unter myaccount.google.com/permissions.
          </li>
        </ul>
      </section>
    </main>
  );
}
