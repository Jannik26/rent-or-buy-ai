import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/footer";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/impressum")({
  head: () => ({ meta: [{ title: "Impressum – EstateAI" }] }),
  component: ImpressumPage,
});

function ImpressumPage() {
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
        <h1 className="font-display text-3xl">Impressum</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Angaben gemäß § 5 TMG / § 18 Abs. 2 MStV.
        </p>

        {/* TODO: Alle Platzhalter unten vor Veröffentlichung durch echte, geprüfte Angaben ersetzen. */}
        <div className="mt-8 space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-medium text-foreground">Anbieter</h2>
            {/* TODO: vollständigen Namen / Firma eintragen */}
            <p className="mt-1 text-muted-foreground">[VOLLSTÄNDIGER NAME / FIRMA]</p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Adresse</h2>
            {/* TODO: Anschrift eintragen */}
            <p className="mt-1 text-muted-foreground">[STRASSE, HAUSNUMMER, PLZ, ORT]</p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Kontakt</h2>
            {/* TODO: E-Mail eintragen */}
            <p className="mt-1 text-muted-foreground">E-Mail: [E-MAIL]</p>
            {/* TODO: Telefon eintragen (optional) */}
            <p className="text-muted-foreground">Telefon: [TELEFON OPTIONAL]</p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Umsatzsteuer-ID</h2>
            {/* TODO: USt-ID eintragen, falls vorhanden */}
            <p className="mt-1 text-muted-foreground">[FALLS VORHANDEN]</p>
          </section>

          <section>
            <h2 className="font-medium text-foreground">Verantwortlich für den Inhalt</h2>
            {/* TODO: verantwortliche Person gemäß § 18 Abs. 2 MStV eintragen */}
            <p className="mt-1 text-muted-foreground">[NAME]</p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
}
