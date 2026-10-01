import { YouTubeApiError, explainYouTubeError } from "./errors";
import { chunk } from "./parse";
import { addQuotaUnits } from "./quota";
import type {
  YtChannel,
  YtCommentThread,
  YtErrorResponse,
  YtListResponse,
  YtPlaylistItem,
  YtVideo,
} from "./types";

/**
 * Adresse der YouTube-API. YOUTUBE_API_BASE_URL nur zum lokalen Testen mit einem
 * nachgebauten Server setzen – in Vercel NICHT setzen.
 */
const API_BASE = process.env.YOUTUBE_API_BASE_URL || "https://www.googleapis.com/youtube/v3";
/** Maximal 50 Einträge pro Abfrage erlaubt YouTube. */
const PAGE_SIZE = 50;

type FetchFn = typeof fetch;

/**
 * Schlanker Zugriff auf die YouTube Data API v3 – bewusst sparsam:
 * - kein search.list (kostet 100 Einheiten)
 * - channels.list für alle Kanäle in EINER Abfrage (1 Einheit)
 * - playlistItems.list über die Upload-Playlist (1 Einheit pro 50 Videos)
 * - videos.list mit bis zu 50 IDs pro Abfrage (1 Einheit pro 50 Videos)
 */
export class YouTubeDataClient {
  /** Einheiten, die dieser Client verbraucht hat. */
  unitsUsed = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
    /** Wartezeit vor der einen Wiederholung (Tests: 0). */
    private readonly retryDelayMs = 1000,
  ) {
    if (!apiKey) throw new Error("YOUTUBE_API_KEY fehlt");
  }

  /**
   * Wie `request`, aber bei kurzen Aussetzern von Google (5xx oder ein einzelnes
   * 403 „forbidden“) einmal nach 1 Sek. wiederholt – kostet höchstens 1 Einheit mehr.
   */
  private async get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    try {
      return await this.request<T>(endpoint, params);
    } catch (e) {
      const transient = e instanceof YouTubeApiError && (e.status >= 500 || (e.status === 403 && e.reason === "forbidden"));
      if (!transient) throw e;
      await new Promise((r) => setTimeout(r, this.retryDelayMs));
      return this.request<T>(endpoint, params);
    }
  }

  private async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", this.apiKey);

    let res: Response;
    try {
      res = await this.fetchFn(url, { cache: "no-store" });
    } catch {
      // Bewusst ohne Original-Fehler: der könnte die Adresse samt API-Schlüssel enthalten.
      throw new YouTubeApiError(0, "network", "YouTube ist gerade nicht erreichbar (Netzwerkfehler). Bitte später erneut versuchen.");
    }
    // Jede Abfrage dieser drei Endpunkte kostet 1 Einheit – auch fehlgeschlagene.
    this.unitsUsed += 1;
    addQuotaUnits(1);

    if (!res.ok) {
      let body: YtErrorResponse = {};
      try {
        body = (await res.json()) as YtErrorResponse;
      } catch {
        // Antwort war kein JSON
      }
      const reason =
        body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? "";
      const apiMessage = body.error?.message ?? res.statusText;
      throw new YouTubeApiError(res.status, reason, explainYouTubeError(res.status, reason, apiMessage));
    }
    return (await res.json()) as T;
  }

  /** Statistiken, Name, Bild und Upload-Playlist für bis zu 50 Kanäle (1 Einheit). */
  async listChannels(ids: string[]): Promise<YtChannel[]> {
    const data = await this.get<YtListResponse<YtChannel>>("channels", {
      part: "snippet,statistics,contentDetails",
      id: ids.join(","),
      maxResults: String(PAGE_SIZE),
    });
    return data.items ?? [];
  }

  /** Alle Video-IDs einer Playlist (neueste zuerst). `maxPages` begrenzt die Kosten. */
  async listPlaylistVideoIds(playlistId: string, maxPages = 40): Promise<string[]> {
    return (await this.listPlaylistPage(playlistId, maxPages)).ids;
  }

  /**
   * Wie listPlaylistVideoIds, sagt aber zusätzlich, ob die Liste vollständig gelesen wurde
   * (`complete`). Nur dann darf man „nicht mehr dabei“ als „gelöscht“ werten.
   */
  async listPlaylistPage(playlistId: string, maxPages = 40): Promise<{ ids: string[]; complete: boolean }> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const data = await this.get<YtListResponse<YtPlaylistItem>>("playlistItems", {
        part: "contentDetails",
        playlistId,
        maxResults: String(PAGE_SIZE),
        ...(pageToken ? { pageToken } : {}),
      });
      for (const item of data.items ?? []) {
        if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) return { ids, complete: true };
    }
    return { ids, complete: false };
  }

  /** Kanal über @Handle oder alten Benutzernamen finden (1 Einheit). */
  async listChannelsBy(by: { forHandle: string } | { forUsername: string }): Promise<YtChannel[]> {
    const data = await this.get<YtListResponse<YtChannel>>("channels", {
      part: "snippet,statistics,contentDetails",
      ...by,
    });
    return data.items ?? [];
  }

  /**
   * Details + Statistiken für beliebig viele Videos (1 Einheit pro 50 Videos).
   * Die 50er-Pakete laufen gleichzeitig – das spart Wartezeit, nicht Kontingent.
   */
  async listVideos(ids: string[]): Promise<YtVideo[]> {
    const pages = await Promise.all(
      chunk(ids, PAGE_SIZE).map((part) =>
        this.get<YtListResponse<YtVideo>>("videos", {
          part: "snippet,statistics,contentDetails",
          id: part.join(","),
          maxResults: String(PAGE_SIZE),
        }),
      ),
    );
    return pages.flatMap((p) => p.items ?? []);
  }

  /**
   * Kommentar-Threads (1 Einheit pro Seite, bis 100 Stück):
   * - `{ channelId }`: neueste Kommentare auf ALLEN Videos eines Kanals (nur „time“ möglich)
   * - `{ videoId }`: Kommentare eines Videos, wahlweise die beliebtesten („relevance“)
   * Abgeschaltete Kommentare → leere Liste statt Fehler.
   */
  async listCommentThreads(
    target: { channelId: string } | { videoId: string },
    opts: { order?: "time" | "relevance"; maxResults?: number } = {},
  ): Promise<YtCommentThread[]> {
    const params: Record<string, string> = {
      part: "snippet",
      maxResults: String(Math.min(100, opts.maxResults ?? 100)),
      order: opts.order ?? "time",
      textFormat: "plainText",
    };
    if ("channelId" in target) params.allThreadsRelatedToChannelId = target.channelId;
    else params.videoId = target.videoId;
    try {
      const data = await this.get<YtListResponse<YtCommentThread>>("commentThreads", params);
      return data.items ?? [];
    } catch (e) {
      if (e instanceof YouTubeApiError && e.status === 403 && /commentsDisabled/i.test(e.reason)) return [];
      throw e;
    }
  }
}
