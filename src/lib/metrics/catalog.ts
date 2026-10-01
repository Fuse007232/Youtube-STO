import type { CatalogAnalysis, CatalogWindow, RankedShort } from "@/lib/data/types";

/**
 * „Reifenverschleiß“ – woher kommen die Aufrufe? Von frischen Shorts oder vom
 * Katalog (älteren Shorts)? Alter = Alter heute. (Phase 7)
 */

const DAY = 86_400_000;

export const AGE_BUCKETS: { label: string; /** Alter in Tagen, ausschließlich */ below: number }[] = [
  { label: "0–2 Tage", below: 3 },
  { label: "3–7 Tage", below: 8 },
  { label: "8–30 Tage", below: 31 },
  { label: "31–90 Tage", below: 91 },
  { label: "älter", below: Infinity },
];

function window(shorts: RankedShort[], now: number, field: "views24h" | "views7d"): CatalogWindow {
  const buckets = AGE_BUCKETS.map((b) => ({ label: b.label, views: 0, share: 0, shorts: 0 }));
  let total = 0;
  let catalog = 0;
  for (const s of shorts) {
    const gain = Math.max(0, s[field]);
    if (gain <= 0) continue;
    const age = (now - s.publishedAt) / DAY;
    const i = AGE_BUCKETS.findIndex((b) => age < b.below);
    buckets[i].views += gain;
    buckets[i].shorts += 1;
    total += gain;
    if (age >= 8) catalog += gain;
  }
  for (const b of buckets) b.share = total > 0 ? b.views / total : 0;
  return { totalViews: total, buckets, catalogShare: total > 0 ? catalog / total : 0 };
}

export function analyzeCatalog(channelIds: string[], shorts: RankedShort[], now: number): CatalogAnalysis[] {
  return channelIds.map((channelId) => {
    const own = shorts.filter((s) => s.channelId === channelId && s.publishedAt > 0 && s.publishedAt <= now);
    const evergreens = own
      .filter((s) => (now - s.publishedAt) / DAY >= 31 && s.views24h > 0)
      .sort((a, b) => b.views24h - a.views24h)
      .slice(0, 5)
      .map(({ id, title, thumbnailUrl, views, views24h, publishedAt }) => ({ id, title, thumbnailUrl, views, views24h, publishedAt }));
    return {
      channelId,
      window24h: window(own, now, "views24h"),
      window7d: window(own, now, "views7d"),
      evergreens,
    };
  });
}
