import { describe, expect, it } from "vitest";
import type { RankedShort } from "@/lib/data/types";
import { addDays, berlinDay, buildUploadCalendar, weekdayOf } from "./calendar";
import { AGE_BUCKETS, analyzeCatalog } from "./catalog";
import { analyzeShortLength, lengthBucketOf } from "./short-length";
import type { TimingSample } from "./upload-timing";

const H = 3_600_000;
const DAY = 24 * H;
const NOW = Date.UTC(2026, 9, 1, 12, 0); // Do, 01.10.2026, 14:00 Berlin

function short(id: string, ageDays: number, extra: Partial<RankedShort> = {}): RankedShort {
  return {
    id,
    channelId: "A",
    title: id,
    publishedAt: NOW - ageDays * DAY,
    thumbnailUrl: null,
    durationSec: 30,
    views: 1000,
    views24h: 0,
    views7d: 0,
    likes: 0,
    ...extra,
  };
}

describe("Short-Länge", () => {
  it("ordnet Dauer den Bereichen zu (Grenze gehört zum nächsten Bereich)", () => {
    expect(lengthBucketOf(8)).toBe(0);
    expect(lengthBucketOf(15)).toBe(1);
    expect(lengthBucketOf(59)).toBe(3);
    expect(lengthBucketOf(60)).toBe(4);
    expect(lengthBucketOf(170)).toBe(4);
  });

  it("findet den besten Bereich gegenüber dem häufigsten", () => {
    const samples: TimingSample[] = [];
    const durations = new Map<string, number>();
    for (let i = 0; i < 40; i++) {
      samples.push({ videoId: `n${i}`, channelId: "A", title: "", publishedAt: 0, index: i % 2 ? 1.1 : 0.9, source: "history" });
      durations.set(`n${i}`, 40); // 30–45 s, normal
    }
    for (let i = 0; i < 15; i++) {
      samples.push({ videoId: `k${i}`, channelId: "A", title: "", publishedAt: 0, index: i % 2 ? 2.2 : 1.8, source: "history" });
      durations.set(`k${i}`, 20); // 15–30 s, doppelt so gut
    }
    const a = analyzeShortLength("A", samples, durations);
    expect(a.samples).toBe(55);
    expect(a.common).toBe(2);
    expect(a.best).toBe(1);
    expect(a.upliftPct).toBeGreaterThan(50);
    expect(a.confidence).toBe("deutlich");
    expect(a.buckets[0].stat.n).toBe(0);
  });

  it("ohne genug Shorts keine Aussage", () => {
    const a = analyzeShortLength("A", [{ videoId: "x", channelId: "A", title: "", publishedAt: 0, index: 3, source: "history" }], new Map([["x", 20]]));
    expect(a).toMatchObject({ best: null, common: null, confidence: "unsicher" });
  });
});

describe("Langzeit-Anteil", () => {
  it("teilt die Aufrufe nach Alter der Shorts auf", () => {
    const shorts = [
      short("neu", 1, { views24h: 600, views7d: 900 }),
      short("woche", 5, { views24h: 100, views7d: 500 }),
      short("monat", 20, { views24h: 200, views7d: 400 }),
      short("alt", 200, { views24h: 100, views7d: 200 }),
      short("fremd", 1, { channelId: "B", views24h: 9999 }),
      short("zukunft", -1, { views24h: 5 }),
    ];
    const [a] = analyzeCatalog(["A"], shorts, NOW);
    expect(a.window24h.totalViews).toBe(1000);
    expect(a.window24h.buckets.map((b) => b.views)).toEqual([600, 100, 200, 0, 100]);
    expect(a.window24h.buckets[0].share).toBeCloseTo(0.6);
    expect(a.window24h.catalogShare).toBeCloseTo(0.3);
    expect(a.window7d.totalViews).toBe(2000);
    expect(a.window24h.buckets).toHaveLength(AGE_BUCKETS.length);
    expect(a.evergreens.map((e) => e.id)).toEqual(["alt"]);
  });
});

describe("Upload-Kalender", () => {
  it("Datums-Hilfen (Berliner Zeit)", () => {
    expect(berlinDay(Date.UTC(2026, 9, 1, 22, 30))).toBe("2026-10-02"); // 0:30 Berlin
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(weekdayOf("2026-10-01")).toBe(3); // Donnerstag
  });

  it("Raster ab Montag, Uploads je Tag, Aufrufe aus Analytics, Serien", () => {
    const shorts = [
      short("heute", 0.05),
      short("gestern", 1),
      short("vorgestern", 2),
      short("vorgestern2", 2.01),
      short("alt1", 10),
      short("alt2", 11),
      short("alt3", 12),
      short("alt4", 13),
    ];
    const cal = buildUploadCalendar({
      channelId: "A",
      shorts,
      dailyViews: new Map([
        ["2026-09-28", 5000],
        ["2026-09-29", 7000],
      ]),
      now: NOW,
      weeks: 4,
    });
    expect(weekdayOf(cal.days[0].day)).toBe(0);
    expect(cal.days.at(-1)!.day).toBe("2026-10-01");
    expect(cal.days.find((d) => d.day === "2026-09-29")).toEqual({ day: "2026-09-29", uploads: 2, views: 7000 });
    expect(cal.currentStreak).toBe(3);
    expect(cal.longestStreak).toBe(4);
    expect(cal.viewsUntil).toBe("2026-09-29");
  });

  it("Serie bleibt bestehen, wenn heute noch nichts hochgeladen ist", () => {
    const cal = buildUploadCalendar({ channelId: "A", shorts: [short("g", 1), short("v", 2)], now: NOW });
    expect(cal.currentStreak).toBe(2);
    expect(cal.days.length).toBeGreaterThan(26 * 7 - 7);
  });
});

describe("Konkurrenz-Radar", () => {
  it("neue Shorts gegen den üblichen Endstand, ältere gegen die üblichen 24h-Aufrufe", async () => {
    const { buildRivalRadar } = await import("./radar");
    // Üblich: 100.000 Aufrufe insgesamt, 10.000 in 24 Std.
    const base = Array.from({ length: 10 }, (_, i) => short(`n${i}`, 3 + i, { channelId: "R", views: 100_000, views24h: 10_000 }));
    const rocket = short("rakete", 0.5, { channelId: "R", views: 400_000, views24h: 400_000 });
    const young = short("normal-neu", 0.5, { channelId: "R", views: 60_000, views24h: 60_000 });
    const comeback = short("comeback", 20, { channelId: "R", views: 500_000, views24h: 30_000 });
    const small = short("klein", 1, { channelId: "S", views: 4_000, views24h: 4_000 });
    const smallBase = Array.from({ length: 5 }, (_, i) => short(`s${i}`, 3 + i, { channelId: "S", views: 100, views24h: 10 }));
    const r = buildRivalRadar([...base, rocket, young, comeback, small, ...smallBase], NOW);
    expect(r.map((x) => [x.id, x.kind])).toEqual([
      ["rakete", "new"],
      ["comeback", "breakout"],
    ]);
    expect(r[0].factor).toBeCloseTo(4);
    expect(r[1].factor).toBeCloseTo(3);
    expect(r[0].perHour).toBeCloseTo(400_000 / 12);
  });

  it("beständige Dauerläufer sind kein Ausbruch (ab 3 Tagen Verlauf)", async () => {
    const { buildRivalRadar } = await import("./radar");
    const base = Array.from({ length: 10 }, (_, i) => short(`n${i}`, 3 + i, { channelId: "R", views: 100_000, views24h: 10_000, views7d: 70_000 }));
    const evergreen = short("dauerläufer", 120, { channelId: "R", views24h: 40_000, views7d: 280_000 });
    const spike = short("ausbruch", 90, { channelId: "R", views24h: 40_000, views7d: 60_000 });
    const r = buildRivalRadar([...base, evergreen, spike], NOW, 168);
    expect(r.map((x) => x.id)).toEqual(["ausbruch"]);
  });
});
