import { NextResponse } from "next/server";
import { CHANNELS } from "@/config/channels";
import { createOAuthState } from "@/lib/auth/crypto";
import { isAuthenticated } from "@/lib/auth/server";
import { buildAuthUrl, isOAuthConfigured, redirectUriFor } from "@/lib/youtube/oauth";

/** GET /api/auth/youtube/start?channel=UC… → weiter zum Google-Login für diesen Kanal. */
export async function GET(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url));
  const url = new URL(req.url);
  const back = (error: string) => {
    const to = new URL("/settings", req.url);
    to.searchParams.set("error", error);
    return NextResponse.redirect(to);
  };
  if (!isOAuthConfigured()) {
    return back("Google-Login ist noch nicht eingerichtet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY in Vercel).");
  }
  const channelId = url.searchParams.get("channel") ?? "";
  if (!CHANNELS.some((c) => c.id === channelId)) return back("Unbekannter Kanal.");

  return NextResponse.redirect(
    buildAuthUrl({ redirectUri: redirectUriFor(url.origin), state: createOAuthState(channelId) }),
  );
}
