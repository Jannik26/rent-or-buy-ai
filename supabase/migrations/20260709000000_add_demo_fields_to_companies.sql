-- 14-day demo/subscription tracking for companies. Additive only, no backfill:
-- existing rows keep subscription_status = NULL, which application code treats
-- as allowed (see isCompanyAllowedToUseWidget in widget.chat.ts) so no existing
-- demo/company is blocked by this change.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS demo_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text;

DO $$ BEGIN
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IS NULL OR subscription_status IN ('trial', 'active', 'expired', 'paused', 'cancelled'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
