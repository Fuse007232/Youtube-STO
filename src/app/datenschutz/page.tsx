import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutz · Mein YouTube Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Öffentliche Datenschutzerklärung (ohne Login erreichbar).
 * Google verlangt den Link für den OAuth-Zustimmungsbildschirm.
 */
export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-ink-2">
      <p className="f1-heading text-[11px] text-live">Mein YouTube Dashboard</p>
      <h1 className="f1-heading mb-6 text-2xl text-ink">Datenschutzerklärung</h1>

      <Section title="Worum es geht">
        „Mein YouTube Dashboard“ ist ein privates, passwortgeschütztes Statistik-Dashboard des Betreibers für
        seine eigenen YouTube-Kanäle. Es gibt keine öffentlichen Nutzerkonten und keine Registrierung.
      </Section>

      <Section title="Welche Daten verarbeitet werden">
        <ul className="list-disc space-y-1 pl-5">
          <li>Öffentliche Kanal- und Videostatistiken über die YouTube Data API (z. B. Aufrufe, Abonnenten, Titel).</li>
          <li>
            Nach ausdrücklicher Freigabe durch den Kanalinhaber: Statistiken der eigenen Kanäle über die YouTube
            Analytics API (z. B. Wiedergabezeit, Abo-Gewinne, Traffic-Quellen, Länder). Zugriff nur lesend über die
            Berechtigungen <code>yt-analytics.readonly</code> und <code>youtube.readonly</code>.
          </li>
          <li>Ein technisch notwendiges Anmelde-Cookie für das Dashboard-Passwort.</li>
        </ul>
      </Section>

      <Section title="Speicherung und Weitergabe">
        Die Daten werden in einer Datenbank bei Supabase (Rechenzentrum Frankfurt, EU) gespeichert; die Anwendung
        läuft bei Vercel. Die Google-Freigabe (Refresh-Token) wird verschlüsselt gespeichert. Es findet keine
        Weitergabe an Dritte, kein Verkauf, keine Werbung und kein Tracking statt.
      </Section>

      <Section title="Google API Services">
        Die Nutzung und Übertragung von Informationen, die über Google-APIs empfangen werden, erfolgt gemäß der{" "}
        <a
          className="underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , einschließlich der Anforderungen zur eingeschränkten Nutzung („Limited Use“). Zusätzlich gelten die{" "}
        <a className="underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
          YouTube-Nutzungsbedingungen
        </a>{" "}
        und die{" "}
        <a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Google-Datenschutzerklärung
        </a>
        .
      </Section>

      <Section title="Widerruf und Löschung">
        Die Freigabe kann jederzeit im Dashboard („Einstellungen → Trennen“) oder unter{" "}
        <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>{" "}
        widerrufen werden. Beim Trennen wird die gespeicherte Freigabe gelöscht.
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold text-ink">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
