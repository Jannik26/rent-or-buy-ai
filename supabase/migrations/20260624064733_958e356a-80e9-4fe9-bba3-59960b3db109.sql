
-- ============ Admin role infrastructure ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ============ Lock down leads anon access ============
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leads FROM anon;
-- Drop any leftover permissive anon policies (idempotent)
DROP POLICY IF EXISTS "Anyone can create lead" ON public.leads;
DROP POLICY IF EXISTS "Anyone can update lead by id" ON public.leads;

-- ============ Widget rate-limit table ============
CREATE TABLE IF NOT EXISTS public.widget_throttle (
  company_id UUID NOT NULL,
  bucket_key TEXT NOT NULL,
  minute_bucket TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, bucket_key, minute_bucket)
);
CREATE INDEX IF NOT EXISTS widget_throttle_recent_idx
  ON public.widget_throttle (minute_bucket DESC);

GRANT ALL ON public.widget_throttle TO service_role;
ALTER TABLE public.widget_throttle ENABLE ROW LEVEL SECURITY;
-- Server-only table; no policies → no client access at all.
