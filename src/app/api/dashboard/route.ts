import { getDataSource } from "@/lib/data";

/**
 * GET /api/dashboard
 * Liefert alle Daten, die das Dashboard braucht. Der Browser ruft das jede Minute auf.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getDataSource().getDashboard();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/dashboard]", e);
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
