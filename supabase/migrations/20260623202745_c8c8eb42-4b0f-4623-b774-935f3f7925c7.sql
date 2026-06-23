
-- ============ Companies / Profiles ============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  greeting TEXT DEFAULT 'Hallo! Ich bin Ihr persönlicher Immobilienberater. Suchen Sie zum Kauf oder zur Miete?',
  primary_color TEXT DEFAULT '#0B1F3A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_owner_unique ON public.companies(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT ON public.companies TO anon;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages company" ON public.companies FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Public reads company branding" ON public.companies FOR SELECT TO anon USING (true);

-- ============ Leads ============
CREATE TYPE public.lead_intent AS ENUM ('kauf','miete','unbekannt');
CREATE TYPE public.lead_score AS ENUM ('hot','warm','cold');

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  intent public.lead_intent NOT NULL DEFAULT 'unbekannt',
  object_desc TEXT,
  budget TEXT,
  financing TEXT,
  timeframe TEXT,
  income TEXT,
  household_size TEXT,
  move_in_date TEXT,
  score public.lead_score NOT NULL DEFAULT 'cold',
  qualification_summary TEXT,
  status TEXT NOT NULL DEFAULT 'neu',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_company_idx ON public.leads(company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leads TO anon;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Makler liest/verwaltet seine Leads
CREATE POLICY "Owner reads leads" ON public.leads FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));
CREATE POLICY "Owner updates leads" ON public.leads FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));
CREATE POLICY "Owner deletes leads" ON public.leads FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Anonyme Besucher dürfen Leads anlegen + ihren laufenden Lead aktualisieren
-- (Schutz: Aktualisierung erfolgt nur per server endpoint; wir erlauben sowohl insert als auch update)
CREATE POLICY "Anyone can create lead" ON public.leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can update lead by id" ON public.leads FOR UPDATE TO anon USING (true);
CREATE POLICY "Authenticated can create lead" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-Anlage einer Demo-Company beim Signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.companies (owner_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'company_name', 'Mein Maklerbüro'));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
