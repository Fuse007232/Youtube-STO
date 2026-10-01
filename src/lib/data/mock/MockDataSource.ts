import { APP_CONFIG } from "@/config/app";
import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { buildDashboard, type RawChannelData } from "@/lib/data/build-dashboard";
import type { ChannelPoint, DataSource, RankedShort } from "@/lib/data/types";
import { HOUR_MS } from "@/lib/metrics/deltas";
import { roundSubscribersLikeYouTube } from "@/lib/metrics/rounding";
import { createRandom, gaussian, hashString } from "./random";
import { mockAnalytics } from "./mock-analytics";
import { makeTitle } from "./titles";

/**
 * Beispieldaten für Phase 1 (und für Design-Tests ohne Internet).
 *
 * Idee: Jeder Short hat eine „Wachstumskurve“ (schneller Start, dann abflachend).
 * Die Kanal-Aufrufe sind die Summe aller Shorts, die Abos wachsen mit den Aufrufen.
 * Abends (deutsche Zeit) wird mehr geschaut als nachts. Neue Shorts kommen nach
 * festem Plan dazu – dadurch „lebt“ das Dashboard, ohne zufällig zu springen.
 */

const DAY_MS = 24 * HOUR_MS;
/** Bezugspunkt: an diesem Tag stimmen die Zahlen ungefähr mit der Realität überein. */
const ANCHOR = Date.UTC(2026, 9, 1);
/** So viele Tage Verlauf werden erzeugt (8 Tage → 24h-Vergleich mit dem Vortag möglich). */
const HISTORY_DAYS = 8;

interface ChannelProfile {
  style: "brainrot" | "granny";
  /** Shorts pro Tag (feste Upload-Uhrzeiten in UTC-Stunden). */
  uploadHoursUtc: number[];
  /** Anzahl Shorts am Bezugstag. */
  videosAtAnchor: number;
  subscribersAtAnchor: number;
  /** Typische Aufrufe eines Shorts (Median) und Streuung (log). */
  medianViews: number;
  spread: number;
  subsPerView: number;
}

const PROFILES: Record<string, ChannelProfile> = {
  // Bra1nrotvault: ca. 102K Abos, ca. 350 Shorts
  UCJtW0caGhgqEWxNh2HcsGPg: {
    style: "brainrot",
    uploadHoursUtc: [11, 17],
    videosAtAnchor: 350,
    subscribersAtAnchor: 102_400,
    medianViews: 140_000,
    spread: 1.25,
    subsPerView: 1 / 1600,
  },
  // Granny Aura: ca. 28K Abos, ca. 100 Shorts
  "UCSxDp-sHQ49VwIz0Ix9fusA": {
    style: "granny",
    uploadHoursUtc: [16],
    videosAtAnchor: 100,
    subscribersAtAnchor: 28_300,
    medianViews: 90_000,
    spread: 1.35,
    subsPerView: 1 / 1100,
  },
};

const FALLBACK_PROFILE: ChannelProfile = PROFILES.UCJtW0caGhgqEWxNh2HcsGPg;

/**
 * „Aktivitäts-Uhr“: läuft abends schneller, nachts langsamer.
 * Höhepunkt um 18 Uhr UTC (= 20 Uhr deutscher Sommerzeit).
 */
const ACTIVITY_AMP = 0.6;
const ACTIVITY_PEAK_UTC_H = 18;
function activityHours(t: number): number {
  const h = t / HOUR_MS;
  return (
    h +
    ((ACTIVITY_AMP * 24) / (2 * Math.PI)) *
      Math.sin((2 * Math.PI * (h - ACTIVITY_PEAK_UTC_H)) / 24)
  );
}

interface MockShort {
  id: string;
  channelId: string;
  title: string;
  publishedAt: number;
  durationSec: number;
  likeRate: number;
  /** Endgröße der Hauptwelle. */
  peakViews: number;
  /** Wie schnell die Hauptwelle abflacht (Aktivitäts-Stunden). */
  tau: number;
  /** Langsamer Dauerzuwachs pro Tag (Anteil von peakViews). */
  tail: number;
  activityAtPublish: number;
}

function viewsAt(short: MockShort, t: number, activityAtT: number): number {
  if (t < short.publishedAt) return 0;
  const a = activityAtT - short.activityAtPublish;
  return short.peakViews * (1 - Math.exp(-a / short.tau)) + short.peakViews * short.tail * (a / 24);
}

/** Alle Shorts eines Kanals, die bis `until` veröffentlicht wurden (fester Upload-Plan). */
function generateShorts(channel: ChannelConfig, profile: ChannelProfile, until: number): MockShort[] {
  const perDay = profile.uploadHoursUtc.length;
  const startDay = ANCHOR - Math.ceil(profile.videosAtAnchor / perDay) * DAY_MS;
  const shorts: MockShort[] = [];
  let index = 0;
  for (let day = startDay; day <= until; day += DAY_MS) {
    for (const hour of profile.uploadHoursUtc) {
      const seed = hashString(`${channel.id}:${index}`);
      const rand = createRandom(seed);
      const jitter = Math.floor(rand() * 50) * 60_000; // bis zu 50 Min. später
      const publishedAt = day + hour * HOUR_MS + jitter;
      if (publishedAt > until) continue;
      // Ab und zu ein Ausreißer nach oben – so entstehen „virale“ Shorts.
      const viral = rand() < 0.05 ? 4 + rand() * 6 : 1;
      shorts.push({
        id: `mock-${channel.code.toLowerCase()}-${index}`,
        channelId: channel.id,
        title: makeTitle(profile.style, rand, index),
        publishedAt,
        durationSec: 12 + Math.floor(rand() * 48),
        likeRate: 0.025 + rand() * 0.035,
        peakViews: profile.medianViews * Math.exp(profile.spread * gaussian(rand)) * viral,
        tau: 14 + rand() * 40,
        tail: 0.0006 + rand() * 0.0012,
        activityAtPublish: activityHours(publishedAt),
      });
      index++;
    }
  }
  return shorts;
}

function channelViewsAt(shorts: MockShort[], t: number): number {
  const activity = activityHours(t);
  let sum = 0;
  for (const s of shorts) sum += viewsAt(s, t, activity);
  return sum;
}

interface ChannelSimulation {
  raw: RawChannelData;
  shorts: RankedShort[];
}

function simulateChannel(channel: ChannelConfig, lastSnapshotAt: number): ChannelSimulation {
  const profile = PROFILES[channel.id] ?? FALLBACK_PROFILE;
  const shorts = generateShorts(channel, profile, lastSnapshotAt);
  const viewsAtAnchor = channelViewsAt(shorts, ANCHOR);

  const stepMs = APP_CONFIG.snapshotIntervalMin * 60_000;
  const first = lastSnapshotAt - HISTORY_DAYS * DAY_MS;
  const points: ChannelPoint[] = [];
  let videoCount = 0;
  let nextShort = 0;
  for (let t = first; t <= lastSnapshotAt; t += stepMs) {
    while (nextShort < shorts.length && shorts[nextShort].publishedAt <= t) {
      nextShort++;
    }
    videoCount = nextShort;
    const views = channelViewsAt(shorts, t);
    const subsExact =
      profile.subscribersAtAnchor + (views - viewsAtAnchor) * profile.subsPerView;
    points.push({
      t,
      views: Math.round(views),
      subscribers: roundSubscribersLikeYouTube(subsExact),
      videoCount,
    });
  }

  const actNow = activityHours(lastSnapshotAt);
  const act24 = activityHours(lastSnapshotAt - DAY_MS);
  const act7d = activityHours(lastSnapshotAt - 7 * DAY_MS);
  const ranked: RankedShort[] = shorts.map((s) => {
    const views = viewsAt(s, lastSnapshotAt, actNow);
    return {
      id: s.id,
      channelId: s.channelId,
      title: s.title,
      publishedAt: s.publishedAt,
      thumbnailUrl: null,
      durationSec: s.durationSec,
      views: Math.round(views),
      views24h: Math.round(views - viewsAt(s, lastSnapshotAt - DAY_MS, act24)),
      views7d: Math.round(views - viewsAt(s, lastSnapshotAt - 7 * DAY_MS, act7d)),
      likes: Math.round(views * s.likeRate),
    };
  });

  return {
    raw: { channel, points, subscribersRounded: true, avatarUrl: null },
    shorts: ranked,
  };
}

// Kleiner Zwischenspeicher: pro Schnappschuss-Zeitpunkt nur einmal rechnen.
let cache: { key: number; sims: ChannelSimulation[] } | null = null;

export class MockDataSource implements DataSource {
  readonly kind = "mock" as const;

  async getDashboard(now = Date.now()) {
    const stepMs = APP_CONFIG.snapshotIntervalMin * 60_000;
    const lastSnapshotAt = Math.floor(now / stepMs) * stepMs;

    if (!cache || cache.key !== lastSnapshotAt) {
      cache = {
        key: lastSnapshotAt,
        sims: CHANNELS.map((c) => simulateChannel(c, lastSnapshotAt)),
      };
    }

    const shorts = cache.sims.flatMap((s) => s.shorts);
    return buildDashboard({
      source: this.kind,
      isDemo: true,
      hasHistory: true,
      now,
      channels: cache.sims.map((s) => s.raw),
      shorts,
      quotaUsedToday: null,
      analytics: CHANNELS.map((c) => mockAnalytics(c, shorts, lastSnapshotAt)),
    });
  }
}
