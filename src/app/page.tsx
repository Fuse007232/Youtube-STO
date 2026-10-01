import { Dashboard } from "@/components/dashboard/Dashboard";
import { getDataSource } from "@/lib/data";

// Immer frisch rendern (nicht beim Bauen einfrieren) – die Zahlen ändern sich ständig.
export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await getDataSource().getDashboard();
  return <Dashboard initialData={initialData} />;
}
