-- Adds 'super_admin' to the existing app_role enum. Kept as its own migration:
-- a newly added enum value cannot be used (cast/compared) within the same
-- transaction that added it, and a multi-statement .sql migration file runs
-- as one implicit transaction.
alter type public.app_role add value if not exists 'super_admin';
