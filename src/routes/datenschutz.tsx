import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/footer";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({ meta: [{ title: "Datenschutz – EstateAI" }] }),
  component: DatenschutzPage,
});

function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-border flex items-center px-6 gap-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Zurück
        </Link>
        <div className="flex-1" />
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="" className="size-7" width={28} height={28} />
          <span className="font-display text-base">EstateAI</span>
        </Link>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto p-6 sm:p-10">
        <h1 className="font-display text-3xl">Datenschutzerklärung</h1>

        {/* TODO: Diese Seite ist ein Entwurf mit Platzhaltern. Vor echtem Kundeneinsatz
            rechtlich prüfen/anpassen lassen (z. B. durch einen Datenschutzbeauftragten
            oder Rechtsanwalt). Keine Garantie auf Vollständigkeit/Rechtssicherheit. */}
        <div className="mt-3 inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-muted-foreground">
          Entwurf – vor Veröffentlichung rechtlich zu prüfen
        </div>

        <div className="mt-8 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-medium text-foreground">Verantwortlicher</h2>
            {/* TODO: Verantwortlichen gemäß Art. 4 Nr. 7 DSGVO eintragen */}
            <p className="mt-1 text-muted-foreground">[NAME / FIRMA]</p>
            {/* TODO: Adresse eintragen */}
            <p className="text-muted-foreground">[ADRESSE]</p>
            {/* TODO: Datenschutz-Kontakt eintragen */}
            <p className="text-muted-foreground">E-Mail: [DATENSCHUTZ-KONTAKT]</p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Welche Daten wir erfassen</h2>
            <p className="mt-1 text-muted-foreground">
              Über das EstateAI-Chat-Widget auf dieser bzw. verbundenen Websites erfassen wir Kontakt- und
              Anfrageinformationen, die Besucher im Chat freiwillig angeben (z. B. Name, E-Mail-Adresse,
              Telefonnummer, Angaben zur Immobilienanfrage). Es werden keine unnötigen Daten erhoben.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Zweck der Verarbeitung</h2>
            <p className="mt-1 text-muted-foreground">
              Diese Daten werden verwendet, um Immobilienanfragen zu bearbeiten und den Kontakt zwischen
              Interessenten und dem zuständigen Makler herzustellen. Die im Chat erfassten Leads werden im
              Makler-Dashboard des jeweiligen Unternehmens angezeigt, damit sich der Makler beim Interessenten
              melden kann.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Eingesetzte Dienstleister</h2>
            <p className="mt-1 text-muted-foreground">Zur Bereitstellung des Dienstes nutzen wir technische Dienstleister, u. a.:</p>
            <ul className="mt-2 list-disc list-inside text-muted-foreground space-y-1">
              {/* TODO: konkreten Hosting-Anbieter eintragen */}
              <li>Hosting: [z. B. Vercel]</li>
              {/* TODO: konkreten Datenbank-Anbieter eintragen */}
              <li>Datenbank: [z. B. Supabase]</li>
              {/* TODO: konkreten KI-Anbieter eintragen */}
              <li>KI-Anbieter (Chat-Verarbeitung): [z. B. Anthropic]</li>
            </ul>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Speicherdauer</h2>
            {/* TODO: konkrete Speicherdauer / Löschregeln eintragen */}
            <p className="mt-1 text-muted-foreground">
              [z. B. bis zur Bearbeitung der Anfrage / gesetzliche Aufbewahrungsfristen / manuelle Löschung
              durch den Makler]
            </p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Ihre Rechte</h2>
            <p className="mt-1 text-muted-foreground">
              Sie haben das Recht auf Auskunft über die zu Ihrer Person gespeicherten Daten sowie auf
              Berichtigung, Löschung oder Einschränkung der Verarbeitung. Bitte wenden Sie sich hierzu an die
              oben genannte Kontaktadresse.
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
