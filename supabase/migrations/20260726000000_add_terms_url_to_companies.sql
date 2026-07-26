-- Optionale AGB-URL der Makler-Website, die im eingebetteten Widget verlinkt
-- wird. Additiv, Default NULL — bestehende Firmen zeigen weiterhin keinen
-- AGB-Hinweis. Kein AGB-Text wird gespeichert, nur die URL.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS terms_url text;

-- Öffentliches Widget liest companies als anon; wie bei privacy_url muss die
-- neue Spalte explizit für anon freigegeben werden (bestehender Grant deckt
-- nur id, name, greeting, primary_color, privacy_url ab).
GRANT SELECT (terms_url) ON public.companies TO anon;
