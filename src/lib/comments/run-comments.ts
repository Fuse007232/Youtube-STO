import type { ChannelConfig } from "@/config/channels";
import type { CommentItem } from "@/lib/data/types";
import type { CommentStore, DashboardReader, RunTrigger, SnapshotStore } from "@/lib/db/store";
import type { YouTubeDataClient } from "@/lib/youtube/client";
import { parseCommentThread } from "@/lib/youtube/parse";

/**
 * Kommentar-Puls (Phase 7): höchstens stündlich Kommentare der eigenen Kanäle holen.
 * - neueste 100 Kommentare je Kanal (1 Einheit)
 * - die 20 beliebtesten Kommentare der 5 stärksten Shorts (24 Std.) je Kanal (je 1 Einheit)
 * → ca. 12 Einheiten pro Stunde für 2 Kanäle.
 */

export const COMMENTS_EVERY_MS = 55 * 60_000;
export const COMMENTS_TOP_SHORTS = 5;

export interface RunCommentsOptions {
  store: CommentStore & Pick<SnapshotStore, "startRun" | "finishRun" | "recentRuns" | "getVideoStates"> & Pick<DashboardReader, "getVideoRankings">;
  client: YouTubeDataClient;
  /** Nur eigene Kanäle (Konkurrenz-Kommentare werden nicht gesammelt). */
  channels: ChannelConfig[];
  trigger: RunTrigger;
  now?: number;
  force?: boolean;
}

export interface RunCommentsResult {
  saved: number;
  units: number;
}

export async function runCommentsIfDue(opts: RunCommentsOptions): Promise<RunCommentsResult | null> {
  const now = opts.now ?? Date.now();
  const { store, client } = opts;
  const channels = opts.channels.filter((c) => c.kind === "own");
  if (channels.length === 0) return null;

  if (!opts.force) {
    const runs = await store.recentRuns(now - COMMENTS_EVERY_MS);
    if (runs.some((r) => r.mode === "comments")) return null;
  }

  const runId = await store.startRun("comments", opts.trigger, now);
  const unitsBefore = client.unitsUsed;
  try {
    const ids = channels.map((c) => c.id);
    const [states, rankings] = await Promise.all([store.getVideoStates(ids), store.getVideoRankings(now)]);
    // Nur Kommentare zu Videos, die wir kennen (Fremdschlüssel; lange Videos o. Ä. fallen raus)
    const known = new Set(states.filter((s) => !s.removed).map((s) => s.id));

    const jobs: Promise<CommentItem[]>[] = [];
    for (const channel of channels) {
      jobs.push(
        client
          .listCommentThreads({ channelId: channel.id }, { order: "time", maxResults: 100 })
          .then((threads) => threads.map((t) => parseCommentThread(t, channel.id)).filter((c): c is CommentItem => c !== null)),
      );
      const hot = rankings
        .filter((r) => r.channelId === channel.id && r.views24h > 0)
        .sort((a, b) => b.views24h - a.views24h)
        .slice(0, COMMENTS_TOP_SHORTS);
      for (const short of hot) {
        jobs.push(
          client
            .listCommentThreads({ videoId: short.id }, { order: "relevance", maxResults: 20 })
            .then((threads) => threads.map((t) => parseCommentThread(t, channel.id)).filter((c): c is CommentItem => c !== null)),
        );
      }
    }
    const comments = (await Promise.all(jobs)).flat().filter((c) => known.has(c.videoId));
    await store.upsertComments(comments, now);
    const units = client.unitsUsed - unitsBefore;
    await store.finishRun(runId, { at: Date.now(), units, videos: comments.length, ok: true });
    return { saved: comments.length, units };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await store.finishRun(runId, { at: Date.now(), units: client.unitsUsed - unitsBefore, videos: 0, ok: false, error: message });
    throw e;
  }
}
