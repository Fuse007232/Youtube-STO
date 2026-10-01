import { describe, expect, it } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { buildCommentPulse } from "@/lib/metrics/comments";
import { runSnapshot } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { BRV_ID, COMP_ID, GRA_ID, VIDEOS, createFakeYouTube } from "@/lib/youtube/__fixtures__/fake-youtube";
import { runCommentsIfDue } from "./run-comments";

const CH: ChannelConfig[] = [
  { id: BRV_ID, name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" },
  { id: GRA_ID, name: "Granny Aura", code: "GRA", color: "#3987e5", kind: "own" },
];
const NOW = Date.UTC(2026, 9, 1, 12, 0);
const MIN = 60_000;

async function setup() {
  const store = new MemoryStore();
  const yt = createFakeYouTube();
  const client = new YouTubeDataClient("test-key", yt.fetchFn);
  await runSnapshot({ store, client, trigger: "cron", channels: CH, now: NOW });
  return { store, yt, client: new YouTubeDataClient("test-key", yt.fetchFn) };
}

describe("runCommentsIfDue", () => {
  it("holt neueste Kommentare je Kanal, ignoriert unbekannte Videos, höchstens stündlich", async () => {
    const { store, yt, client } = await setup();
    const withRival: ChannelConfig[] = [...CH, { id: COMP_ID, name: "Skibidi Lab", code: "SKL", color: "#199e70", kind: "competitor" }];
    const r = await runCommentsIfDue({ store, client, channels: withRival, trigger: "cron", now: NOW + MIN });
    expect(r).not.toBeNull();
    // 2 Kanäle × (1 Kanal-Abruf + Top-Shorts mit 24h-Aufrufen) – ohne Verlauf gibt es noch keine Top-Shorts
    expect(yt.calls.filter((u) => u.pathname.endsWith("commentThreads")).length).toBe(r!.units);
    expect(store.comments.size).toBe(4);
    expect([...store.comments.values()].every((c) => c.videoId !== "unbekanntes-video")).toBe(true);
    expect(store.runs.at(-1)).toMatchObject({ mode: "comments", ok: true });

    // Gleich danach: übersprungen
    expect(await runCommentsIfDue({ store, client, channels: CH, trigger: "cron", now: NOW + 10 * MIN })).toBeNull();
    // Konkurrenten werden nie abgefragt
    expect(yt.calls.some((u) => u.searchParams.get("allThreadsRelatedToChannelId") === COMP_ID)).toBe(false);
  });

  it("holt zusätzlich die beliebtesten Kommentare der stärksten Shorts", async () => {
    const { store, client } = await setup();
    const v = VIDEOS.UU_GRA[0];
    v.statistics!.viewCount = "51000";
    try {
      await runSnapshot({ store, client, trigger: "cron", channels: CH, now: NOW + 60 * MIN, mode: "full" });
      await runCommentsIfDue({ store, client, channels: CH, trigger: "cron", now: NOW + 61 * MIN, force: true });
      expect(store.comments.get(`${v.id}-top`)).toMatchObject({ likes: 500, channelId: GRA_ID });
      const top = await store.getVideoComments(v.id!, 5);
      expect(top[0].text).toBe("Bester Short ever");
    } finally {
      v.statistics!.viewCount = "1000";
    }
  });
});

describe("buildCommentPulse", () => {
  it("sortiert, kürzt und ergänzt Titel", () => {
    const c = (id: string, likes: number, at: number) => ({
      id,
      videoId: "v1",
      channelId: "A",
      author: "@a",
      text: id,
      likes,
      replies: 0,
      publishedAt: at,
    });
    const shorts = [
      { id: "v1", channelId: "A", title: "Mein Short", publishedAt: 0, thumbnailUrl: null, durationSec: 30, views: 10, views24h: 5, views7d: 5, likes: 0 },
    ];
    const p = buildCommentPulse(
      {
        recent: [c("alt", 1, 1), c("neu", 0, 5)],
        top: [c("wenig", 1, 1), c("viel", 9, 1)],
        gains: [
          { id: "v1", channelId: "A", commentsNow: 12, commentsBefore: 2 },
          { id: "fremd", channelId: "A", commentsNow: 99, commentsBefore: 0 },
        ],
      },
      shorts,
    );
    expect(p.recent.map((x) => x.id)).toEqual(["neu", "alt"]);
    expect(p.top[0].id).toBe("viel");
    expect(p.top[0].videoTitle).toBe("Mein Short");
    expect(p.hotShorts).toEqual([{ id: "v1", channelId: "A", title: "Mein Short", thumbnailUrl: null, comments24h: 10 }]);
  });
});
