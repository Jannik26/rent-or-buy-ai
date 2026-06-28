import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/estateai-logo.png";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Passwort zurücksetzen – EstateAI" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Supabase v2 recovery links arrive in different shapes:
      // 1) Hash fragment: #access_token=...&refresh_token=...&type=recovery
      // 2) Query string: ?code=... (PKCE) — exchange for a session
      try {
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
        const hashParams = new URLSearchParams(hash);
        const search = new URLSearchParams(window.location.search);

        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        const type = hashParams.get("type") || search.get("type");
        const code = search.get("code");

        if (access_token && refresh_token && type === "recovery") {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          window.history.replaceState({}, "", window.location.pathname);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState({}, "", window.location.pathname);
        }

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setHasSession(!!data.session);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Recovery-Link ungültig");
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Passwort muss mindestens 6 Zeichen haben");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwörter stimmen nicht überein");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Passwort aktualisiert. Bitte erneut anmelden.");
      await supabase.auth.signOut();
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Aktualisieren");
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
          <h1 className="font-display text-2xl">Neues Passwort festlegen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Wählen Sie ein sicheres neues Passwort für Ihr EstateAI-Konto.
          </p>

          {!ready ? (
            <div className="mt-8 text-sm text-muted-foreground">Recovery-Link wird verarbeitet…</div>
          ) : !hasSession ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-destructive/10 text-destructive p-4 text-sm">
                Der Recovery-Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.
              </div>
              <Link
                to="/forgot-password"
                className="inline-flex w-full justify-center rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-secondary transition"
              >
                Neuen Link anfordern
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Neues Passwort"
                autoComplete="new-password"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Passwort bestätigen"
                autoComplete="new-password"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-secondary transition disabled:opacity-50"
              >
                {busy ? "Speichern…" : "Passwort aktualisieren"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
