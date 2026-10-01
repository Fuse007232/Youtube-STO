import { getDataSource } from "@/lib/data";

/**
 * GET /api/dashboard
 * Liefert alle Daten, die das Dashboard braucht. Der Browser ruft das jede Minute auf.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDataSource().getDashboard();
  return Response.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
