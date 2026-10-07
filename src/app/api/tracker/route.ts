import { isAuthenticated } from "@/lib/auth/server";
import { getTrackerStore, loadTrackerView } from "@/lib/tracker/server";
import { trackerError } from "@/lib/tracker/http";
import { parseItemInput } from "@/lib/tracker/validate";

/**
 * GET  /api/tracker – Produktionsplan (Zeitstrahl, Ideen-Parkplatz, Vorlauf)
 * POST /api/tracker – Eintrag anlegen { channelId, day|null, title?, status?, note?, link? }
 */
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!(await isAuthenticated())) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  const store = getTrackerStore();
  if (!store) return Response.json({ error: "Der Produktionsplan braucht die Datenbank." }, { status: 503 });
  try {
    return Response.json(await loadTrackerView(store), { headers: noStore });
  } catch (e) {
    return trackerError(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  const store = getTrackerStore();
  if (!store) return Response.json({ error: "Der Produktionsplan braucht die Datenbank." }, { status: 503 });
  try {
    const input = parseItemInput(await req.json().catch(() => null), true);
    const item = await store.createProductionItem({ ...input, channelId: input.channelId!, day: input.day ?? null }, Date.now());
    return Response.json(item, { status: 201, headers: noStore });
  } catch (e) {
    return trackerError(e);
  }
}
