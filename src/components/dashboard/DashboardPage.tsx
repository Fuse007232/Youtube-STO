import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth/server";
import { getDataSource } from "@/lib/data";
import type { DashboardData } from "@/lib/data/types";
import type { DashboardPageId } from "@/widgets/types";
import { Dashboard } from "./Dashboard";
import { SetupError } from "./SetupError";

/** Gemeinsamer Server-Teil für „Rennen“ und „Analyse“: Login prüfen, Daten laden. */
export async function DashboardPage({ page }: { page: DashboardPageId }) {
  if (!(await isAuthenticated())) redirect("/login");
  let initialData: DashboardData;
  try {
    initialData = await getDataSource().getDashboard();
  } catch (e) {
    console.error("[dashboard] Daten konnten nicht geladen werden:", e);
    return <SetupError message={e instanceof Error ? e.message : String(e)} />;
  }
  return <Dashboard initialData={initialData} page={page} />;
}
