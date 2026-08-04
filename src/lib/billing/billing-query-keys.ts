import type { QueryClient } from "@tanstack/react-query";

export const BILLING_SNAPSHOT_QUERY_KEY = ["billing-snapshot"] as const;
/** Same literal key `dashboard.tsx`/Settings' company form already use. */
export const COMPANY_QUERY_KEY = ["company"] as const;

/**
 * Centralizes every cache that must refresh after a billing action
 * succeeds — dormant today (the no-op provider never resolves a success),
 * but wired into the checkout/portal mutations now so the moment a real
 * provider returns success, the dashboard banner, Settings billing status,
 * and `["company"]` all refresh with no further changes needed.
 */
export function invalidateBillingCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: BILLING_SNAPSHOT_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: COMPANY_QUERY_KEY });
}
