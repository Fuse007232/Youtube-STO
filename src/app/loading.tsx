import { DashboardSkeleton } from "@/components/dashboard/Skeletons";

/** Wird sofort angezeigt, während der Server die Daten holt („Formationsrunde“). */
export default function Loading() {
  return <DashboardSkeleton />;
}
