import type { AnalyticsDay, AnalyticsTotals, BreakdownItem } from "@/lib/data/types";

/**
 * Summen und gewichtete Mittelwerte über die letzten `days` Tage mit Daten.
 * Durchschnitte (Wiedergabedauer, % angesehen) werden nach Aufrufen gewichtet,
 * damit ein Tag mit wenigen Aufrufen nicht zu stark zählt.
 */
export function totalsFromDaily(daily: AnalyticsDay[], days = 28): AnalyticsTotals | null {
  if (daily.length === 0) return null;
  const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
  const window = sorted.slice(-days);
  const sum = (f: (d: AnalyticsDay) => number) => window.reduce((s, d) => s + f(d), 0);
  const views = sum((d) => d.views);
  const weighted = (f: (d: AnalyticsDay) => number) =>
    views > 0 ? sum((d) => f(d) * d.views) / views : 0;
  const engagedKnown = window.every((d) => d.engagedViews !== null);
  const subsGained = sum((d) => d.subsGained);
  const subsLost = sum((d) => d.subsLost);
  return {
    days: window.length,
    views,
    engagedViews: engagedKnown ? sum((d) => d.engagedViews ?? 0) : null,
    minutesWatched: sum((d) => d.minutesWatched),
    avgViewSec: weighted((d) => d.avgViewSec),
    avgViewPct: weighted((d) => d.avgViewPct),
    subsGained,
    subsLost,
    subsNet: subsGained - subsLost,
    likes: sum((d) => d.likes),
    shares: sum((d) => d.shares),
    comments: sum((d) => d.comments),
  };
}

/** Neue Abos pro 1.000 Aufrufe (0, wenn keine Aufrufe). */
export function subsPer1k(subs: number, views: number): number {
  return views > 0 ? (subs / views) * 1000 : 0;
}

/**
 * Aufschlüsselung (z. B. Länder) → Top-N mit Anteil; der Rest wird zu „Sonstige“.
 */
export function toBreakdown(
  rows: { key: string; views: number }[],
  label: (key: string) => string,
  limit = 6,
): BreakdownItem[] {
  const total = rows.reduce((s, r) => s + r.views, 0);
  if (total === 0) return [];
  const sorted = [...rows].sort((a, b) => b.views - a.views);
  const top = sorted.slice(0, limit).map((r) => ({
    key: r.key,
    label: label(r.key),
    views: r.views,
    share: r.views / total,
  }));
  const rest = sorted.slice(limit).reduce((s, r) => s + r.views, 0);
  if (rest > 0) top.push({ key: "OTHER", label: "Sonstige", views: rest, share: rest / total });
  return top;
}

/** Traffic-Quellen von YouTube auf Deutsch. */
const TRAFFIC_LABELS: Record<string, string> = {
  SHORTS: "Shorts-Feed",
  SHORTS_CONTENT_LINKS: "Links in Shorts",
  YT_SEARCH: "YouTube-Suche",
  SUBSCRIBER: "Abos & Startseite",
  RELATED_VIDEO: "Vorgeschlagene Videos",
  YT_CHANNEL: "Kanalseite",
  YT_OTHER_PAGE: "Andere YouTube-Seiten",
  YT_PLAYLIST_PAGE: "Playlist-Seite",
  PLAYLIST: "Playlists",
  EXT_URL: "Externe Websites",
  NOTIFICATION: "Benachrichtigungen",
  HASHTAGS: "Hashtag-Seiten",
  SOUND_PAGE: "Sound-Seiten",
  VIDEO_REMIXES: "Remixe",
  END_SCREEN: "Abspann",
  NO_LINK_OTHER: "Direkt / unbekannt",
  NO_LINK_EMBEDDED: "Eingebettet",
  ADVERTISING: "Werbung",
  PROMOTED: "Beworben",
  CAMPAIGN_CARD: "Kampagnen-Karten",
  ANNOTATION: "Anmerkungen",
  LIVE_REDIRECT: "Live-Weiterleitung",
  PRODUCT_PAGE: "Produktseite",
  IMMERSIVE_LIVE: "Live",
};

export function trafficLabel(key: string): string {
  return TRAFFIC_LABELS[key] ?? key.toLowerCase().replace(/_/g, " ");
}

let regionNames: Intl.DisplayNames | null = null;
/** Ländercode („DE“) → Name („Deutschland“). */
export function countryLabel(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["de"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}
