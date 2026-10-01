import type { CommentItem } from "@/lib/data/types";
import type { YtCommentThread, YtThumbnails } from "./types";

/** ISO-8601-Dauer von YouTube („PT1M5S“) → Sekunden (65). */
export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Math.round(Number(s ?? 0))
  );
}

/** Zahl aus einem YouTube-Text-Feld („12345“) – fehlt es, dann 0. */
export function toInt(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Bestes verfügbares Vorschaubild in sinnvoller Größe. */
export function pickThumbnail(thumbs: YtThumbnails | undefined): string | null {
  if (!thumbs) return null;
  return (thumbs.high ?? thumbs.medium ?? thumbs.standard ?? thumbs.default ?? thumbs.maxres)?.url ?? null;
}

/** Liste in Pakete aufteilen (z. B. 50 Video-IDs pro Abfrage). */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Kommentar-Thread → gespeicherter Kommentar (null, wenn unvollständig). */
export function parseCommentThread(t: YtCommentThread, channelId: string): CommentItem | null {
  const c = t.snippet?.topLevelComment?.snippet;
  const videoId = t.snippet?.videoId;
  const publishedAt = c?.publishedAt ? Date.parse(c.publishedAt) : NaN;
  if (!c || !videoId || Number.isNaN(publishedAt)) return null;
  return {
    id: t.snippet?.topLevelComment?.id ?? t.id,
    videoId,
    channelId,
    author: c.authorDisplayName ?? "",
    text: (c.textOriginal ?? c.textDisplay ?? "").slice(0, 2000),
    likes: Number(c.likeCount ?? 0),
    replies: Number(t.snippet?.totalReplyCount ?? 0),
    publishedAt,
  };
}
