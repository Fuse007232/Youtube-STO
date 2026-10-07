"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { formatAgo, formatCompact, formatFactor, formatOneDecimal } from "@/lib/format";
import { RADAR } from "@/lib/metrics/radar";
import { ShortLink } from "@/components/ui/ShortLink";
import { SaveIdeaButton } from "@/components/production/SaveIdeaButton";

/** Konkurrenz-Radar: Was geht bei der Konkurrenz gerade ab? */
export function RivalRadarWidget() {
  const { data } = useDashboardData();
  const radar = data.rivalRadar;
  if (radar === null) return null;
  const rivals = (data.standings ?? []).filter((e) => !e.isOwn).map((e) => e.summary.channel);
  const channelOf = new Map(rivals.map((c) => [c.id, c]));
  const now = data.generatedAt;
  // „Merken“ nur, wenn es einen Produktionsplan gibt (Datenbank/Beispieldaten)
  const canSave = data.production !== null;

  return (
    <WidgetCard
      title="Konkurrenz-Radar"
      subtitle={`Konkurrenz-Shorts, die mind. ${formatOneDecimal(RADAR.minFactor)}× so stark laufen wie üblich – Ideen-Quelle.`}
    >
      {rivals.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Noch keine Konkurrenten eingetragen.{" "}
          <a href="/settings#konkurrenz" className="text-ink-2 underline">
            Jetzt hinzufügen
          </a>
        </p>
      ) : radar.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Ruhige Strecke: Gerade geht bei der Konkurrenz nichts Ungewöhnliches ab.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {radar.map((r, i) => {
            const ch = channelOf.get(r.channelId);
            const hot = r.factor >= 5;
            return (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <ShortLink
                  id={r.id}
                  className="group relative block overflow-hidden rounded-xl border border-line bg-surface-2 transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-xl hover:shadow-black/40"
                  title={r.title}
                >
                  <span className="relative block" style={{ aspectRatio: "9 / 16" }}>
                    <RadarImage src={r.thumbnailUrl} color={ch?.color ?? "#555"} />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" aria-hidden />
                    <span className="absolute inset-x-0 top-0 h-1" style={{ background: ch?.color ?? "#555" }} aria-hidden />
                    <span
                      className="num absolute left-2 top-2.5 rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow"
                      style={{
                        background: `color-mix(in srgb, var(${hot ? "--sector-best" : "--sector-improved"}) 80%, black)`,
                      }}
                      title={
                        r.kind === "new"
                          ? "Aufrufe insgesamt im Vergleich zum üblichen Endstand dieses Kanals"
                          : "Aufrufe in 24 Std. im Vergleich zum Üblichen dieses Kanals"
                      }
                    >
                      {formatFactor(r.factor)}
                    </span>
                    <span className="absolute right-2 top-2.5 rounded bg-black/60 px-1 text-[9px] font-semibold uppercase tracking-wider text-white/90">
                      {r.kind === "new" ? "neu" : "Ausbruch"}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 p-2.5">
                      <span className="line-clamp-2 text-xs font-medium leading-snug text-white">{r.title}</span>
                      <span className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-white/75">
                        {ch ? <span className="font-mono font-bold tracking-wider text-white">{ch.code}</span> : <span />}
                        <span className="num">
                          +{formatCompact(r.views24h)} · {formatAgo(r.publishedAt, now)}
                        </span>
                      </span>
                    </span>
                  </span>
                </ShortLink>
                {canSave ? <SaveIdeaButton videoId={r.id} title={r.title} /> : null}
              </motion.li>
            );
          })}
        </ol>
      )}
    </WidgetCard>
  );
}

/** Großes Vorschaubild mit leichtem Zoom beim Drüberfahren; kaputt → Farbverlauf. */
function RadarImage({ src, color }: { src: string | null; color: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${color}, #000 140%)` }} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
  );
}
