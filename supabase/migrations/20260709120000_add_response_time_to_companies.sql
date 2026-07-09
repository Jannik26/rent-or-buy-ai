-- Rückmeldezeitraum, der Besuchern im Widget-Chat genannt wird ("Ein Makler
-- meldet sich innerhalb von ..."). Additive, mit Default: bestehende Zeilen
-- bekommen automatisch "24_hours" und ändern damit ihr Verhalten nicht.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS response_time text NOT NULL DEFAULT '24_hours';

DO $$ BEGIN
  ALTER TABLE public.companies
    ADD CONSTRAINT companies_response_time_check
    CHECK (response_time IN ('24_hours', '1_3_days'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
