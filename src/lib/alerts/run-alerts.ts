import { APP_CONFIG } from "@/config/app";
import { CHANNELS, type ChannelConfig } from "@/config/channels";
import type { AlertStore, DashboardReader } from "@/lib/db/store";
import { HOUR_MS, latestDelta } from "@/lib/metrics/deltas";
import { detectAlerts } from "./detect";
import { isEmailConfigured, renderAlertEmail, sendEmail } from "./email";

/**
 * Nach jedem Schnappschuss: Shorts prüfen, neue Alarme speichern und per E-Mail melden.
 * Mehrere Treffer in einem Lauf → eine gemeinsame E-Mail.
 */

type Env = Record<string, string | undefined>;

export interface RunAlertsOptions {
  store: AlertStore & Pick<DashboardReader, "getChannelPoints">;
  channels?: ChannelConfig[];
  now?: number;
  env?: Env;
  fetchFn?: typeof fetch;
}

export interface RunAlertsResult {
  detected: number;
  emailed: boolean;
  emailError?: string;
}

/** Übliche Aufrufe pro Stunde je Kanal (Schnitt der letzten 24h bzw. seit Messbeginn). */
async function channelHourlyRates(
  store: Pick<DashboardReader, "getChannelPoints">,
  channels: ChannelConfig[],
  now: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const c of channels) {
    const points = await store.getChannelPoints(c.id, now - 26 * HOUR_MS);
    if (points.length < 2) continue;
    const full = latestDelta(points, 24);
    if (full) {
      out.set(c.id, full.views / 24);
    } else {
      const first = points[0];
      const last = points[points.length - 1];
      const hours = (last.t - first.t) / HOUR_MS;
      if (hours >= 1) out.set(c.id, (last.views - first.views) / hours);
    }
  }
  return out;
}

export async function runAlerts(opts: RunAlertsOptions): Promise<RunAlertsResult> {
  const now = opts.now ?? Date.now();
  const env = opts.env ?? process.env;
  const channels = opts.channels ?? CHANNELS.filter((c) => c.kind === "own");
  const cfg = APP_CONFIG.alerts;

  const [rows, recent, hourly] = await Promise.all([
    opts.store.getVideoHourRates(now),
    opts.store.getRecentAlerts(now - cfg.cooldownHours * HOUR_MS, 500),
    channelHourlyRates(opts.store, channels, now),
  ]);
  const ownIds = new Set(channels.map((c) => c.id));
  const candidates = detectAlerts(
    rows.filter((r) => ownIds.has(r.channelId)),
    hourly,
    now,
    new Set(recent.map((a) => a.videoId)),
    cfg,
  );
  if (candidates.length === 0) return { detected: 0, emailed: false };

  const ids = await opts.store.insertAlerts(candidates, now);
  if (!isEmailConfigured(env)) return { detected: candidates.length, emailed: false };

  try {
    await sendEmail(renderAlertEmail(candidates, channels), env, opts.fetchFn);
    await opts.store.markAlertsEmailed(ids, now, null);
    return { detected: candidates.length, emailed: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[alerts] E-Mail fehlgeschlagen:", message);
    await opts.store.markAlertsEmailed(ids, now, message);
    return { detected: candidates.length, emailed: false, emailError: message };
  }
}
