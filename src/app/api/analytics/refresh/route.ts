import { NextResponse } from "next/server";
import { runAnalyticsIfDue } from "@/lib/analytics/run-analytics";
import { isAuthenticated } from "@/lib/auth/server";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";

export const maxDuration = 60;

/** POST /api/analytics/refresh – „Jetzt abrufen“-Knopf in den Einstellungen. */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const to = new URL("/settings", req.url);
  try {
    const result = await runAnalyticsIfDue({
      store: new SupabaseStore(getSupabase()),
      trigger: "manual",
      force: true,
    });
    const failed = result?.channels.filter((c) => !c.ok) ?? [];
    if (!result) to.searchParams.set("error", "Kein Kanal verbunden.");
    else if (failed.length) to.searchParams.set("error", failed.map((f) => f.error).join(" · "));
    else to.searchParams.set("refreshed", "1");
  } catch (e) {
    to.searchParams.set("error", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.redirect(to, 303);
}
