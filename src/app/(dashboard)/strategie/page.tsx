import type { Metadata } from "next";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";

export const metadata: Metadata = { title: "Strategie · Shorts Live Timing" };

/** Bereich „Strategie“: wann, wie lang, wie oft hochladen. */
export default function StrategyPage() {
  return <WidgetGrid page="strategy" />;
}
