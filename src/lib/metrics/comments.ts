import type { CommentItem, CommentPulse, RankedShort } from "@/lib/data/types";
import type { CommentGainRow } from "@/lib/db/store";

/** Kommentar-Puls aus gespeicherten Kommentaren + Kommentar-Zuwachs je Short (Phase 7). */
export function buildCommentPulse(
  raw: { recent: CommentItem[]; top: CommentItem[]; gains: CommentGainRow[] },
  shorts: RankedShort[],
  limits = { recent: 12, top: 8, hot: 6 },
): CommentPulse {
  const byId = new Map(shorts.map((s) => [s.id, s]));
  const withTitle = (c: CommentItem): CommentItem => ({ ...c, videoTitle: byId.get(c.videoId)?.title ?? c.videoTitle });
  return {
    recent: [...raw.recent].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, limits.recent).map(withTitle),
    top: [...raw.top].sort((a, b) => b.likes - a.likes).slice(0, limits.top).map(withTitle),
    hotShorts: raw.gains
      .map((g) => ({ g, s: byId.get(g.id) }))
      .filter((x): x is { g: CommentGainRow; s: RankedShort } => Boolean(x.s) && x.g.commentsNow > x.g.commentsBefore)
      .map(({ g, s }) => ({
        id: s.id,
        channelId: s.channelId,
        title: s.title,
        thumbnailUrl: s.thumbnailUrl,
        comments24h: g.commentsNow - g.commentsBefore,
      }))
      .sort((a, b) => b.comments24h - a.comments24h)
      .slice(0, limits.hot),
  };
}
