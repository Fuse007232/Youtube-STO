import { beforeEach, describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/data/build-dashboard";
import { resolveDataSourceKind } from "@/lib/data/resolve-kind";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { createFakeYouTube } from "@/lib/youtube/__fixtures__/fake-youtube";
import { YouTubeDataSource, fetchYouTubeSnapshot, resetYouTubeCache } from "./YouTubeDataSource";

const NOW = Date.UTC(2026, 9, 1, 12, 0);

describe("fetchYouTubeSnapshot", () => {
  it("liefert echte Kanalzahlen und alle Shorts", async () => {
    const { fetchFn } = createFakeYouTube();
    const snap = await fetchYouTubeSnapshot(new YouTubeDataClient("test-key", fetchFn), undefined, NOW);
    expect(snap.channels).toHaveLength(2);
    expect(snap.channels[0].points[0]).toEqual({
      t: NOW,
      views: 146_000_000,
      subscribers: 102_000,
      videoCount: 120,
    });
    expect(snap.channels[0].avatarUrl).toBe("https://yt3.ggpht.com/brv.jpg");
    expect(snap.shorts).toHaveLength(150);
    const s = snap.shorts.find((x) => x.id === "brv001")!;
    expect(s.durationSec).toBe(45);
    expect(s.views).toBe(2000);
    expect(s.thumbnailUrl).toContain("i.ytimg.com");
  });

  it("verbraucht wenig Kontingent: 1 + Seiten der Upload-Listen + Video-Pakete", async () => {
    const { fetchFn } = createFakeYouTube();
    const client = new YouTubeDataClient("test-key", fetchFn);
    await fetchYouTubeSnapshot(client, undefined, NOW);
    // 1 (Kanäle) + BRV 3 + 3 (120 Videos) + GRA 1 + 1 (30 Videos) = 9
    expect(client.unitsUsed).toBe(9);
  });

  it("meldet eine unbekannte Kanal-ID verständlich", async () => {
    const { fetchFn } = createFakeYouTube({ channels: [] });
    await expect(
      fetchYouTubeSnapshot(new YouTubeDataClient("test-key", fetchFn), undefined, NOW),
    ).rejects.toThrow(/kennt diese Kanal-ID nicht/);
  });

  it("ergibt ein Dashboard ohne Verlauf: nur Gesamt-Rangliste", async () => {
    const { fetchFn } = createFakeYouTube();
    const snap = await fetchYouTubeSnapshot(new YouTubeDataClient("test-key", fetchFn), undefined, NOW);
    const data = buildDashboard({
      source: "youtube",
      isDemo: false,
      hasHistory: false,
      refreshIntervalMin: 10,
      now: NOW,
      channels: snap.channels,
      shorts: snap.shorts,
      quotaUsedToday: 9,
    });
    expect(data.hasHistory).toBe(false);
    expect(data.lastSnapshotAt).toBe(NOW);
    expect(data.snapshotIntervalMin).toBe(10);
    expect(data.topShorts["24h"]).toEqual([]);
    expect(data.topShorts.all[0].id).toBe("brv119");
    expect(data.channels[0].delta24h.views).toBe(0);
    expect(data.channels[0].rate.viewsPerSecond).toBe(0);
  });
});

describe("resolveDataSourceKind", () => {
  it("Beispieldaten ohne Schlüssel", () => expect(resolveDataSourceKind({})).toBe("mock"));
  it("YouTube automatisch mit Schlüssel", () =>
    expect(resolveDataSourceKind({ YOUTUBE_API_KEY: "x" })).toBe("youtube"));
  it("DATA_SOURCE hat Vorrang", () =>
    expect(resolveDataSourceKind({ YOUTUBE_API_KEY: "x", DATA_SOURCE: "mock" })).toBe("mock"));
});

describe("YouTubeDataSource Zwischenspeicher", () => {
  beforeEach(() => resetYouTubeCache());
  const MIN = 60_000;

  it("fragt innerhalb von 10 Minuten nicht erneut bei YouTube", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const source = new YouTubeDataSource("test-key", fetchFn);
    await source.getDashboard(NOW);
    const after1 = calls.length;
    await source.getDashboard(NOW + 9 * MIN);
    expect(calls.length).toBe(after1);
  });

  it("zeigt danach sofort die alten Zahlen und frischt im Hintergrund auf", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const source = new YouTubeDataSource("test-key", fetchFn);
    const first = await source.getDashboard(NOW);
    const after1 = calls.length;
    const second = await source.getDashboard(NOW + 15 * MIN);
    // Sofort beantwortet mit dem alten Stand …
    expect(second.lastSnapshotAt).toBe(first.lastSnapshotAt);
    // … und der Hintergrund-Abruf ist gestartet.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.length).toBeGreaterThan(after1);
  });

  it("teilt gleichzeitige Anfragen auf einen Abruf auf", async () => {
    const { fetchFn, calls } = createFakeYouTube();
    const source = new YouTubeDataSource("test-key", fetchFn);
    await Promise.all([source.getDashboard(NOW), source.getDashboard(NOW), source.getDashboard(NOW)]);
    expect(calls.length).toBe(9);
  });
});
