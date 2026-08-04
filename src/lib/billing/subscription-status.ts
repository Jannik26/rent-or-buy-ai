// Single source of truth for deriving a company's subscription lifecycle
// state from the 3 raw `companies` columns. Pure, no I/O, no hidden clock
// reads — `now` is always passed in explicitly so results are deterministic
// and testable, and so the same instant is used across a whole render/request
// rather than drifting between calls (SSR/hydration safety).
//
// Fails CLOSED for unclassified data: a company with no subscription_status
// and no usable dates gets `expired`/`unclassified`, not indefinite access.
// New companies always receive an explicit trial via a DB-side trigger (see
// the sync migration), and the one legitimate exception — the public shared
// demo company — is identified by its fixed id and given explicit, permanent
// subscription data in the database, never inferred from absent data. See
// `unset_status_active_expiry` for the one remaining null-status branch that
// still grants access: a genuine future subscription_expires_at is concrete
// evidence, not absent data.

export type SubscriptionState =
  | "trial"
  | "trial_expiring"
  | "grace"
  | "active"
  | "expired"
  | "cancelled"
  | "locked";

export type SubscriptionStateReason =
  | "unset_status_active_expiry" // status null, but a future subscription_expires_at is concrete evidence
  | "trial_active"
  | "trial_ending_soon"
  | "trial_grace" // trial period over, still inside the 7-day post-trial grace window
  | "trial_lapsed"
  | "subscription_active"
  | "subscription_lapsed"
  | "cancelled_grace_period" // cancelled, but the paid period hasn't ended yet
  | "explicitly_cancelled"
  | "explicitly_locked"
  | "explicitly_expired"
  | "unknown_status"
  | "unclassified"; // no status AND no usable dates — fails closed, never indefinite access

export type SubscriptionInput = {
  subscription_status: string | null | undefined;
  demo_expires_at: string | null | undefined;
  subscription_expires_at: string | null | undefined;
};

export type SubscriptionStateResult = {
  state: SubscriptionState;
  reason: SubscriptionStateReason;
  daysRemaining: number | null;
  relevantExpiryAt: string | null;
};

/** 48h warning window: distinct from a normal multi-day trial, wide enough to be actionable. */
export const TRIAL_EXPIRING_THRESHOLD_DAYS = 2;

/** Post-trial grace window: gated features stay reachable for 7 days after
 * demo_expires_at so a trial customer who converts on day 15 isn't locked
 * out mid-decision, while still failing closed after that. */
export const TRIAL_GRACE_PERIOD_DAYS = 7;

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isFuture(date: Date | null, now: Date): boolean {
  return date !== null && date.getTime() > now.getTime();
}

function isPastOrPresent(date: Date | null, now: Date): boolean {
  return date !== null && date.getTime() <= now.getTime();
}

/** Epoch-millisecond arithmetic only — never calendar-day/timezone based, so DST can't skew it. */
export function getDaysRemaining(
  expiresAtIso: string | null | undefined,
  now: Date,
): number | null {
  const expires = parseDate(expiresAtIso);
  if (!expires) return null;
  return Math.ceil((expires.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Shared by both the null-status trial-inference branch and the explicit
 * "trial" status branch below — single source of truth for what happens
 * once a trial's `demo_expires_at` has passed, so the two branches can't
 * silently diverge. Epoch-millisecond arithmetic throughout, same as the
 * rest of this file — never calendar-day/timezone based.
 *
 * `demoExpires`/`demoExpiresIso` must describe an already-lapsed trial
 * (caller checks `isFuture` first); this only decides grace vs. fully
 * expired.
 */
function trialLapseOutcome(
  demoExpiresIso: string | null | undefined,
  demoExpires: Date,
  now: Date,
): SubscriptionStateResult {
  const graceEndsAt = new Date(demoExpires.getTime() + TRIAL_GRACE_PERIOD_DAYS * 86_400_000);
  const graceEndsAtIso = graceEndsAt.toISOString();
  if (now.getTime() <= graceEndsAt.getTime()) {
    return {
      state: "grace",
      reason: "trial_grace",
      daysRemaining: getDaysRemaining(graceEndsAtIso, now),
      relevantExpiryAt: graceEndsAtIso,
    };
  }
  return {
    state: "expired",
    reason: "trial_lapsed",
    daysRemaining: getDaysRemaining(demoExpiresIso, now),
    relevantExpiryAt: demoExpiresIso ?? null,
  };
}

export function getSubscriptionState(input: SubscriptionInput, now: Date): SubscriptionStateResult {
  const status = input.subscription_status ?? null;
  const demoExpires = parseDate(input.demo_expires_at);
  const subExpires = parseDate(input.subscription_expires_at);

  if (status === null) {
    if (isFuture(demoExpires, now)) {
      const daysRemaining = getDaysRemaining(input.demo_expires_at, now);
      const expiring = daysRemaining !== null && daysRemaining <= TRIAL_EXPIRING_THRESHOLD_DAYS;
      return {
        state: expiring ? "trial_expiring" : "trial",
        reason: expiring ? "trial_ending_soon" : "trial_active",
        daysRemaining,
        relevantExpiryAt: input.demo_expires_at ?? null,
      };
    }
    if (demoExpires !== null && isPastOrPresent(demoExpires, now)) {
      return trialLapseOutcome(input.demo_expires_at, demoExpires, now);
    }
    if (isFuture(subExpires, now)) {
      return {
        state: "active",
        reason: "unset_status_active_expiry",
        daysRemaining: getDaysRemaining(input.subscription_expires_at, now),
        relevantExpiryAt: input.subscription_expires_at ?? null,
      };
    }
    if (isPastOrPresent(subExpires, now)) {
      return {
        state: "expired",
        reason: "subscription_lapsed",
        daysRemaining: getDaysRemaining(input.subscription_expires_at, now),
        relevantExpiryAt: input.subscription_expires_at ?? null,
      };
    }
    // No status AND no usable dates — fails closed. New companies always get
    // an explicit trial stamped by the DB trigger; the demo company always
    // has explicit data; anything reaching here is genuinely unclassified.
    return {
      state: "expired",
      reason: "unclassified",
      daysRemaining: null,
      relevantExpiryAt: null,
    };
  }

  if (status === "trial") {
    if (isFuture(demoExpires, now)) {
      const daysRemaining = getDaysRemaining(input.demo_expires_at, now);
      const expiring = daysRemaining !== null && daysRemaining <= TRIAL_EXPIRING_THRESHOLD_DAYS;
      return {
        state: expiring ? "trial_expiring" : "trial",
        reason: expiring ? "trial_ending_soon" : "trial_active",
        daysRemaining,
        relevantExpiryAt: input.demo_expires_at ?? null,
      };
    }
    if (demoExpires !== null) {
      return trialLapseOutcome(input.demo_expires_at, demoExpires, now);
    }
    // No demo_expires_at at all to compute a grace window from — shouldn't
    // happen (the DB trigger always stamps one for "trial"), fails closed.
    return {
      state: "expired",
      reason: "trial_lapsed",
      daysRemaining: null,
      relevantExpiryAt: null,
    };
  }

  if (status === "active") {
    if (subExpires === null || isFuture(subExpires, now)) {
      return {
        state: "active",
        reason: "subscription_active",
        daysRemaining: getDaysRemaining(input.subscription_expires_at, now),
        relevantExpiryAt: input.subscription_expires_at ?? null,
      };
    }
    return {
      state: "expired",
      reason: "subscription_lapsed",
      daysRemaining: getDaysRemaining(input.subscription_expires_at, now),
      relevantExpiryAt: input.subscription_expires_at ?? null,
    };
  }

  if (status === "cancelled") {
    if (isFuture(subExpires, now)) {
      return {
        state: "active",
        reason: "cancelled_grace_period",
        daysRemaining: getDaysRemaining(input.subscription_expires_at, now),
        relevantExpiryAt: input.subscription_expires_at ?? null,
      };
    }
    return {
      state: "cancelled",
      reason: "explicitly_cancelled",
      daysRemaining: null,
      relevantExpiryAt: null,
    };
  }

  if (status === "paused") {
    // Admin/ops hold — independent of any date field, always takes
    // precedence over whatever the trial/subscription dates would imply.
    return {
      state: "locked",
      reason: "explicitly_locked",
      daysRemaining: null,
      relevantExpiryAt: null,
    };
  }

  if (status === "expired") {
    return {
      state: "expired",
      reason: "explicitly_expired",
      daysRemaining: null,
      relevantExpiryAt: null,
    };
  }

  return {
    state: "expired",
    reason: "unknown_status",
    daysRemaining: null,
    relevantExpiryAt: null,
  };
}

export function canAccessGatedFeatures(state: SubscriptionState): boolean {
  return state === "trial" || state === "trial_expiring" || state === "grace" || state === "active";
}

/** Short, state-keyed labels for status badges (e.g. Settings' Billing tab). */
export const SUBSCRIPTION_STATE_LABELS: Record<SubscriptionState, string> = {
  trial: "Testphase",
  trial_expiring: "Testphase endet bald",
  grace: "Kulanzfrist",
  active: "Aktiv",
  expired: "Abgelaufen",
  cancelled: "Gekündigt",
  locked: "Gesperrt",
};
