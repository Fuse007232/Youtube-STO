import { APP_CONFIG } from "@/config/app";

/**
 * „Short geht ab“-Erkennung – reine Rechenfunktion (getestet).
 */

export type AlertKind = "rocket" | "breakout";

export interface HourRateRow {
  id: string;
  channelId: string;
  title: string;
  publishedAt: number | null;
  thumbnailUrl: string | null;
  /** Aktuelle Aufrufe und Zeitpunkt dieses Stands. */
  viewsNow: number;
  nowAt: number;
  /** Aufrufe vor 1 Stunde bzw. vor 25 Stunden (null = noch nicht gemessen). */
  views1h: number | null;
  views25h: number | null;
}

export interface AlertCandidate {
  videoId: string;
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  kind: AlertKind;
  /** Aufrufe pro Stunde zuletzt. */
  viewsLastHour: number;
  /** Vergleichswert pro Stunde (Kanal-Schnitt bzw. eigener Schnitt). */
  baselineHour: number;
  viewsTotal: number;
}

export interface AlertConfig {
  minViewsPerHour: number;
  breakoutFactor: number;
  rocketShareOfChannel: number;
  rocketMaxAgeHours: number;
  cooldownHours: number;
  minWindowHours: number;
}
const HOUR = 3_600_000;

export function detectAlerts(
  rows: HourRateRow[],
  /** Übliche Aufrufe pro Stunde je Kanal (Schnitt der letzten 24h). */
  channelHourly: Map<string, number>,
  now: number,
  /** Shorts, die in der Sperrzeit schon einen Alarm hatten. */
  recentlyAlerted: Set<string>,
  cfg: AlertConfig = APP_CONFIG.alerts,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const r of rows) {
    if (r.views1h === null || recentlyAlerted.has(r.id)) continue;
    // Zeitraum vom Stand „vor 1 Stunde“ bis zum aktuellen Stand
    const windowH = (r.nowAt - (now - HOUR)) / HOUR;
    if (windowH < cfg.minWindowHours) continue;
    const rate = Math.max(0, r.viewsNow - r.views1h) / windowH;
    if (rate < cfg.minViewsPerHour) continue;

    const ageH = r.publishedAt === null ? Infinity : (now - r.publishedAt) / HOUR;
    const base = {
      videoId: r.id,
      channelId: r.channelId,
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      viewsLastHour: Math.round(rate),
      viewsTotal: r.viewsNow,
    };

    if (ageH <= cfg.rocketMaxAgeHours) {
      const channelRate = channelHourly.get(r.channelId) ?? 0;
      if (channelRate > 0 && rate >= cfg.rocketShareOfChannel * channelRate) {
        out.push({ ...base, kind: "rocket", baselineHour: Math.round(channelRate) });
      }
      continue;
    }

    // Eigener Stundenschnitt der 24 Stunden vor der letzten Stunde
    let baseline: number | null = null;
    if (r.views25h !== null) baseline = (r.views1h - r.views25h) / 24;
    else if (r.publishedAt !== null && ageH < 25) baseline = r.views1h / Math.max(1, ageH - 1);
    if (baseline === null) continue; // noch zu wenig Verlauf
    if (rate >= cfg.breakoutFactor * Math.max(baseline, 1)) {
      out.push({ ...base, kind: "breakout", baselineHour: Math.round(Math.max(0, baseline)) });
    }
  }
  return out.sort((a, b) => b.viewsLastHour - a.viewsLastHour);
}
