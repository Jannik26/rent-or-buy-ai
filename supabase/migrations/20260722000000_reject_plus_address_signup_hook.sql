-- Postgres function for the Supabase "Before User Created" Auth Hook.
-- Rejects signups whose email local part (before @) contains a "+" alias.
-- NOTE: creating this function does NOT activate it. The hook must still be
-- enabled in Supabase Dashboard -> Authentication -> Hooks -> "Before User Created",
-- pointing at public.reject_plus_address_signup.

create or replace function public.reject_plus_address_signup(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email text;
  local_part text;
begin
  email := event->'user'->>'email';

  -- No email on this signup (e.g. phone/OAuth-only) — nothing to check, allow it.
  if email is null or email = '' then
    return '{}'::jsonb;
  end if;

  local_part := split_part(email, '@', 1);

  if local_part like '%+%' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Bitte verwende deine normale E-Mail-Adresse. E-Mail-Aliase mit ''+'' werden nicht unterstützt.',
        'http_code', 400
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

-- Permissions required by the Auth Hook contract
grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.reject_plus_address_signup
  to supabase_auth_admin;

revoke execute
  on function public.reject_plus_address_signup
  from anon, authenticated, public;
