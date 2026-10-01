import { APP_CONFIG } from "@/config/app";
import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { buildDashboard, type RawChannelData } from "@/lib/data/build-dashboard";
import type { ChannelPoint, DataSource, RankedShort, ShortDetail, ShortHistoryPoint } from "@/lib/data/types";
import { HOUR_MS } from "@/lib/metrics/deltas";
import { activityFromPoints, buildTimingSamples, type FirstDayRow } from "@/lib/metrics/upload-timing";
import { channelRank, shortTiming } from "@/lib/metrics/short-detail";
import { mockCommentData, mockComments } from "./mock-comments";
import { roundSubscribersLikeYouTube } from "@/lib/metrics/rounding";
import { createRandom, gaussian, hashString } from "./random";
import { mockAlerts, mockAnalytics } from "./mock-analytics";
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

/** Erfundene Konkurrenten für Design-Tests (Fahrerwertung). */
const MOCK_RIVALS: { channel: ChannelConfig; profile: ChannelProfile }[] = [
  {
    channel: { id: "UCmockRivalSkibidiLab0001", name: "Skibidi Lab", code: "SKL", color: "#199e70", kind: "competitor" },
    profile: { style: "brainrot", uploadHoursUtc: [9, 15, 20], videosAtAnchor: 420, subscribersAtAnchor: 452_000, medianViews: 210_000, spread: 1.2, subsPerView: 1 / 1800 },
  },
  {
    channel: { id: "UCmockRivalRobloxRush0002", name: "Roblox Rush", code: "RBR", color: "#c98500", kind: "competitor" },
    profile: { style: "brainrot", uploadHoursUtc: [12, 19], videosAtAnchor: 250, subscribersAtAnchor: 211_000, medianViews: 160_000, spread: 1.3, subsPerView: 1 / 1500 },
  },
  {
    channel: { id: "UCmockRivalOmaPower00003", name: "Oma Power", code: "OMP", color: "#d55181", kind: "competitor" },
    profile: { style: "granny", uploadHoursUtc: [17], videosAtAnchor: 60, subscribersAtAnchor: 15_300, medianViews: 45_000, spread: 1.3, subsPerView: 1 / 1200 },
  },
];
for (const r of MOCK_RIVALS) PROFILES[r.channel.id] = r.profile;

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

/** Erfundener Uhrzeit-Effekt: Uploads um 15 Uhr UTC laufen am besten, nachts am schwächsten. */
function slotBoost(hourUtc: number): number {
  return 1 + 0.3 * Math.cos((2 * Math.PI * (hourUtc - 15)) / 24);
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
      // Ab und zu ein „Test-Upload“ zu einer anderen Uhrzeit (eigener Zufall, damit
      // die übrigen Werte gleich bleiben) – so hat die Boxenstrategie etwas zu vergleichen.
      const plan = createRandom(hashString(`${channel.id}:${index}:slot`));
      const uploadHour = plan() < 0.22 ? 5 + Math.floor(plan() * 18) : hour;
      const publishedAt = day + uploadHour * HOUR_MS + jitter;
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
        peakViews: profile.medianViews * Math.exp(profile.spread * gaussian(rand)) * viral * slotBoost(uploadHour),
        tau: 14 + rand() * 40,
        tail: 0.0006 + rand() * 0.0012,
        activityAtPublish: activityHours(publishedAt),
      });
      index++;
    }
  }
  return shorts.sort((a, b) => a.publishedAt - b.publishedAt);
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
  /** Aufrufe nach 24 Std. für Shorts aus dem simulierten Messzeitraum. */
  firstDay: FirstDayRow[];
  /** Interne Short-Modelle (für den Steckbrief-Verlauf). */
  models: MockShort[];
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

  const firstDay: FirstDayRow[] = shorts
    .filter((s) => s.publishedAt >= first && s.publishedAt + DAY_MS <= lastSnapshotAt)
    .map((s) => {
      const t = s.publishedAt + DAY_MS;
      return { id: s.id, channelId: s.channelId, publishedAt: s.publishedAt, viewsAt: Math.round(viewsAt(s, t, activityHours(t))) };
    });

  return {
    raw: { channel, points, subscribersRounded: true, avatarUrl: null },
    shorts: ranked,
    firstDay,
    models: shorts,
  };
}

// Kleiner Zwischenspeicher: pro Schnappschuss-Zeitpunkt nur einmal rechnen.
let cache: { key: number; sims: ChannelSimulation[]; rivals: ChannelSimulation[] } | null = null;

function ensureCache(lastSnapshotAt: number) {
  if (!cache || cache.key !== lastSnapshotAt) {
    cache = {
      key: lastSnapshotAt,
      sims: CHANNELS.map((c) => simulateChannel(c, lastSnapshotAt)),
      rivals: MOCK_RIVALS.map((r) => simulateChannel(r.channel, lastSnapshotAt)),
    };
  }
  return cache;
}

const lastSnapshotFor = (now: number) => {
  const stepMs = APP_CONFIG.snapshotIntervalMin * 60_000;
  return Math.floor(now / stepMs) * stepMs;
};

export class MockDataSource implements DataSource {
  readonly kind = "mock" as const;

  async getDashboard(now = Date.now()) {
    const lastSnapshotAt = lastSnapshotFor(now);
    const cache = ensureCache(lastSnapshotAt);

    const shorts = cache.sims.flatMap((s) => s.shorts);
    const analytics = CHANNELS.map((c) => mockAnalytics(c, shorts, lastSnapshotAt));
    return buildDashboard({
      source: this.kind,
      isDemo: true,
      hasHistory: true,
      now,
      channels: cache.sims.map((s) => s.raw),
      shorts,
      quotaUsedToday: null,
      analytics,
      dailyViews: new Map(analytics.map((a) => [a.channelId, new Map(a.daily.map((d) => [d.day, d.views]))])),
      alerts: mockAlerts(shorts, lastSnapshotAt),
      rivals: cache.rivals.map((s) => s.raw),
      rivalShorts: cache.rivals.flatMap((s) => s.shorts),
      comments: mockCommentData(shorts, lastSnapshotAt),
      timing: {
        firstDay: [...cache.sims, ...cache.rivals].flatMap((s) => s.firstDay),
        activity: new Map(cache.sims.map((s) => [s.raw.channel.id, activityFromPoints(s.raw.points)])),
      },
    });
  }

  async getShortDetail(id: string, now = Date.now()): Promise<ShortDetail | null> {
    const lastSnapshotAt = lastSnapshotFor(now);
    const cache = ensureCache(lastSnapshotAt);
    const sim = [...cache.sims, ...cache.rivals].find((x) => x.shorts.some((s) => s.id === id));
    if (!sim) return null;
    const channel = sim.raw.channel;
    const ranked = sim.shorts.find((s) => s.id === id)!;
    const model = sim.models.find((m) => m.id === id)!;
    const isOwn = cache.sims.includes(sim);

    // Messpunkte alle 15 Min. seit Beginn der simulierten Schnappschüsse
    const stepMs = APP_CONFIG.snapshotIntervalMin * 60_000;
    const first = Math.max(lastSnapshotAt - HISTORY_DAYS * DAY_MS, Math.ceil(model.publishedAt / stepMs) * stepMs);
    const history: ShortHistoryPoint[] = [];
    for (let t = first; t <= lastSnapshotAt; t += stepMs) {
      const views = Math.round(viewsAt(model, t, activityHours(t)));
      history.push({ t, views, likes: Math.round(views * model.likeRate), comments: Math.round(views * 0.0015) });
    }

    const samples =
      buildTimingSamples({ ownChannelIds: [channel.id], ownShorts: sim.shorts, rivalShorts: [], firstDay: sim.firstDay, now }).own.get(
        channel.id,
      ) ?? [];
    const analytics = isOwn
      ? (mockAnalytics(channel, cache.sims.flatMap((s) => s.shorts), lastSnapshotAt).shorts.find((s) => s.id === id) ?? null)
      : null;

    return {
      short: { ...ranked, comments: Math.round(ranked.views * 0.0015), removed: false, statsAt: lastSnapshotAt },
      channel,
      isOwn,
      rank: channelRank(sim.shorts, id),
      history,
      analytics,
      timing: shortTiming(id, ranked.publishedAt, samples),
      comments: mockComments(ranked, lastSnapshotAt),
      historyHours: history.length >= 2 ? (history[history.length - 1].t - history[0].t) / HOUR_MS : 0,
      generatedAt: now,
    };
  }
}
