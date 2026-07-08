import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EffectiveCompany = { id: string; name: string; greeting: string };

export const DEMO_COMPANY: EffectiveCompany = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "EstateAI Demo Immobilien",
  greeting: "Hallo! Ich bin Ihr persönlicher Immobilienberater. Möchten Sie verkaufen, kaufen, mieten oder den Wert einer Immobilie ermitteln?",
};

const DEFAULT_GREETING = "Hallo! Ich bin Ihr persönlicher Immobilienberater. Möchten Sie verkaufen, kaufen, mieten oder den Wert einer Immobilie ermitteln?";

/**
 * Returns the currently authenticated user's own company (auto-creating one
 * if missing). Returns `undefined` while auth is still being resolved and
 * `null` only for confirmed anonymous visitors — callers should decide whether
 * to hide the widget or fall back to the shared demo company (which must only
 * ever happen on the public /demo page).
 */
export function useEffectiveCompany(initial?: EffectiveCompany | null) {
  const [company, setCompany] = useState<EffectiveCompany | null | undefined>(initial);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setCompany(null);
        return;
      }

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
            greeting: existing.greeting ?? DEFAULT_GREETING,
          });
        }
        return;
      }

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
          greeting: created.greeting ?? DEFAULT_GREETING,
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
