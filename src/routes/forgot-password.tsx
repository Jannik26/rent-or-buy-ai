import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Passwort vergessen – EstateAI" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // TODO: Create a /reset-password page to handle the recovery link.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("E-Mail gesendet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <img src={logo} alt="" className="size-8" width={32} height={32} />
          <span className="font-display text-xl">EstateAI</span>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
          <h1 className="font-display text-2xl">Passwort vergessen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Geben Sie Ihre E-Mail ein und wir senden Ihnen einen Link zum Zurücksetzen.
          </p>
          {sent ? (
            <div className="mt-6 rounded-xl bg-success/10 text-success p-4 text-sm">
              Wir haben Ihnen eine E-Mail an <strong>{email}</strong> gesendet.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-Mail-Adresse"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-secondary transition disabled:opacity-50"
              >
                {busy ? "Senden…" : "Link senden"}
              </button>
            </form>
          )}
          <Link to="/auth" className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Zurück zum Login
          </Link>
        </div>
      </div>
    </div>
  );
}
