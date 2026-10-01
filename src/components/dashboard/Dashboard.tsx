"use client";

import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import type { DashboardData } from "@/lib/data/types";
import { PAGES } from "@/widgets/registry";
import type { DashboardPageId, WidgetSize } from "@/widgets/types";
import { DashboardDataProvider } from "./DashboardDataProvider";

const SIZE_CLASS: Record<WidgetSize, string> = {
  small: "col-span-12 xl:col-span-4",
  medium: "col-span-12 xl:col-span-6",
  large: "col-span-12 xl:col-span-8",
  full: "col-span-12",
};

const NAV: { page: DashboardPageId; href: string; label: string }[] = [
  { page: "race", href: "/", label: "Rennen" },
  { page: "analysis", href: "/analyse", label: "Analyse" },
];

/** Umschalter „Rennen | Analyse“ im Kopf. */
function PageNav({ page }: { page: DashboardPageId }) {
  return (
    <nav aria-label="Seiten" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs">
      {NAV.map((n) => {
        const active = n.page === page;
        return (
          <Link
            key={n.page}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-md px-3 py-1 font-semibold uppercase tracking-wider transition-colors ${
              active ? "text-ink" : "text-muted hover:text-ink-2"
            }`}
          >
            {active ? (
              <motion.span
                layoutId="page-nav"
                className="absolute inset-0 rounded-md bg-surface-3"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-live" aria-hidden /> : null}
            <span className="relative">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Das Dashboard: Kopfzeile + die Widgets der gewählten Seite im Raster. */
export function Dashboard({ initialData, page = "race" }: { initialData: DashboardData; page?: DashboardPageId }) {
  const widgets = PAGES[page];
  return (
    <MotionConfig reducedMotion="user">
      <DashboardDataProvider initialData={initialData}>
        <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <p className="f1-heading text-[11px] text-live">YouTube Shorts</p>
                <h1 className="f1-heading text-2xl text-ink sm:text-3xl">Live Timing</h1>
              </div>
              <PageNav page={page} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="hidden text-xs text-muted sm:block">
                {initialData.channels.map((c) => c.channel.name).join(" vs. ")}
              </p>
              <a
                href="/settings"
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink-2"
              >
                Einstellungen
              </a>
              <form method="post" action="/api/auth/logout">
                <button
                  type="submit"
                  className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-line-strong hover:text-ink-2"
                >
                  Abmelden
                </button>
              </form>
            </div>
          </header>

          <main className="grid grid-cols-12 gap-4 lg:gap-5">
            {widgets.map((w, i) => {
              const Widget = w.component;
              return (
                <motion.div
                  key={w.id}
                  className={SIZE_CLASS[w.size]}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Widget />
                </motion.div>
              );
            })}
          </main>
        </div>
      </DashboardDataProvider>
    </MotionConfig>
  );
}
