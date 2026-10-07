import { isAuthenticated } from "@/lib/auth/server";
import { getTrackerStore } from "@/lib/tracker/server";
import { parseItemInput } from "@/lib/tracker/validate";
import { trackerError } from "@/lib/tracker/http";

/** PATCH /api/tracker/<id> – Eintrag ändern · DELETE – Eintrag löschen */
export const dynamic = "force-dynamic";

function idOf(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/tracker/[id]">) {
  if (!(await isAuthenticated())) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  const store = getTrackerStore();
  const id = idOf((await ctx.params).id);
  if (!store || id === null) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  try {
    const patch = parseItemInput(await req.json().catch(() => null), false);
    const item = await store.updateProductionItem(id, patch, Date.now());
    if (!item) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
    return Response.json(item, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return trackerError(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/tracker/[id]">) {
  if (!(await isAuthenticated())) return Response.json({ error: "Bitte anmelden." }, { status: 401 });
  const store = getTrackerStore();
  const id = idOf((await ctx.params).id);
  if (!store || id === null) return Response.json({ error: "Nicht gefunden." }, { status: 404 });
  try {
    await store.deleteProductionItem(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return trackerError(e);
  }
}
