"use client";

import Image from "next/image";
import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { slotTone } from "@/components/ui/slot-tone";
import type { ShortDetail } from "@/lib/data/types";
import {
  formatAgo,
  formatCompact,
  formatDate,
  formatDayClock,
  formatDuration,
  formatHourRange,
  formatIndex,
  formatNumber,
  formatOneDecimal,
  formatPercentValue,
  formatWindowLabel,
  WEEKDAYS_LONG,
} from "@/lib/format";
import { hourlyGains } from "@/lib/metrics/short-detail";
import { TIMING } from "@/lib/metrics/upload-timing";

type ChartMode = "total" | "hourly";

/** Steckbrief eines Shorts – alles auf einen Blick. */
export function ShortDetailView({ detail }: { detail: ShortDetail }) {
  const { short, channel } = detail;
  const now = detail.generatedAt;
  const likeRate = short.views > 0 ? short.likes / short.views : 0;
  // Jüngere Shorts: alles seit dem Upload; sonst seit Messbeginn (falls noch keine 24 Std./7 Tage)
  const age = now - short.publishedAt;
  const win24 = age < 24 * 3_600_000 ? "seit Upload" : formatWindowLabel(detail.historyHours, 24);
  const win7 = age < 7 * 24 * 3_600_000 ? "seit Upload" : formatWindowLabel(detail.historyHours, 168);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border border-line px-2.5 py-1 text-muted hover:border-line-strong hover:text-ink-2">
              ← Rennen
            </Link>
            <Link href="/analyse" className="rounded-lg border border-line px-2.5 py-1 text-muted hover:border-line-strong hover:text-ink-2">
              Analyse
            </Link>
          </div>
          <p className="f1-heading text-[11px] text-live">Short-Steckbrief</p>
        </nav>

        {/* Kopf: Vorschaubild + Titel */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-4 flex flex-col gap-5 rounded-2xl border border-line bg-surface/80 p-4 sm:flex-row sm:p-5"
        >
          <div className="relative w-20 shrink-0 self-start overflow-hidden rounded-xl border border-line sm:w-32" style={{ aspectRatio: "9 / 16" }}>
            {short.thumbnailUrl ? (
              <Image src={short.thumbnailUrl} alt="" fill unoptimized className="object-cover" sizes="128px" />
            ) : (
              <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${channel.color}, #000 140%)` }} aria-hidden />
            )}
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: channel.color }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ChannelCode channel={channel} />
              <span className="text-xs text-muted">{channel.name}</span>
              {!detail.isOwn ? (
                <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">Konkurrenz</span>
              ) : null}
              {short.removed ? (
                <span className="rounded-md bg-sector-worse/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink">
                  nicht mehr öffentlich
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-xl font-semibold leading-snug text-ink sm:text-2xl">{short.title || short.id}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-2">
              <span>
                Veröffentlicht <b className="text-ink">{formatDate(short.publishedAt)}</b>, {formatDayClock(short.publishedAt)} ({formatAgo(short.publishedAt, now)})
              </span>
              <span>
                Länge <b className="num text-ink">{formatDuration(short.durationSec)}</b>
              </span>
              {short.statsAt ? <span className="text-muted">Stand {formatDayClock(short.statsAt)}</span> : null}
            </div>
            <a
              href={`https://www.youtube.com/shorts/${short.id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2"
            >
              Auf YouTube ansehen ↗
            </a>
          </div>
        </motion.section>

        {/* Kennzahlen */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Aufrufe gesamt" value={formatNumber(short.views)} />
          <Kpi label={`Aufrufe ${win24}`} value={`+${formatNumber(short.views24h)}`} />
          <Kpi label={`Aufrufe ${win7}`} value={`+${formatNumber(short.views7d)}`} />
          <Kpi label="Likes" value={formatNumber(short.likes)} hint={`${formatOneDecimal(likeRate * 100)} % der Aufrufe`} />
          <Kpi label="Kommentare" value={formatNumber(short.comments)} />
          <Kpi
            label="Platz im Kanal"
            value={`#${detail.rank.all}`}
            hint={`von ${detail.rank.of} · 24h #${detail.rank.d24} · 7T #${detail.rank.d7}`}
            highlight={detail.rank.all === 1 || detail.rank.d24 === 1}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <HistoryChart detail={detail} />
          </div>
          <div className="min-w-0">
            <TimingCard detail={detail} />
          </div>
          <div className="min-w-0 lg:col-span-1">
            <AnalyticsCard detail={detail} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <CommentsCard detail={detail} />
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

function Kpi({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface/80 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`num mt-1 text-lg font-bold ${highlight ? "text-sector-best" : "text-ink"}`}>{value}</p>
      {hint ? <p className="num mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

// ───────────── Verlauf ─────────────

function HistoryChart({ detail }: { detail: ShortDetail }) {
  const [mode, setMode] = useState<ChartMode>("total");
  const color = detail.channel.color;
  const total = detail.history;
  const hourly = useMemo(() => hourlyGains(detail.history), [detail.history]);

  return (
    <WidgetCard
      title="Rennverlauf des Shorts"
      subtitle={
        total.length > 0
          ? `Gemessen seit ${formatDayClock(total[0].t)} – davor speichert das Dashboard keine Werte.`
          : "Noch keine Messpunkte gespeichert."
      }
      actions={
        <SegmentedControl
          label="Ansicht"
          value={mode}
          onChange={setMode}
          options={[
            { value: "total", label: "Aufrufe gesamt" },
            { value: "hourly", label: "Pro Stunde" },
          ]}
        />
      }
    >
      {total.length < 2 ? (
        <p className="py-16 text-center text-sm text-muted">Verlauf erscheint ab den nächsten Schnappschüssen.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 700, height: 288 }}>
            {mode === "total" ? (
              <LineChart data={total} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis {...xAxis} />
                <YAxis {...yAxis} domain={["auto", "auto"]} />
                <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={(p) => <Tip {...p} unit="Aufrufe" />} />
                <Line dataKey="views" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} animationDuration={900} />
              </LineChart>
            ) : (
              <BarChart data={hourly} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis {...xAxis} />
                <YAxis {...yAxis} />
                <Tooltip cursor={{ fill: "var(--surface-3)" }} content={(p) => <Tip {...p} unit="Aufrufe in der Stunde" signed />} />
                <Bar dataKey="views" fill={color} radius={[2, 2, 0, 0]} animationDuration={700} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </WidgetCard>
  );
}

const xAxis = {
  dataKey: "t",
  type: "number" as const,
  scale: "time" as const,
  domain: ["dataMin", "dataMax"] as [string, string],
  tickFormatter: (t: number) => formatDayClock(t),
  stroke: "var(--axis)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  minTickGap: 48,
};
const yAxis = {
  tickFormatter: (v: number) => formatCompact(v),
  stroke: "var(--axis)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
  width: 56,
};

function Tip({ active, payload, label, unit, signed }: TooltipContentProps & { unit: string; signed?: boolean }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value);
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-0.5 text-muted">{formatDayClock(Number(label))}</div>
      <div className="num font-semibold text-ink">
        {signed ? "+" : ""}
        {formatNumber(v)} <span className="font-normal text-muted">{unit}</span>
      </div>
    </div>
  );
}

// ───────────── Boxenstrategie ─────────────

function TimingCard({ detail }: { detail: ShortDetail }) {
  const t = detail.timing;
  const range = formatHourRange(t.block * TIMING.blockHours, TIMING.blockHours);
  const stat = t.index !== null ? { n: TIMING.minTested, score: t.index, median: t.index, se: null, meanLog: Math.log(t.index) } : null;
  return (
    <WidgetCard title="Boxenstrategie" subtitle="Wie lief dieser Short für seine Uhrzeit?">
      <p className="text-sm text-ink-2">
        Hochgeladen am <b className="text-ink">{WEEKDAYS_LONG[t.weekday]}</b>, Fenster <b className="text-ink">{range}</b>
      </p>
      <div className="mt-4 flex items-end gap-3">
        {stat ? (
          <span className="num rounded-lg px-2.5 py-1 text-2xl font-bold text-ink" style={{ background: slotTone(stat) }}>
            {formatIndex(stat.score)}
          </span>
        ) : (
          <span className="num rounded-lg bg-surface-2 px-2.5 py-1 text-2xl font-bold text-muted">?</span>
        )}
        <span className="pb-1 text-xs leading-snug text-ink-2">
          {stat
            ? `Leistung im Vergleich zu ${detail.isOwn ? "deinen" : "den"} Shorts aus derselben Zeit (1,0× = normal)`
            : "Noch kein Wert – kommt nach 24 Std. (24h-Messung) bzw. ab 7 Tagen Alter."}
        </span>
      </div>
      {stat ? (
        <p className="mt-2 text-[11px] text-muted">
          Grundlage: {t.source === "first24h" ? "Aufrufe nach genau 24 Std." : "Langzeit-Vergleich (±15 Tage)"}
        </p>
      ) : null}
      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
        {t.blockScore !== null ? (
          <>
            Kanal-Schnitt in diesem Fenster: <b className="num text-ink">{formatIndex(t.blockScore)}</b> aus {t.blockN}{" "}
            {t.blockN === 1 ? "Short" : "Shorts"}
          </>
        ) : (
          "In diesem Fenster gibt es noch keine Vergleichswerte."
        )}
      </p>
    </WidgetCard>
  );
}

// ───────────── Analytics ─────────────

function AnalyticsCard({ detail }: { detail: ShortDetail }) {
  const a = detail.analytics;
  let body: ReactNode;
  if (!detail.isOwn) {
    body = <p className="text-sm text-muted">YouTube Analytics gibt es nur für eigene Kanäle.</p>;
  } else if (!a) {
    body = (
      <p className="text-sm text-muted">
        Keine Analytics-Werte – der Short ist nicht unter den 200 stärksten der letzten 28 Tage, oder der Kanal ist nicht
        verbunden.
      </p>
    );
  } else {
    const rows: [string, string][] = [
      ["Ø angesehen", formatPercentValue(a.avgViewPct)],
      ["Ø Wiedergabedauer", `${formatOneDecimal(a.avgViewSec)} s`],
      ["Neue Abos", `+${formatNumber(a.subsGained)}`],
      ["Abos pro 1.000 Aufrufe", formatOneDecimal(a.subsPer1k)],
      ["Wiedergabezeit", `${formatNumber(a.minutesWatched / 60)} Std.`],
      ["Geteilt", formatNumber(a.shares)],
    ];
    body = (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
            <dd className="num text-base font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <WidgetCard title="Telemetrie · 28 Tage" subtitle="YouTube Analytics (2–3 Tage Verzug)">
      {body}
    </WidgetCard>
  );
}

// ───────────── Kommentare ─────────────

function CommentsCard({ detail }: { detail: ShortDetail }) {
  const now = detail.generatedAt;
  return (
    <WidgetCard title="Boxenfunk der Fans" subtitle="Meistgelikte Kommentare zu diesem Short">
      {detail.comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Noch keine Kommentare gespeichert. Der Kommentar-Puls sammelt stündlich neue Kommentare.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {detail.comments.map((c) => (
            <li key={c.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted">
                <span className="truncate text-ink-2">{c.author}</span>
                <span className="shrink-0">{formatAgo(c.publishedAt, now)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">{c.text}</p>
              <p className="mt-1 text-[11px] text-muted">
                <span className="num">♥ {formatCompact(c.likes)}</span>
                {c.replies > 0 ? <span className="num"> · {c.replies} Antworten</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
