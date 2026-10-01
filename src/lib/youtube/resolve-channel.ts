import type { YouTubeDataClient } from "./client";

/**
 * Erkennt, welchen Kanal jemand meint – aus Link, @Handle, Kanal-ID oder Short-Link.
 * Bewusst ohne search.list (100 Einheiten): jede Auflösung kostet 1 Einheit.
 */

export type ChannelRef =
  | { type: "id"; value: string }
  | { type: "handle"; value: string }
  | { type: "username"; value: string }
  | { type: "video"; value: string };

export class ChannelInputError extends Error {}

const ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@?[A-Za-z0-9._-]{3,30}$/;
const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseChannelInput(raw: string): ChannelRef {
  const input = raw.trim();
  if (!input) throw new ChannelInputError("Bitte einen Kanal-Link, @Handle oder eine Kanal-ID eingeben.");
  if (ID_RE.test(input)) return { type: "id", value: input };
  if (input.startsWith("@") && HANDLE_RE.test(input)) return { type: "handle", value: input };

  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    url = null;
  }
  if (url && /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)) {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (url.hostname.toLowerCase().endsWith("youtu.be") && parts[0] && VIDEO_RE.test(parts[0])) {
      return { type: "video", value: parts[0] };
    }
    const [first, second] = parts;
    if (first?.startsWith("@")) return { type: "handle", value: first };
    if (first === "channel" && second && ID_RE.test(second)) return { type: "id", value: second };
    if (first === "user" && second) return { type: "username", value: second };
    if ((first === "shorts" || first === "live") && second && VIDEO_RE.test(second)) return { type: "video", value: second };
    if (first === "watch" && url.searchParams.get("v") && VIDEO_RE.test(url.searchParams.get("v")!)) {
      return { type: "video", value: url.searchParams.get("v")! };
    }
    if (first === "c") {
      throw new ChannelInputError(
        "Links mit /c/… kann YouTube nicht günstig auflösen. Bitte den @Handle des Kanals verwenden (steht unter dem Kanalnamen).",
      );
    }
  }
  if (HANDLE_RE.test(input)) return { type: "handle", value: `@${input.replace(/^@/, "")}` };
  throw new ChannelInputError("Das sieht nicht nach einem YouTube-Kanal aus. Erlaubt: Kanal-Link, @Handle, Kanal-ID (UC…) oder Short-Link.");
}

export interface ResolvedChannel {
  id: string;
  title: string;
  avatarUrl: string | null;
  subscribers: number;
  videoCount: number;
}

/** Fragt YouTube nach dem Kanal (1–2 Einheiten). */
export async function resolveChannel(client: YouTubeDataClient, ref: ChannelRef): Promise<ResolvedChannel> {
  let id: string | null = null;
  if (ref.type === "id") id = ref.value;
  if (ref.type === "video") {
    const [video] = await client.listVideos([ref.value]);
    id = video?.snippet?.channelId ?? null;
    if (!id) throw new ChannelInputError("Zu diesem Short wurde kein Kanal gefunden.");
  }
  const channels =
    ref.type === "handle"
      ? await client.listChannelsBy({ forHandle: ref.value })
      : ref.type === "username"
        ? await client.listChannelsBy({ forUsername: ref.value })
        : await client.listChannels([id!]);
  const ch = channels[0];
  if (!ch) throw new ChannelInputError("YouTube kennt diesen Kanal nicht. Stimmt der @Handle bzw. Link?");
  const thumbs = ch.snippet?.thumbnails;
  return {
    id: ch.id,
    title: ch.snippet?.title ?? ch.id,
    avatarUrl: (thumbs?.high ?? thumbs?.medium ?? thumbs?.default)?.url ?? null,
    subscribers: Number(ch.statistics?.subscriberCount ?? 0),
    videoCount: Number(ch.statistics?.videoCount ?? 0),
  };
}
