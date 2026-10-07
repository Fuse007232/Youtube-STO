import { APP_CONFIG } from "@/config/app";
import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { isEmailConfigured, sendEmail } from "@/lib/alerts/email";
import type { TrackerView } from "@/lib/data/types";
import type { NotificationStore } from "@/lib/db/store";
import { berlinDay } from "@/lib/metrics/calendar";
import { reminderLines, type ReminderLine } from "@/lib/metrics/production";

type Env = Record<string, string | undefined>;

/**
 * Produktions-Erinnerung (Phase 9): Ab 18 Uhr (Berlin) einmal am Tag prüfen, ob für
 * heute noch ein Short fehlt oder fertig, aber noch nicht hochgeladen/eingeplant ist.
 * Läuft am Ende jedes Zeitplaner-Laufs; der Schlüssel `prod-reminder:<Tag>` sorgt
 * dafür, dass höchstens eine Mail pro Tag kommt.
 */
export const REMINDER_HOUR = 18;

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: APP_CONFIG.timeZone, hour: "numeric", hourCycle: "h23" });
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function lineText(l: ReminderLine): string {
  const parts: string[] = [];
  if (l.missing) parts.push(`${l.missing} Short${l.missing === 1 ? "" : "s"} fehl${l.missing === 1 ? "t" : "en"} noch`);
  if (l.toUpload) parts.push(`${l.toUpload} fertig, aber noch nicht hochgeladen/eingeplant`);
  return parts.join(" · ");
}

export function renderReminder(lines: ReminderLine[], channels: ChannelConfig[] = CHANNELS) {
  const url = `${APP_CONFIG.publicUrl}/produktion`;
  const name = (id: string) => channels.find((c) => c.id === id);
  const missing = lines.reduce((s, l) => s + l.missing, 0);
  const subject =
    missing > 0
      ? `⏰ Heute fehl${missing === 1 ? "t" : "en"} noch ${missing} Short${missing === 1 ? "" : "s"}: ${lines.filter((l) => l.missing).map((l) => name(l.channelId)?.code ?? "?").join(", ")}`
      : "⏰ Fertige Shorts warten noch aufs Hochladen";
  const text = [
    "Boxengasse – Stand 18 Uhr:",
    "",
    ...lines.map((l) => `${name(l.channelId)?.name ?? l.channelId}: ${lineText(l)}`),
    "",
    `Produktionsplan: ${url}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;color:#111">
<p style="color:#e10600;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:.06em;margin:0">Boxengasse</p>
<h2 style="margin:4px 0 12px">Heute ist noch was offen</h2>
${lines
  .map((l) => {
    const c = name(l.channelId);
    return `<div style="display:flex;gap:10px;align-items:center;margin:8px 0"><span style="display:inline-block;width:5px;height:30px;border-radius:2px;background:${c?.color ?? "#999"}"></span><div><b>${escape(c?.name ?? l.channelId)}</b><br><span style="font-size:13px;color:#4b5563">${escape(lineText(l))}</span></div></div>`;
  })
  .join("")}
<p style="font-size:13px;margin-top:16px"><a href="${url}" style="color:#e10600;font-weight:700">Zum Produktionsplan →</a></p>
</div>`;
  return { subject, text, html };
}

export interface RunReminderOptions {
  store: Pick<NotificationStore, "claimNotification" | "finishNotification" | "releaseNotification">;
  /** Aktueller Produktionsplan (erst geladen, wenn die Prüfung fällig ist). */
  loadView: () => Promise<TrackerView>;
  now?: number;
  env?: Env;
  fetchFn?: typeof fetch;
}

export async function runProductionReminderIfDue(
  opts: RunReminderOptions,
): Promise<{ sent: boolean; key: string; lines?: number; error?: string } | null> {
  const now = opts.now ?? Date.now();
  const env = opts.env ?? process.env;
  if (!isEmailConfigured(env)) return null;
  if (Number(hourFormat.format(now)) < REMINDER_HOUR) return null;

  const key = `prod-reminder:${berlinDay(now)}`;
  if (!(await opts.store.claimNotification({ key, kind: "watch", summary: "Produktions-Erinnerung" }, now))) return null;
  try {
    const lines = reminderLines(await opts.loadView());
    if (lines.length === 0) {
      await opts.store.finishNotification(key, now, null); // alles erledigt → heute keine Mail
      return { sent: false, key, lines: 0 };
    }
    await sendEmail(renderReminder(lines), env, opts.fetchFn);
    await opts.store.finishNotification(key, now, null);
    return { sent: true, key, lines: lines.length };
  } catch (e) {
    await opts.store.releaseNotification(key);
    return { sent: false, key, error: e instanceof Error ? e.message : String(e) };
  }
}
