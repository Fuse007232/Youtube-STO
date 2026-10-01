import type { Metadata } from "next";
import { isAuthConfigured, safeNextPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Anmelden · Shorts Live Timing" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const next = safeNextPath(typeof params.next === "string" ? params.next : "/");
  const configured = isAuthConfigured();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-16">
      <p className="f1-heading text-[11px] text-live">YouTube Shorts</p>
      <h1 className="f1-heading text-3xl text-ink">Live Timing</h1>
      <p className="mt-1 text-sm text-muted">Boxengasse · nur für Teammitglieder</p>

      {/* Startampel */}
      <div className="my-6 flex gap-2" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-3 w-3 rounded-full bg-live/80" />
        ))}
      </div>

      {configured ? (
        <form method="post" action="/api/auth/login" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Passwort</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-ink-2"
            />
          </label>
          {error === "wrong" ? (
            <p role="alert" className="text-sm text-sector-worse">
              Falsches Passwort – noch einmal versuchen.
            </p>
          ) : null}
          <button
            type="submit"
            className="f1-heading w-full rounded-xl bg-live px-4 py-3 text-sm text-white transition hover:brightness-110"
          >
            Lights out · Los geht&apos;s
          </button>
        </form>
      ) : (
        <p role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
          Der Passwortschutz ist noch nicht eingerichtet. Bitte in Vercel unter Settings → Environment
          Variables <code>DASHBOARD_PASSWORD</code> und <code>SESSION_SECRET</code> eintragen und neu
          veröffentlichen (Deployments → „⋯“ → Redeploy).
        </p>
      )}
    </main>
  );
}
