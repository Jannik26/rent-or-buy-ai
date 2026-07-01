import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EffectiveCompany = { id: string; name: string; greeting: string };

const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000000";
const DEMO_FALLBACK: EffectiveCompany = {
  id: DEMO_COMPANY_ID,
  name: "EstateAI Demo Immobilien",
  greeting: "Willkommen bei EstateAI. Wie kann ich Ihnen helfen?",
};

/**
 * Returns the currently authenticated user's company when signed in
 * (auto-creates one if missing), and falls back to the shared demo
 * company for anonymous visitors. Ensures leads created through the
 * embedded / landing / demo widget are attributed to the right tenant.
 */
export function useEffectiveCompany(initial?: EffectiveCompany | null) {
  const [company, setCompany] = useState<EffectiveCompany>(initial ?? DEMO_FALLBACK);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled && !initial) setCompany(DEMO_FALLBACK);
        return;
      }

      // Try to find an existing company owned by this user.
      const { data: existing } = await supabase
        .from("companies")
        .select("id, name, greeting")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (existing) {
        if (!cancelled) {
          setCompany({
            id: existing.id,
            name: existing.name,
            greeting: existing.greeting ?? DEMO_FALLBACK.greeting,
          });
        }
        return;
      }

      // Safety net: create one if the signup trigger didn't (older accounts,
      // OAuth users, etc.). RLS allows owner_id = auth.uid().
      const fallbackName =
        (user.user_metadata?.company_name as string | undefined) ||
        (user.user_metadata?.full_name ? `${user.user_metadata.full_name} Immobilien` : null) ||
        "Meine Firma";

      const { data: created } = await supabase
        .from("companies")
        .insert({ owner_id: user.id, name: fallbackName })
        .select("id, name, greeting")
        .single();

      if (created && !cancelled) {
        setCompany({
          id: created.id,
          name: created.name,
          greeting: created.greeting ?? DEMO_FALLBACK.greeting,
        });
      }
    }

    resolve();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") resolve();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [initial]);

  return company;
}
