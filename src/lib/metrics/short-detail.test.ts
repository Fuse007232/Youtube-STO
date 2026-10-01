import { describe, expect, it } from "vitest";
import type { RankedShort } from "@/lib/data/types";
import { channelRank, hourlyGains, shortTiming } from "./short-detail";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1, 10, 0);

describe("hourlyGains", () => {
  it("summiert Zuwächse je Stunde, Lücken über 2 Std. zählen nicht", () => {
    const pts = [0, 15, 30, 45, 60, 75].map((m, i) => ({ t: T0 + m * 60_000, views: i * 100, likes: null, comments: null }));
    pts.push({ t: T0 + 5 * H, views: 99_999, likes: null, comments: null });
    const g = hourlyGains(pts);
    expect(g).toEqual([
      { t: T0, views: 400 },
      { t: T0 + H, views: 100 },
    ]);
  });
});

describe("channelRank", () => {
  it("Platz nach Gesamt, 7 Tage und 24 Std.", () => {
    const s = (id: string, views: number, views7d: number, views24h: number) =>
      ({ id, views, views7d, views24h }) as RankedShort;
    const list = [s("a", 100, 50, 1), s("b", 300, 10, 5), s("c", 200, 90, 3)];
    expect(channelRank(list, "c")).toEqual({ all: 2, d7: 1, d24: 2, of: 3 });
  });
});

describe("shortTiming", () => {
  it("Zeitfenster in Berliner Zeit, Index aus den Proben", () => {
    const pub = Date.UTC(2026, 9, 1, 11, 0); // Do 13 Uhr Berlin
    const t = shortTiming("x", pub, [
      { videoId: "x", channelId: "A", title: "", publishedAt: pub, index: 1.6, source: "first24h" },
      { videoId: "y", channelId: "A", title: "", publishedAt: pub - 7 * 24 * H, index: 0.8, source: "history" },
    ]);
    expect(t).toMatchObject({ weekday: 3, block: 6, index: 1.6, source: "first24h", blockN: 2 });
    expect(t.blockScore).not.toBeNull();
  });
});
