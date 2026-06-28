ALTER TYPE public.lead_intent ADD VALUE IF NOT EXISTS 'sonstiges';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS asking_price text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz;