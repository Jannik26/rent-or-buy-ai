import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Anmelden – EstateAI" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              company_name: companyName || "Mein Maklerbüro",
              full_name: fullName || null,
            },
          },
        });
        if (error) throw error;
        toast.success("Konto erstellt!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message || "Google-Anmeldung fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-navy text-primary-foreground p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 size-96 bg-gold/10 rounded-full blur-3xl" />
        <Link to="/" className="flex items-center gap-2.5 relative">
          <img src={logo} alt="EstateAI" className="size-10" width={40} height={40} />
          <span className="font-display text-2xl">EstateAI</span>
        </Link>
        <div className="relative">
          <blockquote className="font-display text-3xl leading-snug">
            „EstateAI qualifiziert Käufer und Verkäufer schon vor dem ersten Anruf – wir gehen nur noch in Termine, die wirklich passen."
          </blockquote>
          <div className="mt-5 text-sm text-primary-foreground/60">
            <div className="font-medium text-primary-foreground">Marcus Hoffmann</div>
            Hoffmann Immobilien GmbH, München
          </div>
        </div>
        <div className="relative text-xs text-primary-foreground/50">Mehr aus Immobilien-Leads machen · DSGVO-konform · Daten in der EU</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <img src={logo} alt="" className="size-8" width={32} height={32} />
            <span className="font-display text-xl">EstateAI</span>
          </Link>
          <h1 className="font-display text-3xl">{mode === "signin" ? "Willkommen zurück" : "Konto erstellen"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin" ? "Melden Sie sich in Ihrem Makler-Dashboard an." : "Starten Sie kostenlos. 14 Tage testen."}
          </p>

          <button
            onClick={google}
            disabled={busy}
            className="mt-7 w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
          >
            <svg className="size-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Mit Google fortfahren
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> oder per E-Mail <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ihr vollständiger Name"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Name Ihres Unternehmens"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </>
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail-Adresse"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {mode === "signin" && (
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                  Passwort vergessen?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-secondary transition disabled:opacity-50"
            >
              {busy ? "Bitte warten…" : mode === "signin" ? "Anmelden" : "Konto erstellen"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Noch kein Konto?" : "Schon registriert?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-foreground font-medium hover:text-gold"
            >
              {mode === "signin" ? "Konto erstellen" : "Anmelden"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
