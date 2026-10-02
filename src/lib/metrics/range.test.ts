import { describe, expect, it } from "vitest";
import type { ChannelAnalytics, ChannelSummary } from "@/lib/data/types";
import { channelGain } from "./range";

const H = 3_600_000;
const summary = {
  channel: { id: "A", name: "A", code: "AAA", color: "#000", kind: "own" },
  avatarUrl: null,
  current: { subscribers: 1000, views: 50_000, videoCount: 12 },
  subscribersRounded: true,
  delta24h: { views: 800, subscribers: 10, videos: 1 },
  prevDelta24h: null,
  best24h: null,
  rate: { viewsPerSecond: 0 },
  history24h: [],
  history7d: [
    { t: 0, views: 45_000, subscribers: 950, videoCount: 9 },
    { t: H, views: 49_000, subscribers: 990, videoCount: 11 },
  ],
} as unknown as ChannelSummary;

describe("channelGain", () => {
  it("24h und 7 Tage aus den Schnappschüssen", () => {
    expect(channelGain(summary, null, "24h", 200)).toMatchObject({ views: 800, subscribers: 10, label: "in 24h" });
    expect(channelGain(summary, null, "7d", 200)).toMatchObject({ views: 5000, subscribers: 50, videos: 3, label: "in 7 Tagen" });
    expect(channelGain(summary, null, "7d", 30).label).toBe("seit 30 Std.");
  });

  it("28 Tage aus Analytics, ohne Analytics Rückfall auf 7 Tage mit Hinweis", () => {
    const analytics = { totals28d: { views: 99_000, subsNet: 120 }, lastDay: "2026-09-30" } as unknown as ChannelAnalytics;
    expect(channelGain(summary, analytics, "28d", 200)).toMatchObject({ views: 99_000, subscribers: 120, effective: "28d", note: "YouTube Analytics bis 30.09." });
    const fallback = channelGain(summary, null, "28d", 200);
    expect(fallback.effective).toBe("7d");
    expect(fallback.note).toContain("zeigt 7 Tage");
  });

  it("Gesamt = Gesamtstand", () => {
    expect(channelGain(summary, null, "all", 200)).toMatchObject({ views: 50_000, subscribers: 1000, videos: 12, label: "gesamt" });
  });
});
