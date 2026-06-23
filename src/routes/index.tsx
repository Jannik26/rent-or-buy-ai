import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, MessageCircle, Sparkles, Zap, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { FloatingWidget } from "@/components/floating-widget";
import logo from "@/assets/setter-logo.png";
import hero from "@/assets/hero-interior.jpg";

const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000000";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SetterAI – KI-Immobilienassistent für Makler" },
      { name: "description", content: "Der KI-Assistent, der Ihre Website-Besucher in qualifizierte Immobilien-Leads verwandelt – rund um die Uhr." },
      { property: "og:title", content: "SetterAI – KI-Immobilienassistent" },
      { property: "og:description", content: "Verwandeln Sie jeden Website-Besucher in einen qualifizierten Lead." },
    ],
  }),
  loader: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.from("companies").select("id, name, greeting").limit(1).maybeSingle();
    return { demoCompany: data };
  },
  component: Landing,
});

function Landing() {
  const { demoCompany } = Route.useLoaderData();
  const companyId = demoCompany?.id ?? DEMO_COMPANY_ID;
  const companyName = demoCompany?.name ?? "SetterAI Demo Immobilien";
  const greeting = demoCompany?.greeting ?? "Hallo! Ich bin Ihr persönlicher Immobilienberater. Suchen Sie zum Kauf oder zur Miete?";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 lg:pt-28 lg:pb-36 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-gold" />
              KI-gestützte Lead-Qualifizierung
            </div>
            <h1 className="mt-6 font-display text-5xl lg:text-7xl leading-[1.02] text-foreground">
              Jeder Besucher.
              <br />
              <span className="text-gradient-gold">Jeder Lead.</span>
              <br />
              Automatisch.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              SetterAI begrüßt Ihre Website-Besucher, stellt die richtigen Fragen und übergibt qualifizierte Interessenten direkt an Ihr Maklerteam – 24/7.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3.5 font-medium shadow-elegant hover:bg-secondary transition"
              >
                Kostenlos starten <ArrowRight className="size-4" />
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 font-medium hover:bg-accent transition"
              >
                <MessageCircle className="size-4" /> Live-Demo testen
              </a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-gold" /> DSGVO-konform</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-gold" /> In 5 Min eingerichtet</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-gold" /> Keine Karte nötig</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-navy opacity-10 blur-3xl rounded-full" />
            <div className="relative rounded-3xl overflow-hidden shadow-elegant ring-1 ring-border">
              <img src={hero} alt="Modernes Immobilien-Interieur" className="w-full h-[520px] object-cover" width={1024} height={1024} />
              <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-card/95 backdrop-blur p-5 ring-1 ring-border">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-full bg-gradient-navy grid place-items-center text-gold font-display">S</div>
                  <div className="text-sm">
                    <div className="font-medium">Neuer qualifizierter Lead</div>
                    <div className="text-muted-foreground text-xs mt-0.5">Familie Weber · 4-Zi-Wohnung · 850k € · Finanzierung geklärt</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
                      🔥 Hot Lead
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-xs uppercase tracking-[0.2em] text-gold font-medium">Wie es funktioniert</div>
          <h2 className="mt-3 font-display text-4xl lg:text-5xl">In drei Schritten zum Lead</h2>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {[
            { i: 1, t: "Besucher kommt auf Ihre Website", d: "Der SetterAI-Chat erscheint dezent unten rechts und begrüßt jeden Besucher freundlich." },
            { i: 2, t: "KI qualifiziert das Gespräch", d: "Stellt die richtigen Fragen: Kauf oder Miete? Budget? Finanzierung? Einzugstermin?" },
            { i: 3, t: "Sie erhalten den Lead", d: "Im Dashboard erscheinen Name, Kontakt, Interesse und Lead-Score in Echtzeit." },
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
            { icon: Zap, t: "Sofortige Antworten", d: "Keine Wartezeiten. Besucher bekommen 24/7 Antworten – auch nachts und am Wochenende." },
            { icon: Building2, t: "Speziell für Immobilien", d: "Vortrainiert auf Kauf, Miete, Finanzierung und alle relevanten Qualifizierungsfragen." },
            { icon: ShieldCheck, t: "DSGVO & seriös", d: "Daten in der EU, klare Sprache, keine Tricks. Vertrauen ist die Basis Ihres Geschäfts." },
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
          <h2 className="mt-3 font-display text-4xl lg:text-5xl">Probieren Sie es jetzt aus</h2>
          <p className="mt-4 text-primary-foreground/70">
            Klicken Sie unten rechts auf das Chat-Symbol und führen Sie ein Gespräch wie ein Interessent. Der Lead landet im Dashboard.
          </p>
          <div className="mt-10 inline-flex items-center gap-2 text-gold text-sm">
            <span className="animate-pulse">↘</span> Chat-Widget unten rechts
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="rounded-3xl bg-gradient-navy text-primary-foreground p-12 lg:p-16 text-center shadow-elegant relative overflow-hidden">
          <div className="absolute top-0 right-0 size-64 bg-gold/10 rounded-full blur-3xl" />
          <h2 className="font-display text-4xl lg:text-5xl relative">Bereit, mehr Leads zu schließen?</h2>
          <p className="mt-4 text-primary-foreground/70 max-w-xl mx-auto relative">
            14 Tage kostenlos. Kein Risiko. Sehen Sie selbst, wie viele Interessenten Sie täglich verpassen.
          </p>
          <Link
            to="/auth"
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-gold text-gold-foreground px-7 py-3.5 font-medium hover:opacity-90 transition"
          >
            Kostenloses Konto erstellen <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="size-6" width={24} height={24} />
            <span>© {new Date().getFullYear()} SetterAI</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Datenschutz</a>
            <a href="#" className="hover:text-foreground">Impressum</a>
            <a href="#" className="hover:text-foreground">Kontakt</a>
          </div>
        </div>
      </footer>

      <FloatingWidget companyId={companyId} companyName={companyName} greeting={greeting} />
    </div>
  );
}

function Nav() {
  return (
    <header className="absolute top-0 inset-x-0 z-40">
      <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="SetterAI" className="size-9" width={36} height={36} />
          <span className="font-display text-xl">SetterAI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#demo" className="hover:text-foreground">Demo</a>
          <a href="#" className="hover:text-foreground">Preise</a>
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
