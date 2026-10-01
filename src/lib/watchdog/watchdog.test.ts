import { describe, expect, it } from "vitest";
import type { ChannelConfig } from "@/config/channels";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import type { RunRow } from "@/lib/db/store";
import { MockDataSource } from "@/lib/data/mock/MockDataSource";
import { renderRaceReport } from "@/lib/report/report";
import { runDailyReportIfDue } from "@/lib/report/run-report";
import { detectIssues } from "./detect";
import { runWatchdog } from "./run-watchdog";

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 2, 6, 30); // Fr 8:30 Berlin
const CH: ChannelConfig[] = [{ id: "A", name: "Kanal A", code: "AAA", color: "#d95926", kind: "own" }];
const ENV = { RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "test@example.com" };

const run = (id: number, minutesAgo: number, ok = true, mode: RunRow["mode"] = "quick", units = 5): RunRow => ({
  id,
  startedAt: NOW - minutesAgo * MIN,
  mode,
  ok,
  units,
});
const regular = () => Array.from({ length: 8 }, (_, i) => run(i + 1, (8 - i) * 15));

function fakeResend() {
  const sent: { subject: string; text: string }[] = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ subject: body.subject, text: body.text });
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  }) as typeof fetch;
  return { sent, fetchFn };
}

describe("Wächter: Erkennung", () => {
  const base = { now: NOW, connections: [], removed: [], channels: CH, dailyQuota: 10_000 };

  it("alles gut → keine Meldung", () => {
    expect(detectIssues({ ...base, runs: regular() })).toEqual([]);
  });

  it("meldet Lücke, Stillstand, Fehlerserie, Kontingent, Verbindung und verschwundene Shorts", () => {
    const runs = [run(1, 300), run(2, 200, false), run(3, 120, false), run(4, 100, false, "full", 8000)];
    const issues = detectIssues({
      ...base,
      runs,
      connections: [{ channelId: "A", refreshTokenEnc: "", scopes: "", connectedAt: 0, lastUsedAt: null, lastError: "Erlaubnis abgelaufen" }],
      removed: [{ id: "v1", channelId: "A", title: "Weg", removedAt: NOW - 10 * MIN, views: 1234 }],
    });
    const keys = issues.map((i) => i.key.split(":")[0]);
    expect(keys).toEqual(["removed", "oauth", "quota", "runs-failed", "gap", "gap", "stale"]);
    expect(issues[0].title).toContain("Weg");
    expect(issues[1].detail).toContain("Erlaubnis abgelaufen");
  });
});

describe("Wächter: Versand", () => {
  it("schickt neue Probleme gesammelt in einer Mail – und dasselbe Problem nie zweimal", async () => {
    const store = new MemoryStore();
    store.runs.push(...regular().map((r) => ({ ...r, trigger: "cron" as const })));
    store.runs.push({ ...run(99, 0, true, "quick", 9000), trigger: "cron" });
    const mail = fakeResend();
    const first = await runWatchdog({ store, channels: CH, now: NOW, env: ENV, fetchFn: mail.fetchFn });
    expect(first.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toContain("Kontingent");
    const second = await runWatchdog({ store, channels: CH, now: NOW + 15 * MIN, env: ENV, fetchFn: mail.fetchFn });
    expect(second.sent).toEqual([]);
    expect(mail.sent).toHaveLength(1);
  });

  it("Versand gescheitert → beim nächsten Lauf erneut", async () => {
    const store = new MemoryStore();
    store.runs.push({ ...run(1, 0, true, "quick", 9000), trigger: "cron" });
    const failing = (async () => new Response(JSON.stringify({ message: "kaputt" }), { status: 500 })) as typeof fetch;
    const r = await runWatchdog({ store, channels: CH, now: NOW, env: ENV, fetchFn: failing });
    expect(r.error).toContain("500");
    expect(store.notifications.size).toBe(0);
  });

  it("ohne E-Mail-Einrichtung wird nur geprüft", async () => {
    const store = new MemoryStore();
    const r = await runWatchdog({ store, channels: CH, now: NOW, env: {} });
    expect(r.issues).toBeGreaterThan(0);
    expect(store.notifications.size).toBe(0);
  });
});

describe("Rennbericht", () => {
  it("enthält Kanäle, besten Short, Fahrerwertung und Boxenstrategie", async () => {
    const data = await new MockDataSource().getDashboard(NOW);
    const msg = renderRaceReport(data, "Fr., 02.10.");
    expect(msg.subject).toMatch(/^🏁 Rennbericht Fr\., 02\.10\.: (BRV|GRA) vorn/);
    expect(msg.text).toContain("Bra1nrotvault");
    expect(msg.text).toContain("Bester Short");
    expect(msg.text).toContain("Fahrerwertung");
    expect(msg.text).toContain("Boxenstrategie");
    expect(msg.html).toContain("/short/");
    expect(msg.html).not.toContain("<script");
  });

  it("geht einmal pro Tag ab 8 Uhr raus", async () => {
    const store = new MemoryStore();
    const mail = fakeResend();
    const getData = () => new MockDataSource().getDashboard(NOW);
    const early = Date.UTC(2026, 9, 2, 5, 30); // 7:30 Berlin
    expect(await runDailyReportIfDue({ store, getData, now: early, env: ENV, fetchFn: mail.fetchFn })).toBeNull();
    expect(await runDailyReportIfDue({ store, getData, now: NOW, env: ENV, fetchFn: mail.fetchFn })).toMatchObject({
      sent: true,
      key: "report:2026-10-02",
    });
    expect(await runDailyReportIfDue({ store, getData, now: NOW + 15 * MIN, env: ENV, fetchFn: mail.fetchFn })).toBeNull();
    expect(mail.sent).toHaveLength(1);
    // Test-Knopf: immer, mit [TEST]
    await runDailyReportIfDue({ store, getData, now: NOW, env: ENV, fetchFn: mail.fetchFn, force: true });
    expect(mail.sent[1].subject).toMatch(/^\[TEST\]/);
  });
});
