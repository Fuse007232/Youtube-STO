import { describe, expect, it } from "vitest";
import type { RankedShort } from "@/lib/data/types";
import { extrapolate } from "./extrapolate";
import { rankShorts, topShortsPerChannel } from "./ranking";
import { roundSubscribersLikeYouTube } from "./rounding";
import { sectorStatus } from "./sector";

describe("roundSubscribersLikeYouTube", () => {
  it.each([
    [999, 999],
    [1234, 1230],
    [28_456, 28_400],
    [102_345, 102_000],
    [1_234_567, 1_230_000],
  ])("%i → %i", (input, expected) => {
    expect(roundSubscribersLikeYouTube(input)).toBe(expected);
  });
});

describe("extrapolate", () => {
  it("zählt im gemessenen Tempo weiter", () => {
    expect(extrapolate(100, 2, 0, 10_000, 60_000)).toBe(120);
  });
  it("deckelt die vergangene Zeit", () => {
    expect(extrapolate(100, 2, 0, 1_000_000, 60_000)).toBe(220);
  });
  it("rechnet nie rückwärts", () => {
    expect(extrapolate(100, 2, 10_000, 0, 60_000)).toBe(100);
  });
});

describe("sectorStatus", () => {
  it("lila bei Bestwert", () => expect(sectorStatus(500, 300, 500)).toBe("best"));
  it("grün wenn besser als Vortag", () => expect(sectorStatus(400, 300, 500)).toBe("improved"));
  it("gelb wenn schlechter als Vortag", () => expect(sectorStatus(200, 300, 500)).toBe("worse"));
  it("neutral ohne Vergleich", () => expect(sectorStatus(200, null, null)).toBe("neutral"));
  it("nie lila bei 0", () => expect(sectorStatus(0, 0, 0)).toBe("neutral"));
});

function short(id: string, channelId: string, views24h: number, views: number): RankedShort {
  return {
    id,
    channelId,
    title: id,
    publishedAt: 0,
    thumbnailUrl: null,
    durationSec: 30,
    views,
    views24h,
    views7d: views24h,
    likes: 0,
  };
}

describe("Ranglisten", () => {
  const list = [
    short("a1", "A", 50, 1000),
    short("a2", "A", 40, 5000),
    short("a3", "A", 30, 10),
    short("b1", "B", 5, 99999),
    short("b2", "B", 1, 1),
  ];
  it("sortiert nach dem gewählten Zeitraum", () => {
    expect(rankShorts(list, "24h", 2).map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(rankShorts(list, "all", 2).map((s) => s.id)).toEqual(["b1", "a2"]);
  });
  it("behält die besten N je Kanal", () => {
    const top = topShortsPerChannel(list, "24h", 2);
    expect(top.map((s) => s.id)).toEqual(["a1", "a2", "b1", "b2"]);
  });
});
