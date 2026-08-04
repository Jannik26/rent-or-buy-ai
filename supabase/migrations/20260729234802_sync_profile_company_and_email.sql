-- Keeps the denormalized profiles.company / profiles.email columns (set once
-- at signup by handle_new_user, never resynced since) in step with the
-- authoritative sources: companies.name and auth.users.email. Without this,
-- the sidebar (and anything else reading profiles) silently shows a stale
-- company name / email after the new Settings forms change either value.
-- Additive only: two AFTER UPDATE triggers, no existing migration touched.
--
-- Verified locally against a plain Postgres instance (full existing
-- migration history replayed + this file applied on top, then manual
-- UPDATE ... trigger-fired checks) before being added here. Not yet applied
-- to the remote project.

CREATE OR REPLACE FUNCTION public.tg_sync_profile_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.profiles
    SET company = NEW.name
    WHERE id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_sync_profile_company ON public.companies;
CREATE TRIGGER companies_sync_profile_company
AFTER UPDATE OF name ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_profile_company();

-- Only fires once auth.users.email itself changes, i.e. after confirmation
-- completes when "Confirm email change" is required — never reflects an
-- unconfirmed pending address.
CREATE OR REPLACE FUNCTION public.tg_sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_sync_profile_email ON auth.users;
CREATE TRIGGER auth_users_sync_profile_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_profile_email();
