import { describe, expect, it, vi } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { runSnapshot } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { BRV_ID, GRA_ID, VIDEOS, createFakeYouTube } from "@/lib/youtube/__fixtures__/fake-youtube";
import { MockDataSource } from "@/lib/data/mock/MockDataSource";
import { DatabaseDataSource } from "./DatabaseDataSource";

const CH: ChannelConfig[] = [
  { id: BRV_ID, name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" },
  { id: GRA_ID, name: "Granny Aura", code: "GRA", color: "#3987e5", kind: "own" },
];
const NOW = Date.UTC(2026, 9, 1, 12, 0);
const MIN = 60_000;

describe("DatabaseDataSource", () => {
  it("ohne Schnappschüsse: Fallback + Selbstauslöser", async () => {
    const onStale = vi.fn();
    const source = new DatabaseDataSource(new MemoryStore(), {
      channels: CH,
      onStale,
      fallback: new MockDataSource(),
    });
    const data = await source.getDashboard(NOW);
    expect(onStale).toHaveBeenCalledOnce();
    expect(data.source).toBe("mock");
  });

  it("ohne Schnappschüsse und ohne Fallback: verständlicher Fehler", async () => {
    const source = new DatabaseDataSource(new MemoryStore(), { channels: CH });
    await expect(source.getDashboard(NOW)).rejects.toThrow(/noch keine Schnappschüsse/);
  });

  it("ein Schnappschuss: echte Zahlen, aber noch kein Verlauf", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "manual", channels: CH, now: NOW });
    const data = await new DatabaseDataSource(store, { channels: CH }).getDashboard(NOW + MIN);
    expect(data.source).toBe("database");
    expect(data.hasHistory).toBe(false);
    expect(data.channels[0].current.subscribers).toBe(102_000);
    expect(data.channels[0].avatarUrl).toBe("https://yt3.ggpht.com/brv.jpg");
    expect(data.quota.usedToday).toBe(8);
  });

  it("mehrere Schnappschüsse: Verlauf, Gewinne seit Messbeginn, Ranglisten", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    const client = () => new YouTubeDataClient("test-key", yt.fetchFn);
    await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW });
    // Ein Short legt zu
    const v = VIDEOS.UU_GRA[0];
    v.statistics!.viewCount = "51000";
    try {
      await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW + 3 * 60 * MIN, mode: "full" });
      const data = await new DatabaseDataSource(store, { channels: CH }).getDashboard(NOW + 3 * 60 * MIN + MIN);
      expect(data.hasHistory).toBe(true);
      expect(data.historyHours).toBeCloseTo(3);
      const top24 = data.topShorts["24h"];
      expect(top24[0].id).toBe(v.id);
      expect(top24[0].views24h).toBe(50_000);
    } finally {
      v.statistics!.viewCount = "1000";
    }
  });

  it("stößt einen Schnappschuss an, wenn der letzte überfällig ist", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "cron", channels: CH, now: NOW });
    const onStale = vi.fn();
    const source = new DatabaseDataSource(store, { channels: CH, onStale });
    await source.getDashboard(NOW + 10 * MIN);
    expect(onStale).not.toHaveBeenCalled();
    await source.getDashboard(NOW + 25 * MIN);
    expect(onStale).toHaveBeenCalledOnce();
  });

  it("Boxenstrategie: je eigener Kanal, Rohdaten nur einmal pro Schnappschuss", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "cron", channels: CH, now: NOW });
    const firstDay = vi.spyOn(store, "getFirstDayViews");
    const timingCache = {};
    const source = new DatabaseDataSource(store, { channels: CH, timing: store, timingCache });
    const a = await source.getDashboard(NOW + MIN);
    await new DatabaseDataSource(store, { channels: CH, timing: store, timingCache }).getDashboard(NOW + 2 * MIN);
    expect(firstDay).toHaveBeenCalledOnce();
    expect(a.uploadTiming?.map((t) => t.scope)).toEqual([BRV_ID, GRA_ID]);
    // Ohne Timing-Leser keine Auswertung
    expect((await new DatabaseDataSource(store, { channels: CH }).getDashboard(NOW + MIN)).uploadTiming).toBeNull();
  });
});
