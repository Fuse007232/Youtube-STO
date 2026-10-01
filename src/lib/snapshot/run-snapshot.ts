import { CHANNELS, type ChannelConfig } from "@/config/channels";
import type {
  RunMode,
  RunRow,
  RunTrigger,
  SnapshotStore,
  VideoSnapshotRow,
  VideoUpsert,
} from "@/lib/db/store";
import type { YouTubeDataClient } from "@/lib/youtube/client";
import { parseIsoDuration, pickThumbnail, toInt } from "@/lib/youtube/parse";
import type { YtChannel } from "@/lib/youtube/types";

/**
 * Ein Schnappschuss-Lauf: holt die aktuellen Zahlen von YouTube und speichert sie.
 *
 * Zwei Arten (spart Kontingent):
 * - "quick" (alle 15 Min.): Kanalzahlen + die 50 neuesten Uploads je Kanal
 *   + alle Shorts der letzten 7 Tage → ca. 5 Einheiten
 * - "full" (höchstens 1× pro Stunde): Kanalzahlen + ALLE Shorts → ca. 21 Einheiten
 * → zusammen ca. 96 × 5 + 24 × 21 ≈ 1.000 von 10.000 Einheiten pro Tag.
 *
 * Video-Schnappschüsse werden nur gespeichert, wenn sich die Aufrufe geändert haben
 * (spart Speicher, die Rechnung bleibt trotzdem korrekt).
 * Nach einem "full"-Lauf wird einmal pro Tag verdichtet (siehe compact_video_snapshots).
 */

export const FULL_RUN_EVERY_MS = 55 * 60_000;
export const COMPACT_EVERY_MS = 23 * 60 * 60_000;
export const RECENT_VIDEO_MS = 7 * 24 * 60 * 60_000;
/** Kein neuer Lauf, wenn vor so kurzer Zeit schon einer gestartet ist (Doppelte vermeiden). */
export const MIN_RUN_GAP_MS = 12 * 60_000;

export interface RunSnapshotOptions {
  store: SnapshotStore;
  client: YouTubeDataClient;
  trigger: RunTrigger;
  mode?: "auto" | "quick" | "full";
  channels?: ChannelConfig[];
  now?: number;
}

export interface RunSnapshotResult {
  runId: number;
  mode: Exclude<RunMode, "compact">;
  takenAt: number;
  units: number;
  videosUpdated: number;
  videoSnapshots: number;
  removed: number;
  compacted: number | null;
}

/** Entscheidet, ob ein voller oder ein schneller Lauf dran ist. */
export function chooseMode(runs: RunRow[], now: number): "quick" | "full" {
  const recentFull = runs.some(
    (r) => r.mode === "full" && r.ok === true && now - r.startedAt < FULL_RUN_EVERY_MS,
  );
  return recentFull ? "quick" : "full";
}

export async function runSnapshot(opts: RunSnapshotOptions): Promise<RunSnapshotResult> {
  const { store, client, trigger } = opts;
  const channels = opts.channels ?? CHANNELS;
  const now = opts.now ?? Date.now();
  const channelIds = channels.map((c) => c.id);

  const runs = await store.recentRuns(now - 26 * 60 * 60_000);
  const mode = !opts.mode || opts.mode === "auto" ? chooseMode(runs, now) : opts.mode;
  const runId = await store.startRun(mode, trigger, now);
  const unitsBefore = client.unitsUsed;

  try {
    // 1) Kanalzahlen (1 Einheit für alle Kanäle)
    const ytChannels = await client.listChannels(channelIds);
    const byId = new Map<string, YtChannel>(ytChannels.map((c) => [c.id, c]));
    const missing = channels.filter((c) => !byId.has(c.id));
    if (missing.length > 0) {
      throw new Error(`YouTube kennt diese Kanal-ID nicht: ${missing.map((c) => c.id).join(", ")}`);
    }

    await store.upsertChannels(
      channels.map((c) => {
        const yt = byId.get(c.id)!;
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          kind: c.kind,
          uploadsPlaylistId: yt.contentDetails?.relatedPlaylists?.uploads ?? null,
          avatarUrl: pickThumbnail(yt.snippet?.thumbnails),
        };
      }),
    );
    // 2) Welche Videos sollen aktualisiert werden?
    const states = await store.getVideoStates(channelIds);
    const stateById = new Map(states.map((s) => [s.id, s]));

    const playlistIdsPerChannel = await Promise.all(
      channels.map(async (c) => {
        const uploads = byId.get(c.id)!.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) return { channelId: c.id, ids: [] as string[] };
        const ids = await client.listPlaylistVideoIds(uploads, mode === "full" ? 40 : 1);
        return { channelId: c.id, ids };
      }),
    );

    const target = new Set<string>();
    for (const { ids } of playlistIdsPerChannel) ids.forEach((id) => target.add(id));
    if (mode === "quick") {
      // Zusätzlich alle bekannten Shorts der letzten 7 Tage (falls sie nicht unter den neuesten 50 sind).
      for (const s of states) {
        if (!s.removed && s.publishedAt !== null && now - s.publishedAt < RECENT_VIDEO_MS) target.add(s.id);
      }
    }

    // 3) Statistiken holen (1 Einheit pro 50 Videos)
    const videos = await client.listVideos([...target]);
    const channelOf = new Map<string, string>();
    for (const { channelId, ids } of playlistIdsPerChannel) ids.forEach((id) => channelOf.set(id, channelId));

    const upserts: VideoUpsert[] = [];
    const snapshots: VideoSnapshotRow[] = [];
    for (const v of videos) {
      const channelId = v.snippet?.channelId ?? channelOf.get(v.id) ?? stateById.get(v.id)?.channelId;
      if (!channelId || !channelIds.includes(channelId)) continue;
      const views = toInt(v.statistics?.viewCount);
      const likes = toInt(v.statistics?.likeCount);
      const comments = toInt(v.statistics?.commentCount);
      upserts.push({
        id: v.id,
        channelId,
        title: v.snippet?.title ?? "",
        publishedAt: v.snippet?.publishedAt ? Date.parse(v.snippet.publishedAt) : null,
        thumbnailUrl: pickThumbnail(v.snippet?.thumbnails),
        durationSec: parseIsoDuration(v.contentDetails?.duration),
        views,
        likes,
        comments,
      });
      const before = stateById.get(v.id);
      if (!before || before.views !== views) {
        snapshots.push({ videoId: v.id, takenAt: now, views, likes, comments });
      }
    }
    await store.upsertVideos(upserts, now);
    await store.insertVideoSnapshots(snapshots);

    // 4) Beim vollen Lauf: gelöschte/privat gestellte Videos markieren
    let removed = 0;
    const gone = new Set<string>();
    if (mode === "full") {
      const seen = new Set(playlistIdsPerChannel.flatMap((p) => p.ids));
      states.filter((s) => !s.removed && !seen.has(s.id)).forEach((s) => gone.add(s.id));
      await store.markVideosRemoved([...gone], now);
      removed = gone.size;
    }

    // 5) Kanalzahlen speichern – inkl. Summe der Short-Aufrufe
    //    (neuer Stand für aktualisierte Shorts, letzter bekannter Stand für die übrigen).
    const latestViews = new Map<string, { channelId: string; views: number }>();
    for (const st of states) {
      if (!st.removed && !gone.has(st.id)) latestViews.set(st.id, { channelId: st.channelId, views: st.views });
    }
    for (const u of upserts) latestViews.set(u.id, { channelId: u.channelId, views: u.views });
    const videoViewsByChannel = new Map<string, number>();
    for (const { channelId, views } of latestViews.values()) {
      videoViewsByChannel.set(channelId, (videoViewsByChannel.get(channelId) ?? 0) + views);
    }

    await store.insertChannelSnapshots(
      channels.map((c) => {
        const s = byId.get(c.id)!.statistics ?? {};
        return {
          channelId: c.id,
          takenAt: now,
          subscribers: s.hiddenSubscriberCount ? 0 : toInt(s.subscriberCount),
          views: toInt(s.viewCount),
          videoCount: toInt(s.videoCount),
          videoViews: videoViewsByChannel.get(c.id) ?? null,
        };
      }),
    );

    const units = client.unitsUsed - unitsBefore;
    await store.finishRun(runId, { at: Date.now(), units, videos: upserts.length, ok: true });

    // 6) Einmal am Tag verdichten
    let compacted: number | null = null;
    const compactedRecently = runs.some(
      (r) => r.mode === "compact" && r.ok === true && now - r.startedAt < COMPACT_EVERY_MS,
    );
    if (mode === "full" && !compactedRecently) {
      const cid = await store.startRun("compact", trigger, now);
      try {
        compacted = await store.compactVideoSnapshots(now);
        await store.finishRun(cid, { at: Date.now(), units: 0, videos: compacted, ok: true });
      } catch (e) {
        await store.finishRun(cid, { at: Date.now(), units: 0, videos: 0, ok: false, error: String(e) });
      }
    }

    return {
      runId,
      mode,
      takenAt: now,
      units,
      videosUpdated: upserts.length,
      videoSnapshots: snapshots.length,
      removed,
      compacted,
    };
  } catch (e) {
    await store
      .finishRun(runId, {
        at: Date.now(),
        units: client.unitsUsed - unitsBefore,
        videos: 0,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
      .catch(() => {});
    throw e;
  }
}

/**
 * Wie runSnapshot, aber nur wenn nicht gerade erst ein Lauf gestartet wurde.
 * Für den „Selbstauslöser“ beim Öffnen des Dashboards.
 */
export async function runSnapshotIfDue(
  opts: RunSnapshotOptions,
): Promise<RunSnapshotResult | null> {
  const now = opts.now ?? Date.now();
  const runs = await opts.store.recentRuns(now - MIN_RUN_GAP_MS);
  if (runs.some((r) => r.mode === "quick" || r.mode === "full")) return null;
  return runSnapshot(opts);
}
