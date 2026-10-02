import type { ChannelAnalytics, ChannelSummary, TimeRange } from "@/lib/data/types";
import { formatIsoDayShort, formatWindowLabel } from "@/lib/format";

/**
 * Globaler Zeitraum-Schalter (Phase 8): Was „im Zeitraum“ je Kanal bedeutet.
 * - 24h / 7 Tage: aus den eigenen Schnappschüssen (vor vollen 24 Std./7 Tagen: „seit X Std.“)
 * - 28 Tage: aus YouTube Analytics (2–3 Tage Verzug); ohne Analytics → 7 Tage
 * - Gesamt: Gesamtstand
 */

export const RANGES: { value: TimeRange; label: string; short: string }[] = [
  { value: "24h", label: "24 Std.", short: "24h" },
  { value: "7d", label: "7 Tage", short: "7T" },
  { value: "28d", label: "28 Tage", short: "28T" },
  { value: "all", label: "Gesamt", short: "Gesamt" },
];

export function rangeLabel(r: TimeRange): string {
  return RANGES.find((x) => x.value === r)?.label ?? r;
}

export interface ChannelGain {
  views: number | null;
  subscribers: number | null;
  videos: number | null;
  /** Tatsächlich gezeigter Zeitraum (kann vom gewählten abweichen). */
  effective: TimeRange;
  /** Beschriftung, z. B. „in 24h“, „seit 5 Std.“, „in 28 Tagen“, „gesamt“. */
  label: string;
  /** Kurzer Hinweis zur Quelle bzw. warum ein anderer Zeitraum gezeigt wird. */
  note: string | null;
}

function sevenDays(s: ChannelSummary, historyHours: number, note: string | null): ChannelGain {
  const first = s.history7d[0];
  return {
    views: first ? s.current.views - first.views : null,
    subscribers: first ? s.current.subscribers - first.subscribers : null,
    videos: first ? s.current.videoCount - first.videoCount : null,
    effective: "7d",
    label: formatWindowLabel(historyHours, 168),
    note,
  };
}

export function channelGain(
  s: ChannelSummary,
  analytics: ChannelAnalytics | null | undefined,
  range: TimeRange,
  historyHours: number,
): ChannelGain {
  switch (range) {
    case "24h":
      return {
        views: s.delta24h.views,
        subscribers: s.delta24h.subscribers,
        videos: s.delta24h.videos,
        effective: "24h",
        label: formatWindowLabel(historyHours, 24),
        note: null,
      };
    case "7d":
      return sevenDays(s, historyHours, null);
    case "28d": {
      const t = analytics?.totals28d;
      if (!t) return sevenDays(s, historyHours, "28 Tage gibt es nur mit YouTube Analytics – zeigt 7 Tage");
      return {
        views: t.views,
        subscribers: t.subsNet,
        videos: null,
        effective: "28d",
        label: "in 28 Tagen",
        note: analytics?.lastDay ? `YouTube Analytics bis ${formatIsoDayShort(analytics.lastDay)}` : "YouTube Analytics",
      };
    }
    case "all":
      return {
        views: s.current.views,
        subscribers: s.current.subscribers,
        videos: s.current.videoCount,
        effective: "all",
        label: "gesamt",
        note: null,
      };
  }
}
