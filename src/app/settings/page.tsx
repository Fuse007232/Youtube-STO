import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_CONFIG } from "@/config/app";
import { CHANNELS } from "@/config/channels";
import { isEmailConfigured, maskEmail } from "@/lib/alerts/email";
import { isAuthenticated } from "@/lib/auth/server";
import type { OAuthConnectionRow } from "@/lib/db/store";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { formatAgo, formatDate } from "@/lib/format";
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
  const emailReady = isEmailConfigured();
  const alertCfg = APP_CONFIG.alerts;

  const oauthReady = isOAuthConfigured();
  const dbReady = isSupabaseConfigured();
  let connections: OAuthConnectionRow[] = [];
  let loadError: string | null = null;
  if (dbReady) {
    try {
      connections = await new SupabaseStore(getSupabase()).getConnections();
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
      {mailed ? (
        <p role="status" className="mb-4 rounded-xl border border-sector-improved/40 bg-sector-improved/10 p-4 text-sm text-ink">
          ✓ Test-E-Mail wurde verschickt – schau in dein Postfach (ggf. auch in den Spam-Ordner).
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
