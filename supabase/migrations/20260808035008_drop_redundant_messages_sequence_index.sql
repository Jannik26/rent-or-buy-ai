-- messages_conversation_sequence_unique (previous migration) already covers
-- every query pattern this index would have (same leading columns,
-- conversation_id, sequence) — a unique index is usable by the planner
-- exactly like a regular index for equality/range/ordering on its columns.
-- messages_conversation_seq_idx was an unnecessary duplicate, against the
-- task's own "nur notwendige Indizes" guidance — dropping it rather than
-- carrying dead weight forward.
drop index if exists public.messages_conversation_seq_idx;
