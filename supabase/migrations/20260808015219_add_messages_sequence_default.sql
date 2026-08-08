-- The trigger tg_set_message_sequence (previous migration) always
-- overwrites `sequence` on every insert regardless of what's supplied, so
-- no caller should ever need to pass a value — but a NOT NULL column with
-- no DEFAULT makes Supabase's generated TypeScript Insert type require one
-- anyway (it can't know a trigger will fill it in). A harmless default of 0
-- (immediately replaced by the trigger before the row is ever visible)
-- makes the column optional in that generated type, matching what's
-- actually true for every real caller (appendMessages, the backfill).
alter table public.messages alter column sequence set default 0;
