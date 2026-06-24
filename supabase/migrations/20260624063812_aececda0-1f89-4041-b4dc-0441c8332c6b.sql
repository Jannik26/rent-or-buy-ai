
-- Fix: companies_public_read_owner_id
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (id, name, greeting, primary_color) ON public.companies TO anon;

-- Fix: system_events_authenticated_unrestricted
DROP POLICY IF EXISTS "Authenticated reads system_events" ON public.system_events;
REVOKE SELECT ON public.system_events FROM authenticated;
