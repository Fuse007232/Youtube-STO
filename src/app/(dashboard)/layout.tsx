import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SetupError } from "@/components/dashboard/SetupError";
import { isAuthenticated } from "@/lib/auth/server";
import { getDataSource } from "@/lib/data";
import type { DashboardData } from "@/lib/data/types";

// Immer frisch rendern (nicht beim Bauen einfrieren) – die Zahlen ändern sich ständig.
export const dynamic = "force-dynamic";

/**
 * Gemeinsamer Rahmen aller Bereiche (Rennen, Strategie, Analyse, Konkurrenz, Steckbrief):
 * Login prüfen und Daten EINMAL laden. Beim Wechseln zwischen den Bereichen bleibt
 * der Rahmen stehen – danach hält der Browser die Daten jede Minute frisch.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  if (!(await isAuthenticated())) redirect("/login");
  let initialData: DashboardData;
  try {
    initialData = await getDataSource().getDashboard();
  } catch (e) {
    console.error("[dashboard] Daten konnten nicht geladen werden:", e);
    return <SetupError message={e instanceof Error ? e.message : String(e)} />;
  }
  return <DashboardShell initialData={initialData}>{children}</DashboardShell>;
}
