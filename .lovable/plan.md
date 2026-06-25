## EstateAI — Rebrand & MVP-Ausbau

Umbau der bestehenden SetterAI-App zu **EstateAI**, einem KI-Vertriebsassistenten für Immobilienmakler. Bestehendes Backend (Lovable Cloud, Auth, Leads, Widget-Chat, Diagnose, Rate-Limit, Rollen) bleibt erhalten — wird gezielt erweitert.

### 1. Branding-Umstellung
- Texte, Logo-Wortmarke, Meta-Tags, Hero, Footer, Auth-Seite, E-Mail-Defaults: **SetterAI → EstateAI**, Slogan *"Mehr aus Immobilien-Leads machen."*
- Trust Navy Palette bleibt (passt zu B2B SaaS / Immobilien). Typo Fraunces + Inter bleibt.
- Neue Hero-Headline + Untertitel laut Vorgabe, Buttons "Demo starten" / "Kontakt aufnehmen".
- Neue Abschnitte: Problem, Lösung (4 Checkpoints), bestehende Feature-/Widget-Demo-Sektion bleibt und wird umbenannt.

### 2. Chat-Demo erweitern (3 Intents statt 2)
- Neue Intents im System-Prompt: **Verkäufer / Käufer / Bewertung**.
- Verkäufer-Slots: Name, Immobilientyp, Standort, Verkaufsgrund, Zeitraum, Eigentümerstatus.
- Käufer-Slots: Name, gewünschte Immobilie, Eigennutzung/Kapitalanlage, Budget, Finanzierung, Kaufzeitraum.
- Bewertung-Slots: Name, Immobilientyp, Standort, Baujahr, Zustand, Wunschpreis (optional).
- DB-Enum `lead_intent` erweitern: `verkaeufer`, `kaeufer`, `bewertung`, `unbekannt` (Migration mit ADD VALUE; bestehende `kauf`/`miete` bleiben für Abwärtskompatibilität).
- Lead-Tabelle bekommt optionale Spalten: `property_type`, `location`, `motivation`, `ownership_status`, `usage_type` (Eigennutzung/Kapitalanlage), `condition`, `year_built`.
- Strukturierte Extraktion `<<DATA>>…<<END>>` um neue Felder erweitern.

### 3. Dashboard ausbauen
- KPI-Karten: Neue Leads (heute), Qualifizierte (warm+hot), Heiße Leads, Termine (Platzhalter — Status `termin`).
- Lead-Tabelle: Name · Typ · Immobilie · Motivation · Zeitraum · Score · Status. Filter nach Status/Typ.
- Status-Badges HOT/WARM/COLD farbcodiert.

### 4. Lead-Detailseite (neu)
- Route `/_authenticated/leads/$leadId`.
- Zeigt: komplette Unterhaltung (chronologisch), KI-Zusammenfassung, Score (xx/100 abgeleitet aus enum), empfohlene nächste Aktion (regelbasiert: HOT → Termin vereinbaren, WARM → Nachfassen, COLD → Pflege-E-Mail).
- Status änderbar (neu / kontaktiert / termin / abgeschlossen).

### 5. Auth
- Bestehende Login/Registrierung bleibt, nur Branding angepasst. Google-Auth bleibt aktiv.

### 6. E2E-Test & Bericht
- Playwright-Skript: Käufer- und Verkäufer-Flow durch Widget, Lead-Persistierung prüfen, Dashboard-Ansicht, Detailseite, Fehlerfälle (leere Eingabe, sehr lange Nachricht >4000 Zeichen, ungültiges Format).
- Kurzer Bericht in der Antwort: ✅ funktioniert / ⚠️ teilweise / ❌ Fehler — kritische Fehler werden direkt gefixt.

### Technische Details
- Migration: enum erweitern, neue Lead-Spalten (nullable), keine Breaking Changes.
- `src/lib/chat-prompt.ts`: neuer System-Prompt mit 3 Intents + erweiterten Slot-Listen + neuem DATA-Schema.
- `src/routes/api/public/widget.chat.ts`: extractData um neue Felder erweitern, Lead-Upsert auf neue Spalten mappen.
- `src/routes/_authenticated/dashboard.tsx`: KPI-Berechnung + erweiterte Tabelle, Klick auf Zeile → Detailroute.
- Neu: `src/routes/_authenticated/leads.$leadId.tsx`.
- Bestehende Diagnose- und Sicherheits-Hardening-Änderungen bleiben unverändert.

### Was nicht geändert wird
- Backend-Stack, RLS-Policies (außer der enum/spalten-Migration), Rate-Limit-Logik, Diagnose-Seite, Auth-Provider-Setup, Widget-Embed-Snippet-Mechanik.
