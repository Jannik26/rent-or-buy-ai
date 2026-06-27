import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings – EstateAI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const companyQuery = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("companies").select("id, name, greeting").eq("owner_id", user.id).maybeSingle();
      return data;
    },
  });
  const company = companyQuery.data;

  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setGreeting(company.greeting ?? "");
    }
  }, [company]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    const { error } = await supabase.from("companies").update({ name, greeting }).eq("id", company.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Gespeichert");
      companyQuery.refetch();
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl sm:text-3xl">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Personalisieren Sie Ihren EstateAI-Assistenten.</p>
      <form onSubmit={save} className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div>
          <label className="text-sm font-medium">Unternehmensname</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Begrüßung</label>
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !company}
          className="rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
        >
          {busy ? "Speichern…" : "Änderungen speichern"}
        </button>
      </form>
    </div>
  );
}
