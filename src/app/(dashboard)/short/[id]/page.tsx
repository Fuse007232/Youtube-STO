import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShortDetailView } from "@/components/short/ShortDetailView";
import { isAuthenticated } from "@/lib/auth/server";
import { getDataSource } from "@/lib/data";
import type { ShortDetail } from "@/lib/data/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Short-Steckbrief · Shorts Live Timing" };

const VALID_ID = /^[A-Za-z0-9_-]{4,40}$/;

/** Steckbrief eines Shorts: /short/<Video-ID> */
export default async function ShortPage(props: PageProps<"/short/[id]">) {
  // Zusätzlich zum Türsteher (proxy.ts): Layouts laufen beim Wechseln nicht erneut
  if (!(await isAuthenticated())) redirect("/login");
  const { id } = await props.params;

  let detail: ShortDetail | null = null;
  let error: string | null = null;
  if (VALID_ID.test(id)) {
    try {
      const source = getDataSource();
      detail = source.getShortDetail ? await source.getShortDetail(id) : null;
    } catch (e) {
      console.error("[short] Steckbrief konnte nicht geladen werden:", e);
      error = e instanceof Error ? e.message : String(e);
    }
  }

  if (!detail) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="f1-heading text-[11px] text-live">Short-Steckbrief</p>
        <h1 className="f1-heading text-2xl text-ink">Kein Steckbrief gefunden</h1>
        <p className="text-sm text-muted">
          {error ??
            "Diesen Short kennt die Datenbank (noch) nicht. Steckbriefe gibt es für alle Shorts deiner Kanäle und deiner Konkurrenten."}
        </p>
        <Link href="/" className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-line-strong hover:text-ink">
          ← Zurück zum Rennen
        </Link>
      </main>
    );
  }
  return <ShortDetailView detail={detail} />;
}
