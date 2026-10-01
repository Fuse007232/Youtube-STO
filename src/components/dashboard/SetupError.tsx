/** Freundliche Fehlerseite, wenn die Daten nicht geladen werden können (z. B. Schlüssel falsch). */
export function SetupError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
      <p className="f1-heading text-[11px] text-live">Box, Box – Problem beim Laden</p>
      <h1 className="f1-heading mt-1 text-2xl text-ink">Daten nicht verfügbar</h1>
      <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">{message}</p>
      <p className="mt-4 text-xs text-muted">
        Tipp: Nach dem Ändern von Umgebungsvariablen in Vercel muss neu veröffentlicht werden
        (Deployments → „⋯“ → Redeploy). Zum Testen ohne YouTube kann <code>DATA_SOURCE=mock</code>{" "}
        gesetzt werden.
      </p>
    </main>
  );
}
