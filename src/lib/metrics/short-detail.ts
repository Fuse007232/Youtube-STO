import type { RankedShort, ShortDetail, ShortHistoryPoint } from "@/lib/data/types";
import { analyzeTiming, slotOf, type TimingSample } from "./upload-timing";

/**
 * Rechenhilfen für den Short-Steckbrief (Phase 7).
 */

const HOUR = 3_600_000;

/**
 * Aufrufe pro Stunde aus Messpunkten: Zuwachs zwischen zwei Punkten zählt zur Stunde
 * seiner Mitte. Lücken über 2 Std. (z. B. vor dem ersten Messpunkt) bleiben leer.
 */
export function hourlyGains(points: ShortHistoryPoint[]): { t: number; views: number }[] {
  const byHour = new Map<number, number>();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 2 * HOUR) continue;
    const hour = Math.floor((a.t + dt / 2) / HOUR) * HOUR;
    byHour.set(hour, (byHour.get(hour) ?? 0) + Math.max(0, b.views - a.views));
  }
  return [...byHour.entries()].sort((x, y) => x[0] - y[0]).map(([t, views]) => ({ t, views }));
}

/** Platz eines Shorts im eigenen Kanal (1 = bester) nach Gesamt / 7 Tage / 24 Std. */
export function channelRank(channelShorts: RankedShort[], id: string): ShortDetail["rank"] {
  const place = (key: "views" | "views7d" | "views24h") => {
    const sorted = [...channelShorts].sort((a, b) => b[key] - a[key]);
    const i = sorted.findIndex((s) => s.id === id);
    return i < 0 ? channelShorts.length : i + 1;
  };
  return { all: place("views"), d7: place("views7d"), d24: place("views24h"), of: channelShorts.length };
}

/** Zeitfenster + Leistungs-Index eines Shorts im Vergleich zum Kanal-Schnitt in diesem Fenster. */
export function shortTiming(id: string, publishedAt: number, samples: TimingSample[]): ShortDetail["timing"] {
  const { weekday, block } = slotOf(publishedAt);
  const sample = samples.find((s) => s.videoId === id) ?? null;
  const analysis = analyzeTiming({ scope: "", samples });
  const stat = analysis.byBlock[block];
  return {
    weekday,
    block,
    index: sample?.index ?? null,
    source: sample?.source ?? null,
    blockScore: stat.n > 0 ? stat.score : null,
    blockN: stat.n,
  };
}
