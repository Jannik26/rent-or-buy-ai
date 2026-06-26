
-- system_events: ensure no anon/authenticated access
REVOKE ALL ON TABLE public.system_events FROM PUBLIC, anon, authenticated;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.system_events TO service_role;

-- has_role: revoke EXECUTE from public roles; only service_role may call it
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
