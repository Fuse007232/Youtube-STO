import { APP_CONFIG } from "@/config/app";
import type { ChannelConfig } from "@/config/channels";
import { isEmailConfigured, sendEmail } from "@/lib/alerts/email";
import type { AnalyticsStore, NotificationStore, SnapshotStore } from "@/lib/db/store";
import { detectIssues, type WatchIssue } from "./detect";

type Env = Record<string, string | undefined>;

const HOUR = 3_600_000;

export interface RunWatchdogOptions {
  store: NotificationStore & Pick<SnapshotStore, "recentRuns"> & Pick<AnalyticsStore, "getConnections">;
  channels: ChannelConfig[];
  now?: number;
  env?: Env;
  fetchFn?: typeof fetch;
}

export interface RunWatchdogResult {
  issues: number;
  sent: string[];
  error?: string;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderWatchEmail(issues: WatchIssue[]) {
  const subject = issues.length === 1 ? `🛠️ Wächter: ${issues[0].title}` : `🛠️ Wächter: ${issues.length} Hinweise`;
  const text = [
    "Der Wächter vom Shorts Live Timing hat etwas bemerkt:",
    "",
    ...issues.map((i) => `• ${i.title}\n  ${i.detail}`),
    "",
    `Dashboard: ${APP_CONFIG.publicUrl}/settings`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
<p style="color:#e10600;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:.06em;margin:0">Wächter · Rennleitung</p>
<h2 style="margin:4px 0 16px">${issues.length === 1 ? "Ein Hinweis" : `${issues.length} Hinweise`}</h2>
${issues
  .map(
    (i) => `<div style="border:1px solid #ddd;border-left:4px solid #eab308;border-radius:10px;padding:12px;margin-bottom:10px">
<div style="font-weight:600">${escape(i.title)}</div>
<div style="margin-top:4px;font-size:14px;color:#444">${escape(i.detail)}</div>
</div>`,
  )
  .join("\n")}
<p style="font-size:13px"><a href="${APP_CONFIG.publicUrl}/settings">Zu den Einstellungen</a></p>
</div>`;
  return { subject, text, html };
}

/**
 * Prüft auf Probleme und schickt neue Hinweise gesammelt in EINER E-Mail.
 * Ohne E-Mail-Einrichtung wird nur geprüft (nichts vorgemerkt).
 */
export async function runWatchdog(opts: RunWatchdogOptions): Promise<RunWatchdogResult> {
  const now = opts.now ?? Date.now();
  const env = opts.env ?? process.env;
  const { store } = opts;
  const [runs, connections, removed] = await Promise.all([
    store.recentRuns(now - 26 * HOUR),
    store.getConnections().catch(() => []),
    store.getRemovedOwnVideos(now - 26 * HOUR),
  ]);
  const issues = detectIssues({
    now,
    runs,
    connections,
    removed,
    channels: opts.channels,
    dailyQuota: APP_CONFIG.youtubeDailyQuota,
  });
  if (issues.length === 0 || !isEmailConfigured(env)) return { issues: issues.length, sent: [] };

  const fresh: WatchIssue[] = [];
  for (const issue of issues) {
    if (await store.claimNotification({ key: issue.key, kind: "watch", summary: issue.title }, now)) fresh.push(issue);
  }
  if (fresh.length === 0) return { issues: issues.length, sent: [] };

  try {
    await sendEmail(renderWatchEmail(fresh), env, opts.fetchFn);
    await Promise.all(fresh.map((i) => store.finishNotification(i.key, now, null)));
    return { issues: issues.length, sent: fresh.map((i) => i.key) };
  } catch (e) {
    // Versand gescheitert → Vormerkungen zurücknehmen, beim nächsten Lauf erneut versuchen
    await Promise.all(fresh.map((i) => store.releaseNotification(i.key)));
    return { issues: issues.length, sent: [], error: e instanceof Error ? e.message : String(e) };
  }
}
