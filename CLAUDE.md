# CLAUDE.md — EstateAI Projektanleitung

## Projektziel

EstateAI ist ein KI-Vertriebsassistent für Immobilienunternehmen, Maklerbüros und später einzelne Makler.

Das System soll Website-Besucher automatisch beraten, qualifizieren und als Leads speichern.

Hauptziel:
Aus anonymen Website-Besuchern sollen qualifizierte Immobilien-Leads werden.

EstateAI soll später nicht nur ein Chatbot sein, sondern ein Vertriebs-, Analyse- und Problemlösungs-System für Immobilienunternehmen.

---

## Aktuelle Hauptpriorität

Die aktuelle Hauptpriorität ist:

**EstateAI als stabile, verkaufbare Makler-Demo fertig machen.**

Der wichtigste MVP-Fokus:

1. Widget stabil einbettbar machen
2. Leads zuverlässig in Supabase speichern
3. Dashboard zeigt Leads korrekt an
4. Login/Auth funktioniert stabil
5. Demo-Website für Makler nutzbar machen

Keine unnötige Komplexität einbauen, solange dieser Demo-Flow nicht stabil ist.

---

## Wichtigster Demo-Flow

Dieser Flow darf nicht kaputtgehen:

```text
Besucher öffnet Demo-Website
→ EstateAI Widget erscheint
→ Besucher schreibt mit dem Chat
→ KI fragt relevante Immobilienfragen
→ Lead wird erkannt
→ Lead wird mit company_id gespeichert
→ Makler sieht Lead im Dashboard
```

---

## Was auf keinen Fall kaputtgehen darf

Bitte besonders schützen:

- Widget-Einbettung
- public/embed.js
- Lead-Erstellung in Supabase
- company_id-Zuordnung
- Dashboard-Lead-Anzeige
- Login/Auth
- Passwort-Reset
- Supabase RLS Policies
- Environment Variables
- bestehende Demo-Funktionalität

Keine Änderungen machen, die den Demo-Flow riskieren, ohne vorher einen Plan zu erstellen.

---

## Tech-Stack

Aktueller Stack:

- Frontend: React / TypeScript / TanStack / Vite / Lovable-Struktur
- Backend/DB: Supabase
- Auth: Supabase Auth
- Database: PostgreSQL über Supabase
- Hosting: Vercel / Lovable
- Widget: public/embed.js
- KI: API-basiert, später bevorzugt Claude

Vorhandene Struktur respektieren. Nicht unnötig umbauen.

---

## Supabase-Grundstruktur

Aktuell läuft das System über company_id.

Langfristig soll EstateAI auch einzelne Makler unterstützen.

Geplante Struktur:

- company_id = Büro / Unternehmen
- agent_id = einzelner Makler
- widget_id = konkrete Widget-Einbindung

Wichtige Tabellen-Idee:

- companies
- agents
- widgets
- leads
- system_events

Aktuell darf das System weiter nur mit company_id funktionieren.

Später soll optional agent_id ergänzt werden, damit einzelne RE/MAX-Makler eigene Widgets, Leads und Dashboards bekommen können.

---

## RE/MAX-Ziel

EstateAI soll später RE/MAX-tauglich werden.

Nicht nur:

- Ein RE/MAX-Büro = ein Widget

Sondern später auch:

- Ein einzelner RE/MAX-Makler = eigenes Widget
- Ein einzelner RE/MAX-Makler = eigene Leads
- Ein einzelner RE/MAX-Makler = eigene Auswertung

Bei neuen Features darauf achten, dass spätere Makler-Zuordnung nicht verbaut wird.

---

## Sicherheitsregeln

Niemals:

- RLS deaktivieren
- service_role_key ins Frontend schreiben
- API Keys in public files speichern
- alle Leads öffentlich lesbar machen
- company_id blind vertrauen, wenn es sicherheitskritisch ist
- Auth umgehen
- Daten anderer Firmen sichtbar machen

Immer prüfen:

- Welche Tabelle wird gelesen?
- Welche Tabelle wird beschrieben?
- Welche Rolle führt die Aktion aus?
- Gibt es passende RLS Policies?
- Kann Firma A Daten von Firma B sehen?

Cross-Company-Datenlecks unbedingt vermeiden.

---

## Regeln für Änderungen

Vor jeder größeren Änderung:

1. Bestehenden Code lesen
2. Betroffene Dateien nennen
3. Plan erstellen
4. Risiko erklären
5. Erst danach Code ändern
6. Nach Änderung Demo-Flow testen

Keine großen Refactorings ohne klaren Nutzen.

Wenn etwas unklar ist:
Nicht raten, sondern Datei, Tabelle oder Fehlertext prüfen.

---

## Plan Mode

Bei größeren Aufgaben zuerst nur planen.

Der Plan soll enthalten:

- Ziel der Änderung
- betroffene Dateien
- genaue Schritte
- Risiko
- Testkriterien

Noch keinen Code ändern, bevor der Plan klar ist.

---

## Definition of Done

Widget fertig:

- Widget lädt auf externer Website
- company_id wird erkannt
- Chat öffnet sich
- Nachricht kann gesendet werden
- KI antwortet
- Lead wird gespeichert
- Fehler werden sauber geloggt

Login/Auth fertig:

- Nutzer kann sich einloggen
- Nutzer kann Passwort zurücksetzen
- Auth-Link führt nicht zu 404
- Nutzer landet nach Login im Dashboard
- Session bleibt erhalten

Dashboard fertig:

- Dashboard lädt nach Login
- Nur Leads der eigenen company_id werden angezeigt
- Neue Widget-Leads erscheinen im Dashboard
- Fehler werden verständlich angezeigt

RE/MAX-Vorbereitung fertig:

- company_id bleibt stabil
- agent_id kann später ergänzt werden
- bestehendes Widget bricht nicht
- Leads können später einem Makler zugeordnet werden

---

## Gewünschte Chatlogik

EstateAI soll professionell, freundlich und seriös wirken.

Ton:

- professionell
- klar
- freundlich
- nicht übertrieben
- nicht unseriös
- nicht zu technisch

Der Bot soll Besucher qualifizieren, aber nicht nerven.

Wichtige Absichten:

- Verkauf
- Kauf
- Miete
- Bewertung
- Allgemeine Anfrage

---

## Lead Scoring

Leads sollen langfristig bewertet werden.

Ein Lead ist heißer, wenn:

- Telefonnummer vorhanden
- E-Mail vorhanden
- konkreter Verkaufs- oder Kaufzeitraum
- konkrete Immobilie oder Suchprofil
- Budget vorhanden
- hohe Dringlichkeit
- Bewertungs- oder Verkaufsabsicht

Einfache Score-Logik reicht am Anfang:

- 0-30 = kalt
- 31-70 = mittel
- 71-100 = heiß

---

## Follow-up-Regel

EstateAI soll professionell bleiben.

Standard:

- Maximal 3 Follow-up-Nachrichten

Keine aggressive Nachfasslogik.

---

## Analytics & Problemlösung

EstateAI soll später Datenanalyse und Problemlösung enthalten.

Mögliche Analysen:

- Anzahl Leads
- Leads pro Zeitraum
- durchschnittlicher Lead-Score
- häufigste Nutzerfragen
- Kauf/Miete/Verkauf/Bewertung-Verteilung
- Abbruchpunkte im Chat
- fehlende Kontaktdaten
- Conversion-Probleme
- Makler-Reaktionszeit

Problemlösungs-Funktion:

Problem erkennen → mögliche Ursache erklären → konkrete Empfehlung geben → nächsten Schritt vorschlagen.

Beispiel:

Problem:
Viele Nutzer fragen nach Immobilienbewertung, geben aber keine Telefonnummer an.

Mögliche Ursache:
Kontaktdaten werden zu früh abgefragt.

Empfehlung:
Erst Objektart, Lage und Verkaufszeitraum abfragen. Danach erklären, warum der Makler für eine genauere Einschätzung Kontakt aufnehmen sollte.

---

## System-Events

Wichtige Ereignisse sollen geloggt werden:

- widget_loaded
- chat_started
- message_sent
- ai_response_created
- lead_detected
- lead_created
- lead_score_updated
- dashboard_opened
- auth_error
- database_error

Keine sensiblen Daten unnötig in Logs speichern.

---

## Typische Fehlerquellen

Besonders prüfen bei:

- falsche company_id
- fehlende Environment Variables
- Supabase RLS blockiert Insert oder Select
- Auth Redirect URL falsch
- Passwort-Reset landet auf 404
- Vercel/Lovable Deployment nutzt alte Version
- embed.js lädt nicht
- CORS/Domain-Problem
- Dashboard filtert Leads falsch
- Lead wird erstellt, aber nicht angezeigt
- TypeScript Types passen nicht zur Datenbank

---

## Environment Variables

Keine Secrets direkt in Code schreiben.

Typische Variablen:

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- OPENAI_API_KEY

Regel:

- Anon Key darf ins Frontend.
- Service Role Key niemals ins Frontend.
- KI API Keys möglichst serverseitig verwenden.

---

## Widget-Regeln

Das Widget muss einfach einbettbar sein.

Aktuell:

```html
<script src="https://estateai.de/embed.js" data-company-id="COMPANY_ID"></script>
```

Später:

```html
<script src="https://estateai.de/embed.js" data-company-id="COMPANY_ID" data-agent-id="AGENT_ID" data-widget-id="WIDGET_ID"></script>
```

Regeln:

- Widget darf externe Website nicht kaputtmachen
- CSS möglichst isolieren
- keine globalen Konflikte verursachen
- mehrfaches Laden vermeiden
- Fehler sauber behandeln
- company_id muss erkannt werden
- agent_id später optional unterstützen

---

## UX-Regeln

Makler sollen sofort verstehen:

- Wer hat angefragt?
- Was will diese Person?
- Wie heiß ist der Lead?
- Was soll ich als nächstes tun?

Lead-Karten sollten enthalten:

- Name
- Kontakt
- Absicht
- Score
- Zusammenfassung
- empfohlener nächster Schritt
- Zeitpunkt

---

## Projektstrategie

Für Jannik gilt:

- Funktionierende Demo > perfekter Code
- Stabilität > neue Features
- Verkaufbarkeit > technische Spielerei
- Klare nächste Schritte > theoretische Perfektion

Erst verkaufbare Demo, dann Ausbau.

---

## Kommunikationsstil

Bitte kurz, direkt und praktisch antworten.

Bevorzugt:

- klare Einschätzung
- nächster sinnvoller Schritt
- konkrete Prompts
- konkrete Befehle
- Warnung vor Risiken
- Fokus auf Umsetzung

Nicht unnötig theoretisch werden.

---

## Ausgabe nach Codeänderungen

Nach jeder Änderung ausgeben:

Geändert:
- Datei 1
- Datei 2

Warum:
- kurzer Grund

Test:
- was Jannik jetzt prüfen soll

Risiko:
- mögliche Nebenwirkung

---

## Nächste sinnvolle technische Schritte

Reihenfolge:

1. Prüfen, ob CLAUDE.md vollständig ist
2. Login/Auth stabilisieren
3. Dashboard-Lead-Anzeige prüfen
4. Widget-Demo-Flow testen
5. Danach RE/MAX-Einzelmakler-Struktur planen
6. Danach Analytics & Problemlösung planen

---

## Grundsatz

Baue EstateAI so, dass es heute einfach funktioniert und morgen professionell erweitert werden kann.
