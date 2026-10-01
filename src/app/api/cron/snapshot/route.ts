import { timingSafeEqual } from "node:crypto";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { runAlerts } from "@/lib/alerts/run-alerts";
import { runAnalyticsIfDue } from "@/lib/analytics/run-analytics";
import { loadTrackedChannels } from "@/lib/competitors/tracked";
import { runSnapshot } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";

/**
 * GET/POST /api/cron/snapshot  – speichert einen Schnappschuss.
 * Wird vom Zeitplaner (Supabase Cron) alle 15 Minuten aufgerufen.
 *
 * Schutz: Header `Authorization: Bearer <CRON_SECRET>`.
 * Optional: `?mode=quick|full` (Standard: automatisch).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET ist nicht gesetzt." }, { status: 500 });
  }
  if (!authorized(req)) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 401 });
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ error: "YOUTUBE_API_KEY fehlt." }, { status: 500 });

  const modeParam = new URL(req.url).searchParams.get("mode");
  const mode = modeParam === "quick" || modeParam === "full" ? modeParam : "auto";
  const trigger = req.headers.get("x-snapshot-trigger") === "manual" ? "manual" : "cron";

  try {
    const store = new SupabaseStore(getSupabase());
    const result = await runSnapshot({
      store,
      client: new YouTubeDataClient(key),
      trigger,
      mode,
      // Eigene Kanäle + Konkurrenten
      channels: await loadTrackedChannels(store),
    });
    // Danach (höchstens alle 6 Std.) YouTube Analytics der verbundenen Kanäle holen.
    let analytics: unknown = null;
    try {
      analytics = await runAnalyticsIfDue({ store, trigger });
    } catch (e) {
      console.error("[cron/analytics]", e);
      analytics = { error: e instanceof Error ? e.message : String(e) };
    }
    // „Short geht ab“-Alarme prüfen (E-Mail, falls eingerichtet).
    let alerts: unknown = null;
    try {
      alerts = await runAlerts({ store });
    } catch (e) {
      console.error("[cron/alerts]", e);
      alerts = { error: e instanceof Error ? e.message : String(e) };
    }
    return Response.json({ ...result, analytics, alerts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/snapshot]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
