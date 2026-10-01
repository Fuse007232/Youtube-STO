/**
 * YouTube Analytics API (v2) – braucht die Google-Erlaubnis des Kanals.
 * Daten kommen mit 1–2 Tagen Verzögerung; Datumsangaben in pazifischer Zeit.
 */

const REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
type FetchFn = typeof fetch;

export class AnalyticsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AnalyticsApiError";
  }
}

export type ReportRow = Record<string, string | number>;

export interface ReportQuery {
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
  sort?: string;
  maxResults?: number;
  filters?: string;
}

/** Eine Abfrage → Zeilen als Objekte ({ day: "2026-09-30", views: 123, … }). */
export async function queryReport(
  accessToken: string,
  q: ReportQuery,
  fetchFn: FetchFn = fetch,
): Promise<ReportRow[]> {
  const url = new URL(REPORTS_URL);
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", q.startDate);
  url.searchParams.set("endDate", q.endDate);
  url.searchParams.set("metrics", q.metrics.join(","));
  if (q.dimensions?.length) url.searchParams.set("dimensions", q.dimensions.join(","));
  if (q.sort) url.searchParams.set("sort", q.sort);
  if (q.maxResults) url.searchParams.set("maxResults", String(q.maxResults));
  if (q.filters) url.searchParams.set("filters", q.filters);

  let res: Response;
  try {
    res = await fetchFn(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  } catch {
    throw new AnalyticsApiError(0, "YouTube Analytics ist gerade nicht erreichbar (Netzwerkfehler).");
  }
  const body = (await res.json().catch(() => ({}))) as {
    columnHeaders?: { name: string }[];
    rows?: (string | number)[][];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new AnalyticsApiError(res.status, `YouTube Analytics ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  const headers = (body.columnHeaders ?? []).map((h) => h.name);
  return (body.rows ?? []).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

const BASE_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "shares",
  "comments",
];

export interface ChannelAnalyticsReport {
  daily: ReportRow[];
  videos: ReportRow[];
  traffic: ReportRow[];
  countries: ReportRow[];
  endDate: string;
}

/** Datum als YYYY-MM-DD in pazifischer Zeit (so rechnet YouTube Analytics). */
export function pacificDate(t: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

/**
 * Alles, was das Dashboard braucht, für einen Kanal (5 Abfragen):
 * Tageswerte (35 Tage), Shorts (28 Tage), Traffic-Quellen und Länder (28 Tage).
 */
export async function fetchChannelAnalytics(
  accessToken: string,
  now = Date.now(),
  fetchFn: FetchFn = fetch,
): Promise<ChannelAnalyticsReport> {
  const DAY = 86_400_000;
  const endDate = pacificDate(now);
  const start35 = pacificDate(now - 35 * DAY);
  const start28 = pacificDate(now - 28 * DAY);

  // „engagedViews“ (Shorts-Aufrufe ohne Wiederholungen) – falls die API die Kennzahl
  // für dieses Konto nicht kennt, ohne sie erneut versuchen.
  let daily: ReportRow[];
  try {
    daily = await queryReport(
      accessToken,
      { startDate: start35, endDate, metrics: [...BASE_METRICS, "engagedViews"], dimensions: ["day"], sort: "day" },
      fetchFn,
    );
  } catch (e) {
    if (!(e instanceof AnalyticsApiError) || e.status !== 400) throw e;
    daily = await queryReport(
      accessToken,
      { startDate: start35, endDate, metrics: BASE_METRICS, dimensions: ["day"], sort: "day" },
      fetchFn,
    );
  }

  const [videos, traffic, countries] = await Promise.all([
    queryReport(
      accessToken,
      {
        startDate: start28,
        endDate,
        metrics: [
          "views",
          "estimatedMinutesWatched",
          "averageViewDuration",
          "averageViewPercentage",
          "subscribersGained",
          "likes",
          "shares",
        ],
        dimensions: ["video"],
        sort: "-views",
        maxResults: 200,
      },
      fetchFn,
    ),
    queryReport(
      accessToken,
      {
        startDate: start28,
        endDate,
        metrics: ["views", "estimatedMinutesWatched"],
        dimensions: ["insightTrafficSourceType"],
        sort: "-views",
      },
      fetchFn,
    ),
    queryReport(
      accessToken,
      {
        startDate: start28,
        endDate,
        metrics: ["views", "estimatedMinutesWatched"],
        dimensions: ["country"],
        sort: "-views",
        maxResults: 15,
      },
      fetchFn,
    ),
  ]);

  return { daily, videos, traffic, countries, endDate };
}
