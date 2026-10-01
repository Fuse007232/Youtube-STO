import type { ChannelConfig } from "@/config/channels";
import { buildChannelAnalytics } from "@/lib/analytics/build";
import type { AnalyticsDay, ChannelAnalytics, RankedShort } from "@/lib/data/types";
import type { AnalyticsVideoRow, BreakdownRow } from "@/lib/db/store";
import { createRandom, hashString } from "./random";

/**
 * Beispiel-Analytics für Design-Tests (DATA_SOURCE=mock).
 * Grob an den Kanal-Größen orientiert, vorhersagbar pro Tag.
 */
const DAY = 86_400_000;

export function mockAnalytics(
  channel: ChannelConfig,
  shorts: RankedShort[],
  now: number,
): ChannelAnalytics {
  const big = channel.code === "BRV";
  const daily: AnalyticsDay[] = [];
  for (let i = 35; i >= 2; i--) {
    const t = now - i * DAY;
    const day = new Date(t).toISOString().slice(0, 10);
    const rand = createRandom(hashString(`${channel.id}:${day}`));
    const views = Math.round((big ? 550_000 : 220_000) * (0.6 + rand() * 0.9));
    const avgViewSec = (big ? 21 : 26) + rand() * 6;
    daily.push({
      day,
      views,
      engagedViews: Math.round(views * (0.62 + rand() * 0.1)),
      minutesWatched: Math.round((views * avgViewSec) / 60),
      avgViewSec,
      avgViewPct: (big ? 68 : 81) + rand() * 12,
      subsGained: Math.round(views / (big ? 1500 : 900) * (0.7 + rand() * 0.6)),
      subsLost: Math.round(views / (big ? 9000 : 6000) * (0.5 + rand())),
      likes: Math.round(views * 0.035),
      shares: Math.round(views * 0.002),
      comments: Math.round(views * 0.0008),
    });
  }

  const own = shorts.filter((s) => s.channelId === channel.id).sort((a, b) => b.views7d - a.views7d).slice(0, 40);
  const videos: AnalyticsVideoRow[] = own.map((s) => {
    const rand = createRandom(hashString(`a:${s.id}`));
    const views = Math.max(1000, Math.round(s.views7d * 3.2));
    const avgViewSec = 14 + rand() * 20;
    return {
      videoId: s.id,
      channelId: channel.id,
      views,
      minutesWatched: Math.round((views * avgViewSec) / 60),
      avgViewSec,
      avgViewPct: 55 + rand() * 45,
      subsGained: Math.round(views / (600 + rand() * 2400)),
      likes: Math.round(views * 0.04),
      shares: Math.round(views * 0.002),
    };
  });

  const traffic: [string, number][] = [
    ["SHORTS", 0.86],
    ["YT_SEARCH", 0.05],
    ["YT_CHANNEL", 0.03],
    ["SUBSCRIBER", 0.025],
    ["NO_LINK_OTHER", 0.02],
    ["RELATED_VIDEO", 0.015],
  ];
  const countries: [string, number][] = big
    ? [["US", 0.31], ["GB", 0.08], ["CA", 0.06], ["PH", 0.06], ["IN", 0.05], ["AU", 0.04], ["DE", 0.03], ["BR", 0.03], ["MX", 0.02]]
    : [["US", 0.38], ["GB", 0.09], ["CA", 0.07], ["AU", 0.05], ["DE", 0.04], ["PH", 0.03], ["NZ", 0.02]];
  const total28 = daily.slice(-28).reduce((s, d) => s + d.views, 0);
  const breakdowns: BreakdownRow[] = [
    ...traffic.map(([key, share]) => ({ channelId: channel.id, kind: "traffic" as const, key, views: Math.round(total28 * share), minutesWatched: 0 })),
    ...countries.map(([key, share]) => ({ channelId: channel.id, kind: "country" as const, key, views: Math.round(total28 * share), minutesWatched: 0 })),
  ];

  return buildChannelAnalytics({
    channelId: channel.id,
    connection: { channelId: channel.id, refreshTokenEnc: "", scopes: "", connectedAt: now, lastUsedAt: now, lastError: null },
    daily,
    videos,
    breakdowns,
    videoInfo: new Map(own.map((s) => [s.id, s])),
  });
}
