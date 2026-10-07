"use client";

import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ChartIcon,
  ClipboardIcon,
  FlagIcon,
  LogoutIcon,
  RivalsIcon,
  SettingsIcon,
  TargetIcon,
} from "@/components/ui/icons";
import type { DashboardData } from "@/lib/data/types";
import type { DashboardPageId } from "@/widgets/types";
import { DashboardDataProvider, useDashboardData } from "./DashboardDataProvider";
import { RangeSwitch, TimeRangeProvider } from "./TimeRange";
import { DASHBOARD_PAGES, pageForPath, pageIndex } from "./pages";

const ICONS: Record<DashboardPageId, typeof FlagIcon> = {
  race: FlagIcon,
  production: ClipboardIcon,
  strategy: TargetIcon,
  analysis: ChartIcon,
  rivals: RivalsIcon,
};

/** Zuletzt besuchter Bereich (für „zurück“ aus dem Steckbrief). */
const LastPageContext = createContext<string>("/");
export function useLastPageHref(): string {
  return useContext(LastPageContext);
}

/** Richtung der Seitenübergänge: Reiter rechts davon → nach links wischen. */
function transitionFor(
  current: DashboardPageId | null,
  target: DashboardPageId,
): string[] {
  if (current === null) return ["nav-back"];
  if (current === target) return [];
  return [pageIndex(target) > pageIndex(current) ? "nav-forward" : "nav-back"];
}

/**
 * Fester Rahmen um alle Bereiche: Daten, Kopf, Reiter (Computer) bzw. Leiste unten (Handy).
 * Bleibt beim Wechseln stehen – nur der Inhalt tauscht (mit Übergang).
 */
export function DashboardShell({
  initialData,
  children,
}: {
  initialData: DashboardData;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = pageForPath(pathname);
  const [lastPage, setLastPage] = useState("/");
  useEffect(() => {
    // Merken, aus welchem Bereich man in einen Steckbrief springt
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (current) setLastPage(pathname);
  }, [current, pathname]);

  return (
    <MotionConfig reducedMotion="user">
      <DashboardDataProvider initialData={initialData}>
        <TimeRangeProvider>
          <LastPageContext.Provider value={lastPage}>
            <div className="mx-auto max-w-[1440px] px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 md:pb-16 lg:px-8">
              <header
                className="mb-5 flex flex-wrap items-end justify-between gap-4"
                style={{ viewTransitionName: "site-header" }}
              >
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <Link
                    href="/"
                    transitionTypes={transitionFor(current, "race")}
                    className="group"
                  >
                    <p className="f1-heading text-[11px] text-live">
                      YouTube Shorts
                    </p>
                    <h1 className="f1-heading text-2xl text-ink transition-colors group-hover:text-white sm:text-3xl">
                      Live Timing
                    </h1>
                  </Link>
                  <TopNav current={current} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {current && current !== "production" ? <RangeSwitch /> : null}
                  <div className="mx-1 hidden items-center gap-2 2xl:flex" title={initialData.channels.map((c) => c.channel.name).join(" vs. ")}>
                  <span className="flex -space-x-1.5">
                    {initialData.channels.map((c) => (
                      <ChannelAvatar key={c.channel.id} channel={c.channel} url={c.avatarUrl} size={22} />
                    ))}
                  </span>
                  <span className="text-xs text-muted">{initialData.channels.map((c) => c.channel.code).join(" vs. ")}</span>
                </div>
                  <a
                    href="/settings"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-ink-2 active:scale-95"
                    title="Einstellungen"
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Einstellungen</span>
                  </a>
                  <form method="post" action="/api/auth/logout">
                    <button
                      type="submit"
                      title="Abmelden"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-ink-2 active:scale-95"
                    >
                      <LogoutIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Abmelden</span>
                    </button>
                  </form>
                </div>
              </header>
              {children}
            </div>
            <BottomNav current={current} />
          </LastPageContext.Provider>
        </TimeRangeProvider>
      </DashboardDataProvider>
    </MotionConfig>
  );
}

/** Reiter oben (ab Tablet-Breite). */
function TopNav({ current }: { current: DashboardPageId | null }) {
  return (
    <nav
      aria-label="Bereiche"
      className="hidden rounded-xl border border-line bg-surface-2 p-1 text-xs md:inline-flex"
    >
      {DASHBOARD_PAGES.map((p) => {
        const active = p.id === current;
        const Icon = ICONS[p.id];
        return (
          <Link
            key={p.id}
            href={p.href}
            transitionTypes={transitionFor(current, p.id)}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
              active ? "text-ink" : "text-muted hover:text-ink-2"
            }`}
          >
            {active ? (
              <motion.span
                layoutId="page-nav"
                className="absolute inset-0 rounded-lg bg-surface-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            ) : null}
            {active ? (
              <motion.span
                layoutId="page-nav-bar"
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-live"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                aria-hidden
              />
            ) : null}
            <Icon className="relative h-3.5 w-3.5" />
            <span className="relative">{p.label}</span>
            {p.id === "production" ? <ProductionBadge className="relative ml-0.5" /> : null}
            {p.id === "race" ? (
              <span
                className="live-dot relative ml-0.5 h-1.5 w-1.5 rounded-full bg-live"
                aria-hidden
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Leiste unten am Handy – mit dem Daumen gut erreichbar. */
function BottomNav({ current }: { current: DashboardPageId | null }) {
  return (
    <nav
      aria-label="Bereiche"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      style={{ viewTransitionName: "bottom-nav" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {DASHBOARD_PAGES.map((p) => {
          const active = p.id === current;
          const Icon = ICONS[p.id];
          return (
            <Link
              key={p.id}
              href={p.href}
              transitionTypes={transitionFor(current, p.id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] sm:tracking-wider transition-colors active:scale-95 ${
                active ? "text-ink" : "text-muted"
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-bar"
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-live"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  aria-hidden
                />
              ) : null}
              <span className="relative">
                <Icon className="h-5 w-5" />
                {p.id === "production" ? <ProductionBadge className="absolute -right-2.5 -top-1.5" /> : null}
              </span>
              {p.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Rote Zahl am Reiter „Produktion“: so viele Shorts fehlen heute noch (weder online noch fertig). */
function ProductionBadge({ className = "" }: { className?: string }) {
  const { data } = useDashboardData();
  const open = (data.production ?? []).reduce((sum, p) => sum + p.todayOpen, 0);
  if (open === 0) return null;
  return (
    <span
      className={`num grid h-4 min-w-4 place-items-center rounded-full bg-live px-1 text-[9px] font-bold leading-none text-white shadow ${className}`}
      title={`Heute fehlen noch ${open} Short${open === 1 ? "" : "s"}`}
      aria-label={`Heute fehlen noch ${open}`}
    >
      {open}
    </span>
  );
}
