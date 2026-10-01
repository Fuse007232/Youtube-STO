import { APP_CONFIG } from "@/config/app";

/**
 * Google-Login (OAuth) für YouTube Analytics.
 * Pro Kanal einmal „Erlauben“ klicken → wir bekommen ein Refresh-Token
 * (Dauer-Erlaubnis), mit dem wir später selbst Zugangs-Tokens holen.
 */

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

type FetchFn = typeof fetch;
type Env = Record<string, string | undefined>;

export class OAuthError extends Error {
  constructor(
    message: string,
    /** true = Erlaubnis widerrufen/abgelaufen → neu verbinden nötig */
    readonly needsReconnect = false,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

export function isOAuthConfigured(env: Env = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

const CALLBACK_PATH = "/api/auth/youtube/callback";

function isLocal(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/**
 * Rückkehr-Adresse nach dem Google-Login. Muss EXAKT so in der Google Cloud stehen.
 * Online immer die feste Adresse (auch wenn das Dashboard über eine Vercel-Vorschau-
 * Adresse geöffnet wurde), lokal die lokale Adresse.
 */
export function redirectUriFor(requestOrigin: string, publicUrl: string = APP_CONFIG.publicUrl): string {
  return isLocal(requestOrigin) ? `${requestOrigin}${CALLBACK_PATH}` : `${publicUrl}${CALLBACK_PATH}`;
}

/** Läuft diese Anfrage über die feste Adresse (oder lokal)? */
export function isCanonicalOrigin(requestOrigin: string, publicUrl: string = APP_CONFIG.publicUrl): boolean {
  return isLocal(requestOrigin) || requestOrigin === publicUrl;
}

export function buildAuthUrl(opts: { redirectUri: string; state: string; env?: Env }): string {
  const env = opts.env ?? process.env;
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline"); // → Refresh-Token
  url.searchParams.set("prompt", "consent select_account"); // immer Konto wählen + Refresh-Token liefern
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", opts.state);
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>, fetchFn: FetchFn): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
    });
  } catch {
    throw new OAuthError("Google ist gerade nicht erreichbar (Netzwerkfehler).");
  }
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || body.error) {
    if (body.error === "invalid_grant") {
      throw new OAuthError(
        "Die Google-Erlaubnis ist abgelaufen oder wurde widerrufen. Bitte den Kanal in den Einstellungen neu verbinden.",
        true,
      );
    }
    if (body.error === "invalid_client") {
      throw new OAuthError("GOOGLE_CLIENT_ID oder GOOGLE_CLIENT_SECRET stimmt nicht (Vercel prüfen).");
    }
    throw new OAuthError(`Google-Anmeldung fehlgeschlagen: ${body.error_description ?? body.error ?? res.status}`);
  }
  return body;
}

/** Code aus der Rückkehr-Adresse gegen Tokens tauschen. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  fetchFn: FetchFn = fetch,
  env: Env = process.env,
): Promise<{ accessToken: string; refreshToken: string | null; scopes: string }> {
  const body = await tokenRequest(
    {
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    },
    fetchFn,
  );
  if (!body.access_token) throw new OAuthError("Google hat kein Zugangs-Token geliefert.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, scopes: body.scope ?? "" };
}

/** Mit dem Refresh-Token ein frisches Zugangs-Token (1 Stunde gültig) holen. */
export async function refreshAccessToken(
  refreshToken: string,
  fetchFn: FetchFn = fetch,
  env: Env = process.env,
): Promise<string> {
  const body = await tokenRequest(
    {
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    },
    fetchFn,
  );
  if (!body.access_token) throw new OAuthError("Google hat kein Zugangs-Token geliefert.");
  return body.access_token;
}

/** Welcher Kanal gehört zu dieser Anmeldung? (1 Einheit Data-API-Kontingent) */
export async function getAuthorizedChannelIds(accessToken: string, fetchFn: FetchFn = fetch): Promise<string[]> {
  const url = new URL(CHANNELS_URL);
  url.searchParams.set("part", "id");
  url.searchParams.set("mine", "true");
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new OAuthError(`Kanal konnte nicht ermittelt werden (YouTube ${res.status}).`);
  const body = (await res.json()) as { items?: { id: string }[] };
  return (body.items ?? []).map((i) => i.id);
}
