import type { Metadata } from "next";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";

export const metadata: Metadata = { title: "Konkurrenz · Shorts Live Timing" };

/** Bereich „Konkurrenz“: Fahrerwertung + Radar. */
export default function RivalsPage() {
  return <WidgetGrid page="rivals" />;
}
