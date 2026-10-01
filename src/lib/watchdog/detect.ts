import type { ChannelConfig } from "@/config/channels";
import type { OAuthConnectionRow, RemovedVideoRow, RunRow } from "@/lib/db/store";
import { formatDayClock, formatNumber } from "@/lib/format";
import { berlinDay } from "@/lib/metrics/calendar";
import { quotaDayKey } from "@/lib/youtube/quota";

/**
 * Wächter (Phase 7): erkennt Probleme. Jede Meldung hat einen festen Schlüssel –
 * so kommt dasselbe Problem nur einmal per E-Mail (siehe Tabelle `notifications`).
 */

export const WATCH = {
  /** Lücke zwischen zwei Schnappschüssen, ab der gemeldet wird. */
  gapMinutes: 45,
  /** Anteil des Tageskontingents, ab dem gewarnt wird. */
  quotaWarnShare: 0.8,
  /** So viele fehlgeschlagene Schnappschüsse in Folge → Meldung. */
  failedInARow: 3,
} as const;

export interface WatchIssue {
  key: string;
  title: string;
  detail: string;
}

export interface WatchInput {
  now: number;
  /** Läufe der letzten ~26 Std. (alle Arten). */
  runs: RunRow[];
  connections: OAuthConnectionRow[];
  removed: RemovedVideoRow[];
  channels: ChannelConfig[];
  dailyQuota: number;
}

const MIN = 60_000;

export function detectIssues(input: WatchInput): WatchIssue[] {
  const issues: WatchIssue[] = [];
  const name = (id: string) => input.channels.find((c) => c.id === id)?.name ?? id;
  const day = berlinDay(input.now);

  // 1) Short verschwunden (gelöscht, privat oder gesperrt)
  for (const v of input.removed) {
    issues.push({
      key: `removed:${v.id}`,
      title: `Short nicht mehr öffentlich: „${v.title}“`,
      detail: `${name(v.channelId)} · zuletzt ${formatNumber(v.views)} Aufrufe · bemerkt ${formatDayClock(v.removedAt)}. Gelöscht, auf privat gestellt oder von YouTube gesperrt? Bitte im YouTube Studio prüfen.`,
    });
  }

  // 2) YouTube-Analytics-Verbindung defekt (z. B. Freigabe abgelaufen)
  for (const c of input.connections) {
    if (!c.lastError) continue;
    issues.push({
      key: `oauth:${c.channelId}:${day}`,
      title: `Analytics-Verbindung von ${name(c.channelId)} gestört`,
      detail: `${c.lastError} – In den Einstellungen „neu verbinden“ klicken.`,
    });
  }

  // 3) Kontingent fast aufgebraucht
  const quotaDay = quotaDayKey(input.now);
  const used = input.runs.filter((r) => quotaDayKey(r.startedAt) === quotaDay).reduce((a, r) => a + r.units, 0);
  if (used >= input.dailyQuota * WATCH.quotaWarnShare) {
    issues.push({
      key: `quota:${quotaDay}`,
      title: "YouTube-Kontingent fast aufgebraucht",
      detail: `Heute schon ${formatNumber(used)} von ${formatNumber(input.dailyQuota)} Einheiten verbraucht. Neuer Tag ab 9 Uhr deutscher Zeit. Tipp: weniger Konkurrenten beobachten.`,
    });
  }

  const snaps = input.runs.filter((r) => r.mode === "quick" || r.mode === "full").sort((a, b) => a.startedAt - b.startedAt);

  // 4) Schnappschüsse schlagen mehrfach hintereinander fehl
  const lastFew = snaps.slice(-WATCH.failedInARow);
  if (lastFew.length === WATCH.failedInARow && lastFew.every((r) => r.ok === false)) {
    issues.push({
      key: `runs-failed:${day}`,
      title: "Schnappschüsse schlagen fehl",
      detail: `Die letzten ${WATCH.failedInARow} Schnappschüsse sind fehlgeschlagen (zuletzt ${formatDayClock(lastFew[lastFew.length - 1].startedAt)}). Details in Supabase → Tabelle snapshot_runs.`,
    });
  }

  // 5) Zeitplaner hatte eine Lücke (im Nachhinein erkannt)
  for (let i = 1; i < snaps.length; i++) {
    const gap = snaps[i].startedAt - snaps[i - 1].startedAt;
    if (gap > WATCH.gapMinutes * MIN) {
      issues.push({
        key: `gap:${snaps[i - 1].id}`,
        title: "Zeitplaner hatte eine Pause",
        detail: `Zwischen ${formatDayClock(snaps[i - 1].startedAt)} und ${formatDayClock(snaps[i].startedAt)} gab es keine Schnappschüsse (${Math.round(gap / MIN)} Min.). Läuft jetzt wieder.`,
      });
    }
  }

  // 6) Zeitplaner steht gerade (z. B. vom Tages-Rückfall auf Vercel erkannt)
  const last = snaps.at(-1);
  if (!last || input.now - last.startedAt > WATCH.gapMinutes * MIN) {
    issues.push({
      key: `stale:${last?.id ?? "none"}`,
      title: "Zeitplaner steht",
      detail: last
        ? `Letzter Schnappschuss ${formatDayClock(last.startedAt)}. Supabase → Integrations → Cron prüfen (Job „dashboard-snapshot“).`
        : "In den letzten 26 Std. gab es keinen Schnappschuss. Supabase → Integrations → Cron prüfen.",
    });
  }

  return issues;
}
