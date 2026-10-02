import type { RadarItem, RankedShort } from "@/lib/data/types";

/**
 * Konkurrenz-Radar (Phase 7): Konkurrenz-Shorts, die gerade weit über dem Üblichen
 * ihres Kanals laufen. Fair getrennt nach Alter:
 * - **Neu** (unter 48 Std.): Aufrufe insgesamt ÷ Median der Gesamtaufrufe der Shorts,
 *   die 2–30 Tage alt sind („hat schon mehr als ein üblicher Short je schafft“).
 * - **Ausbruch** (ab 48 Std.): Aufrufe der letzten 24 Std. ÷ Median der 24h-Aufrufe
 *   ALLER übrigen Shorts ab 48 Std. – und nur, wenn es plötzlich kommt (ab 3 Tagen
 *   Verlauf: ein großer Teil der Wochen-Aufrufe fiel in die letzten 24 Std.). So
 *   tauchen beständige Dauerläufer nicht ständig auf.
 */

const HOUR = 3_600_000;

export const RADAR = {
  /** Aus so vielen neuesten Shorts wird der Vergleichswert gebildet. */
  baselineShorts: 30,
  /** Mindestens so viele Shorts mit Aufrufen für einen Vergleichswert. */
  minBaseline: 4,
  /** Ab diesem Faktor taucht ein Short auf dem Radar auf. */
  minFactor: 2.5,
  /** Und nur mit mindestens so vielen Aufrufen in 24 Std. (sonst Rauschen bei kleinen Kanälen). */
  minViews24h: 5_000,
  limit: 8,
} as const;

/**
 * „Plötzlich“: Ab 3 Tagen Verlauf muss ein deutlicher Teil der gemessenen Wochen-Aufrufe
 * in den letzten 24 Std. liegen (gleichmäßig wären es 24/Messdauer).
 */
export function isSudden(s: RankedShort, historyHours: number): boolean {
  const window = Math.min(168, historyHours);
  if (window < 72 || s.views7d <= 0) return true;
  return s.views24h / s.views7d >= Math.max(0.3, (1.5 * 24) / window);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** `historyHours`: wie lange schon gemessen wird (unter 24 Std. umfassen die „24h“-Werte nur diese Zeit). */
export function buildRivalRadar(rivalShorts: RankedShort[], now: number, historyHours = 24): RadarItem[] {
  const byChannel = new Map<string, RankedShort[]>();
  for (const s of rivalShorts) {
    if (!s.publishedAt || s.publishedAt > now) continue;
    byChannel.set(s.channelId, [...(byChannel.get(s.channelId) ?? []), s]);
  }
  const ageH = (s: RankedShort) => (now - s.publishedAt) / HOUR;
  const out: RadarItem[] = [];
  for (const list of byChannel.values()) {
    const recent = [...list].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, RADAR.baselineShorts);
    const settled = recent.filter((s) => ageH(s) >= 48);
    const totals = settled.filter((s) => ageH(s) <= 30 * 24 && s.views > 0).map((s) => s.views);
    const gains = list.filter((s) => ageH(s) >= 48 && s.views24h > 0).map((s) => s.views24h);
    const totalBase = totals.length >= RADAR.minBaseline ? median(totals) : null;
    const gainBase = gains.length >= RADAR.minBaseline ? median(gains) : null;

    for (const s of list) {
      if (s.views24h < RADAR.minViews24h) continue;
      const young = ageH(s) < 48;
      const base = young ? totalBase : gainBase;
      if (!base || base <= 0) continue;
      const factor = (young ? s.views : s.views24h) / base;
      if (factor < RADAR.minFactor) continue;
      if (!young && !isSudden(s, historyHours)) continue;
      out.push({
        id: s.id,
        channelId: s.channelId,
        title: s.title,
        thumbnailUrl: s.thumbnailUrl,
        publishedAt: s.publishedAt,
        views: s.views,
        views24h: s.views24h,
        factor,
        kind: young ? "new" : "breakout",
        perHour: s.views24h / Math.max(1, Math.min(24, historyHours, ageH(s))),
      });
    }
  }
  return out.sort((a, b) => b.factor - a.factor).slice(0, RADAR.limit);
}
