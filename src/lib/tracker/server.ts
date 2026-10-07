import "server-only";
import { CHANNELS } from "@/config/channels";
import { getMockTracker } from "@/lib/data/mock/MockDataSource";
import { resolveDataSourceKind } from "@/lib/data/resolve-kind";
import type { TrackerView } from "@/lib/data/types";
import type { TrackerStore } from "@/lib/db/store";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { addDays, berlinDay } from "@/lib/metrics/calendar";
import { buildTracker } from "@/lib/metrics/production";

/** Produktions-Speicher passend zur Datenquelle (YouTube direkt: keiner). */
export function getTrackerStore(): TrackerStore | null {
  const kind = resolveDataSourceKind();
  if (kind === "database") return new SupabaseStore(getSupabase());
  if (kind === "mock") return getMockTracker();
  return null;
}

/** Komplette Tracker-Ansicht (Zeitstrahl, Ideen-Parkplatz, Vorlauf). */
export async function loadTrackerView(store: TrackerStore, now = Date.now()): Promise<TrackerView> {
  const today = berlinDay(now);
  const [items, targets, published] = await Promise.all([
    store.listProductionItems(addDays(today, -7), addDays(today, 31)),
    store.getProductionTargets(),
    store.getPublishedOwn(now - 9 * 86_400_000, now + 86_400_000),
  ]);
  return buildTracker({ channelIds: CHANNELS.map((c) => c.id), items, published, targets, now });
}
