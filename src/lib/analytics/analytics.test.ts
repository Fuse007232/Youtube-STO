import { describe, expect, it } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { createOAuthState, decryptSecret, encryptSecret, verifyOAuthState } from "@/lib/auth/crypto";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { DatabaseDataSource } from "@/lib/data/database/DatabaseDataSource";
import type { AnalyticsDay } from "@/lib/data/types";
import { countryLabel, subsPer1k, toBreakdown, totalsFromDaily, trafficLabel } from "@/lib/metrics/analytics";
import { runSnapshot } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { BRV_ID, GRA_ID, createFakeYouTube } from "@/lib/youtube/__fixtures__/fake-youtube";
import { buildAuthUrl, exchangeCode, refreshAccessToken } from "@/lib/youtube/oauth";
import { runAnalyticsIfDue } from "./run-analytics";

const ENV = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  TOKEN_ENCRYPTION_KEY: "ein-langer-test-schluessel",
  SESSION_SECRET: "sitzung",
};
const NOW = Date.UTC(2026, 9, 3, 12, 0);

describe("Verschlüsselung der Refresh-Tokens", () => {
  it("ver- und entschlüsselt", () => {
    const enc = encryptSecret("1//refresh-token", ENV);
    expect(enc).not.toContain("refresh-token");
    expect(decryptSecret(enc, ENV)).toBe("1//refresh-token");
  });
  it("mit falschem Schlüssel unlesbar", () => {
    const enc = encryptSecret("geheim", ENV);
    expect(() => decryptSecret(enc, { ...ENV, TOKEN_ENCRYPTION_KEY: "anders" })).toThrow();
  });
  it("jedes Mal anders verschlüsselt (zufälliger IV)", () => {
    expect(encryptSecret("x", ENV)).not.toBe(encryptSecret("x", ENV));
  });
});

describe("OAuth-State", () => {
  it("echt und frisch → Kanal-ID", () => {
    const state = createOAuthState(BRV_ID, NOW, ENV);
    expect(verifyOAuthState(state, NOW + 60_000, ENV)).toBe(BRV_ID);
  });
  it("abgelaufen, manipuliert oder fehlend → null", () => {
    const state = createOAuthState(BRV_ID, NOW, ENV);
    expect(verifyOAuthState(state, NOW + 16 * 60_000, ENV)).toBeNull();
    expect(verifyOAuthState(state.replace(/.$/, "x"), NOW, ENV)).toBeNull();
    expect(verifyOAuthState(`${Buffer.from('{"c":"X","e":9999999999999}').toString("base64url")}.abc`, NOW, ENV)).toBeNull();
    expect(verifyOAuthState(null, NOW, ENV)).toBeNull();
  });
  it("Login-Adresse fragt nach Dauer-Erlaubnis und Analytics-Bereich", () => {
    const url = new URL(buildAuthUrl({ redirectUri: "https://x/cb", state: "s", env: ENV }));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("yt-analytics.readonly");
    expect(url.searchParams.get("prompt")).toContain("consent");
  });
});

function day(d: string, views: number, extra: Partial<AnalyticsDay> = {}): AnalyticsDay {
  return {
    day: d, views, engagedViews: Math.round(views * 0.7), minutesWatched: views / 2, avgViewSec: 20,
    avgViewPct: 80, subsGained: 10, subsLost: 2, likes: 5, shares: 1, comments: 1, ...extra,
  };
}

describe("Analytics-Rechnung", () => {
  it("summiert die letzten 28 Tage und gewichtet Durchschnitte nach Aufrufen", () => {
    const days = [
      day("2026-09-01", 1000, { avgViewPct: 50 }),
      day("2026-09-02", 3000, { avgViewPct: 90 }),
    ];
    const t = totalsFromDaily(days)!;
    expect(t.views).toBe(4000);
    expect(t.subsNet).toBe(16);
    expect(t.avgViewPct).toBeCloseTo(80); // (50*1000 + 90*3000) / 4000
    expect(t.engagedViews).toBe(2800);
  });
  it("nimmt nur die letzten N Tage", () => {
    const days = Array.from({ length: 35 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, "0")}`, 100));
    expect(totalsFromDaily(days, 28)!.days).toBe(28);
  });
  it("Engaged Views unbekannt, wenn ein Tag fehlt", () => {
    expect(totalsFromDaily([day("2026-09-01", 1, { engagedViews: null })])!.engagedViews).toBeNull();
  });
  it("Abos pro 1.000 Aufrufe", () => {
    expect(subsPer1k(5, 2000)).toBe(2.5);
    expect(subsPer1k(5, 0)).toBe(0);
  });
  it("Aufschlüsselung mit „Sonstige“", () => {
    const b = toBreakdown(
      [{ key: "A", views: 50 }, { key: "B", views: 30 }, { key: "C", views: 20 }],
      (k) => k,
      2,
    );
    expect(b.map((x) => [x.key, x.share])).toEqual([["A", 0.5], ["B", 0.3], ["OTHER", 0.2]]);
  });
  it("deutsche Bezeichnungen", () => {
    expect(trafficLabel("SHORTS")).toBe("Shorts-Feed");
    expect(countryLabel("DE")).toBe("Deutschland");
  });
});

/** Nachgebaute Google-Token- und Analytics-API. */
function fakeGoogle(opts: { revoked?: boolean } = {}) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url.pathname + (url.searchParams.get("dimensions") ? `?${url.searchParams.get("dimensions")}` : ""));
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.hostname === "oauth2.googleapis.com") {
      const body = new URLSearchParams(String(init?.body));
      if (opts.revoked) return json({ error: "invalid_grant" }, 400);
      if (body.get("grant_type") === "authorization_code") return json({ access_token: "at", refresh_token: "rt", scope: "s" });
      return json({ access_token: `at-for-${body.get("refresh_token")}` });
    }
    if (url.hostname === "youtubeanalytics.googleapis.com") {
      const dim = url.searchParams.get("dimensions");
      if (dim === "day") {
        return json({
          columnHeaders: [{ name: "day" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" }, { name: "averageViewPercentage" }, { name: "subscribersGained" }, { name: "subscribersLost" }, { name: "likes" }, { name: "shares" }, { name: "comments" }, { name: "engagedViews" }],
          rows: [["2026-10-01", 1000, 400, 24, 80, 12, 2, 40, 3, 1, 700]],
        });
      }
      if (dim === "video") {
        return json({
          columnHeaders: [{ name: "video" }, { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" }, { name: "averageViewPercentage" }, { name: "subscribersGained" }, { name: "likes" }, { name: "shares" }],
          rows: [["brv000", 900, 300, 20, 75, 9, 30, 2]],
        });
      }
      if (dim === "insightTrafficSourceType") {
        return json({ columnHeaders: [{ name: "insightTrafficSourceType" }, { name: "views" }, { name: "estimatedMinutesWatched" }], rows: [["SHORTS", 900, 300], ["YT_SEARCH", 100, 30]] });
      }
      return json({ columnHeaders: [{ name: "country" }, { name: "views" }, { name: "estimatedMinutesWatched" }], rows: [["US", 600, 200], ["DE", 400, 100]] });
    }
    return json({ error: { message: "unbekannt" } }, 404);
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("OAuth-Tokens", () => {
  it("tauscht den Code und holt frische Zugangs-Tokens", async () => {
    const g = fakeGoogle();
    const t = await exchangeCode("code", "https://x/cb", g.fetchFn, ENV);
    expect(t).toMatchObject({ accessToken: "at", refreshToken: "rt" });
    expect(await refreshAccessToken("rt", g.fetchFn, ENV)).toBe("at-for-rt");
  });
  it("widerrufene Erlaubnis → „neu verbinden“", async () => {
    const g = fakeGoogle({ revoked: true });
    await expect(refreshAccessToken("rt", g.fetchFn, ENV)).rejects.toMatchObject({ needsReconnect: true });
  });
});

const CH: ChannelConfig[] = [
  { id: BRV_ID, name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" },
  { id: GRA_ID, name: "Granny Aura", code: "GRA", color: "#3987e5", kind: "own" },
];

describe("runAnalyticsIfDue", () => {
  it("holt und speichert Analytics für verbundene Kanäle", async () => {
    const store = new MemoryStore();
    await store.saveConnection({ channelId: BRV_ID, refreshTokenEnc: encryptSecret("rt", ENV), scopes: "" });
    const g = fakeGoogle();
    const r = await runAnalyticsIfDue({ store, trigger: "cron", now: NOW, fetchFn: g.fetchFn, env: ENV });
    expect(r?.channels).toEqual([{ channelId: BRV_ID, ok: true, days: 1, shorts: 1 }]);
    expect(store.analyticsDaily.get(`${BRV_ID}:2026-10-01`)).toMatchObject({ views: 1000, subsGained: 12, engagedViews: 700 });
    expect(store.breakdowns.filter((b) => b.kind === "traffic")).toHaveLength(2);
    expect(store.connections.get(BRV_ID)!.lastUsedAt).toBe(NOW);
    expect(store.runs.at(-1)).toMatchObject({ mode: "analytics", ok: true });
  });

  it("läuft höchstens alle 6 Stunden (außer erzwungen)", async () => {
    const store = new MemoryStore();
    await store.saveConnection({ channelId: BRV_ID, refreshTokenEnc: encryptSecret("rt", ENV), scopes: "" });
    const g = fakeGoogle();
    await runAnalyticsIfDue({ store, trigger: "cron", now: NOW, fetchFn: g.fetchFn, env: ENV });
    expect(await runAnalyticsIfDue({ store, trigger: "cron", now: NOW + 60 * 60_000, fetchFn: g.fetchFn, env: ENV })).toBeNull();
    expect(await runAnalyticsIfDue({ store, trigger: "manual", force: true, now: NOW + 60 * 60_000, fetchFn: g.fetchFn, env: ENV })).not.toBeNull();
  });

  it("ohne Verbindung oder ohne Google-Einrichtung passiert nichts", async () => {
    const store = new MemoryStore();
    expect(await runAnalyticsIfDue({ store, trigger: "cron", now: NOW, env: ENV })).toBeNull();
    await store.saveConnection({ channelId: BRV_ID, refreshTokenEnc: "x", scopes: "" });
    expect(await runAnalyticsIfDue({ store, trigger: "cron", now: NOW, env: {} })).toBeNull();
  });

  it("merkt sich, wenn die Erlaubnis widerrufen wurde", async () => {
    const store = new MemoryStore();
    await store.saveConnection({ channelId: GRA_ID, refreshTokenEnc: encryptSecret("rt", ENV), scopes: "" });
    const r = await runAnalyticsIfDue({ store, trigger: "cron", now: NOW, fetchFn: fakeGoogle({ revoked: true }).fetchFn, env: ENV });
    expect(r?.channels[0].ok).toBe(false);
    expect(store.connections.get(GRA_ID)!.lastError).toMatch(/neu verbinden/);
    expect(store.runs.at(-1)?.ok).toBe(false);
  });

  it("das Dashboard zeigt die Analytics an", async () => {
    const store = new MemoryStore();
    const yt = createFakeYouTube();
    await runSnapshot({ store, client: new YouTubeDataClient("test-key", yt.fetchFn), trigger: "manual", channels: CH, now: NOW });
    await store.saveConnection({ channelId: BRV_ID, refreshTokenEnc: encryptSecret("rt", ENV), scopes: "" });
    await runAnalyticsIfDue({ store, trigger: "cron", now: NOW, fetchFn: fakeGoogle().fetchFn, env: ENV });

    const data = await new DatabaseDataSource(store, { channels: CH, analytics: store }).getDashboard(NOW + 60_000);
    const brv = data.analytics!.find((a) => a.channelId === BRV_ID)!;
    const gra = data.analytics!.find((a) => a.channelId === GRA_ID)!;
    expect(brv.connected).toBe(true);
    expect(brv.totals28d).toMatchObject({ views: 1000, subsNet: 10 });
    expect(brv.shorts[0]).toMatchObject({ id: "brv000", title: "brv Short 0", subsGained: 9, subsPer1k: 10 });
    expect(brv.traffic[0]).toMatchObject({ label: "Shorts-Feed", share: 0.9 });
    expect(gra.connected).toBe(false);
  });
});
