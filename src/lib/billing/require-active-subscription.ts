import {
  canAccessGatedFeatures,
  getSubscriptionState,
  type SubscriptionInput,
  type SubscriptionState,
} from "@/lib/billing/subscription-status";

const SENTINEL_PREFIX = "SUBSCRIPTION_REQUIRED:";

/**
 * Thrown by `requireActiveSubscription`. The reason is encoded in
 * `error.message` (not relied on via `instanceof`) because thrown errors
 * from a `createServerFn` handler are serialized across the server/client
 * boundary, the same reasoning the existing codebase already applies to
 * plain `throw new Error("Forbidden")` checks (see lead-summary.functions.ts,
 * admin.functions.ts).
 */
export class SubscriptionRequiredError extends Error {
  readonly code = "SUBSCRIPTION_REQUIRED" as const;
  readonly state: SubscriptionState;

  constructor(state: SubscriptionState) {
    super(`${SENTINEL_PREFIX}${state}`);
    this.name = "SubscriptionRequiredError";
    this.state = state;
  }
}

/** Throwing guard for server-side write actions. Client code should use the
 * plain boolean `canAccessGatedFeatures(getSubscriptionState(...).state)`
 * directly instead — there is exactly one implementation of the state rules
 * either way, this is just the throw-shaped wrapper servers need. */
export function requireActiveSubscription(input: SubscriptionInput, now: Date): void {
  const { state } = getSubscriptionState(input, now);
  if (!canAccessGatedFeatures(state)) {
    throw new SubscriptionRequiredError(state);
  }
}

export function isSubscriptionRequiredMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && message.startsWith(SENTINEL_PREFIX);
}
