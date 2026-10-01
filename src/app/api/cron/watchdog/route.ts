import { CHANNELS } from "@/config/channels";
import { isCronAuthorized } from "@/lib/auth/cron";
import { getDataSource } from "@/lib/data";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { runDailyReportIfDue } from "@/lib/report/run-report";
import { runWatchdog } from "@/lib/watchdog/run-watchdog";

/**
 * GET /api/cron/watchdog – Rückfall, 1× täglich über Vercel-Cron (vercel.json).
 * Läuft unabhängig vom Supabase-Zeitplaner: meldet, falls dieser steht, und
 * schickt den Rennbericht nach, falls er heute noch fehlt.
 * Schutz: `Authorization: Bearer <CRON_SECRET>` (setzt Vercel automatisch).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 401 });
  try {
    const store = new SupabaseStore(getSupabase());
    const watchdog = await runWatchdog({ store, channels: CHANNELS });
    const report = await runDailyReportIfDue({ store, getData: () => getDataSource().getDashboard() });
    return Response.json({ watchdog, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/watchdog]", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
