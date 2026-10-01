import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/server";
import { getDataSource } from "@/lib/data";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { runDailyReportIfDue } from "@/lib/report/run-report";

/** POST /api/report/test – Rennbericht sofort senden (Einstellungen). */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/login", req.url), 303);
  const to = new URL("/settings", req.url);
  to.hash = "rennbericht";
  try {
    const result = await runDailyReportIfDue({
      store: new SupabaseStore(getSupabase()),
      getData: () => getDataSource().getDashboard(),
      force: true,
    });
    if (!result) throw new Error("E-Mail ist nicht eingerichtet (RESEND_API_KEY, ALERT_EMAIL_TO).");
    to.searchParams.set("reported", "1");
  } catch (e) {
    to.searchParams.set("error", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.redirect(to, 303);
}
