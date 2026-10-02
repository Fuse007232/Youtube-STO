import { NextResponse, after } from "next/server";
import { CHANNELS } from "@/config/channels";
import { COMPETITOR_CONFIG, makeChannelCode, pickCompetitorColor } from "@/config/competitors";
import { isAuthenticated } from "@/lib/auth/server";
import { loadTrackedChannels } from "@/lib/competitors/tracked";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { runSnapshot } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { ChannelInputError, parseChannelInput, resolveChannel } from "@/lib/youtube/resolve-channel";

export const maxDuration = 60;

/** POST /api/competitors/add – Konkurrenz-Kanal per Link/@Handle/ID hinzufügen. */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const to = new URL("/settings", req.url);
  to.hash = "konkurrenz";
  const fail = (msg: string) => {
    to.searchParams.set("error", msg);
    return NextResponse.redirect(to, 303);
  };

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fail("YOUTUBE_API_KEY fehlt.");
  const input = String((await req.formData()).get("query") ?? "");

  try {
    const store = new SupabaseStore(getSupabase());
    const existing = await store.getCompetitors();
    if (existing.length >= COMPETITOR_CONFIG.maxCompetitors) {
      return fail(`Maximal ${COMPETITOR_CONFIG.maxCompetitors} Konkurrenten (YouTube-Kontingent). Bitte erst einen entfernen.`);
    }

    const client = new YouTubeDataClient(key);
    const ch = await resolveChannel(client, parseChannelInput(input));
    if (CHANNELS.some((c) => c.id === ch.id)) return fail(`„${ch.title}“ ist dein eigener Kanal.`);
    if (existing.some((c) => c.id === ch.id)) return fail(`„${ch.title}“ ist schon in der Liste.`);

    const code = makeChannelCode(ch.title, [...CHANNELS, ...existing].map((c) => c.code));
    const color = pickCompetitorColor(existing.map((c) => c.color));
    await store.addCompetitor({ id: ch.id, name: ch.title, code, color, avatarUrl: ch.avatarUrl });

    // Gleich die ersten Zahlen holen (im Hintergrund) – als VOLLER Lauf: So sind von Anfang an
    // alle beobachteten Shorts (bis 200) dabei. Sonst kämen beim ersten vollen Lauf auf einen
    // Schlag ältere Shorts dazu, und die Summe der Aufrufe würde einen falschen „Gewinn“ zeigen.
    after(async () => {
      try {
        await runSnapshot({ store, client, trigger: "manual", mode: "full", channels: await loadTrackedChannels(store) });
      } catch (e) {
        console.error("[competitors] Erst-Schnappschuss fehlgeschlagen:", e);
      }
    });

    to.searchParams.set("added", ch.title);
    return NextResponse.redirect(to, 303);
  } catch (e) {
    if (e instanceof ChannelInputError) return fail(e.message);
    console.error("[competitors/add]", e);
    return fail(e instanceof Error ? e.message : String(e));
  }
}
