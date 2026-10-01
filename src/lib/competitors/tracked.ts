import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { COMPETITOR_CONFIG } from "@/config/competitors";
import type { CompetitorStore } from "@/lib/db/store";

/** Alle beobachteten Kanäle: eigene (aus der Konfiguration) + Konkurrenten (aus der Datenbank). */
export async function loadTrackedChannels(store: Pick<CompetitorStore, "getCompetitors">): Promise<ChannelConfig[]> {
  const own = CHANNELS.filter((c) => c.kind === "own");
  let competitors: ChannelConfig[] = [];
  try {
    competitors = (await store.getCompetitors()).slice(0, COMPETITOR_CONFIG.maxCompetitors);
  } catch (e) {
    console.error("[competitors] Lesen fehlgeschlagen – nur eigene Kanäle:", e);
  }
  const ownIds = new Set(own.map((c) => c.id));
  return [...own, ...competitors.filter((c) => !ownIds.has(c.id))];
}
