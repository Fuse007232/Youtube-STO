import type { YtChannel, YtVideo } from "../types";

/**
 * Nachgebaute YouTube-API für Tests – antwortet wie die echte API,
 * aber ohne Internet und ohne Kontingent.
 */

export const BRV_ID = "UCJtW0caGhgqEWxNh2HcsGPg";
export const GRA_ID = "UCSxDp-sHQ49VwIz0Ix9fusA";
/** Konkurrent mit vielen Shorts (für das 200-Shorts-Limit). */
export const COMP_ID = "UCcompetitor0000000000AA";

function makeVideos(prefix: string, channelId: string, count: number): YtVideo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, "0")}`,
    snippet: {
      title: `${prefix} Short ${i}`,
      publishedAt: new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString(),
      channelId,
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${prefix}${i}/hqdefault.jpg` } },
    },
    statistics: { viewCount: String((i + 1) * 1000), likeCount: String((i + 1) * 40) },
    contentDetails: { duration: i % 2 ? "PT45S" : "PT1M2S" },
  }));
}

export const VIDEOS: Record<string, YtVideo[]> = {
  UU_BRV: makeVideos("brv", BRV_ID, 120),
  UU_GRA: makeVideos("gra", GRA_ID, 30),
  UU_COMP: makeVideos("cmp", COMP_ID, 300),
};

export const CHANNELS: YtChannel[] = [
  {
    id: BRV_ID,
    snippet: { title: "Brainrot Vault", thumbnails: { high: { url: "https://yt3.ggpht.com/brv.jpg" } } },
    statistics: { viewCount: "146000000", subscriberCount: "102000", videoCount: "120" },
    contentDetails: { relatedPlaylists: { uploads: "UU_BRV" } },
  },
  {
    id: GRA_ID,
    snippet: { title: "Granny Aura" },
    statistics: { viewCount: "16300000", subscriberCount: "28400", videoCount: "30" },
    contentDetails: { relatedPlaylists: { uploads: "UU_GRA" } },
  },
  {
    id: COMP_ID,
    snippet: { title: "Skibidi Lab", customUrl: "@skibidilab", thumbnails: { high: { url: "https://yt3.ggpht.com/cmp.jpg" } } },
    statistics: { viewCount: "900000000", subscriberCount: "452000", videoCount: "300" },
    contentDetails: { relatedPlaylists: { uploads: "UU_COMP" } },
  },
];

export interface FakeOptions {
  channels?: YtChannel[];
  error?: { status: number; reason: string; message: string };
}

/** Liefert eine fetch-Funktion, die wie die YouTube-API antwortet, und protokolliert die Aufrufe. */
export function createFakeYouTube(opts: FakeOptions = {}) {
  const calls: URL[] = [];
  const channels = opts.channels ?? CHANNELS;

  const fetchFn = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (opts.error) {
      return json(
        { error: { code: opts.error.status, message: opts.error.message, errors: [{ reason: opts.error.reason }] } },
        opts.error.status,
      );
    }

    const endpoint = url.pathname.split("/").pop();
    const p = url.searchParams;
    if (p.get("key") !== "test-key") {
      // So antwortet Google wirklich bei einem falschen Schlüssel.
      return json(
        {
          error: {
            code: 400,
            message: "API key not valid. Please pass a valid API key.",
            errors: [{ reason: "badRequest", message: "API key not valid. Please pass a valid API key." }],
            details: [{ reason: "API_KEY_INVALID" }],
          },
        },
        400,
      );
    }

    if (endpoint === "channels") {
      const handle = p.get("forHandle");
      if (handle) {
        const h = handle.replace(/^@/, "").toLowerCase();
        return json({ items: channels.filter((c) => c.snippet?.customUrl?.replace(/^@/, "").toLowerCase() === h) });
      }
      const ids = (p.get("id") ?? "").split(",");
      return json({ items: channels.filter((c) => ids.includes(c.id)) });
    }
    if (endpoint === "playlistItems") {
      const all = VIDEOS[p.get("playlistId") ?? ""] ?? [];
      const start = Number(p.get("pageToken") ?? 0);
      const size = Number(p.get("maxResults") ?? 5);
      const page = all.slice(start, start + size);
      return json({
        items: page.map((v) => ({ contentDetails: { videoId: v.id } })),
        nextPageToken: start + size < all.length ? String(start + size) : undefined,
      });
    }
    if (endpoint === "videos") {
      const ids = (p.get("id") ?? "").split(",");
      if (ids.length > 50) return json({ error: { code: 400, message: "too many ids" } }, 400);
      const all = Object.values(VIDEOS).flat();
      return json({ items: all.filter((v) => ids.includes(v.id)) });
    }
    if (endpoint === "commentThreads") {
      const thread = (id: string, videoId: string, text: string, likes: number, at: string) => ({
        id,
        snippet: {
          videoId,
          totalReplyCount: 1,
          topLevelComment: { id, snippet: { authorDisplayName: "@fan", textOriginal: text, likeCount: likes, publishedAt: at } },
        },
      });
      const channelId = p.get("allThreadsRelatedToChannelId");
      if (channelId) {
        const playlist = channelId === GRA_ID ? "UU_GRA" : "UU_BRV";
        const first = VIDEOS[playlist]?.[0]?.id ?? "x";
        return json({
          items: [
            thread(`${channelId}-c1`, first, "Teil 2 bitte!", 3, "2026-10-01T10:00:00Z"),
            thread(`${channelId}-c2`, first, "Legendär", 0, "2026-10-01T11:00:00Z"),
            // Kommentar zu einem Video, das wir nicht kennen (z. B. langes Video) → wird ignoriert
            thread(`${channelId}-c3`, "unbekanntes-video", "?", 0, "2026-10-01T11:30:00Z"),
          ],
        });
      }
      const videoId = p.get("videoId") ?? "";
      return json({ items: [thread(`${videoId}-top`, videoId, "Bester Short ever", 500, "2026-09-30T08:00:00Z")] });
    }
    return json({ error: { code: 404, message: "unknown endpoint" } }, 404);
  }) as typeof fetch;

  return { fetchFn, calls };
}
