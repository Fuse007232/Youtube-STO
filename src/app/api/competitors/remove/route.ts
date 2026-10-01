import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/server";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";

/** POST /api/competitors/remove – Konkurrenten samt seinen Daten entfernen. */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const to = new URL("/settings", req.url);
  to.hash = "konkurrenz";
  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? id);
  try {
    await new SupabaseStore(getSupabase()).removeCompetitor(id);
    to.searchParams.set("removed", name);
  } catch (e) {
    to.searchParams.set("error", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.redirect(to, 303);
}
