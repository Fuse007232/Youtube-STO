import { describe, expect, it } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { detectAlerts, type HourRateRow } from "./detect";
import { maskEmail, renderAlertEmail, sendEmail } from "./email";
import { runAlerts } from "./run-alerts";

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 2, 18, 0);
const CFG = {
  minViewsPerHour: 2_000,
  breakoutFactor: 3,
  rocketShareOfChannel: 0.5,
  rocketMaxAgeHours: 24,
  cooldownHours: 24,
  minWindowHours: 0.5,
};

function row(p: Partial<HourRateRow>): HourRateRow {
  return {
    id: "v", channelId: "A", title: "Short", publishedAt: NOW - 10 * 24 * H, thumbnailUrl: null,
    viewsNow: 100_000, nowAt: NOW, views1h: 99_000, views25h: 90_000, ...p,
  };
}
const hourly = new Map([["A", 10_000]]);

describe("detectAlerts", () => {
  it("📈 Ausbruch: 3× über dem eigenen Stundenschnitt", () => {
    // Schnitt davor: (99.000 − 90.000) / 24 = 375/Std.; jetzt 5.000/Std.
    const out = detectAlerts([row({ viewsNow: 104_000 })], hourly, NOW, new Set(), CFG);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "breakout", viewsLastHour: 5_000, baselineHour: 375 });
  });

  it("kein Alarm unter der Mindestmenge", () => {
    expect(detectAlerts([row({ viewsNow: 100_500 })], hourly, NOW, new Set(), CFG)).toEqual([]);
  });

  it("kein Ausbruch, wenn der Short ohnehin so läuft", () => {
    // Schnitt davor 5.000/Std., jetzt 6.000/Std. → nur 1,2×
    const r = row({ views25h: 99_000 - 24 * 5_000, viewsNow: 105_000 });
    expect(detectAlerts([r], hourly, NOW, new Set(), CFG)).toEqual([]);
  });

  it("🚀 Raketenstart: junger Short mit ≥ 50 % der Kanal-Aufrufe pro Stunde", () => {
    const young = row({ publishedAt: NOW - 3 * H, views1h: 20_000, viewsNow: 26_000, views25h: null });
    const out = detectAlerts([young], hourly, NOW, new Set(), CFG);
    expect(out[0]).toMatchObject({ kind: "rocket", viewsLastHour: 6_000, baselineHour: 10_000 });
  });

  it("junger Short unter 50 % → kein Alarm", () => {
    const young = row({ publishedAt: NOW - 3 * H, views1h: 20_000, viewsNow: 24_000, views25h: null });
    expect(detectAlerts([young], hourly, NOW, new Set(), CFG)).toEqual([]);
  });

  it("rechnet auf Stunden um, wenn der Stand älter ist", () => {
    // Stand nur 45 Min. nach dem 1-Std.-Punkt → 3.000 Aufrufe = 4.000/Std.
    const r = row({ viewsNow: 102_000, nowAt: NOW - 15 * 60_000 });
    expect(detectAlerts([r], hourly, NOW, new Set(), CFG)[0].viewsLastHour).toBe(4_000);
  });

  it("zu kurzes Messfenster → kein Alarm", () => {
    const r = row({ viewsNow: 110_000, nowAt: NOW - 40 * 60_000 });
    expect(detectAlerts([r], hourly, NOW, new Set(), CFG)).toEqual([]);
  });

  it("Sperrzeit: höchstens ein Alarm pro Short", () => {
    expect(detectAlerts([row({ viewsNow: 104_000 })], hourly, NOW, new Set(["v"]), CFG)).toEqual([]);
  });

  it("ohne Verlauf (noch kein Messpunkt vor 1 Std.) → kein Alarm", () => {
    expect(detectAlerts([row({ views1h: null })], hourly, NOW, new Set(), CFG)).toEqual([]);
  });
});

describe("E-Mail", () => {
  const CH: ChannelConfig[] = [{ id: "A", name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" }];
  it("Betreff und Inhalt", () => {
    const m = renderAlertEmail(
      [{ videoId: "x1", channelId: "A", title: "Mega <Short>", thumbnailUrl: null, kind: "rocket", viewsLastHour: 25_000, baselineHour: 12_000, viewsTotal: 180_000 }],
      CH,
    );
    expect(m.subject).toBe("🚀 Short geht ab: Mega <Short>");
    expect(m.text).toContain("25.000 Aufrufe/Std.");
    expect(m.html).toContain("Mega &lt;Short&gt;");
    expect(m.html).toContain("youtube.com/shorts/x1");
  });
  it("versteckt die E-Mail-Adresse teilweise", () => {
    expect(maskEmail("felix@example.com")).toBe("f***@example.com");
  });
  it("sendet über Resend", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "1" }), { status: 200 });
    }) as unknown as typeof fetch;
    await sendEmail({ subject: "s", text: "t", html: "h" }, { RESEND_API_KEY: "re_x", ALERT_EMAIL_TO: "me@x.de" }, fetchFn);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].body).toMatchObject({ to: ["me@x.de"], subject: "s" });
  });
  it("ohne Einrichtung → verständlicher Fehler", async () => {
    await expect(sendEmail({ subject: "s", text: "t", html: "h" }, {})).rejects.toThrow(/nicht eingerichtet/);
  });
});

describe("runAlerts", () => {
  const CH: ChannelConfig[] = [{ id: "A", name: "Bra1nrotvault", code: "BRV", color: "#d95926", kind: "own" }];

  async function setup() {
    const store = new MemoryStore();
    // Kanal: 10.000 Aufrufe/Std. über 24h
    await store.insertChannelSnapshots([
      { channelId: "A", takenAt: NOW - 24 * H, subscribers: 1, views: 1_000_000, videoCount: 1, videoViews: 1_000_000 },
      { channelId: "A", takenAt: NOW, subscribers: 1, views: 1_240_000, videoCount: 1, videoViews: 1_240_000 },
    ]);
    // Junger Short geht ab: 12.000 Aufrufe in der letzten Stunde
    await store.upsertVideos(
      [{ id: "s1", channelId: "A", title: "Rakete", publishedAt: NOW - 2 * H, thumbnailUrl: null, durationSec: 30, views: 30_000, likes: 0, comments: 0 }],
      NOW,
    );
    await store.insertVideoSnapshots([{ videoId: "s1", takenAt: NOW - 61 * 60_000, views: 18_000, likes: 0, comments: 0 }]);
    return store;
  }

  it("speichert den Alarm und schickt eine E-Mail", async () => {
    const store = await setup();
    const sent: unknown[] = [];
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runAlerts({ store, channels: CH, now: NOW, env: { RESEND_API_KEY: "re_x", ALERT_EMAIL_TO: "me@x.de" }, fetchFn });
    expect(r).toEqual({ detected: 1, emailed: true });
    expect(store.alerts[0]).toMatchObject({ kind: "rocket", videoId: "s1", emailedAt: NOW });
    expect(sent).toHaveLength(1);
    // Zweiter Lauf: Sperrzeit → kein neuer Alarm
    expect((await runAlerts({ store, channels: CH, now: NOW + 15 * 60_000, env: {} })).detected).toBe(0);
  });

  it("ohne E-Mail-Einrichtung: Alarm trotzdem gespeichert", async () => {
    const store = await setup();
    const r = await runAlerts({ store, channels: CH, now: NOW, env: {} });
    expect(r).toEqual({ detected: 1, emailed: false });
    expect(store.alerts).toHaveLength(1);
  });

  it("E-Mail-Fehler wird am Alarm vermerkt", async () => {
    const store = await setup();
    const fetchFn = (async () => new Response(JSON.stringify({ message: "nope" }), { status: 403 })) as unknown as typeof fetch;
    const r = await runAlerts({ store, channels: CH, now: NOW, env: { RESEND_API_KEY: "re_x", ALERT_EMAIL_TO: "me@x.de" }, fetchFn });
    expect(r.emailed).toBe(false);
    expect(store.alerts[0].emailError).toMatch(/Resend lehnt ab/);
  });
});
