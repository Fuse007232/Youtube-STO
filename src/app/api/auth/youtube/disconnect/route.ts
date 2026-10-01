import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/auth/crypto";
import { isAuthenticated } from "@/lib/auth/server";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";

/** POST /api/auth/youtube/disconnect – Verbindung eines Kanals trennen (und bei Google widerrufen). */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const form = await req.formData();
  const channelId = String(form.get("channel") ?? "");
  const store = new SupabaseStore(getSupabase());

  const conn = (await store.getConnections()).find((c) => c.channelId === channelId);
  if (conn) {
    try {
      // Bei Google widerrufen (beste Mühe – Fehler hier ignorieren)
      const token = decryptSecret(conn.refreshTokenEnc);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } catch {
      // egal – lokal wird trotzdem gelöscht
    }
    await store.deleteConnection(channelId);
  }
  const to = new URL("/settings", req.url);
  to.searchParams.set("disconnected", channelId);
  return NextResponse.redirect(to, 303);
}
