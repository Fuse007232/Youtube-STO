import { DashboardPage } from "@/components/dashboard/DashboardPage";

// Immer frisch rendern (nicht beim Bauen einfrieren) – die Zahlen ändern sich ständig.
export const dynamic = "force-dynamic";

/** Startseite „Rennen“: was gerade passiert. */
export default function Home() {
  return <DashboardPage page="race" />;
}
