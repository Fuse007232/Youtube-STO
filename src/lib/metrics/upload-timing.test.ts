import { describe, expect, it } from "vitest";
import type { ChannelPoint, RankedShort } from "@/lib/data/types";
import {
  activityFromHourly,
  activityFromPoints,
  analyzeTiming,
  berlinWeekdayHour,
  buildUploadTiming,
  firstDaySamples,
  historySamples,
  mergeSamples,
  slotOf,
  slotStat,
  type TimingSample,
} from "./upload-timing";

const H = 3_600_000;
const DAY = 24 * H;
const NOW = Date.UTC(2026, 9, 1, 12, 0); // Do, 01.10.2026, 14:00 Berlin

function short(id: string, publishedAt: number, views: number, channelId = "A"): RankedShort {
  return { id, channelId, title: id, publishedAt, thumbnailUrl: null, durationSec: 30, views, views24h: 0, views7d: 0, likes: 0 };
}

/** Kleiner fester Zufall (für Streuung in Testdaten). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

/** Zeitpunkt in Berliner Sommerzeit (UTC+2) an einem Tag vor NOW. */
const berlin = (daysAgo: number, hour: number) =>
  Date.UTC(2026, 9, 1, hour - 2, 10) - daysAgo * DAY;

describe("Zeitfenster (Berliner Zeit)", () => {
  it("rechnet Sommer- und Winterzeit richtig um", () => {
    expect(berlinWeekdayHour(Date.UTC(2026, 9, 1, 11, 0))).toEqual({ weekday: 3, hour: 13 }); // Do 13 Uhr (MESZ)
    expect(berlinWeekdayHour(Date.UTC(2026, 10, 2, 12, 0))).toEqual({ weekday: 0, hour: 13 }); // Mo 13 Uhr (MEZ)
    expect(berlinWeekdayHour(Date.UTC(2026, 9, 3, 22, 30))).toEqual({ weekday: 6, hour: 0 }); // So 0:30
  });

  it("teilt in 2-Stunden-Blöcke", () => {
    expect(slotOf(Date.UTC(2026, 9, 1, 11, 0))).toEqual({ weekday: 3, block: 6 }); // 13 Uhr → 12–14
    expect(slotOf(Date.UTC(2026, 9, 1, 9, 59))).toEqual({ weekday: 3, block: 5 }); // 11:59 → 10–12
  });
});

describe("Leistungs-Index", () => {
  it("Historie: Aufrufe ÷ Median der Nachbar-Shorts (±15 Tage), erst ab 7 Tagen Alter", () => {
    const shorts = [
      short("a", NOW - 10 * DAY, 100),
      short("b", NOW - 11 * DAY, 200),
      short("c", NOW - 12 * DAY, 300),
      short("d", NOW - 13 * DAY, 400),
      short("hit", NOW - 14 * DAY, 1000),
      short("new", NOW - 2 * DAY, 99_999), // zu jung
    ];
    const samples = historySamples(shorts, NOW);
    expect(samples.map((s) => s.videoId).sort()).toEqual(["a", "b", "c", "d", "hit"]);
    // Nachbarn von „hit“: 100, 200, 300, 400 → Median 250
    expect(samples.find((s) => s.videoId === "hit")!.index).toBeCloseTo(4);
    expect(samples.every((s) => s.source === "history")).toBe(true);
  });

  it("Historie: ohne genug Nachbarn kein Wert", () => {
    const shorts = [short("a", NOW - 10 * DAY, 100), short("b", NOW - 11 * DAY, 200), short("c", NOW - 12 * DAY, 300)];
    expect(historySamples(shorts, NOW)).toEqual([]);
  });

  it("Startkurve: Aufrufe nach 24 Std. ÷ Median der übrigen, ab 3 Messungen", () => {
    const rows = [
      { id: "x", channelId: "A", publishedAt: NOW - 3 * DAY, viewsAt: 1000 },
      { id: "y", channelId: "A", publishedAt: NOW - 4 * DAY, viewsAt: 2000 },
      { id: "z", channelId: "A", publishedAt: NOW - 5 * DAY, viewsAt: 3000 },
      { id: "solo", channelId: "B", publishedAt: NOW - 5 * DAY, viewsAt: 3000 },
    ];
    const samples = firstDaySamples(rows, new Map([["x", "Titel X"]]));
    expect(samples.map((s) => s.videoId)).toEqual(["x", "y", "z"]); // B hat zu wenig
    expect(samples[0].index).toBeCloseTo(1000 / 2500);
    expect(samples[0].title).toBe("Titel X");
    expect(samples[2].index).toBeCloseTo(2);
  });

  it("Startkurve ersetzt den Historien-Wert", () => {
    const h: TimingSample = { videoId: "a", channelId: "A", title: "", publishedAt: 0, index: 2, source: "history" };
    const f: TimingSample = { ...h, index: 0.5, source: "first24h" };
    expect(mergeSamples([h], [f])).toEqual([f]);
  });
});

describe("slotStat", () => {
  it("ohne Shorts: neutral", () => {
    expect(slotStat([])).toMatchObject({ n: 0, score: 1, median: null, se: null });
  });

  it("zieht wenige Shorts Richtung 1,0", () => {
    // 5× doppelt so gut, Schrumpfung mit 5 gedachten Normal-Shorts → √2
    expect(slotStat([2, 2, 2, 2, 2]).score).toBeCloseTo(Math.SQRT2);
    expect(slotStat(new Array(95).fill(2)).score).toBeCloseTo(2 ** 0.95);
  });

  it("kappt Ausreißer", () => {
    expect(slotStat([1000]).meanLog).toBeCloseTo(Math.log(8));
  });
});

describe("analyzeTiming", () => {
  /** n Shorts im Block (Berliner Stunde) mit Index um `level`, verteilt über die Wochentage. */
  function samples(hour: number, n: number, level: number, seed: number): TimingSample[] {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => ({
      videoId: `${hour}-${i}`,
      channelId: "A",
      title: "",
      publishedAt: berlin(i + 8, hour),
      index: level * Math.exp((r() - 0.5) * 0.8),
      source: "history" as const,
    }));
  }

  it("findet einen klar besseren Block", () => {
    const a = analyzeTiming({ scope: "A", samples: [...samples(13, 60, 1, 1), ...samples(19, 15, 1.8, 2)] });
    expect(a.recommendation).toMatchObject({ block: 9, defaultBlock: 6, confidence: "deutlich" });
    expect(a.recommendation!.upliftPct).toBeGreaterThan(40);
    expect(a.recommendation!.defaultShare).toBeCloseTo(0.8);
    expect(a.byBlock[9].n).toBe(15);
    expect(a.cells.flat().reduce((sum, c) => sum + c.n, 0)).toBe(75);
  });

  it("bleibt vorsichtig bei wenigen Test-Uploads", () => {
    const a = analyzeTiming({ scope: "A", samples: [...samples(13, 60, 1, 3), ...samples(19, 3, 1.3, 4)] });
    expect(a.recommendation!.confidence).not.toBe("deutlich");
  });

  it("Standard ist schon am besten → 0 % Vorteil", () => {
    const a = analyzeTiming({ scope: "A", samples: [...samples(13, 60, 1.5, 5), ...samples(19, 10, 0.7, 6)] });
    expect(a.recommendation).toMatchObject({ block: 6, defaultBlock: 6, upliftPct: 0 });
  });

  it("ohne getestete Blöcke keine Empfehlung", () => {
    expect(analyzeTiming({ scope: "A", samples: samples(13, 2, 1, 7) }).recommendation).toBeNull();
  });

  it("nennt keinen Wochentag, wenn es keinen echten Unterschied gibt", () => {
    const a = analyzeTiming({ scope: "A", samples: samples(13, 140, 1, 8) });
    expect(a.recommendation!.weekday).toBeNull();
  });

  it("schlägt ungetestete Blöcke vor, wenn das Publikum dann aktiv ist", () => {
    // Publikum abends (19–23 Uhr) am aktivsten
    const act = Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 23 ? 100 : 20));
    const a = analyzeTiming({ scope: "A", samples: samples(13, 30, 1, 9), activity: { activity: act, hours: 200 } });
    expect(a.experiments.map((e) => e.block)).toContain(9); // 18–20 Uhr → Schub 19–21 Uhr
    expect(a.experiments.every((e) => e.reason === "audience")).toBe(true);
  });

  it("schlägt Zeiten vor, die bei der Konkurrenz gut laufen", () => {
    const competition = analyzeTiming({ scope: "competitors", samples: [...samples(9, 40, 1.6, 10), ...samples(13, 40, 0.8, 11)] });
    const a = analyzeTiming({ scope: "A", samples: samples(13, 30, 1, 12), competition });
    expect(a.experiments).toEqual([expect.objectContaining({ block: 4, reason: "competition" })]);
  });

  it("Testprotokoll: neueste Uploads zuerst, mit Index falls vorhanden", () => {
    const s = samples(13, 3, 1, 13);
    const a = analyzeTiming({
      scope: "A",
      samples: s,
      recentShorts: [
        { id: s[2].videoId, title: "alt", publishedAt: s[2].publishedAt },
        { id: "frisch", title: "frisch", publishedAt: NOW - H },
      ],
    });
    expect(a.recent.map((r) => r.videoId)).toEqual(["frisch", s[2].videoId]);
    expect(a.recent[0].index).toBeNull();
    expect(a.recent[1].index).toBeCloseTo(s[2].index);
  });
});

describe("Aktivitätsprofil", () => {
  it("aus Stunden-Summen: erst wenn jede Stunde gemessen ist", () => {
    const rows = Array.from({ length: 24 }, (_, hour) => ({ channelId: "A", hour, views: 1000 * (hour + 1), hours: 2 }));
    const full = activityFromHourly(rows).get("A")!;
    expect(full.activity![0]).toBe(500);
    expect(full.activity![23]).toBe(12_000);
    expect(full.hours).toBe(48);
    const partial = activityFromHourly(rows.slice(0, 20)).get("A")!;
    expect(partial.activity).toBeNull();
    expect(partial.hours).toBe(40);
  });

  it("aus Schnappschüssen: Aufrufe pro Stunde je Berliner Stunde, Lücken > 75 Min. zählen nicht", () => {
    const start = Date.UTC(2026, 9, 1, 22, 0); // 0 Uhr Berlin
    const points: ChannelPoint[] = [];
    for (let i = 0; i <= 96; i++) points.push({ t: start + i * 15 * 60_000, views: i * 250, subscribers: 0, videoCount: 0 });
    points.push({ t: start + 30 * H, views: 1e9, subscribers: 0, videoCount: 0 }); // Lücke
    const p = activityFromPoints(points);
    expect(p.activity).not.toBeNull();
    expect(p.activity!.every((v) => Math.abs(v - 1000) < 1e-6)).toBe(true);
    expect(p.hours).toBeCloseTo(24);
  });
});

describe("buildUploadTiming", () => {
  it("je eigener Kanal + Konkurrenz zusammen", () => {
    const own = Array.from({ length: 20 }, (_, i) => short(`o${i}`, berlin(8 + i, 13), 1000 + i * 10));
    const rival = Array.from({ length: 20 }, (_, i) => short(`r${i}`, berlin(8 + i, 9), 500 + i * 10, "R"));
    const result = buildUploadTiming({
      ownChannelIds: ["A", "B"],
      ownShorts: own,
      rivalShorts: rival,
      firstDay: [],
      activity: new Map(),
      now: NOW,
    });
    expect(result.map((r) => r.scope)).toEqual(["A", "B", "competitors"]);
    expect(result[0].samples).toBe(20);
    expect(result[1].samples).toBe(0);
    expect(result[2].samples).toBe(20);
    expect(result[0].activity).toBeNull();
  });

  it("ohne Konkurrenten kein Konkurrenz-Eintrag", () => {
    const result = buildUploadTiming({ ownChannelIds: ["A"], ownShorts: [], rivalShorts: [], firstDay: [], activity: new Map(), now: NOW });
    expect(result.map((r) => r.scope)).toEqual(["A"]);
  });
});
