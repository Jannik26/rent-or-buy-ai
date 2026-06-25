ALTER TYPE public.lead_intent ADD VALUE IF NOT EXISTS 'verkauf';
ALTER TYPE public.lead_intent ADD VALUE IF NOT EXISTS 'bewertung';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS property_type TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS motivation TEXT,
  ADD COLUMN IF NOT EXISTS ownership_status TEXT,
  ADD COLUMN IF NOT EXISTS usage_type TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS score_numeric INT NOT NULL DEFAULT 0;

UPDATE public.companies
SET name = 'EstateAI Demo Immobilien',
    greeting = 'Willkommen bei EstateAI. Wie kann ich Ihnen helfen? Sie können eine Immobilie verkaufen, kaufen oder den Wert Ihrer Immobilie erfahren.'
WHERE id = '00000000-0000-0000-0000-000000000000';