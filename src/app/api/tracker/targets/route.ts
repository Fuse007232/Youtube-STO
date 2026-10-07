import { isAuthenticated } from "@/lib/auth/server";
import { getTrackerStore } from "@/lib/tracker/server";
import { parseTarget } from "@/lib/tracker/validate";
import { trackerError } from "@/lib/tracker/http";

/** PUT /api/tracker/targets – Tagesziel { channelId, perDay } */
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  const store = getTrackerStore();
  if (!store) return Response.json({ error: "Der Produktionsplan braucht die Datenbank." }, { status: 503 });
  try {
    const { channelId, perDay } = parseTarget(await req.json().catch(() => null));
    await store.setProductionTarget(channelId, perDay, Date.now());
    return new Response(null, { status: 204 });
  } catch (e) {
    return trackerError(e);
  }
}
