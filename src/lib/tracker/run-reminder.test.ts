import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/__fixtures__/MemoryStore";
import { buildTracker } from "@/lib/metrics/production";
import { renderReminder, runProductionReminderIfDue } from "./run-reminder";

const ENV = { RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "test@example.com" };
const AT_18 = Date.UTC(2026, 9, 7, 16, 5); // 18:05 Berlin
const AT_17 = Date.UTC(2026, 9, 7, 15, 50);

function fakeResend() {
  const sent: { subject: string; text: string }[] = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ subject: body.subject, text: body.text });
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  }) as typeof fetch;
  return { sent, fetchFn };
}
const view = (targets: Record<string, number>) => async () =>
  buildTracker({ channelIds: ["UCJtW0caGhgqEWxNh2HcsGPg"], items: [], published: [], targets, now: AT_18 });

describe("Produktions-Erinnerung", () => {
  it("ab 18 Uhr einmal am Tag, nur wenn etwas fehlt", async () => {
    const store = new MemoryStore();
    const mail = fakeResend();
    const loadView = view({ UCJtW0caGhgqEWxNh2HcsGPg: 1 });
    expect(await runProductionReminderIfDue({ store, loadView, now: AT_17, env: ENV, fetchFn: mail.fetchFn })).toBeNull();
    expect(await runProductionReminderIfDue({ store, loadView, now: AT_18, env: ENV, fetchFn: mail.fetchFn })).toMatchObject({
      sent: true,
      key: "prod-reminder:2026-10-07",
    });
    expect(await runProductionReminderIfDue({ store, loadView, now: AT_18 + 900_000, env: ENV, fetchFn: mail.fetchFn })).toBeNull();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("⏰ Heute fehlt noch 1 Short: BRV");
    expect(mail.sent[0].text).toContain("Bra1nrotvault: 1 Short fehlt noch");
  });

  it("alles erledigt → keine Mail", async () => {
    const mail = fakeResend();
    const r = await runProductionReminderIfDue({
      store: new MemoryStore(),
      loadView: view({ UCJtW0caGhgqEWxNh2HcsGPg: 0 }),
      now: AT_18,
      env: ENV,
      fetchFn: mail.fetchFn,
    });
    expect(r).toMatchObject({ sent: false, lines: 0 });
    expect(mail.sent).toHaveLength(0);
  });

  it("fertige, aber nicht hochgeladene Shorts", () => {
    const msg = renderReminder([{ channelId: "UCSxDp-sHQ49VwIz0Ix9fusA", target: 1, missing: 0, toUpload: 1 }]);
    expect(msg.subject).toBe("⏰ Fertige Shorts warten noch aufs Hochladen");
    expect(msg.text).toContain("Granny Aura: 1 fertig, aber noch nicht hochgeladen/eingeplant");
  });
});
