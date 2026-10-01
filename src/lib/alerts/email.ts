import type { ChannelConfig } from "@/config/channels";
import { APP_CONFIG } from "@/config/app";
import { formatNumber } from "@/lib/format";
import type { AlertCandidate } from "./detect";

/**
 * E-Mail-Versand über Resend (https://resend.com).
 * Ohne eigene Domain sendet Resend von onboarding@resend.dev – und nur an die
 * E-Mail-Adresse des Resend-Kontos. Genau richtig für private Alarme.
 */

type Env = Record<string, string | undefined>;

export function isEmailConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL_TO);
}

/** f***@gmail.com – zum Anzeigen, ohne die ganze Adresse zu zeigen. */
export function maskEmail(email: string | undefined): string {
  if (!email) return "–";
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderAlertEmail(alerts: AlertCandidate[], channels: ChannelConfig[]) {
  const name = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const line = (a: AlertCandidate) => {
    const factor = a.baselineHour > 0 ? ` (${(a.viewsLastHour / a.baselineHour).toFixed(1).replace(".", ",")}×)` : "";
    return a.kind === "rocket"
      ? `🚀 Raketenstart · ${name(a.channelId)}: „${a.title}“ – ${formatNumber(a.viewsLastHour)} Aufrufe/Std. (Kanal üblich: ${formatNumber(a.baselineHour)}/Std.)`
      : `📈 Ausbruch · ${name(a.channelId)}: „${a.title}“ – ${formatNumber(a.viewsLastHour)} Aufrufe/Std.${factor}, sonst ${formatNumber(a.baselineHour)}/Std.`;
  };
  const first = alerts[0];
  const subject =
    alerts.length === 1
      ? `${first.kind === "rocket" ? "🚀" : "📈"} Short geht ab: ${first.title}`
      : `🏁 ${alerts.length} Shorts gehen ab`;
  const text = [
    "Boxenfunk vom Shorts Live Timing:",
    "",
    ...alerts.map((a) => `${line(a)}\n   https://www.youtube.com/shorts/${a.videoId} · gesamt ${formatNumber(a.viewsTotal)} Aufrufe`),
    "",
    `Dashboard: ${APP_CONFIG.publicUrl}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
<p style="color:#e10600;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:.06em;margin:0">Boxenfunk</p>
<h2 style="margin:4px 0 16px">${alerts.length === 1 ? "Ein Short geht ab" : `${alerts.length} Shorts gehen ab`}</h2>
${alerts
  .map(
    (a) => `<div style="border:1px solid #ddd;border-radius:10px;padding:12px;margin-bottom:10px">
<div>${escape(line(a))}</div>
<div style="margin-top:6px;font-size:13px;color:#555">Gesamt ${formatNumber(a.viewsTotal)} Aufrufe · <a href="https://www.youtube.com/shorts/${encodeURIComponent(a.videoId)}">Short öffnen</a></div>
</div>`,
  )
  .join("\n")}
<p style="font-size:13px"><a href="${APP_CONFIG.publicUrl}">Zum Dashboard</a></p>
</div>`;
  return { subject, text, html };
}

export async function sendEmail(
  msg: { subject: string; text: string; html: string },
  env: Env = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!isEmailConfigured(env)) throw new Error("E-Mail ist nicht eingerichtet (RESEND_API_KEY, ALERT_EMAIL_TO).");
  let res: Response;
  try {
    res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM || "Shorts Live Timing <onboarding@resend.dev>",
        to: [env.ALERT_EMAIL_TO],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Resend ist gerade nicht erreichbar (Netzwerkfehler).");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Resend lehnt ab (${res.status}): ${body.message ?? ""} – Schlüssel prüfen; ohne eigene Domain darf nur an die E-Mail des Resend-Kontos gesendet werden.`,
      );
    }
    throw new Error(`Resend-Fehler ${res.status}: ${body.message ?? res.statusText}`);
  }
}
