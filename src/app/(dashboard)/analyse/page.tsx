import type { Metadata } from "next";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";

export const metadata: Metadata = { title: "Analyse · Shorts Live Timing" };

/** Bereich „Analyse“: YouTube Analytics. */
export default function AnalysePage() {
  return <WidgetGrid page="analysis" />;
}
