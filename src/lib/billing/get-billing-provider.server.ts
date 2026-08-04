import { NoopBillingProvider } from "@/lib/billing/noop-billing-provider.server";
import type { BillingProvider } from "@/lib/billing/billing-provider";

let _provider: BillingProvider | undefined;

/** Single swap point for a future Stripe-backed implementation. */
export function getBillingProvider(): BillingProvider {
  if (!_provider) _provider = new NoopBillingProvider();
  return _provider;
}
