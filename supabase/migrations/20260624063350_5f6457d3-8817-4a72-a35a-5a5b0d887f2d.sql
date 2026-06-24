
ALTER TABLE public.companies ALTER COLUMN owner_id DROP NOT NULL;

INSERT INTO public.companies (id, owner_id, name, greeting)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  NULL,
  'SetterAI Demo Immobilien',
  'Hallo! Ich bin Ihr persönlicher Immobilienberater. Suchen Sie zum Kauf oder zur Miete?'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, greeting = EXCLUDED.greeting;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.system_events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('error','success')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_events_kind_idx ON public.system_events(kind, created_at DESC);

GRANT SELECT ON public.system_events TO authenticated;
GRANT ALL ON public.system_events TO service_role;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads system_events" ON public.system_events
  FOR SELECT TO authenticated USING (true);
