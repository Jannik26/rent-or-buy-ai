
DROP POLICY IF EXISTS "Authenticated can create lead" ON public.leads;
CREATE POLICY "Owner inserts leads" ON public.leads FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));
