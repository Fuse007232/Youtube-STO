import type { DashboardPageId } from "@/widgets/types";

/** Die Bereiche – Reihenfolge = Reiter von links nach rechts (bestimmt die Wisch-Richtung). */
export const DASHBOARD_PAGES: { id: DashboardPageId; href: string; label: string; title: string }[] = [
  { id: "race", href: "/", label: "Rennen", title: "Live Timing" },
  { id: "production", href: "/produktion", label: "Produktion", title: "Produktion" },
  { id: "strategy", href: "/strategie", label: "Strategie", title: "Strategie" },
  { id: "analysis", href: "/analyse", label: "Analyse", title: "Analyse" },
  { id: "rivals", href: "/konkurrenz", label: "Konkurrenz", title: "Konkurrenz" },
];

/** Welcher Bereich gehört zu dieser Adresse? (Steckbrief usw. → null) */
export function pageForPath(pathname: string): DashboardPageId | null {
  return DASHBOARD_PAGES.find((p) => p.href === pathname)?.id ?? null;
}

export function pageIndex(id: DashboardPageId): number {
  return DASHBOARD_PAGES.findIndex((p) => p.id === id);
}
