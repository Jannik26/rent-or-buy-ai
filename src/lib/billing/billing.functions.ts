import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  BillingCompanyRow,
  CheckoutResult,
  PortalResult,
  SubscriptionSnapshot,
} from "@/lib/billing/billing-provider";

const BILLING_COLUMNS = "id, plan, subscription_status, demo_expires_at, subscription_expires_at";

async function loadOwnCompany(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ id: string } & BillingCompanyRow> {
  const { data, error } = await supabase
    .from("companies")
    .select(BILLING_COLUMNS)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Kein Unternehmen gefunden.");
  return data;
}

export const getBillingSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionSnapshot> => {
    const company = await loadOwnCompany(context.supabase, context.userId);
    const { getBillingProvider } = await import("@/lib/billing/get-billing-provider.server");
    return getBillingProvider().getSubscription({ companyId: company.id, companyRow: company });
  });

const createCheckoutSchema = z
  .object({ plan: z.enum(["basic", "professional", "enterprise"]).optional() })
  .strict();

export const createBillingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createCheckoutSchema.parse(input))
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const company = await loadOwnCompany(context.supabase, context.userId);
    const { getBillingProvider } = await import("@/lib/billing/get-billing-provider.server");
    return getBillingProvider().createCheckout({ companyId: company.id, plan: data.plan });
  });

export const createBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalResult> => {
    const company = await loadOwnCompany(context.supabase, context.userId);
    const { getBillingProvider } = await import("@/lib/billing/get-billing-provider.server");
    return getBillingProvider().createPortal({ companyId: company.id });
  });
