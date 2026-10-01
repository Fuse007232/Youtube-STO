import { APP_CONFIG } from "@/config/app";
import type { DashboardData, TimingAnalysis } from "@/lib/data/types";
import { formatCompact, formatHourRange, formatNumber, formatSigned } from "@/lib/format";
import { sectorStatus, type SectorStatus } from "@/lib/metrics/sector";
import { sortStandings } from "@/lib/metrics/standings";
import { TIMING } from "@/lib/metrics/upload-timing";

/**
 * Rennbericht (Phase 7): die letzten 24 Std. als E-Mail – jeden Morgen ab 8 Uhr.
 * Baut nur aus `DashboardData` (keine eigene Rechnung), damit Mail und Dashboard
 * immer dieselben Zahlen zeigen.
 */

const SECTOR_COLOR: Record<SectorStatus, string> = {
  best: "#b05cff",
  improved: "#16a34a",
  worse: "#ca8a04",
  neutral: "#6b7280",
};
const SECTOR_TEXT: Record<SectorStatus, string> = {
  best: "Bestwert",
  improved: "besser als Vortag",
  worse: "schwächer als Vortag",
  neutral: "",
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (now: number, prev: number | null) =>
  prev && prev > 0 ? ` (${now >= prev ? "+" : "−"}${Math.round(Math.abs(now / prev - 1) * 100)} % zum Vortag)` : "";

function timingLine(t: TimingAnalysis): string | null {
  const r = t.recommendation;
  if (!r) return null;
  const range = (b: number) => formatHourRange(b * TIMING.blockHours, TIMING.blockHours);
  if (r.block === r.defaultBlock) return `bleib bei ${range(r.block)}`;
  const conf = r.confidence === "deutlich" ? "deutlich" : r.confidence === "tendenz" ? "Tendenz" : "noch unsicher";
  return `${range(r.block)} läuft +${Math.round(r.upliftPct)} % besser als ${range(r.defaultBlock)} (${conf})`;
}

export function renderRaceReport(data: DashboardData, dayLabel: string) {
  const url = APP_CONFIG.publicUrl;
  const windowLabel = data.historyHours >= 24 ? "letzte 24 Std." : `seit ${Math.floor(data.historyHours)} Std. (Messbeginn)`;
  const channels = data.channels.map((c) => {
    const status = sectorStatus(c.delta24h.views, c.prevDelta24h?.views ?? null, c.best24h?.views ?? null);
    return { c, status };
  });
  const leader = [...data.channels].sort((a, b) => b.delta24h.views - a.delta24h.views)[0];
  const best = data.topShorts["24h"][0] ?? null;
  const bestChannel = best ? data.channels.find((c) => c.channel.id === best.channelId)?.channel : undefined;
  const standings = data.standings ? sortStandings(data.standings, "views24h") : [];
  const alerts = (data.alerts ?? []).filter((a) => a.detectedAt >= data.generatedAt - 24 * 3_600_000);
  const radar = (data.rivalRadar ?? []).slice(0, 3);
  const hotComments = data.comments?.hotShorts[0] ?? null;
  const timing = (data.uploadTiming ?? [])
    .filter((t) => t.scope !== "competitors")
    .map((t) => ({ name: data.channels.find((c) => c.channel.id === t.scope)?.channel.code ?? "?", line: timingLine(t) }))
    .filter((t): t is { name: string; line: string } => t.line !== null);

  const subject = leader
    ? `🏁 Rennbericht ${dayLabel}: ${leader.channel.code} vorn mit +${formatCompact(leader.delta24h.views)} Aufrufen`
    : `🏁 Rennbericht ${dayLabel}`;

  // ── Text ──
  const text: string[] = [`Rennbericht ${dayLabel} (${windowLabel})`, ""];
  for (const { c, status } of channels) {
    text.push(
      `${c.channel.name}: ${formatSigned(c.delta24h.views)} Aufrufe${pct(c.delta24h.views, c.prevDelta24h?.views ?? null)}${SECTOR_TEXT[status] ? ` – ${SECTOR_TEXT[status]}` : ""}, ${formatSigned(c.delta24h.subscribers)} Abos, ${c.delta24h.videos} Uploads · gesamt ${formatNumber(c.current.subscribers)} Abos`,
    );
  }
  if (best) text.push("", `Bester Short: „${best.title}“ (${bestChannel?.code ?? ""}) +${formatNumber(best.views24h)} Aufrufe – ${url}/short/${best.id}`);
  if (standings.length > data.channels.length) {
    text.push("", "Fahrerwertung (Aufrufe 24h):");
    standings.forEach((e, i) => text.push(`  P${i + 1} ${e.summary.channel.code} ${formatSigned(e.summary.delta24h.views, true)}${e.isOwn ? " ◀" : ""}`));
  }
  if (alerts.length) text.push("", `Boxenfunk: ${alerts.length} Alarm${alerts.length === 1 ? "" : "e"} – ${alerts.map((a) => `„${a.title}“`).join(", ")}`);
  if (hotComments) text.push("", `Meiste neue Kommentare: „${hotComments.title}“ (+${hotComments.comments24h})`);
  if (radar.length) {
    text.push("", "Konkurrenz-Radar:");
    radar.forEach((r) => text.push(`  ${r.factor.toFixed(1).replace(".", ",")}× „${r.title}“ – ${url}/short/${r.id}`));
  }
  if (timing.length) text.push("", "Boxenstrategie:", ...timing.map((t) => `  ${t.name}: ${t.line}`));
  text.push("", `Dashboard: ${url}`);

  // ── HTML ──
  const card = (inner: string) =>
    `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:0 0 12px">${inner}</div>`;
  const h3 = (t: string) => `<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin:0 0 8px">${t}</div>`;
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;color:#111">
<p style="color:#e10600;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:.06em;margin:0">Rennbericht</p>
<h2 style="margin:4px 0 2px">${escape(dayLabel)}</h2>
<p style="margin:0 0 16px;color:#6b7280;font-size:13px">${escape(windowLabel)}</p>
${card(
  h3("Kanäle") +
    channels
      .map(
        ({ c, status }) => `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
<span style="display:inline-block;width:5px;height:34px;border-radius:2px;background:${c.channel.color}"></span>
<div style="flex:1"><b>${escape(c.channel.name)}</b><br><span style="font-size:13px;color:#4b5563">${formatSigned(c.delta24h.subscribers)} Abos · ${c.delta24h.videos} Uploads · gesamt ${formatNumber(c.current.subscribers)} Abos</span></div>
<div style="text-align:right"><b style="font-size:18px">${formatSigned(c.delta24h.views)}</b><br><span style="font-size:12px;color:${SECTOR_COLOR[status]}">${escape(SECTOR_TEXT[status] || "Aufrufe")}${escape(pct(c.delta24h.views, c.prevDelta24h?.views ?? null))}</span></div>
</div>`,
      )
      .join(""),
)}
${
  best
    ? card(
        h3("Bester Short") +
          `<a href="${url}/short/${encodeURIComponent(best.id)}" style="color:#111;text-decoration:none"><b>${escape(best.title)}</b></a><br><span style="font-size:13px;color:#4b5563">${escape(bestChannel?.name ?? "")} · +${formatNumber(best.views24h)} Aufrufe · gesamt ${formatNumber(best.views)}</span>`,
      )
    : ""
}
${
  standings.length > data.channels.length
    ? card(
        h3("Fahrerwertung · Aufrufe 24h") +
          standings
            .map(
              (e, i) =>
                `<div style="display:flex;gap:8px;font-size:14px;margin:3px 0;${e.isOwn ? "font-weight:700" : "color:#4b5563"}"><span style="width:28px">P${i + 1}</span><span style="display:inline-block;width:4px;background:${e.summary.channel.color};border-radius:2px"></span><span style="flex:1">${escape(e.summary.channel.code)} ${escape(e.summary.channel.name)}</span><span>${formatSigned(e.summary.delta24h.views, true)}</span></div>`,
            )
            .join(""),
      )
    : ""
}
${
  alerts.length || hotComments
    ? card(
        h3("Boxenfunk") +
          (alerts.length
            ? alerts.map((a) => `<div style="font-size:14px;margin:3px 0">${a.kind === "rocket" ? "🚀" : "📈"} ${escape(a.title)}</div>`).join("")
            : "") +
          (hotComments ? `<div style="font-size:14px;margin:6px 0 0">💬 Meiste neue Kommentare: <b>${escape(hotComments.title)}</b> (+${hotComments.comments24h})</div>` : ""),
      )
    : ""
}
${
  radar.length
    ? card(
        h3("Konkurrenz-Radar") +
          radar
            .map(
              (r) =>
                `<div style="font-size:14px;margin:4px 0"><b>${r.factor.toFixed(1).replace(".", ",")}×</b> <a href="${url}/short/${encodeURIComponent(r.id)}" style="color:#111">${escape(r.title)}</a></div>`,
            )
            .join(""),
      )
    : ""
}
${timing.length ? card(h3("Boxenstrategie") + timing.map((t) => `<div style="font-size:14px;margin:3px 0"><b>${escape(t.name)}</b>: ${escape(t.line)}</div>`).join("")) : ""}
<p style="font-size:13px"><a href="${url}" style="color:#e10600;font-weight:700">Zum Dashboard →</a></p>
</div>`;
  return { subject, text: text.join("\n"), html };
}
