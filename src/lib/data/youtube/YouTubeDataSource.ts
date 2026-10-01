import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { buildDashboard, type RawChannelData } from "@/lib/data/build-dashboard";
import type { DashboardData, DataSource, RankedShort } from "@/lib/data/types";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { parseIsoDuration, pickThumbnail, toInt } from "@/lib/youtube/parse";
import { quotaUsedToday } from "@/lib/youtube/quota";
import type { YtChannel } from "@/lib/youtube/types";

/**
 * Echte Zahlen direkt von der YouTube Data API (Phase 2).
 *
 * Es gibt noch keine gespeicherten Schnappschüsse – daher nur der aktuelle Stand:
 * Abos, Gesamtaufrufe, Anzahl Shorts und die Top-Shorts „gesamt“.
 * 24h-Werte, Kurven und 24h/7-Tage-Ranglisten kommen mit der Datenbank in Phase 3.
 *
 * Kontingent: Ergebnis wird 10 Minuten zwischengespeichert. Ein Abruf kostet
 * 1 (Kanäle) + je Kanal ⌈Videos/50⌉ (Upload-Liste) + ⌈Videos/50⌉ (Video-Statistiken)
 * ≈ 19 Einheiten bei 350 + 100 Shorts → höchstens ~2.700 Einheiten/Tag.
 */

export const YOUTUBE_REFRESH_MIN = 10;
const REFRESH_MS = YOUTUBE_REFRESH_MIN * 60_000;

export interface YouTubeSnapshot {
  fetchedAt: number;
  unitsUsed: number;
  channels: RawChannelData[];
  shorts: RankedShort[];
}

/** Holt einmal alle Zahlen für die konfigurierten Kanäle. */
export async function fetchYouTubeSnapshot(
  client: YouTubeDataClient,
  channels: ChannelConfig[] = CHANNELS,
  now = Date.now(),
): Promise<YouTubeSnapshot> {
  const ytChannels = await client.listChannels(channels.map((c) => c.id));
  const byId = new Map<string, YtChannel>(ytChannels.map((c) => [c.id, c]));

  const missing = channels.filter((c) => !byId.has(c.id));
  if (missing.length > 0) {
    throw new Error(
      `YouTube kennt diese Kanal-ID nicht: ${missing.map((c) => `${c.name} (${c.id})`).join(", ")}. Bitte src/config/channels.ts prüfen.`,
    );
  }

  // Beide Kanäle gleichzeitig abfragen (spart Wartezeit, kostet gleich viel Kontingent).
  const perChannel = await Promise.all(
    channels.map(async (channel) => {
      const yt = byId.get(channel.id)!;
      const stats = yt.statistics ?? {};
      const raw: RawChannelData = {
        channel,
        avatarUrl: pickThumbnail(yt.snippet?.thumbnails),
        subscribersRounded: true,
        points: [
          {
            t: now,
            views: toInt(stats.viewCount),
            subscribers: stats.hiddenSubscriberCount ? 0 : toInt(stats.subscriberCount),
            videoCount: toInt(stats.videoCount),
          },
        ],
      };

      const uploads = yt.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return { raw, shorts: [] as RankedShort[] };
      const videoIds = await client.listPlaylistVideoIds(uploads);
      const videos = await client.listVideos(videoIds);
      const shorts: RankedShort[] = videos.map((v) => ({
        id: v.id,
        channelId: channel.id,
        title: v.snippet?.title ?? "(ohne Titel)",
        publishedAt: v.snippet?.publishedAt ? Date.parse(v.snippet.publishedAt) : 0,
        thumbnailUrl: pickThumbnail(v.snippet?.thumbnails),
        durationSec: parseIsoDuration(v.contentDetails?.duration),
        views: toInt(v.statistics?.viewCount),
        // Ohne Schnappschüsse unbekannt – wird nicht angezeigt (hasHistory = false).
        views24h: 0,
        views7d: 0,
        likes: toInt(v.statistics?.likeCount),
      }));
      return { raw, shorts };
    }),
  );
  const rawChannels = perChannel.map((p) => p.raw);
  const shorts = perChannel.flatMap((p) => p.shorts);

  return { fetchedAt: now, unitsUsed: client.unitsUsed, channels: rawChannels, shorts };
}

/**
 * Zwischenspeicher (pro Server-Instanz):
 * - jünger als 10 Min. → direkt verwenden
 * - älter → sofort die alten Zahlen zeigen und im Hintergrund auffrischen
 *   („stale-while-revalidate“), damit niemand auf 21 YouTube-Abfragen warten muss
 * - älter als 1 Stunde → doch warten (so alte Zahlen wären irreführend)
 * Gleichzeitige Anfragen teilen sich einen Abruf.
 */
const MAX_STALE_MS = 60 * 60_000;
let cached: YouTubeSnapshot | null = null;
let inFlight: Promise<YouTubeSnapshot> | null = null;

export class YouTubeDataSource implements DataSource {
  readonly kind = "youtube" as const;

  constructor(
    private readonly apiKey: string,
    /** Nur für Tests: nachgebaute YouTube-API. */
    private readonly fetchFn: typeof fetch = fetch,
    /**
     * Hält Hintergrund-Arbeit am Leben, nachdem die Antwort verschickt ist.
     * Auf Vercel: Next.js `after()` (sonst kann die Funktion vorher eingefroren werden).
     */
    private readonly runInBackground: (task: Promise<unknown>) => void = () => {},
  ) {}

  private refresh(now: number): Promise<YouTubeSnapshot> {
    if (!inFlight) {
      inFlight = fetchYouTubeSnapshot(new YouTubeDataClient(this.apiKey, this.fetchFn), CHANNELS, now)
        .then((s) => {
          cached = s;
          return s;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  private async snapshot(now: number): Promise<YouTubeSnapshot> {
    const age = cached ? now - cached.fetchedAt : Infinity;
    if (cached && age < REFRESH_MS) return cached;
    if (cached && age < MAX_STALE_MS) {
      // Im Hintergrund auffrischen; Fehler dabei nur protokollieren, alte Zahlen bleiben.
      this.runInBackground(
        this.refresh(now).catch((e) => console.error("[youtube] Auffrischen fehlgeschlagen:", e)),
      );
      return cached;
    }
    return this.refresh(now);
  }

  async getDashboard(now = Date.now()): Promise<DashboardData> {
    const snap = await this.snapshot(now);
    return buildDashboard({
      source: this.kind,
      isDemo: false,
      hasHistory: false,
      refreshIntervalMin: YOUTUBE_REFRESH_MIN,
      now,
      channels: snap.channels,
      shorts: snap.shorts,
      quotaUsedToday: quotaUsedToday(now),
    });
  }
}

/** Nur für Tests: Zwischenspeicher leeren. */
export function resetYouTubeCache(): void {
  cached = null;
  inFlight = null;
}
