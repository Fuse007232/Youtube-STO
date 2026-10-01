import { APP_CONFIG } from "@/config/app";
import { isEmailConfigured, sendEmail } from "@/lib/alerts/email";
import type { DashboardData } from "@/lib/data/types";
import type { NotificationStore } from "@/lib/db/store";
import { berlinDay } from "@/lib/metrics/calendar";
import { renderRaceReport } from "./report";

type Env = Record<string, string | undefined>;

/** Ab dieser Stunde (Berlin) geht der Rennbericht raus – mit dem ersten Zeitplaner-Lauf danach. */
export const REPORT_HOUR = 8;

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: APP_CONFIG.timeZone, hour: "numeric", hourCycle: "h23" });
const dayLabelFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_CONFIG.timeZone,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

export function reportDayLabel(t: number): string {
  return dayLabelFormat.format(t);
}

export interface RunReportOptions {
  store: Pick<NotificationStore, "claimNotification" | "finishNotification" | "releaseNotification">;
  /** Liefert die aktuellen Dashboard-Daten (erst aufgerufen, wenn der Bericht wirklich fällig ist). */
  getData: () => Promise<DashboardData>;
  now?: number;
  env?: Env;
  fetchFn?: typeof fetch;
  /** Unabhängig von Uhrzeit und „schon verschickt“ senden (Test-Knopf), ohne Vormerkung. */
  force?: boolean;
}

export interface RunReportResult {
  sent: boolean;
  key?: string;
  error?: string;
}

/** Schickt den Rennbericht einmal pro Tag (ab 8 Uhr Berlin). */
export async function runDailyReportIfDue(opts: RunReportOptions): Promise<RunReportResult | null> {
  const now = opts.now ?? Date.now();
  const env = opts.env ?? process.env;
  if (!isEmailConfigured(env)) return null;

  if (opts.force) {
    const data = await opts.getData();
    const msg = renderRaceReport(data, reportDayLabel(now));
    await sendEmail({ ...msg, subject: `[TEST] ${msg.subject}` }, env, opts.fetchFn);
    return { sent: true };
  }

  if (Number(hourFormat.format(now)) < REPORT_HOUR) return null;
  const key = `report:${berlinDay(now)}`;
  if (!(await opts.store.claimNotification({ key, kind: "report", summary: `Rennbericht ${reportDayLabel(now)}` }, now))) {
    return null;
  }
  try {
    const data = await opts.getData();
    await sendEmail(renderRaceReport(data, reportDayLabel(now)), env, opts.fetchFn);
    await opts.store.finishNotification(key, now, null);
    return { sent: true, key };
  } catch (e) {
    // Beim nächsten Lauf erneut versuchen
    await opts.store.releaseNotification(key);
    return { sent: false, key, error: e instanceof Error ? e.message : String(e) };
  }
}
