import { describe, expect, it } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { makeChannelCode, pickCompetitorColor } from "@/config/competitors";
import { DatabaseDataSource } from "@/lib/data/database/DatabaseDataSource";
import { MockDataSource } from "@/lib/data/mock/MockDataSource";
import type { RankedShort } from "@/lib/data/types";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { channelShortStats, sortStandings } from "@/lib/metrics/standings";
import { runSnapshot } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { BRV_ID, COMP_ID, GRA_ID, createFakeYouTube } from "@/lib/youtube/__fixtures__/fake-youtube";
import { ChannelInputError, parseChannelInput, resolveChannel } from "@/lib/youtube/resolve-channel";

const NOW = Date.UTC(2026, 9, 2, 12, 0);
const DAY = 86_400_000;

describe("parseChannelInput", () => {
  it.each([
    ["@skibidilab", { type: "handle", value: "@skibidilab" }],
    ["skibidilab", { type: "handle", value: "@skibidilab" }],
    ["https://www.youtube.com/@skibidilab", { type: "handle", value: "@skibidilab" }],
    ["youtube.com/@skibidilab/shorts", { type: "handle", value: "@skibidilab" }],
    ["https://m.youtube.com/@Some.Name", { type: "handle", value: "@Some.Name" }],
    ["UCcompetitor0000000000AA", { type: "id", value: "UCcompetitor0000000000AA" }],
    ["https://www.youtube.com/channel/UCcompetitor0000000000AA", { type: "id", value: "UCcompetitor0000000000AA" }],
    ["https://youtube.com/shorts/abcdefghijk", { type: "video", value: "abcdefghijk" }],
    ["https://youtu.be/abcdefghijk", { type: "video", value: "abcdefghijk" }],
    ["https://www.youtube.com/user/oldname", { type: "username", value: "oldname" }],
  ])("%s", (input, expected) => {
    expect(parseChannelInput(input)).toEqual(expected);
  });

  it("/c/-Links und Unsinn → verständlicher Fehler", () => {
    expect(() => parseChannelInput("https://www.youtube.com/c/Name")).toThrow(/@Handle/);
    expect(() => parseChannelInput("https://example.com/x")).toThrow(ChannelInputError);
    expect(() => parseChannelInput("   ")).toThrow(ChannelInputError);
  });
});

describe("resolveChannel", () => {
  it("findet den Kanal über den @Handle (1 Einheit, kein search.list)", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const client = new YouTubeDataClient("test-key", fetchFn);
    const ch = await resolveChannel(client, parseChannelInput("@skibidilab"));
    expect(ch).toMatchObject({ id: COMP_ID, title: "Skibidi Lab", subscribers: 452_000 });
    expect(client.unitsUsed).toBe(1);
    expect(calls.some((u) => u.pathname.endsWith("/search"))).toBe(false);
  });
  it("findet den Kanal über einen Short-Link", async () => {
    const { fetchFn } = createFakeYouTube();
    const ch = await resolveChannel(new YouTubeDataClient("test-key", fetchFn), { type: "video", value: "cmp000" });
    expect(ch.id).toBe(COMP_ID);
  });
  it("unbekannter Handle → verständlicher Fehler", async () => {
    const { fetchFn } = createFakeYouTube();
    await expect(resolveChannel(new YouTubeDataClient("test-key", fetchFn), { type: "handle", value: "@gibtsnicht" })).rejects.toThrow(/kennt diesen Kanal nicht/);
  });
});

describe("Kürzel und Farben", () => {
  it("3 Buchstaben im F1-Stil, eindeutig", () => {
    expect(makeChannelCode("Skibidi Lab", [])).toBe("SKL");
    expect(makeChannelCode("Roblox Rush Daily", [])).toBe("RRD");
    expect(makeChannelCode("MrBeast", [])).toBe("MRB");
    expect(makeChannelCode("Skibidi Lab", ["SKL"])).toBe("SKI");
    expect(makeChannelCode("💀💀", [])).toHaveLength(3);
  });
  it("vergibt freie Farben der Reihe nach", () => {
    expect(pickCompetitorColor([])).toBe("#199e70");
    expect(pickCompetitorColor(["#199e70"])).toBe("#c98500");
  });
});

function short(p: Partial<RankedShort>): RankedShort {
  return { id: "x", channelId: "A", title: "t", publishedAt: NOW - DAY, thumbnailUrl: null, durationSec: 30, views: 1000, views24h: 100, views7d: 500, likes: 0, ...p };
}

describe("Fahrerwertung-Kennzahlen", () => {
  it("Uploads 7 Tage, Ø pro Short (30 Tage), bester Short 24h", () => {
    const shorts = [
      short({ id: "a", publishedAt: NOW - 2 * DAY, views: 10_000, views24h: 3_000 }),
      short({ id: "b", publishedAt: NOW - 10 * DAY, views: 20_000, views24h: 500 }),
      short({ id: "c", publishedAt: NOW - 40 * DAY, views: 999_999, views24h: 9_000 }),
      short({ id: "z", channelId: "B", views24h: 1e9 }),
    ];
    const s = channelShortStats(shorts, "A", NOW);
    expect(s.uploads7d).toBe(1);
    expect(s.avgViewsPerShort30d).toBe(15_000);
    expect(s.bestShort24h?.id).toBe("c");
  });
});

const OWN: ChannelConfig[] = [
  { id: BRV_ID, name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" },
  { id: GRA_ID, name: "Granny Aura", code: "GRA", color: "#3987e5", kind: "own" },
];
const COMP: ChannelConfig = { id: COMP_ID, name: "Skibidi Lab", code: "SKL", color: "#199e70", kind: "competitor" };

describe("Konkurrenten im Schnappschuss", () => {
  it("beobachtet nur die neuesten 200 Shorts und markiert ältere nicht als gelöscht", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    const client = () => new YouTubeDataClient("test-key", yt.fetchFn);
    await store.addCompetitor({ id: COMP_ID, name: "Skibidi Lab", code: "SKL", color: "#199e70", avatarUrl: null });
    await runSnapshot({ store, client: client(), trigger: "cron", channels: [...OWN, COMP], now: NOW });
    const compVideos = [...store.videos.values()].filter((v) => v.channelId === COMP_ID);
    expect(compVideos).toHaveLength(200);
    // Ein „alter“ Short außerhalb der 200 bleibt bestehen
    await store.upsertVideos([{ id: "cmp-alt", channelId: COMP_ID, title: "alt", publishedAt: NOW - 400 * DAY, thumbnailUrl: null, durationSec: 30, views: 5, likes: 0, comments: 0 }], NOW);
    const r = await runSnapshot({ store, client: client(), trigger: "cron", channels: [...OWN, COMP], now: NOW + 70 * 60_000, mode: "full" });
    expect(r.removed).toBe(0);
    expect(store.videos.get("cmp-alt")!.removedAt).toBeNull();
    // Kanalfarbe bleibt erhalten
    expect(store.channels.get(COMP_ID)!.color).toBe("#199e70");
  });

  it("Dashboard: Fahrerwertung mit eigenen Kanälen und Konkurrenz; Top Shorts nur eigene", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    await store.addCompetitor({ id: COMP_ID, name: "Skibidi Lab", code: "SKL", color: "#199e70", avatarUrl: null });
    const channels = [...OWN, COMP];
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "cron", channels, now: NOW });
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "cron", channels, now: NOW + 15 * 60_000 });
    const data = await new DatabaseDataSource(store, { channels: OWN, competitors: store }).getDashboard(NOW + 16 * 60_000);
    expect(data.standings?.map((s) => [s.summary.channel.code, s.isOwn])).toEqual([
      ["BRV", true],
      ["GRA", true],
      ["SKL", false],
    ]);
    expect(data.channels).toHaveLength(2);
    expect(data.topShorts.all.every((s) => s.channelId !== COMP_ID)).toBe(true);
    const sorted = sortStandings(data.standings!, "subscribers");
    expect(sorted[0].summary.channel.code).toBe("SKL");
  });

  it("entfernen löscht Konkurrent samt Daten", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    await store.addCompetitor({ id: COMP_ID, name: "Skibidi Lab", code: "SKL", color: "#199e70", avatarUrl: null });
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "cron", channels: [...OWN, COMP], now: NOW });
    await store.removeCompetitor(COMP_ID);
    expect(await store.getCompetitors()).toEqual([]);
    expect([...store.videos.values()].some((v) => v.channelId === COMP_ID)).toBe(false);
    // Eigene Kanäle lassen sich so nicht löschen
    await store.removeCompetitor(BRV_ID);
    expect(store.channels.has(BRV_ID)).toBe(true);
  });
});

describe("Beispieldaten", () => {
  it("haben eine Fahrerwertung mit 3 Konkurrenten", async () => {
    const data = await new MockDataSource().getDashboard(NOW);
    expect(data.standings).toHaveLength(5);
    expect(data.standings!.filter((s) => !s.isOwn).map((s) => s.summary.channel.code)).toEqual(["SKL", "RBR", "OMP"]);
  });
});
