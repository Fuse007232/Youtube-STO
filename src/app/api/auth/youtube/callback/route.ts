import { NextResponse, after } from "next/server";
import { CHANNELS } from "@/config/channels";
import { runAnalyticsIfDue } from "@/lib/analytics/run-analytics";
import { encryptSecret, verifyOAuthState } from "@/lib/auth/crypto";
import { isAuthenticated } from "@/lib/auth/server";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { exchangeCode, getAuthorizedChannelIds, redirectUriFor } from "@/lib/youtube/oauth";

/** GET /api/auth/youtube/callback – hierher schickt Google nach dem „Erlauben“ zurück. */
export async function GET(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url));
  const url = new URL(req.url);
  const back = (params: Record<string, string>) => {
    const to = new URL("/settings", req.url);
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
    return NextResponse.redirect(to);
  };

  if (url.searchParams.get("error")) {
    return back({ error: "Verbindung abgebrochen – bei Google wurde nicht „Zulassen“ geklickt." });
  }
  const channelId = verifyOAuthState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!channelId || !code) {
    return back({ error: "Die Anmeldung ist abgelaufen oder ungültig. Bitte noch einmal auf „Verbinden“ klicken." });
  }
  const channel = CHANNELS.find((c) => c.id === channelId);
  if (!channel) return back({ error: "Unbekannter Kanal." });

  try {
    const tokens = await exchangeCode(code, redirectUriFor(url.origin));
    const authorized = await getAuthorizedChannelIds(tokens.accessToken);
    if (!authorized.includes(channelId)) {
      const other = CHANNELS.find((c) => authorized.includes(c.id));
      return back({
        error: other
          ? `Falsches Konto: Du hast dich mit dem Konto von „${other.name}“ angemeldet. Für „${channel.name}“ bitte das andere Google-Konto wählen.`
          : `Dieses Google-Konto gehört nicht zu „${channel.name}“. Bitte beim Google-Login das richtige Konto wählen.`,
      });
    }
    if (!tokens.refreshToken) {
      return back({
        error:
          "Google hat keine Dauer-Erlaubnis geliefert. Bitte unter myaccount.google.com/permissions „Mein YouTube Dashboard“ entfernen und neu verbinden.",
      });
    }

    const store = new SupabaseStore(getSupabase());
    await store.saveConnection({
      channelId,
      refreshTokenEnc: encryptSecret(tokens.refreshToken),
      scopes: tokens.scopes,
    });
    // Gleich die ersten Analytics-Daten holen (im Hintergrund).
    after(() =>
      runAnalyticsIfDue({ store, trigger: "manual", force: true, onlyChannel: channelId }).catch((e) =>
        console.error("[analytics] Erstabruf fehlgeschlagen:", e),
      ),
    );
    return back({ connected: channelId });
  } catch (e) {
    console.error("[oauth/callback]", e);
    return back({ error: e instanceof Error ? e.message : "Verbindung fehlgeschlagen." });
  }
}
