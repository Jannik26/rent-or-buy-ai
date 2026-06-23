
DROP POLICY IF EXISTS "Anyone can create lead" ON public.leads;
DROP POLICY IF EXISTS "Anyone can update lead by id" ON public.leads;
REVOKE INSERT, UPDATE ON public.leads FROM anon;
REVOKE SELECT ON public.leads FROM anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
