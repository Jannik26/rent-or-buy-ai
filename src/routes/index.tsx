import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, MessageCircle, Sparkles, Zap, ShieldCheck, ArrowRight, CheckCircle2, Clock, Target, BarChart3 } from "lucide-react";
import { FloatingWidget } from "@/components/floating-widget";
import { useEffectiveCompany } from "@/lib/use-effective-company";
import logo from "@/assets/estateai-logo.png";
import hero from "@/assets/hero-interior.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EstateAI – Mehr aus Immobilien-Leads machen" },
      { name: "description", content: "EstateAI beantwortet Immobilienanfragen automatisch, qualifiziert Käufer und Verkäufer und übergibt Termin-reife Leads an Ihr Maklerteam." },
      { property: "og:title", content: "EstateAI – KI-Vertriebsassistent für Immobilien" },
      { property: "og:description", content: "Verwandeln Sie Immobilienanfragen in qualifizierte Termine." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const company = useEffectiveCompany();


  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 lg:pt-28 lg:pb-36 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-gold" />
              KI-Vertriebsassistent für Immobilien
            </div>
            <h1 className="mt-6 font-display text-5xl lg:text-6xl leading-[1.05] text-foreground">
              Verwandeln Sie Immobilienanfragen in{" "}
              <span className="text-gradient-gold">qualifizierte Termine.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              EstateAI beantwortet Interessenten automatisch, erkennt Kauf- und Verkaufsabsichten und unterstützt Immobilienunternehmen im Vertrieb.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3.5 font-medium shadow-elegant hover:bg-secondary transition"
              >
                Demo starten <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 font-medium hover:bg-accent transition"
              >
                <MessageCircle className="size-4" /> Makler Login
              </Link>
            </div>

            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-gold" /> DSGVO-konform</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-gold" /> Käufer · Verkäufer · Bewertung</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-gold" /> 24/7 Erreichbarkeit</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-navy opacity-10 blur-3xl rounded-full" />
            <div className="relative rounded-3xl overflow-hidden shadow-elegant ring-1 ring-border">
              <img src={hero} alt="Modernes Immobilien-Interieur" className="w-full h-[520px] object-cover" width={1024} height={1024} />
              <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-card/95 backdrop-blur p-5 ring-1 ring-border">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-full bg-gradient-navy grid place-items-center text-gold font-display">E</div>
                  <div className="text-sm">
                    <div className="font-medium">Neuer qualifizierter Lead</div>
                    <div className="text-muted-foreground text-xs mt-0.5">Max Müller · Verkäufer · Wohnung · Motivation: Verkleinerung · 3 Monate</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
                      🔥 Score 88/100 · HOT
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Lösung */}
      <section className="mx-auto max-w-7xl px-6 py-24 grid lg:grid-cols-2 gap-12">
        <div className="rounded-3xl border border-border bg-card p-10 shadow-soft">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">Das Problem</div>
          <h2 className="mt-3 font-display text-3xl">Zu viele Anfragen. Zu wenig qualifizierte Leads.</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Immobilienunternehmen verlieren Zeit durch manuelle Bearbeitung von Anfragen, verpasste Erstkontakte und unqualifizierte Interessenten, die nie zu einem Termin führen.
          </p>
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            {["Anfragen aus mehreren Kanälen", "Lange Reaktionszeiten am Wochenende", "Kein einheitliches Qualifizierungsprofil"].map((t) => (
              <div key={t} className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground/60" /> {t}</div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-gradient-navy text-primary-foreground p-10 shadow-elegant relative overflow-hidden">
          <div className="absolute -top-10 -right-10 size-56 bg-gold/15 rounded-full blur-3xl" />
          <div className="text-xs uppercase tracking-[0.2em] text-gold font-medium">Die Lösung – EstateAI</div>
          <h2 className="mt-3 font-display text-3xl">Ein KI-Assistent, der wie ein erfahrener Makler qualifiziert.</h2>
          <ul className="mt-6 space-y-3 text-primary-foreground/90 text-sm">
            {[
              "beantwortet Anfragen sofort – 24/7",
              "qualifiziert Interessenten in natürlicher Sprache",
              "erkennt Käufer, Verkäufer und Bewertungsanfragen",
              "erstellt strukturierte Leads inkl. Score & Empfehlung",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-gold shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-xs uppercase tracking-[0.2em] text-gold font-medium">Wie es funktioniert</div>
          <h2 className="mt-3 font-display text-4xl lg:text-5xl">In drei Schritten zum Termin</h2>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {[
            { i: 1, t: "Interessent stellt eine Anfrage", d: "Der EstateAI-Chat begrüßt Besucher und fragt: kaufen, verkaufen oder bewerten lassen?" },
            { i: 2, t: "KI qualifiziert das Gespräch", d: "Immobilientyp, Standort, Motivation, Budget, Zeitraum – strukturiert in natürlicher Sprache." },
            { i: 3, t: "Makler sieht eine Zusammenfassung", d: "Im Dashboard erscheinen Lead-Score, KI-Zusammenfassung und empfohlene nächste Aktion." },
          ].map((s) => (
            <div key={s.i} className="rounded-2xl border border-border bg-card p-7 shadow-soft">
              <div className="size-10 rounded-xl bg-gradient-navy text-gold grid place-items-center font-display text-lg">{s.i}</div>
              <h3 className="mt-5 font-display text-xl">{s.t}</h3>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-6">
          {[
            { icon: Zap, t: "Sofortige Antworten", d: "Keine Wartezeiten. Interessenten erhalten 24/7 fundierte Antworten." },
            { icon: Target, t: "3 Intent-Erkennung", d: "Kauf, Verkauf und Wertermittlung – jeweils mit dem passenden Qualifizierungsdialog." },
            { icon: BarChart3, t: "Strukturierte Leads", d: "Score, Zusammenfassung und Handlungsempfehlung direkt im Dashboard." },
            { icon: Building2, t: "Speziell für Immobilien", d: "Vortrainiert auf Käufer-, Verkäufer- und Bewertungsdialoge." },
            { icon: ShieldCheck, t: "DSGVO & seriös", d: "Daten in der EU, klare Sprache, vollständige Transparenz." },
            { icon: Sparkles, t: "Bereit für Claude & Gemini", d: "Austauschbare KI-Modelle – heute Gemini, morgen Claude. Ihre Wahl." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex gap-4">
              <div className="size-10 shrink-0 rounded-xl bg-accent grid place-items-center text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <h3 className="font-display text-lg">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="bg-primary text-primary-foreground py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-gold font-medium">Live-Demo</div>
          <h2 className="mt-3 font-display text-4xl lg:text-5xl">Probieren Sie EstateAI jetzt aus</h2>
          <p className="mt-4 text-primary-foreground/70">
            Öffnen Sie unten rechts das Chat-Symbol und führen Sie ein Gespräch wie ein Interessent. Der qualifizierte Lead landet in Echtzeit im Makler-Dashboard.
          </p>
          <div className="mt-10 inline-flex items-center gap-2 text-gold text-sm">
            <span className="animate-pulse">↘</span> Chat-Widget unten rechts
          </div>
        </div>
      </section>

      {/* CTA / Kontakt */}
      <section id="kontakt" className="mx-auto max-w-5xl px-6 py-24">
        <div className="rounded-3xl bg-gradient-navy text-primary-foreground p-12 lg:p-16 text-center shadow-elegant relative overflow-hidden">
          <div className="absolute top-0 right-0 size-64 bg-gold/10 rounded-full blur-3xl" />
          <h2 className="font-display text-4xl lg:text-5xl relative">Mehr aus Immobilien-Leads machen.</h2>
          <p className="mt-4 text-primary-foreground/70 max-w-xl mx-auto relative">
            Lassen Sie uns zeigen, wie EstateAI in Ihrem Unternehmen täglich neue Beratungstermine erzeugt.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3 justify-center">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full bg-gold text-gold-foreground px-7 py-3.5 font-medium hover:opacity-90 transition"
            >
              Kostenloses Konto erstellen <ArrowRight className="size-4" />
            </Link>
            <a
              href="mailto:hello@estateai.de"
              className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 text-primary-foreground px-7 py-3.5 font-medium hover:bg-primary-foreground/10 transition"
            >
              Kontakt aufnehmen
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="size-6" width={24} height={24} />
            <span>© {new Date().getFullYear()} EstateAI – Mehr aus Immobilien-Leads machen.</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Datenschutz</a>
            <a href="#" className="hover:text-foreground">Impressum</a>
            <a href="#kontakt" className="hover:text-foreground">Kontakt</a>
          </div>
        </div>
      </footer>

      <FloatingWidget companyId={company.id} companyName={company.name} greeting={company.greeting} />
    </div>
  );
}

function Nav() {
  return (
    <header className="absolute top-0 inset-x-0 z-40">
      <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="EstateAI" className="size-9" width={36} height={36} />
          <span className="font-display text-xl">EstateAI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#demo" className="hover:text-foreground">Demo</a>
          <a href="#kontakt" className="hover:text-foreground">Kontakt</a>
          <Link to="/auth" className="hover:text-foreground">Anmelden</Link>
        </nav>
        <Link
          to="/auth"
          className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-secondary transition"
        >
          Loslegen
        </Link>
      </div>
    </header>
  );
}
