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
