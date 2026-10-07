import type { Metadata } from "next";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";
import { TrackerProvider } from "@/components/production/TrackerProvider";
import type { TrackerData } from "@/lib/data/types";
import { getTrackerStore, loadTrackerData } from "@/lib/tracker/server";

export const metadata: Metadata = { title: "Produktion · Shorts Live Timing" };
export const dynamic = "force-dynamic";

/** Bereich „Produktion“: Tages-Tracker je Kanal, Vorlauf, Ideen-Parkplatz. */
export default async function ProductionPage() {
  const store = getTrackerStore();
  let initial: TrackerData | null = null;
  if (store) {
    try {
      initial = await loadTrackerData(store);
    } catch (e) {
      console.error("[produktion] Plan konnte nicht geladen werden:", e);
    }
  }
  return (
    <TrackerProvider initial={initial} available={store !== null}>
      <WidgetGrid page="production" />
    </TrackerProvider>
  );
}
