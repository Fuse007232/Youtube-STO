import { APP_CONFIG } from "@/config/app";
import type {
  ChannelPoint,
  RankedShort,
  SampleSource,
  SlotStat,
  TimingAnalysis,
  TimingConfidence,
  TimingExperiment,
  TimingRecent,
  TimingRecommendation,
} from "@/lib/data/types";

/**
 * „Boxenstrategie“ – beste Upload-Uhrzeit (Phase 6.2). Reine Rechenfunktionen.
 *
 * Leistungs-Index eines Shorts (1,0 = normal für diesen Kanal zu dieser Zeit):
 * - Historie: Aufrufe ÷ Median der Kanal-Shorts, die ±15 Tage um denselben Zeitpunkt
 *   erschienen sind (Shorts ab 7 Tage alt). Gleicht Kanalwachstum und Alter aus.
 * - Startkurve: Aufrufe nach 24 Std. ÷ Median der 24h-Werte des Kanals (genauer, ab
 *   Beginn der Schnappschüsse). Ersetzt die Historie, wo vorhanden.
 * Auswertung in 2-Stunden-Blöcken (Berliner Zeit) × Wochentag, robust gegen Ausreißer
 * (log-Mittel, gekappt) und mit Schrumpfung Richtung 1,0 bei wenigen Shorts.
 */

export const TIMING = {
  blockHours: 2,
  blocks: 12,
  minAgeDays: 7,
  maxAgeDays: 365,
  neighborDays: 15,
  minNeighbors: 4,
  /** Mindestanzahl gemessener 24h-Werte pro Kanal, bevor sie genutzt werden. */
  minMeasured: 3,
  /** Wie stark wenige Shorts Richtung 1,0 gezogen werden (Anzahl „gedachter“ Normal-Shorts). */
  prior: 5,
  /** Einzelwerte werden auf 1/8× … 8× gekappt. */
  clamp: 8,
  /** Ab so vielen Shorts zählt ein Zeitfenster als „getestet“. */
  minTested: 3,
  /** Konkurrenz-Vorschläge erst ab so vielen Konkurrenz-Shorts im Block. */
  minCompetition: 8,
  /** z-Werte für „deutlich“ und „Tendenz“. */
  zClear: 2.5,
  zTrend: 1.5,
} as const;

const DAY = 86_400_000;

export interface TimingSample {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: number;
  index: number;
  source: SampleSource;
}

// ───────────── Zeitfenster ─────────────

const slotFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_CONFIG.timeZone,
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Wochentag (0 = Mo) und Stunde in Berliner Zeit. */
export function berlinWeekdayHour(t: number): { weekday: number; hour: number } {
  const parts = slotFormat.formatToParts(t);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday: Math.max(0, WEEKDAYS.indexOf(wd)), hour };
}

export function slotOf(t: number): { weekday: number; block: number } {
  const { weekday, hour } = berlinWeekdayHour(t);
  return { weekday, block: Math.floor(hour / TIMING.blockHours) };
}

// ───────────── Index ─────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Historien-Index für alle Shorts eines Kanals, die alt genug sind. */
export function historySamples(shorts: RankedShort[], now: number): TimingSample[] {
  const byChannel = new Map<string, RankedShort[]>();
  for (const s of shorts) {
    const age = (now - s.publishedAt) / DAY;
    if (!s.publishedAt || age < TIMING.minAgeDays || age > TIMING.maxAgeDays) continue;
    const list = byChannel.get(s.channelId) ?? [];
    list.push(s);
    byChannel.set(s.channelId, list);
  }
  const out: TimingSample[] = [];
  for (const list of byChannel.values()) {
    for (const s of list) {
      let baseline: number | null = null;
      for (const days of [TIMING.neighborDays, TIMING.neighborDays * 2]) {
        const neighbors = list.filter((o) => o !== s && Math.abs(o.publishedAt - s.publishedAt) <= days * DAY);
        if (neighbors.length >= TIMING.minNeighbors) {
          baseline = median(neighbors.map((o) => o.views));
          break;
        }
      }
      if (!baseline || baseline <= 0) continue;
      out.push({
        videoId: s.id,
        channelId: s.channelId,
        title: s.title,
        publishedAt: s.publishedAt,
        index: s.views / baseline,
        source: "history",
      });
    }
  }
  return out;
}

export interface FirstDayRow {
  id: string;
  channelId: string;
  publishedAt: number;
  viewsAt: number;
}

/** Startkurven-Index (Aufrufe nach 24h ÷ Median der 24h-Werte des Kanals). */
export function firstDaySamples(rows: FirstDayRow[], titles: Map<string, string>): TimingSample[] {
  const byChannel = new Map<string, FirstDayRow[]>();
  for (const r of rows) {
    const list = byChannel.get(r.channelId) ?? [];
    list.push(r);
    byChannel.set(r.channelId, list);
  }
  const out: TimingSample[] = [];
  for (const list of byChannel.values()) {
    if (list.length < TIMING.minMeasured) continue;
    for (const r of list) {
      const base = median(list.filter((o) => o !== r).map((o) => o.viewsAt));
      if (!base || base <= 0) continue;
      out.push({
        videoId: r.id,
        channelId: r.channelId,
        title: titles.get(r.id) ?? "",
        publishedAt: r.publishedAt,
        index: r.viewsAt / base,
        source: "first24h",
      });
    }
  }
  return out;
}

/** Startkurve schlägt Historie (genauer). */
export function mergeSamples(history: TimingSample[], first24h: TimingSample[]): TimingSample[] {
  const map = new Map<string, TimingSample>();
  for (const s of history) map.set(s.videoId, s);
  for (const s of first24h) map.set(s.videoId, s);
  return [...map.values()];
}

// ───────────── Statistik ─────────────

export function slotStat(indices: number[]): SlotStat {
  const n = indices.length;
  if (n === 0) return { n: 0, score: 1, median: null, se: null, meanLog: 0 };
  const cap = Math.log(TIMING.clamp);
  const logs = indices.map((i) => Math.max(-cap, Math.min(cap, Math.log(Math.max(i, 1e-6)))));
  const meanLog = logs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? logs.reduce((a, b) => a + (b - meanLog) ** 2, 0) / (n - 1) : null;
  return {
    n,
    score: Math.exp((n * meanLog) / (n + TIMING.prior)),
    median: median(indices),
    se: variance === null ? null : Math.sqrt(variance / n),
    meanLog,
  };
}

export interface ActivityProfile {
  /** Ø Aufrufe pro Stunde je Tagesstunde (Berlin, 0…23); null = noch nicht jede Stunde gemessen. */
  activity: number[] | null;
  /** Gemessene Stunden insgesamt. */
  hours: number;
}

export interface HourlyActivityRow {
  channelId: string;
  /** Stunde des Tages, Berliner Zeit (0…23). */
  hour: number;
  views: number;
  hours: number;
}

function profile(views: number[], hours: number[]): ActivityProfile {
  const covered = hours.reduce((a, b) => a + b, 0);
  if (!hours.every((h) => h > 0)) return { activity: null, hours: covered };
  return { activity: views.map((v, h) => v / hours[h]), hours: covered };
}

/** Summen je Stunde (aus der Datenbank) → Aktivitätsprofil je Kanal. */
export function activityFromHourly(rows: HourlyActivityRow[]): Map<string, ActivityProfile> {
  const sums = new Map<string, { views: number[]; hours: number[] }>();
  for (const r of rows) {
    if (r.hour < 0 || r.hour > 23) continue;
    const s = sums.get(r.channelId) ?? { views: new Array(24).fill(0), hours: new Array(24).fill(0) };
    s.views[r.hour] += r.views;
    s.hours[r.hour] += r.hours;
    sums.set(r.channelId, s);
  }
  return new Map([...sums].map(([id, s]) => [id, profile(s.views, s.hours)]));
}

/** Gleiche Rechnung direkt aus Kanal-Schnappschüssen (Beispieldaten, Tests). */
export function activityFromPoints(points: ChannelPoint[]): ActivityProfile {
  const views = new Array(24).fill(0);
  const hours = new Array(24).fill(0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 75 * 60_000 || b.views < a.views) continue;
    const { hour } = berlinWeekdayHour(a.t + dt / 2);
    views[hour] += b.views - a.views;
    hours[hour] += dt / 3_600_000;
  }
  return profile(views, hours);
}

// ───────────── Analyse + Empfehlung ─────────────

/** Sicherheits-Stufe aus z-Wert und Anzahl (streng, weil der Beste immer etwas Glück hat). */
export function confidenceLevel(z: number, n: number): TimingConfidence {
  return z >= TIMING.zClear && n >= 8 ? "deutlich" : z >= TIMING.zTrend ? "tendenz" : "unsicher";
}
const level = confidenceLevel;

/** z-Wert für „a ist besser als b“ (log-Maßstab; ohne Streuung wird vorsichtig 0,5 angenommen). */
export function zDiff(a: SlotStat, b: SlotStat): number {
  const se = Math.sqrt((a.se ?? 0.5) ** 2 + (b.se ?? 0.5) ** 2);
  return se > 0 ? (Math.log(a.score) - Math.log(b.score)) / se : 0;
}

export function analyzeTiming(input: {
  scope: string;
  samples: TimingSample[];
  /** Alle Shorts dieses Bereichs (für das Testprotokoll). */
  recentShorts?: { id: string; title: string; publishedAt: number; thumbnailUrl?: string | null }[];
  activity?: ActivityProfile;
  /** Analyse der Konkurrenz (für Test-Vorschläge). */
  competition?: TimingAnalysis | null;
}): TimingAnalysis {
  const { samples } = input;
  const cellsIdx: number[][][] = Array.from({ length: 7 }, () => Array.from({ length: TIMING.blocks }, () => []));
  const blockIdx: number[][] = Array.from({ length: TIMING.blocks }, () => []);
  const dayIdx: number[][] = Array.from({ length: 7 }, () => []);
  for (const s of samples) {
    const { weekday, block } = slotOf(s.publishedAt);
    cellsIdx[weekday][block].push(s.index);
    blockIdx[block].push(s.index);
    dayIdx[weekday].push(s.index);
  }
  const cells = cellsIdx.map((row) => row.map(slotStat));
  const byBlock = blockIdx.map(slotStat);
  const byWeekday = dayIdx.map(slotStat);

  // Empfehlung
  let recommendation: TimingRecommendation | null = null;
  const tested = byBlock.map((s, b) => ({ s, b })).filter((x) => x.s.n >= TIMING.minTested);
  if (tested.length > 0) {
    const def = byBlock.map((s, b) => ({ s, b })).sort((x, y) => y.s.n - x.s.n)[0];
    const best = tested.sort((x, y) => y.s.score - x.s.score)[0];
    const upliftPct = best.b === def.b ? 0 : (best.s.score / def.s.score - 1) * 100;
    // Wie sicher ist der Unterschied? (z-Wert im log-Maßstab; streng, weil der
    // beste von mehreren Blöcken immer ein bisschen Glück hat)
    let confidence: TimingConfidence;
    if (best.b !== def.b) {
      confidence = level(zDiff(best.s, def.s), best.s.n);
    } else {
      // Standard ist am besten: wie sicher hebt er sich vom Zweitbesten ab?
      const second = tested.find((x) => x.b !== def.b);
      confidence = second ? level(zDiff(def.s, second.s), def.s.n) : "unsicher";
    }
    // Wochentag nur nennen, wenn er sich deutlich vom Rest abhebt
    const days = byWeekday.map((s, d) => ({ s, d })).filter((x) => x.s.n >= 5 && x.s.se !== null);
    let weekday: number | null = null;
    let weekdayUpliftPct: number | null = null;
    if (days.length >= 5) {
      const bestDay = [...days].sort((x, y) => y.s.score - x.s.score)[0];
      const others = days.filter((x) => x !== bestDay);
      const otherLog = others.reduce((a, x) => a + Math.log(x.s.score), 0) / others.length;
      const diff = Math.log(bestDay.s.score) - otherLog;
      if (diff >= Math.log(1.1) && diff / bestDay.s.se! >= TIMING.zClear) {
        weekday = bestDay.d;
        weekdayUpliftPct = (Math.exp(diff) - 1) * 100;
      }
    }
    recommendation = {
      block: best.b,
      defaultBlock: def.b,
      defaultShare: samples.length ? def.s.n / samples.length : 0,
      upliftPct,
      confidence,
      weekday,
      weekdayUpliftPct,
    };
  }

  // Test-Vorschläge: wenig getestete Blöcke, in denen das Publikum aktiv ist
  // (1–3 Std. nach dem Upload) oder die bei der Konkurrenz gut laufen.
  const experiments: TimingExperiment[] = [];
  const untested = byBlock.map((s, b) => ({ s, b })).filter((x) => x.s.n < TIMING.minTested).map((x) => x.b);
  const act = input.activity?.activity ?? null;
  if (act) {
    const peak = Math.max(...act);
    const ranked = untested
      .map((b) => {
        const h1 = (b * TIMING.blockHours + 1) % 24;
        const h2 = (b * TIMING.blockHours + 3) % 24;
        return { b, value: peak > 0 ? (act[h1] + act[(h1 + 1) % 24] + act[h2]) / 3 / peak : 0 };
      })
      .filter((x) => x.value >= 0.8)
      .sort((x, y) => y.value - x.value)
      .slice(0, 2);
    for (const r of ranked) experiments.push({ block: r.b, reason: "audience", value: r.value });
  }
  if (input.competition) {
    const ranked = untested
      .filter((b) => !experiments.some((e) => e.block === b))
      .map((b) => ({ b, s: input.competition!.byBlock[b] }))
      .filter((x) => x.s.n >= TIMING.minCompetition && x.s.score >= 1.15)
      .sort((x, y) => y.s.score - x.s.score)
      .slice(0, 2);
    for (const r of ranked) experiments.push({ block: r.b, reason: "competition", value: r.s.score });
  }

  // Testprotokoll: die letzten Uploads mit ihrem Ergebnis
  const sampleById = new Map(samples.map((s) => [s.videoId, s]));
  const recent: TimingRecent[] = [...(input.recentShorts ?? [])]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 8)
    .map((s) => {
      const sample = sampleById.get(s.id);
      return {
        videoId: s.id,
        title: s.title,
        thumbnailUrl: s.thumbnailUrl ?? null,
        publishedAt: s.publishedAt,
        index: sample?.index ?? null,
        source: sample?.source ?? null,
      };
    });

  return {
    scope: input.scope,
    samples: samples.length,
    samplesFirst24h: samples.filter((s) => s.source === "first24h").length,
    cells,
    byBlock,
    byWeekday,
    activity: act,
    activityHours: input.activity?.hours ?? 0,
    recommendation,
    experiments,
    recent,
  };
}

export interface TimingSampleInput {
  ownChannelIds: string[];
  ownShorts: RankedShort[];
  rivalShorts: RankedShort[];
  firstDay: FirstDayRow[];
  now: number;
}

/** Leistungs-Index aller Shorts: je eigener Kanal + alle Konkurrenten zusammen. */
export function buildTimingSamples(input: TimingSampleInput): { own: Map<string, TimingSample[]>; rivals: TimingSample[] } {
  const titles = new Map([...input.ownShorts, ...input.rivalShorts].map((s) => [s.id, s.title]));
  const ownIds = new Set(input.ownChannelIds);
  const rivals = mergeSamples(
    historySamples(input.rivalShorts, input.now),
    firstDaySamples(input.firstDay.filter((r) => !ownIds.has(r.channelId)), titles),
  );
  const own = new Map(
    input.ownChannelIds.map((channelId) => [
      channelId,
      mergeSamples(
        historySamples(input.ownShorts.filter((s) => s.channelId === channelId), input.now),
        firstDaySamples(input.firstDay.filter((r) => r.channelId === channelId), titles),
      ),
    ]),
  );
  return { own, rivals };
}

/** Komplette Boxenstrategie: je eigener Kanal + Konkurrenz zusammen. */
export function buildUploadTiming(
  input: TimingSampleInput & { activity: Map<string, ActivityProfile> },
  samples = buildTimingSamples(input),
): TimingAnalysis[] {
  const competition =
    input.rivalShorts.length > 0 ? analyzeTiming({ scope: "competitors", samples: samples.rivals }) : null;

  const own = input.ownChannelIds.map((channelId) =>
    analyzeTiming({
      scope: channelId,
      samples: samples.own.get(channelId) ?? [],
      recentShorts: input.ownShorts.filter((s) => s.channelId === channelId && s.publishedAt <= input.now),
      activity: input.activity.get(channelId),
      competition,
    }),
  );
  return competition ? [...own, competition] : own;
}
