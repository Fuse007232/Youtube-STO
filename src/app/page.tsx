import { Dashboard } from "@/components/dashboard/Dashboard";
import { SetupError } from "@/components/dashboard/SetupError";
import { getDataSource } from "@/lib/data";
import type { DashboardData } from "@/lib/data/types";

// Immer frisch rendern (nicht beim Bauen einfrieren) – die Zahlen ändern sich ständig.
export const dynamic = "force-dynamic";

export default async function Home() {
  let initialData: DashboardData;
  try {
    initialData = await getDataSource().getDashboard();
  } catch (e) {
    console.error("[dashboard] Daten konnten nicht geladen werden:", e);
    return <SetupError message={e instanceof Error ? e.message : String(e)} />;
  }
  return <Dashboard initialData={initialData} />;
}
