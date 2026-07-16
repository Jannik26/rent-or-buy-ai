-- Optionale Datenschutz-URL der Makler-Website, die im eingebetteten Widget
-- verlinkt wird (statt auf die EstateAI-eigene /datenschutz-Seite zu verweisen).
-- Additiv, Default NULL: bestehende Firmen zeigen weiterhin keinen Link an.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS privacy_url text;

-- Öffentliches Widget liest companies als anon (siehe "Public reads company
-- branding"-Policy) und darf laut bestehendem Spalten-Grant nur bestimmte
-- Spalten sehen (id, name, greeting, primary_color) — privacy_url ergänzen,
-- damit der Hinweislink im eingebetteten Chat angezeigt werden kann.
GRANT SELECT (privacy_url) ON public.companies TO anon;
