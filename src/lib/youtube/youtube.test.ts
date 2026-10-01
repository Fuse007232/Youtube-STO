import { beforeEach, describe, expect, it } from "vitest";
import { createFakeYouTube, BRV_ID, GRA_ID } from "./__fixtures__/fake-youtube";
import { YouTubeDataClient } from "./client";
import { YouTubeApiError } from "./errors";
import { chunk, parseIsoDuration, pickThumbnail, toInt } from "./parse";
import { quotaDayKey, quotaUsedToday, resetQuotaCounter } from "./quota";

describe("parse", () => {
  it.each([
    ["PT45S", 45],
    ["PT1M2S", 62],
    ["PT1H", 3600],
    ["P1DT2M", 86520],
    ["PT0S", 0],
    [undefined, 0],
    ["kaputt", 0],
  ])("parseIsoDuration(%s) = %i", (iso, sec) => {
    expect(parseIsoDuration(iso)).toBe(sec);
  });

  it("toInt", () => {
    expect(toInt("123")).toBe(123);
    expect(toInt(undefined)).toBe(0);
  });

  it("pickThumbnail bevorzugt high", () => {
    expect(pickThumbnail({ default: { url: "d" }, high: { url: "h" } })).toBe("h");
    expect(pickThumbnail(undefined)).toBeNull();
  });

  it("chunk teilt in 50er-Pakete", () => {
    expect(chunk(Array.from({ length: 120 }), 50).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});

describe("quota", () => {
  it("Tageswechsel nach pazifischer Zeit (9 Uhr deutscher Sommerzeit)", () => {
    // 01.10.2026 06:59 UTC = 23:59 in Kalifornien (Vortag)
    expect(quotaDayKey(Date.UTC(2026, 9, 1, 6, 59))).toBe("2026-09-30");
    expect(quotaDayKey(Date.UTC(2026, 9, 1, 7, 1))).toBe("2026-10-01");
  });
});

describe("YouTubeDataClient", () => {
  beforeEach(() => resetQuotaCounter());

  it("holt alle Kanäle in einer Abfrage", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const client = new YouTubeDataClient("test-key", fetchFn);
    const channels = await client.listChannels([BRV_ID, GRA_ID]);
    expect(channels).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(client.unitsUsed).toBe(1);
  });

  it("blättert durch die Upload-Playlist (50 pro Seite)", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const client = new YouTubeDataClient("test-key", fetchFn);
    const ids = await client.listPlaylistVideoIds("UU_BRV");
    expect(ids).toHaveLength(120);
    expect(calls).toHaveLength(3);
    expect(calls.every((u) => u.searchParams.get("maxResults") === "50")).toBe(true);
  });

  it("fragt Videos in 50er-Paketen ab", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const client = new YouTubeDataClient("test-key", fetchFn);
    const ids = Array.from({ length: 120 }, (_, i) => `brv${String(i).padStart(3, "0")}`);
    const videos = await client.listVideos(ids);
    expect(videos).toHaveLength(120);
    expect(calls).toHaveLength(3);
    expect(quotaUsedToday()).toBe(3);
  });

  it("nutzt nie search.list", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const client = new YouTubeDataClient("test-key", fetchFn);
    await client.listChannels([BRV_ID]);
    await client.listPlaylistVideoIds("UU_GRA");
    expect(calls.some((u) => u.pathname.endsWith("/search"))).toBe(false);
  });

  it("übersetzt Fehler verständlich", async () => {
    const { fetchFn } = createFakeYouTube({
      error: { status: 403, reason: "quotaExceeded", message: "The request cannot be completed because you have exceeded your quota." },
    });
    const client = new YouTubeDataClient("test-key", fetchFn);
    await expect(client.listChannels([BRV_ID])).rejects.toThrow(/Tageskontingent/);
    await expect(client.listChannels([BRV_ID])).rejects.toBeInstanceOf(YouTubeApiError);
  });

  it("verrät bei Netzwerkfehlern den Schlüssel nicht", async () => {
    const failing = (async (url: URL) => {
      throw new Error(`connect failed ${url.toString()}`);
    }) as unknown as typeof fetch;
    const client = new YouTubeDataClient("geheim-123", failing);
    const err = await client.listChannels([BRV_ID]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(YouTubeApiError);
    expect(String((err as Error).message)).not.toContain("geheim-123");
  });

  it("meldet einen falschen Schlüssel", async () => {
    const { fetchFn } = createFakeYouTube();
    const client = new YouTubeDataClient("falsch", fetchFn);
    await expect(client.listChannels([BRV_ID])).rejects.toThrow(/Schlüssel ist ungültig/);
  });
});
