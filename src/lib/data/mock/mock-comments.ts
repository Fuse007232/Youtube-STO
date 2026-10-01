import type { CommentItem, RankedShort } from "@/lib/data/types";
import { createRandom, hashString } from "./random";

/** Erfundene Kommentare für Design-Tests (fester Zufall → immer gleich). */

const AUTHORS = ["@skibidi_fan", "@oma.hilde", "@aura_farmer", "@mathe_king", "@lisa.k", "@tomtom", "@brainrot_daily", "@nina_lol", "@gen_z_opa", "@sigma.sam"];
const TEXTS = [
  "Ich kann nicht mehr 😂😂",
  "Teil 2 bitte!!!",
  "Wer schaut das auch um 3 Uhr nachts?",
  "Die Oma ist einfach legendär 💀",
  "Das Ende hat mich komplett zerstört",
  "+1000 Aura",
  "Wie kommt man auf so eine Idee 😭",
  "Hab's meiner ganzen Klasse gezeigt",
  "Beste Folge bisher",
  "Ich hab beim dritten Mal erst verstanden 😅",
  "Mehr davon!",
  "Warum ist das so lustig",
];

export function mockComments(short: Pick<RankedShort, "id" | "channelId" | "publishedAt" | "views">, at: number): CommentItem[] {
  const rand = createRandom(hashString(`comments:${short.id}`));
  const count = 3 + Math.floor(rand() * 5);
  const span = Math.max(60_000, at - short.publishedAt);
  return Array.from({ length: count }, (_, i) => {
    const publishedAt = short.publishedAt + Math.floor(rand() * span);
    return {
      id: `${short.id}-c${i}`,
      videoId: short.id,
      channelId: short.channelId,
      author: AUTHORS[Math.floor(rand() * AUTHORS.length)],
      text: TEXTS[Math.floor(rand() * TEXTS.length)],
      likes: Math.floor(rand() ** 3 * Math.max(10, short.views / 400)),
      replies: Math.floor(rand() ** 2 * 12),
      publishedAt,
    };
  })
    .filter((c) => c.publishedAt <= at)
    .sort((a, b) => b.likes - a.likes);
}

/** Kommentar-Puls für Beispieldaten: Kommentare der 15 neuesten Shorts + Zuwachs. */
export function mockCommentData(shorts: RankedShort[], at: number) {
  const recentShorts = [...shorts].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 15);
  const all = recentShorts.flatMap((s) => mockComments(s, at));
  return {
    recent: [...all].sort((a, b) => b.publishedAt - a.publishedAt),
    top: all.filter((c) => c.publishedAt >= at - 7 * 86_400_000),
    gains: shorts
      .filter((s) => s.views24h > 0)
      .map((s) => ({
        id: s.id,
        channelId: s.channelId,
        commentsNow: Math.round(s.views * 0.0015),
        commentsBefore: Math.round((s.views - s.views24h) * 0.0015),
      })),
  };
}
