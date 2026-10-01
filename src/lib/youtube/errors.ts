/**
 * Fehler der YouTube-API mit verständlicher deutscher Erklärung.
 */
export class YouTubeApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

/** Übersetzt die Fehler-Gründe von Google in Klartext. */
export function explainYouTubeError(status: number, reason: string, apiMessage: string): string {
  if (/api key not valid|api_key_invalid/i.test(`${reason} ${apiMessage}`)) {
    return "Der YouTube-API-Schlüssel ist ungültig. Bitte in Vercel unter Settings → Environment Variables prüfen (YOUTUBE_API_KEY).";
  }
  switch (reason) {
    case "quotaExceeded":
    case "dailyLimitExceeded":
      return "Das YouTube-Tageskontingent ist aufgebraucht. Es setzt sich um 9 Uhr deutscher Zeit (Mitternacht in Kalifornien) zurück.";
    case "accessNotConfigured":
    case "SERVICE_DISABLED":
      return "Die „YouTube Data API v3“ ist im Google-Cloud-Projekt noch nicht aktiviert (APIs & Dienste → Bibliothek).";
    case "forbidden":
      return "YouTube hat einen Abruf verweigert (403). Meist ein kurzer Aussetzer bei Google – der nächste Lauf klappt in der Regel wieder. Hält es an: Schlüssel-Einschränkungen prüfen.";
    case "API_KEY_SERVICE_BLOCKED":
      return "Der API-Schlüssel darf die YouTube Data API nicht nutzen. Bitte bei den Schlüssel-Einschränkungen „YouTube Data API v3“ erlauben.";
  }
  return `YouTube-API-Fehler ${status}${reason ? ` (${reason})` : ""}: ${apiMessage}`;
}
