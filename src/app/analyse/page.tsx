import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analyse · Shorts Live Timing" };

/** Seite „Analyse“: Auswertungen in Ruhe. */
export default function AnalysePage() {
  return <DashboardPage page="analysis" />;
}
