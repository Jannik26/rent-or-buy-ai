/**
 * The fixed, well-known id of the single public shared demo company (used on
 * the public /demo page). Its owner_id is NULL (see the migration that
 * created it) and its subscription fields are set explicitly to an
 * unconditional "active" state — it is identified by this id alone, never by
 * inferring "no subscription data" behavior, so ordinary companies can never
 * accidentally match its policy.
 */
export const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000000";
