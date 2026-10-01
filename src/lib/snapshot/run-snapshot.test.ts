import { describe, expect, it } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { BRV_ID, GRA_ID, VIDEOS, createFakeYouTube } from "@/lib/youtube/__fixtures__/fake-youtube";
import { chooseMode, runSnapshot, runSnapshotIfDue } from "./run-snapshot";

const CH: ChannelConfig[] = [
  { id: BRV_ID, name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" },
  { id: GRA_ID, name: "Granny Aura", code: "GRA", color: "#3987e5", kind: "own" },
];
const NOW = Date.UTC(2026, 9, 1, 12, 0);
const MIN = 60_000;

function setup() {
  const store = new MemoryStore();
  const yt = createFakeYouTube();
  const client = () => new YouTubeDataClient("test-key", yt.fetchFn);
  return { store, yt, client };
}

describe("runSnapshot", () => {
  it("erster Lauf ist ein voller Lauf und speichert alles", async () => {
    const { store, client } = setup();
    const r = await runSnapshot({ store, client: client(), trigger: "manual", channels: CH, now: NOW });
    expect(r.mode).toBe("full");
    expect(store.channels.size).toBe(2);
    expect(store.channelSnapshots).toHaveLength(2);
    expect(store.videos.size).toBe(150);
    expect(store.videoSnapshots).toHaveLength(150);
    // 1 Kanäle + BRV 3 Seiten + GRA 1 Seite + 150 Videos in 3 gemeinsamen 50er-Paketen
    expect(r.units).toBe(8);
    expect(store.runs[0]).toMatchObject({ mode: "full", ok: true, units: 8 });
    // Einmal am Tag verdichten
    expect(store.compactCalls).toBe(1);
  });

  it("15 Minuten später: schneller Lauf mit wenig Kontingent", async () => {
    const { store, client } = setup();
    await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW });
    const r = await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW + 15 * MIN });
    expect(r.mode).toBe("quick");
    // 1 Kanäle + 2 erste Upload-Seiten + Videos (50 BRV + 30 GRA → 2 Pakete)
    expect(r.units).toBeLessThanOrEqual(6);
    expect(store.channelSnapshots).toHaveLength(4);
    // Aufrufe unverändert → keine neuen Video-Schnappschüsse
    expect(r.videoSnapshots).toBe(0);
    expect(store.compactCalls).toBe(1);
  });

  it("speichert Video-Schnappschüsse nur bei geänderten Aufrufen", async () => {
    const { store, client } = setup();
    await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW });
    // brv000 steht auf der ersten Upload-Seite → wird auch im schnellen Lauf abgefragt
    VIDEOS.UU_BRV[0].statistics!.viewCount = "999999";
    try {
      const r = await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW + 15 * MIN });
      expect(r.videoSnapshots).toBe(1);
    } finally {
      VIDEOS.UU_BRV[0].statistics!.viewCount = "1000";
    }
  });

  it("nach einer Stunde wieder ein voller Lauf", () => {
    const runs = [{ id: 1, startedAt: NOW, mode: "full" as const, ok: true, units: 9 }];
    expect(chooseMode(runs, NOW + 30 * MIN)).toBe("quick");
    expect(chooseMode(runs, NOW + 60 * MIN)).toBe("full");
    // Fehlgeschlagener voller Lauf zählt nicht
    expect(chooseMode([{ ...runs[0], ok: false }], NOW + 5 * MIN)).toBe("full");
  });

  it("markiert gelöschte Videos beim vollen Lauf", async () => {
    const { store, client } = setup();
    await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW });
    await store.upsertVideos(
      [{ id: "weg", channelId: GRA_ID, title: "gelöscht", publishedAt: NOW - 1e9, thumbnailUrl: null, durationSec: 20, views: 5, likes: 0, comments: 0 }],
      NOW,
    );
    const r = await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW + 70 * MIN, mode: "full" });
    expect(r.removed).toBe(1);
    expect(store.videos.get("weg")!.removedAt).toBe(NOW + 70 * MIN);
  });

  it("protokolliert Fehler im Lauf", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube({ error: { status: 403, reason: "quotaExceeded", message: "quota" } });
    await expect(
      runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "cron", channels: CH, now: NOW }),
    ).rejects.toThrow(/Tageskontingent/);
    expect(store.runs[0].ok).toBe(false);
    expect(store.runs[0].finish?.error).toMatch(/Tageskontingent/);
  });
});

describe("runSnapshotIfDue (Selbstauslöser)", () => {
  it("läuft nicht doppelt, wenn gerade erst ein Lauf war", async () => {
    const { store, client } = setup();
    await runSnapshot({ store, client: client(), trigger: "cron", channels: CH, now: NOW });
    const skipped = await runSnapshotIfDue({ store, client: client(), trigger: "dashboard", channels: CH, now: NOW + 5 * MIN });
    expect(skipped).toBeNull();
    const ran = await runSnapshotIfDue({ store, client: client(), trigger: "dashboard", channels: CH, now: NOW + 20 * MIN });
    expect(ran?.mode).toBe("quick");
  });
});
