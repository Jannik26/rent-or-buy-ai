# EstateAI — Roadmap & Architekturplan

**Stand: 2026-08-08 · Korrekturrunde 1 + Product-Track-Slice 1
(Appointments) + Slice 2 (Analytics V1) + Slice 3 (Conversations V1) ·
Kanonisches Planungsdokument.**

Dieses Dokument ersetzt `.lovable/plan.md` als laufende Roadmap. Es wird bei
jeder größeren strategischen oder architektonischen Entscheidung aktualisiert
— Statusangaben darin gelten nur so lange als korrekt, bis der Code sie
widerlegt. Im Zweifel gilt immer: **Code und DB-Schema dieses Repos schlagen
Markdown.**

Für die geteilte Grizzly-Technologie (siehe Abschnitt 4) gilt eine
Einschränkung: Sie lebt in einem separaten Branch/Arbeitskontext
(`feature/grizzly-architect`), der von diesem Repo/Remote aus in dieser
Session nicht einsehbar war. Ihr Status hier beruht auf einer vom
Auftraggeber mitgeteilten, als verifiziert bezeichneten Zusammenfassung —
nicht auf eigener Code-Einsicht dieser Session. Das ist ausdrücklich
gekennzeichnet, wo es relevant ist.

## 0. Verhältnis zu anderen Dokumenten

| Dokument | Rolle | Status |
|---|---|---|
| `CLAUDE.md` | Betriebshandbuch/Leitplanken für AI-gestützte Änderungen (Sicherheitsregeln, Demo-Flow-Schutz, Kommunikationsstil). Verweist auf dieses Dokument statt eigene Roadmap-Punkte zu duplizieren. | aktiv |
| **`ROADMAP.md`** (dieses Dokument) | Kanonischer, fortlaufend gepflegter Produkt- und Architekturplan für **dieses** EstateAI-Repo (`main`). | **kanonisch** |
| `.lovable/plan.md` | Ursprünglicher Umbauplan „SetterAI → EstateAI MVP" (Lovable-Cloud-Sessionartefakt). Inhaltlich zu ~95 % umgesetzt (siehe Abschnitt 3). Als historisch markiert, nicht gelöscht. | historisch, superseded |
| `AGENTS.md` | Lovable-Sync-Hinweis (History-Rewrite-Warnung). Unverändert. | aktiv |
| `src/routes/README.md` | Technische Routing-Konvention (TanStack Start). Unverändert. | aktiv |
| *(extern, anderer Branch)* `feature/grizzly-architect` | Shared-Grizzly-Technologie — **nicht** Teil dieses Repos/dieser Roadmap-Pflege, siehe Abschnitt 4. | existiert, extern gepflegt |

Es existierte **keine** Datei namens Roadmap/Masterplan/Product-Vision/
Architecture/TODO/Phasenplan im Repo. `.lovable/plan.md` war der einzige
Kandidat, ist aber ein schmales (46 Zeilen), von Lovable verwaltetes
Session-Planungsartefakt für einen bereits abgeschlossenen Umbau — kein
lebendes Strategiedokument. Es wurde deshalb kein zweites konkurrierendes
Dokument geschaffen, sondern dieses hier als die fehlende kanonische Roadmap
neu angelegt.

---

## 1. Vision

EstateAI wird nicht mehr nur als schlanker Lead-Chatbot für Makler gedacht,
sondern schrittweise zu:

1. einer **Vertriebs-/Betriebsplattform für Immobilienunternehmen** (Lead →
   Qualifizierung → Termin → Abschluss → Analytics → Automatisierung), und
2. einem **Entscheidungsassistenten für Immobilieninteressenten**
   (Matching → Vergleich → Kosten → Pros/Cons → Grundriss/3D → Entscheidung).

Leitplanken bleiben: Produktionsreife vor Feature-Menge, DSGVO,
Tenant-Isolation/RLS, nachvollziehbare AI-Entscheidungen, Human-in-the-Loop
bei kritischen Aktionen, Kostenkontrolle, Feature Flags statt Big Bang,
Wiederverwendung bestehender Architektur (insbesondere Grizzly Home statt
Duplikation).

---

## 2. Tatsächlicher Implementierungsstand (verifiziert gegen Code, nicht gegen alte Doku)

Geprüft: alle Routen unter `src/routes/`, `src/lib/billing/*` (inkl. Tests),
`src/lib/admin.functions.ts`, `src/lib/lead-summary*.ts`,
`src/routes/api/public/widget.chat.ts`, alle 24 Dateien in
`supabase/migrations/`, `public/embed.js`, `package.json`. Testsuite
ausgeführt (`npm test` → 136/136 grün, 10 Dateien).

**Diese Statusprüfung bezieht sich ausschließlich auf dieses Repo
(`main`-Branch von EstateAI).** Für die Shared-Grizzly-Zeile gilt eine
eigene Kennzeichnung (siehe Legende) — sie ist kein EstateAI-Status.

Legende:
✅ DONE (in diesem Repo) · 🟡 PARTIAL (in diesem Repo) · ⏳ PLANNED (in
diesem Repo noch nicht begonnen) · 🚫 BLOCKED · 🔗 EXISTING-EXTERNAL
(existiert bereits als Shared-Grizzly-Technologie in einem anderen
Branch/Kontext; **Integration in EstateAI selbst** ist PLANNED)

| Bereich | Status | Befund |
|---|---|---|
| Auth E-Mail/Passwort | ✅ DONE | `auth.tsx`, `forgot-password.tsx`, `reset-password.tsx` voll funktionsfähig, inkl. Plus-Adress-Sperre (`validate-email.ts`) |
| Google OAuth | ✅ DONE | `auth.tsx` — Redirect-Handling, Fehleranzeige (access_denied etc.), kein Redirect-Loop möglich (Rückkehr immer zu `/auth`, nie `/dashboard`) |
| Unternehmen/Tenants (`company_id`) | ✅ DONE | `companies`-Tabelle, `owner_id`-1:1-Zuordnung, Auto-Anlage per DB-Trigger |
| Profile | ✅ DONE | `profiles`-Tabelle inkl. Sync-Trigger (`tg_sync_profile_company`, `tg_sync_profile_email`) |
| Rollen/RLS-Grundgerüst | ✅ DONE | `user_roles`/`app_role` Enum (`admin`, `moderator`, `user`, `super_admin`), `has_role()` SECURITY DEFINER-Funktion |
| RLS Policies (companies/leads) | ✅ DONE | Owner-scoped SELECT/UPDATE/DELETE; anon INSERT für Widget-Leads bewusst offen (nötig für anonyme Besucher), `search_path` gehärtet (Migrationen vom 4.8.) |
| Leads (Erstellung/Speicherung) | ✅ DONE | `widget.chat.ts::persistLeadFromTranscript`, mergt Felder über Turns, company_id-Scoping serverseitig via Service-Role |
| Widget-Einbettung (`embed.js`) | ✅ DONE | 369 Zeilen, eigenständiges Skript, CSS-isoliert, Demo-Company-Schutz (`isPublicDemoRequest`) |
| Kauf/Miete/Verkauf/Bewertung-Flow | ✅ DONE | 5 Intents (`kauf`,`verkauf`,`bewertung`,`miete`,`sonstiges`) in `chat-prompt.ts`/`widget.chat.ts`, erweiterte Slot-Extraktion |
| Lead Scoring | ✅ DONE | Regelbasiert (`scoreFromData`) + KI-strukturierte Zusammenfassung (`lead-summary.server.ts`), 0–100, hot/warm/cold, nachvollziehbare Punktevergabe |
| Lead Summary (KI) | ✅ DONE | Auto-Trigger ab 3 Nutzer-Nachrichten + Kontakt, Zod-validiertes Schema (`lead-summary-schema.ts`), „erfinde keine Werte" im Prompt |
| Termin-Funktion | ✅ DONE (2026-08-07, Product-Track-Slice 1) | Kanonische `appointments`-Tabelle (`company_id`/`lead_id`, `starts_at`/`ends_at`, `status` scheduled/completed/cancelled, RLS analog `leads`/`companies`, company_id server-seitig per Trigger aus `lead_id` abgeleitet, nie Client-Input vertraut). `leads.status='termin'` bleibt als synchronisiertes Legacy-Flag erhalten (Rückwärtskompatibilität zu AI-Chat-gesetztem Status ohne Datum). Lead-Detail-UI und `/appointments`-Seite an echte Daten angebunden. **Noch nicht enthalten** (bewusst außerhalb dieses Slices): Erinnerungen, Kalenderintegration/-Sync, Automatisierungen — bleiben Phase B/F |
| Termin Undo | ✅ DONE | `leads/$leadId.tsx` — Termin anlegen/stornieren/reaktivieren jeweils mit Undo-Toast, jetzt auf echten `appointments`-Zeilen statt nur auf `leads.status` |
| Mobile Navigation | ✅ DONE | `app-sidebar.tsx::MobileNav` |
| Klickbare Stat Cards | ✅ DONE | `dashboard.tsx::StatCard` als `Link` mit Such-Params |
| Klickbare Lead Rows | ✅ DONE | `dashboard.tsx`/`leads/index.tsx` |
| Response-Time-Einstellung | ✅ DONE | `companies.response_time`, `response-time.ts`, fließt in System-Prompt ein |
| Makler-AGB-Link | ✅ DONE | `companies.terms_url` (Migration 26.7.), im Widget verlinkt |
| Impressum/Datenschutz | 🟡 PARTIAL | Seiten/Struktur vorhanden und rechtlich korrekt aufgebaut, aber **mit expliziten TODO-Platzhaltern** (Firmenname, Anschrift, Hosting-/KI-Anbieter, Löschfristen) — vor echtem Kundeneinsatz zwingend auszufüllen |
| Trial Banner | ✅ DONE | `SubscriptionBanner.tsx` |
| 14-Tage-Trial | ✅ DONE | DB-Trigger `tg_set_initial_trial` stempelt bei jedem Insert serverseitig (nie Browser-Uhr) |
| Trial/Billing-Lifecycle (trial/trial_expiring/active/grace/expired/locked/cancelled) | ✅ DONE | `subscription-status.ts` — reine, deterministische State-Machine, fail-closed bei unklassifizierten Daten, vollständig unit-getestet |
| Zahlungsabwicklung (Stripe o. ä.) | ⏳ PLANNED | `BillingProvider`-Interface + `NoopBillingProvider` — bewusst austauschbar angelegt, aber **kein Zahlungsanbieter angebunden**, keine Env-Vars dafür vorhanden. „Abo verwalten" ist aktuell nicht klickbar bedienbar. Relevant für Monetarisierung, siehe Abschnitt 9/10 für Einordnung als Production- statt Produkt-Blocker |
| Settings – Profil/Unternehmen | ✅ DONE | `ProfileSettingsForm`, `CompanySettingsForm`, E-Mail-Änderung mit Bestätigung (`email-change.ts`) |
| Settings – Sicherheit/Benachrichtigungen/Integrationen | ⏳ PLANNED | Explizite `ComingSoonSettingsCard`-Platzhalter |
| Settings – Abo & Abrechnung | 🟡 PARTIAL | Zeigt echten Lifecycle-Status; kein echter Checkout/keine echte Kündigung möglich (siehe Zahlungsabwicklung) |
| Admin-/Trial-Monitoring (Super-Admin) | ✅ DONE | `admin/index.tsx`, `admin_company_overview()` SQL-Funktion (service_role-only), `admin_audit_log` wird bei jeder Änderung befüllt |
| System-Events-Logging | ✅ DONE | `system_events`-Tabelle, durchgängig befüllt (Rate-Limit, Fehler, Abschlüsse) im Widget-Endpoint |
| Rate-Limiting/Kostenschutz | ✅ DONE | Tages-/Sessionlimits + Minuten-/Company-Rate-Limit in `widget.chat.ts`, `widget_throttle`-Tabelle |
| Conversations-Ansicht | ✅ DONE (2026-08-08, Product-Track-Slice 3, „Conversations V1") | Master-Detail-Ansicht (Liste links, Verlauf rechts, responsive) mit echten Daten aus `leads.messages`, read-only. Suche (Name), Filter (Status/Score), Empty States, robuste Normalisierung für Legacy-/Malformed-Nachrichten (unbekannte Rollen, fehlender Inhalt, kaputte Einträge — alle im Browser gegen echte Fixtures verifiziert). Sortierung nach `leads.updated_at` als dokumentierte Näherung, da `messages` **keine Zeitstempel pro Nachricht** besitzt (echter Datenmodell-Befund, siehe Risiko 10). Kein Schreibzugriff, keine neuen Kanäle, keine Migration |
| Analytics-Dashboard | ✅ DONE (2026-08-07, Product-Track-Slice 2, „Analytics V1") | Echte, tenant-isolierte Kennzahlen statt Platzhalter: Lead-/Termin-KPIs, Zeitfilter (7/30/90 Tage/gesamt), Trends ggü. Vorperiode, 3-stufiger Funnel, Status-/Score-Verteilung, Tagesverläufe (nur für endliche Zeitfenster). Serverseitige Aggregation über eine RLS-gebundene `SECURITY INVOKER`-SQL-Funktion (`analytics_summary`, kein `company_id`-Parameter — Tenant-Isolation entsteht ausschließlich durch RLS), keine PII in der Antwort. `leads.status='termin'` ohne echten Termin wird bewusst **nicht** in „Aktive Termine"/Conversion mitgezählt, sondern separat als Altbestand ausgewiesen (siehe Abschnitt 9, Punkt 9). 12 SQL-Korrektheits-/RLS-Assertions gegen die echte DB (`supabase/tests/analytics_rls.sql`), 22 Unit-Tests für die reinen Kennzahl-Regeln |
| Automatisierte Follow-ups | ⏳ PLANNED | Nicht implementiert (max. 3 Follow-ups aus CLAUDE.md ist eine Regel, kein Code) |
| DSGVO-Löschfristen | ⏳ PLANNED | `data-retention.ts` definiert Zielwerte (30 Tage Demo, 6–12 Monate ohne Abschluss) explizit als **noch nicht durchgesetzt** |
| AI-Provider-Anbindung | ✅ DONE (aber nicht abstrahiert) | Direkt `@ai-sdk/anthropic` via Vercel AI SDK (`ai`-Package), kein Gateway/Abstraktionslayer — funktioniert, aber Wechsel des Modells/Anbieters erfordert Codeänderung an einer Stelle (`ai-gateway.server.ts`, aktuell nur ein dünner Wrapper) |
| Agent/Widget-ID-Struktur (RE/MAX-Vorbereitung) | ⏳ PLANNED | Nur `company_id` existiert; `agent_id`/`widget_id` noch nicht im Schema — siehe Abschnitt 7 |
| **Grizzly Home / Grizzly Architect** | 🔗 **EXISTING-EXTERNAL** — EstateAI-Integration ⏳ PLANNED | Existiert **nicht** in diesem Repo/Branch, ist aber **keine hypothetische Zukunftsidee**: laut Auftraggeber substanziell entwickelt auf `feature/grizzly-architect` (`origin/feature/grizzly-architect`), aktueller Phase-D-Commit `bbb96e2f1581f42e6ac015df90ab39650f5f5ae5` („feat(grizzly-architect): add ai action planning"), Phasen A–D bereits umgesetzt inkl. Geometrie-Engine, 2D-Editor, 3D Building View, `HomeActionPlan`-Pipeline, AI Action Planning (siehe Abschnitt 4). Aus **EstateAI-Sicht** (dieses Repos) ist davon **nichts** integriert — kein Package-Import, kein Adapter-Code, keine Referenz im Dependency-Baum. Die konkrete Integration in EstateAI ist vollständig ⏳ PLANNED (Phase D dieser Roadmap) |

**Kernaussage:** Die Maklerseite (Phase-A/B-Fundament) ist deutlich weiter,
robuster und produktionsreifer als es die alten Notizen vermuten lassen —
insbesondere Billing-Lifecycle, RLS-Härtung, Admin-Audit-Log und
Lead-Scoring sind bereits solide, getestete Produktionslogik, keine
Prototypen. Die größten offenen Punkte für EstateAI selbst sind: (1) kein
echter Zahlungsanbieter, (2) keine Automatisierungen — Termine, Analytics
und Conversations sind seit den Product-Track-Slices 1–3 (2026-08-07/08)
keine leeren Hüllen mehr, siehe Termin-Funktion/Analytics-Dashboard/
Conversations-Ansicht oben, (3) rechtliche
Platzhalterseiten, (4) die
komplette Interessenten-Seite (Matching, Vergleich, Kostenassistent) fehlt
noch im EstateAI-Datenmodell, und (5) die Anbindung an die **bereits
existierende** Grizzly-Home/Grizzly-Architect-Technologie ist von
EstateAI-Seite aus noch nicht begonnen.

---

## 3. Verhältnis zum alten `.lovable/plan.md`

| Punkt aus `.lovable/plan.md` | Status heute |
|---|---|
| 1. Branding SetterAI → EstateAI | ✅ umgesetzt |
| 2. 3 Intents → jetzt 5 (inkl. Verkäufer/Bewertung) | ✅ umgesetzt, sogar erweitert |
| 3. Dashboard mit KPI-Karten | ✅ umgesetzt, plus klickbare Cards (Ausbau ggü. Plan) |
| 4. Lead-Detailseite | ✅ umgesetzt, plus AI-Summary-Card (Ausbau ggü. Plan) |
| 5. Auth (Branding-Anpassung) | ✅ umgesetzt, plus Google OAuth (Ausbau ggü. Plan) |
| 6. E2E-Test & Bericht | ❓ nicht im Repo nachweisbar (kein Playwright-Testartefakt gefunden) — vermutlich manuell/einmalig durchgeführt, nicht persistiert |

Der alte Plan ist inhaltlich erledigt; die einzige offene Position (E2E-Test)
ist keine Produktlücke, sondern ein Testing-Artefakt. `.lovable/plan.md`
bleibt unverändert liegen (Lovable-Sync), gilt aber als abgeschlossen/
historisch.

---

## 4. Architekturprinzip: EstateAI Domain vs. Shared Grizzly Platform

### 4.1 Klarstellung: Grizzly Home / Grizzly Architect ist real, nicht hypothetisch

Grizzly Home bzw. „Grizzly Architect" ist **keine unbestätigte oder rein
zukünftige Idee**, sondern eine bereits substanziell entwickelte, geteilte
Technologie in einem separaten Branch/Arbeitskontext dieses Projekts:

- Branch: `feature/grizzly-architect` (Remote: `origin/feature/grizzly-architect`)
- Aktueller Phase-D-Commit: `bbb96e2f1581f42e6ac015df90ab39650f5f5ae5` —
  „feat(grizzly-architect): add ai action planning"
- Phasen A–D laut Auftraggeber substanziell entwickelt; Phase-D-Kennzahlen
  (Clean Checkout, `npm ci`, 140/140 Tests in `packages/grizzly-home`,
  376/376 Tests in `apps/intelligence`, gesamt 516/516, sauberer Typecheck,
  sauberer Production Build, 0 Lint-Findings, Preview-Deployment READY).
  Phase D gilt formal nur deshalb als noch nicht abgeschlossen, weil ein
  Browser-E2E-Test hinter der app-eigenen Supabase-Anmeldung nicht
  durchgeführt werden konnte — **kein bekannter Codefehler.**
- Dieser Stand wurde dieser Session vom Auftraggeber mitgeteilt und war aus
  diesem Repo/Remote heraus nicht selbst einsehbar (kein
  `feature/grizzly-architect` unter diesem `origin`). Er wird hier als
  gegeben behandelt, aber als extern verifiziert gekennzeichnet — vor
  Beginn der Integrationsarbeiten (Phase D dieser Roadmap) sollte die
  tatsächliche Package-/API-Oberfläche gegen den echten Branch geprüft
  werden, nicht nur gegen diese Beschreibung.

Bereits vorhandene Grizzly-Architect-Fähigkeiten (laut Auftraggeber-Stand,
Phasen A–D):

- kanonische Raum-/Gebäudegeometrie, Home Actions
- 2D-Editor: Multi-Selection, Gruppierung, Snapping/Guides, Drag Preview,
  Zoom/Pan, Undo/Redo
- Multi-Storey-/Building-Funktionen, 3D Building View
- AI Action Planning über eine `HomeActionPlan`-Pipeline: Dry Run,
  atomische Plan-Ausführung, Clarification Handling, Architect Context,
  Selection Priority, Unit Conversion, destructive Action Confirmation
- Chat-/Voice-kompatible Planning-Schnittstelle („Planning Seam")

**Wichtig — Scope-Grenze dieser Roadmap-Korrektur:** Dieser Branch wird in
diesem Auftrag **nicht** ausgecheckt, gemergt, cherry-gepickt oder
verändert. Der obige Stand dient ausschließlich der korrekten Einordnung
der Shared-Grizzly-Technologie in der EstateAI-Roadmap — **nicht** als
Behauptung, dass EstateAI (dieses Repo) diese Fähigkeiten bereits nutzt.
Aus EstateAI-Sicht bleibt der korrekte Status weiterhin: **Integration
PLANNED, nicht begonnen.**

### 4.2 Architekturgrenze

```
┌─────────────────────────────┐
│   EstateAI Domain             │  Listings, Interessenten, Leads, Makler,
│   (dieses Repo, main)         │  Unternehmen/Tenants, Suchkriterien,
│                               │  Immobilien-Matching, Mietentscheidung,
│                               │  Bewerbungen, Besichtigungen,
│                               │  Immobilienkommunikation, Billing
└───────────────┬───────────────┘
                │  EstateAI ↔ Grizzly Adapter
                │  (noch zu bauen — kein Code heute)
┌───────────────┴───────────────┐
│  Shared Grizzly Platform       │  Grizzly Home Geometry, 2D, 3D,
│  (feature/grizzly-architect —  │  Home Actions, HomeActionPlan,
│   separater Branch/Kontext,    │  Chat/Voice Editing, Action Center,
│   nicht in diesem Repo)        │  Orchestration, Approvals, Audit,
│                               │  Cost/Budget Controls, Agent-
│                               │  Infrastruktur, generative Infrastruktur
└───────────────────────────────┘
```

Übersetzungsrichtung des Adapters, beispielhaft:

```
EstateAI Listing/Floorplan
      → EstateAI-Grizzly-Adapter
      → Grizzly Home Project

Grizzly Home Result (z. B. „Bett passt", 3D-Variante)
      → EstateAI-Grizzly-Adapter
      → EstateAI User Experience (Match-Detailansicht, Grundrissseite)
```

Der Adapter übersetzt EstateAI-Fachdaten (Listing, Grundriss, Interessenten-
Kriterien) in generische Grizzly-Home-Projekte/-Aktionen und umgekehrt
Grizzly-Ergebnisse zurück in die EstateAI-Nutzererfahrung. **Keine
Fork/Copy von `packages/grizzly-home`** — EstateAI konsumiert die
Shared-Plattform, dupliziert sie nicht.

EstateAI-eigen bleibt: Lead-/Makler-Domänenlogik, Matching-Gewichtung nach
Nutzerkriterien, Tenant-/Billing-Modell, Widget-Distribution,
Immobilien-Datenmodell (Miete/Kauf/Bewertung), Conversation-Historie über
Kanäle hinweg.

---

## 5. Zwei Nutzerreisen

### 5.1 Makler-Journey (Phase A/B/F/G)

```
Lead kommt rein → EstateAI qualifiziert (✅ heute) → Scoring (✅ heute)
→ Termin (✅ seit 2026-08-07 echte `appointments`-Daten, noch ohne
Erinnerungen/Kalender-Sync) → Kommunikation (🟡 seit 2026-08-08 read-only
Conversations-Ansicht für den Website-Chat, weitere Kanäle/Schreibzugriff
⏳ Omnichannel geplant)
→ Aufgaben (⏳) → Follow-up (⏳) → Bewerbung/Interessentenprozess (⏳)
→ Abschluss (⏳ kein Deal-Status) → Analytics (✅ seit 2026-08-07 „Analytics
V1" mit echten Daten)
```

### 5.2 Interessenten-Journey (Phase C/D/E/H)

```
Immobilie entdecken (⏳) → verstehen (⏳) → EstateAI versteht Objekt +
Nutzerkriterien (⏳) → transparenten Match sehen (⏳) → Gesamtkosten sehen (⏳)
→ Pros/Cons (⏳) → andere Wohnungen vergleichen (⏳) → Grundriss öffnen
(⏳, via Grizzly-Adapter) → eigene Möbel testen (⏳) → 3D ansehen (⏳) →
Fragen stellen (✅ heute via Widget-Chat) → Besichtigung buchen (✅ seit
2026-08-07 über echte `appointments`-Daten, aktuell nur maklerseitig
bedienbar — kein Self-Service-Buchungsformular für Interessenten) →
Unterlagen/Bewerbung (⏳) → Entscheidung
```

Heute deckt EstateAI nur den Chat-/Erstkontakt-Teil beider Journeys ab. Der
Rest ist vollständig zu bauen.

### 5.3 Übergang Phase C → Phase D — zwei unterschiedliche Fragen

Phase C und Phase D beantworten bewusst unterschiedliche Fragen und bauen
aufeinander auf, statt sich zu überschneiden:

- **Phase C** beantwortet: *„Passt die Immobilie zu meinen Anforderungen?"*
  (Kriterien, Budget, Lage — reine Attribut-/Kriterien-Passung, kein
  räumliches Verständnis nötig)
- **Phase D** ergänzt: *„Passt mein tatsächliches Leben räumlich hinein?"*
  (Grundriss + eigene Möbel + reale Maße — setzt Phase C voraus, braucht
  aber zusätzlich die Grizzly-Home-Geometrie-Engine)

```
EstateAI Match (Phase C)
   +
Grizzly Home Grundriss (Phase D, via Adapter)
   +
Meine Möbel (Phase D)
   →
tatsächliche räumliche Eignung
```

Phase C ist bewusst **ohne** Grizzly-Abhängigkeit nutzbar (reine
Kriterien-/Kosten-/Vergleichslogik in EstateAI selbst) und liefert bereits
eigenständigen Nutzwert. Phase D ist ein Aufbau darauf, kein Ersatz.

---

## 6. Phasenstruktur

Die vom Auftrag vorgeschlagene Reihenfolge A–H wird nach Repo-Analyse
übernommen, mit zwei Verfeinerungen gegenüber der ersten Fassung dieses
Dokuments:

1. Phase A wird in **zwei parallele Tracks** aufgeteilt (Production Track /
   Product Track) statt als serielle Vorbedingung für alles Weitere — echte
   technische Abhängigkeiten werden explizit benannt, keine künstlichen.
2. Phase C wird als eigenständiges strategisches Kernfeature deutlich
   ausführlicher gefasst (siehe unten) — EstateAI ist nicht nur
   Makler-Software.

### Phase A — Production Foundation (zwei parallele Tracks)

Phase A ist in diesem Repo bereits zu einem großen Teil erledigt (siehe
Abschnitt 2). Was verbleibt, zerfällt in zwei Tracks, die **unabhängig
voneinander** bearbeitet werden können — Recht/Billing blockieren die
Produktentwicklung nicht automatisch:

**Production Track** (nötig für Monetarisierung/echten Kundenbetrieb, aber
kein Blocker für Phase-B-Entwicklung):

- Rechtstexte (Impressum/Datenschutz) mit echten Angaben füllen — reine
  Business-/Redaktionsaufgabe, kein Coding-Blocker für anderes
- Zahlungsanbieter anbinden (Stripe o. ä.) über das bestehende
  `BillingProvider`-Interface
- DSGVO-Löschjob umsetzen (`data-retention.ts` → tatsächlicher Cron/Job)
- Auth/OAuth-Härtung, Monitoring, Tenant/RLS-Verifikation als laufende
  Produktionsreife-Pflege

**Product Track** (kann parallel starten, keine Abhängigkeit von obigem):

Inhaltlich handelt es sich hierbei bereits um die ersten Punkte aus Phase B
(siehe unten) — sie stehen hier zusätzlich aufgelistet, weil sie keine
Abhängigkeit zum Production Track haben und deshalb zeitlich vorgezogen
werden können, statt auf Phase A zu warten:

- ✅ **DONE (2026-08-07, Slice 1)** Eigene `appointments`-Tabelle (Datum/
  Uhrzeit statt nur Status-Flag) — Migration, RLS (11/11 Tests grün, siehe
  `supabase/tests/appointments_rls.sql`), zentrale Server-Function-Schicht
  (`src/lib/appointments/`), Lead-Detail- und `/appointments`-UI
  angebunden. `leads.status='termin'` bleibt als Legacy-Signal synchron
  bestehen (siehe Abschnitt 2). Erinnerungen/Kalender-Sync bewusst nicht
  Teil dieses Slices.
- ✅ **DONE (2026-08-08, Slice 3, „Conversations V1")** Conversations-
  Ansicht mit echter Datenanbindung — Master-Detail-UI, Suche/Filter,
  robuste Legacy-/Malformed-Message-Behandlung, read-only. Keine
  Migration (Projektion/Truncation passiert im Server-Function-Layer,
  nicht in SQL — bewusste V1-Abwägung, siehe Abschnitt 7). Bewusst nicht
  Teil dieses Slices: Schreibzugriff, weitere Kanäle (E-Mail/WhatsApp/
  Telefon), echte Per-Message-Zeitstempel (existieren im Datenmodell
  nicht, siehe Risiko 10)
- ✅ **DONE (2026-08-07, Slice 2, „Analytics V1")** Analytics-Dashboard mit
  echten Daten — Lead-/Termin-KPIs, Zeitfilter, Trends, Funnel,
  Status-/Score-Verteilung, Tagesverläufe; serverseitige RLS-gebundene
  Aggregation (`analytics_summary`, `src/lib/analytics/`), 12/12
  SQL-Assertions grün (`supabase/tests/analytics_rls.sql`). Bewusst nicht
  Teil dieses Slices: Conversations, echte Zeitreihen für „gesamter
  Zeitraum" (nur 7/30/90 Tage), Kosten-/AI-Usage-Analytics
- Lead-Pipeline-Verbesserungen, weitere Maklerfunktionen
- Beginn von Phase C (Matching/Vergleich/Kosten) kann parallel geplant
  werden, sobald das Immobilien-Datenmodell (Abschnitt 7) steht

**Echte technische Abhängigkeit, explizit benannt:** Der Zahlungsanbieter
muss stehen, *bevor* echte zahlende Kunden das Produkt nutzen können — das
ist eine Voraussetzung für **Verkauf/Monetarisierung**, nicht für
**Entwicklung**. Es besteht **keine** technische Notwendigkeit, Analytics,
Conversations, Termine oder Matching auf den Zahlungsanbieter warten zu
lassen; diese Systeme lesen/schreiben ausschließlich `leads`/`companies`-
Daten und haben keinen Code-Pfad, der `BillingProvider` voraussetzt.
E2E-Testabdeckung für den Kauf-/Verkauf-/Bewertungs-Flow als persistiertes
Testartefakt bleibt ebenfalls Production-Track-Arbeit (aktuell nur
Unit-Tests, keine E2E-Tests im Repo).

### Phase B — Brokerage Core

- `appointments`-Tabelle ✅ DONE, Analytics-Dashboard ✅ DONE (V1),
  Conversations-Ansicht ✅ DONE (V1) — alle drei ursprünglich hier
  geplanten Punkte sind bereits in Phase A Product Track umgesetzt (dort
  bewusst vorgezogen, hier nicht doppelt geplant)
- Erinnerungen für Termine, Kalenderintegration (Ausbau der bestehenden
  `appointments`-Tabelle — Datenmodell ist dafür bereits vorbereitet)
- Immobilien-/Interessenten-Matching (setzt Immobilien-Datenmodell voraus —
  existiert heute nicht; Leads referenzieren keine konkrete Immobilie)
- Automatisierte, begrenzte Follow-ups (max. 3, siehe CLAUDE.md-Regel)

### Phase C — Rental Decision Intelligence (strategisches Kernfeature)

EstateAI ist hier nicht Zusatzfunktion, sondern beantwortet die
Kernfrage *„Ist diese Immobilie für MICH eine gute Entscheidung?"* für den
Interessenten — unabhängig von der Maklerseite nutzbar (siehe 5.3). Phase C
muss mindestens enthalten:

- Immobilien-Entität (aktuell nicht im Schema — Leads haben `object_desc`
  als Freitext, keine strukturierte Immobilie mit eigenen Attributen)
- persönliche Suchkriterien: Muss-/Kann-Kriterien mit Gewichtung
- transparentes, **erklärbares** Matching — keine Black-Box-Bewertung
  (analog zum bereits bestehenden nachvollziehbaren Scoring-Ansatz in
  `scoreFromData`/`lead-summary`, z. B. „87 % Match — ✓ Budget passt, △
  Arbeitsweg 34 statt 30 Min., ✕ kein Stellplatz")
- Vergleich mehrerer Immobilien nebeneinander
- Kalt-/Warmmiete getrennt ausgewiesen
- Gesamtwohnkosten (laufend) und einmalige Kosten (Kaution, Umzug) getrennt
- klare Trennung: bekannte Werte vs. Nutzerangaben vs. Schätzungen — nie
  erfundene Zahlen als Fakten darstellen
- Pros/Cons je Immobilie, aus vorhandenen Daten abgeleitet
- Erkennung fehlender Informationen (Energieausweis, Haustierregelung,
  Stellplatz, Nebenkosten-Bestandteile, Einzugstermin …) → daraus Fragen an
  den Makler generierbar
- Favoriten/Merkliste
- eigenständige Entscheidungsansicht (Zusammenfassung über mehrere
  Objekte hinweg)
- Pendel-/Lagefaktoren als **spätere** Erweiterung (nicht Teil des
  Phase-C-Minimalumfangs, aber in der Datenmodell-Planung zu
  berücksichtigen, siehe Abschnitt 7)

**Wichtige Leitplanke:** Das Matching bewertet ausschließlich die Eignung
der **Immobilie** anhand vom Nutzer selbst gewählter, sachlicher Kriterien
(Budget, Fläche, Lage, Ausstattung …). Es leitet daraus **keine** Bewertung
des Menschen ab und verwendet keine Schutzmerkmale oder diskriminierenden
Proxys. Kein Score über Personen, nur über Objekte relativ zu
selbstgewählten Kriterien.

### Phase D — Grizzly Home Integration

Siehe Abschnitt 4 und 5.3. Die Shared-Technologie existiert bereits
(`feature/grizzly-architect`, Phasen A–D laut Auftraggeber weit
fortgeschritten) — die Arbeit in dieser Phase ist **nicht** der Bau von
Grizzly Home, sondern:

- Verifikation der tatsächlichen Package-/API-Oberfläche gegen den echten
  `feature/grizzly-architect`-Stand (Voraussetzung, bevor der Adapter im
  Detail spezifiziert werden kann)
- Bau des EstateAI-↔-Grizzly-Adapters (Abschnitt 4.2)
- Grundriss/2D-Anbindung im Interessenten-Flow
- „Meine Möbel" (siehe Abschnitt 7) inkl. Fit-Checks
- Setzt Phase C voraus (räumliche Eignung ergänzt Kriterien-Eignung, nicht
  umgekehrt)

### Phase E — 3D + Conversational Home

- 3D-Ansicht, Chat-/Voice-Editing, Layout-Varianten — konsumiert die
  entsprechenden Grizzly-Architect-Fähigkeiten (3D Building View,
  Chat/Voice Planning Seam) über denselben Adapter

### Phase F — Omnichannel EstateAI

- Telefon-KI (mit Pflicht-Offenlegung „Ich bin eine KI" zu Gesprächsbeginn)
- E-Mail-Kanal
- Gemeinsame Conversation-/Thread-Datenstruktur über Kanäle hinweg (heute:
  Chat-Verlauf liegt nur als JSONB-Spalte `leads.messages` vor — kein
  kanalübergreifendes Modell)
- Human-Handoff, Consent-/Compliance-Metadaten vor jeder
  Aufzeichnungs-/Transkriptionsfunktion

### Phase G — Automation / Agentic Operations

- Workflow-/Trigger-Engine (Trigger, Conditions, Actions, Retry, Pause,
  Approval) — heute nicht vorhanden; vor Eigenbau prüfen, ob die
  Grizzly-Architect-Agent-Infrastruktur/Action-Center (Abschnitt 4) dafür
  wiederverwendet werden kann, statt eine zweite Workflow-Engine zu bauen
- Kostentracking, Rate Limits, Idempotency (Rate-Limit-Pattern aus
  `widget.chat.ts`/`widget_throttle` ist eine gute EstateAI-interne Vorlage)

### Phase H — Visualization / Generative Real Estate

- Virtual Staging, Interior Generation, Provider-Abstraktion für
  generative Anbieter, später eigene Grizzly-Generierungsmodelle

---

## 7. Datenmodell — Planungsnotizen (keine Migrationen in diesem Schritt)

Bestehendes Schema (verifiziert, Stand 2026-08-07): `companies`, `leads`,
`profiles`, `user_roles`, `widget_throttle`, `system_events`,
`admin_audit_log`, **`appointments`** (✅ neu, Product-Track-Slice 1 — siehe
unten). **Kein** `agents`, `widgets`, `properties`/`immobilien`,
`conversation_threads` als eigene Tabellen.

**`appointments` (✅ DONE, 2026-08-07):** `id`, `company_id` (server-seitig
per Trigger aus `lead_id` abgeleitet, nie Client-Input), `lead_id`,
`starts_at`/`ends_at`, `status` (`scheduled`/`completed`/`cancelled`, text
+ check statt enum — analog `companies.subscription_status`),
`location`/`notes`, `created_by`, `created_at`/`updated_at`. RLS
owner-scoped analog `leads`/`companies`, kein anon-Zugriff. Partial-Unique-
Index erzwingt max. einen `scheduled`-Termin pro Lead, erlaubt aber volle
Historie (`completed`/`cancelled`) — das sind bereits die kanonischen
Felder für die künftige Analytics-Phase (Anzahl geplanter Termine, Termine
pro Zeitraum, Lead→Termin-Conversion, completed/cancelled-Quote). RLS mit
11 Assertions gegen die echte Projekt-DB verifiziert, siehe
`supabase/tests/appointments_rls.sql`. `leads.status='termin'` bleibt als
synchronisiertes Legacy-Signal bestehen (u. a. weil der Widget-Chat direkt
`status='termin'` setzen kann, ohne ein Datum zu kennen — siehe
`widget.chat.ts` `ALLOWED_STATUS`); die `/appointments`-Seite zeigt solche
undatierten Fälle separat, statt sie zu verstecken.

**`analytics_summary` (✅ DONE, 2026-08-07, keine neue Tabelle — eine SQL-
Funktion):** `SECURITY INVOKER` (kein `company_id`-Parameter, RLS auf
`leads`/`appointments` übernimmt die Mandantentrennung vollständig),
liefert ausschließlich Aggregatzahlen (Counts, Durchschnitt) für ein
Zeitfenster + Vorperiode — keine Lead-/Termin-Datensätze, keine PII,
verlassen je die Funktion. Von `authenticated` aufrufbar, `anon`- und
`PUBLIC`-Ausführung explizit entzogen (gleiches Muster wie bei
`tg_set_appointment_company`, siehe Migration
20260807201730/20260807201801). 12 Assertions gegen die echte Projekt-DB
verifiziert, siehe `supabase/tests/analytics_rls.sql`.

**Conversations V1 (✅ DONE, 2026-08-08, keine Migration):** Anders als
Appointments/Analytics bewusst **ohne** neue SQL-Funktion — Liste und
Detail lesen `leads` direkt über den RLS-gebundenen Client
(`src/lib/conversations/conversations.functions.ts`). Für die Liste wird
`messages` pro Lead vollständig aus Postgres geladen und dann **im
Server-Function-Layer** (nicht im Client-Bundle) auf Name/Status/Score/
Nachrichtenanzahl/letzte-Nachricht-Vorschau reduziert — die volle
Nachrichtenhistorie verlässt den Server nie außer für die eine gerade
geöffnete Detail-Ansicht. Bewusste V1-Abwägung (dokumentiert statt
automatisch durch eine Migration gelöst): bei heutigen Datenmengen
(einstellige/niedrige zweistellige Leads pro Mandant) vernachlässigbar;
sollte die Listengröße relevant wachsen, wäre eine Projektionsfunktion
nach dem `analytics_summary`-Muster der nächste Schritt. Normalisierung
(`src/lib/conversations/conversation-rules.ts`) ist eine reine, getestete
Funktion — keine neue Zwischenspeicherung, keine neue Tabelle.

Für kommende Phasen wahrscheinlich nötig (grobe Skizze, vor Umsetzung im
Detail zu planen):

| Neue Entität | Phase | Tenant-Ownership | RLS-Bedarf | Besonderheiten |
|---|---|---|---|---|
| `agents` | B (RE/MAX-Vorbereitung) | `company_id` | Owner + Agent-Self-Access | `leads.agent_id` optional nachziehbar, ohne Breaking Change |
| `widgets` | B | `company_id` (+ optional `agent_id`) | wie companies | mehrere Widget-Einbindungen pro Firma |
| `properties`/`immobilien` | C | `company_id` | wie leads | strukturierte Objektattribute statt Freitext; Basis für Matching |
| `search_criteria`/`match_profiles` | C | Interessent (Auth-Modell TBD, siehe Risiko 6 in Abschnitt 9) | eigenes RLS-Modell nötig, da Interessenten heute keine Accounts haben | Muss/Kann-Gewichtung, spätere Pendel-/Lagefaktoren als optionale Kriterien |
| `furniture_items` ("Meine Möbel") | D | Interessent | wie oben | Pflichtfelder: Name, Kategorie, Breite, Tiefe, Höhe. Optional (später): Foto, 3D-Asset, Material/Farbe, Demontierbarkeit |
| `fit_checks` (Ergebnis, nicht zwingend eigene Tabelle) | D | Interessent | wie oben | Ergebnis „passt in Raum?", sinnvolle Platzierung, Laufwege-Erhalt, Mehrfach-Möbel-Kombination; Tür-/Zugangsprüfung nur bei ausreichend verlässlichen Maßen — sonst als „nicht geprüft" kennzeichnen, nicht raten |
| `conversation_threads` + `messages` | F | `company_id` | wie leads | ersetzt/ergänzt `leads.messages` JSONB, kanalübergreifend |
| `workflows`/`automation_runs` | G | `company_id` | wie leads | Retry-/Fehlerzustände, Kosten pro Lauf |

Alle mit personenbezogenen Daten (Interessenten-Kriterien, Möbel-Fotos,
Telefon-Transkripte) brauchen vor Umsetzung: Retention-Policy analog
`data-retention.ts`, DSGVO-Löschkonzept, und — bei Interessenten ohne
Login — eine bewusste Entscheidung, wie deren Daten überhaupt einer Person
zugeordnet und wieder gelöscht werden können.

---

## 8. AI Safety / Reliability — heute vs. Ziel

Bereits vorhandene, gute Praxis, die als Vorlage für neue Features dienen
sollte:

- Strukturierte Outputs werden Zod-validiert (`lead-summary-schema.ts`)
- Prompt instruiert explizit „Erfinde keine Werte. Nutze nur Informationen
  aus dem Transkript."
- Score-Berechnung ist nachvollziehbar (regelbasierte Punkte, keine
  Black-Box) und im UI mit Hinweis „KI-Einschätzung – bitte manuell
  prüfen" versehen
- Rate Limits, Tages-/Sessionlimits, Fehler-Logging in `system_events`
  sind bereits Standard im Widget-Endpoint

Für neue Features (Matching, Pros/Cons, Kosten-Schätzung, generative
Visualisierung) gilt dieselbe Messlatte: Quellen/Fakten von Schätzungen
trennen, keine erfundenen Immobiliendaten, serverseitige Validierung,
Budget-/Timeout-/Retry-Strategie, menschliche Eskalation bei Unsicherheit.

Zusätzlich für Phase C/D verbindlich: Matching und Scoring bewerten
**ausschließlich Immobilien anhand nutzergewählter, sachlicher Kriterien**
— niemals Personen, niemals unter Verwendung von Schutzmerkmalen oder
Proxys dafür. Jedes Match-Ergebnis muss auf einzelne, dem Nutzer sichtbare
Kriterien zurückführbar sein (siehe Beispiel in Phase C).

---

## 9. Offene Architekturentscheidungen & Risiken

1. **Grizzly-Architect-Stand nicht selbst eingesehen** — der in Abschnitt 4
   beschriebene Stand basiert auf Angaben des Auftraggebers, nicht auf
   eigener Code-Prüfung dieser Session (der Branch war über dieses Repo/
   Remote nicht erreichbar). Vor Start der Adapter-Implementierung
   (Phase D) sollte der reale Stand direkt geprüft werden.
2. **Kein Zahlungsanbieter** — blockiert echten Verkauf/Monetarisierung,
   **nicht** die parallele Weiterentwicklung von Analytics, Conversations,
   Terminen oder Matching (siehe Phase-A-Tracks, Abschnitt 6).
3. **Rechtstexte mit Platzhaltern** — dürfen nicht mit TODO-Platzhaltern
   live für echte Kunden gehen; Compliance-Risiko, aber ebenfalls kein
   Blocker für die parallele Produktentwicklung.
4. **KI-Provider ohne Abstraktion** — direkte `@ai-sdk/anthropic`-Bindung.
   Funktioniert, aber jede Modell-/Anbieter-Änderung ist eine Codeänderung
   an einer zentralen Stelle statt Konfiguration. Für Phase F/H (Telefon-KI,
   generative Visualisierung, evtl. andere Modelle) sollte frühzeitig
   entschieden werden, ob eine echte Abstraktion eingeführt wird — das ist
   eine noch offene Entscheidung, keine Empfehlung, die dieses Dokument
   vorwegnimmt.
5. **`leads.messages` als JSONB statt eigenes Conversation-Modell** —
   funktioniert für den heutigen Ein-Kanal-Chat gut (Conversations V1 liest
   direkt darauf, siehe Abschnitt 2/7), wird aber zum Umbau-Kandidaten
   sobald Telefon/E-Mail (Phase F) dazukommen — dann braucht es echte
   `conversation_threads`/`messages`-Tabellen mit Kanal- und
   Zeitstempel-Feldern statt der heutigen JSONB-Spalte.
6. **Interessenten haben keine Accounts** — Phase C/D (Matching, Merkliste,
   „Meine Möbel") setzt voraus, dass Interessenten wiedererkannt werden
   können. Aktuell ist niemand außer dem Makler authentifiziert. Braucht
   eine bewusste Entscheidung (Magic-Link? Account? anonyme Session mit
   Ablauf?), bevor Phase C in die Umsetzung geht — für die Konzeption
   (Kriterien-/Matching-Logik) aber kein Blocker.
7. **RE/MAX-Mehrfach-Makler-Struktur** — `company_id` ist stabil und
   `agent_id` kann additiv ergänzt werden (keine Breaking Changes nötig,
   bestehendes Muster aus den letzten Migrationen — additive
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — ist dafür bereits etabliert).
8. **E2E-Testing-Lücke** — 202 Unit-Tests (alle grün), plus je ein
   manueller, gegen die echte Projekt-DB verifizierter SQL-Korrektheits-/
   RLS-Testlauf für Slice 1 (Appointments, 11/11) und Slice 2 (Analytics,
   12/12). Für Slice 1/2 war ein echter eingeloggter Browser-Durchlauf
   blockiert (Slice 1: Pflicht-E-Mail-Bestätigung; Slice 2: zusätzlich
   Supabase-Auth-E-Mail-Rate-Limit nach zu vielen Signups). Für Slice 3
   (Conversations) gelang ein vollständiger, echter Browser-Durchlauf ohne
   neuen Signup: ein Admin-generierter Magic-Link (Supabase Admin API,
   `auth.admin.generate_link`) für den bereits bestehenden QA-Test-Account
   verschaffte eine reale Session, ohne das Rate-Limit erneut zu
   beanspruchen — Liste, Suche, Filter, Empty State, lange Conversation
   (40 Nachrichten, Scroll geprüft) und sämtliche Legacy-/Malformed-Fälle
   (unbekannte Rolle, fehlender Inhalt, kaputte Einträge, `null`) wurden
   visuell gegen eigens angelegte und danach vollständig gelöschte
   Fixture-Leads verifiziert, keine Konsolenfehler. Mobile-Viewport-
   Screenshot war durch eine Tool-Einschränkung (Fenster-Resize griff
   nicht) nicht möglich — stattdessen per Code-Review gegen das bereits
   produktiv laufende `MobileNav`-Breakpoint-Muster verifiziert. Weiterhin:
   **kein** wiederholbares, im Repo persistiertes Browser-/E2E-Testartefakt
   (z. B. Playwright). Für einen produktionsreifen Demo-Flow-Schutz
   (CLAUDE.md-Priorität #1) mittelfristig relevant, Production-Track-Arbeit.
9. **`leads.status='termin'` bleibt eine zweite/Legacy-Quelle neben
   `appointments`** — technische Schuld, bewusst nicht in Slice 1 oder 2
   aufgelöst. Der Widget-/AI-Chat kann `status='termin'` weiterhin direkt
   setzen, ohne einen `appointments`-Eintrag anzulegen (siehe
   `widget.chat.ts` `ALLOWED_STATUS`); Analytics und die Termin-UI behandeln
   das korrekt getrennt (siehe Abschnitt 2), aber die Doppelquelle selbst
   bleibt bestehen. Langfristig soll `appointments` die alleinige kanonische
   Quelle werden und der AI-Chat/Lead-Status daraus abgeleitet bzw. mit ihr
   synchronisiert werden (z. B. der Chat legt bei einer erkannten
   Terminvereinbarung direkt einen `appointments`-Eintrag an, statt nur
   `leads.status` zu setzen) — **kein** Umsetzungsauftrag für dieses
   Dokument, nur als offener Refactor-Punkt festgehalten.
10. **`leads.messages` besitzt keinen Zeitstempel pro Nachricht** —
    echter, gegen Produktionsdaten verifizierter Befund aus Slice 3
    (Conversations): jedes Element ist ausschließlich `{role, content}`
    (siehe `widget.chat.ts`'s `persistLeadFromTranscript`). Conversations
    V1 sortiert deshalb nach `leads.updated_at` als dokumentierte
    Näherung für „letzte Aktivität" — dieses Feld wird aber auch durch
    Nicht-Nachrichten-Schreibvorgänge auf derselben Zeile aktualisiert
    (Termin-Toggle, KI-Zusammenfassung-Regenerierung, Admin-Edits), ist
    also kein exakter „letzte Nachricht"-Zeitstempel. Innerhalb einer
    Conversation ist nur die Reihenfolge (Array-Index), nie ein Zeitpunkt,
    bekannt. Langfristige Lösung: `starts_at`/`sent_at` pro Nachricht beim
    Schreiben mitspeichern (kleine, additive Änderung an der
    JSONB-Struktur oder der Umstieg auf `conversation_threads`/`messages`
    aus Risiko 5) — **kein** Umsetzungsauftrag für dieses Dokument.

---

## 10. Empfehlung: nächster Schritt

**Update 2026-08-08:** Der ursprüngliche Product-Track-Dreiklang
(`appointments`-Tabelle, Analytics V1, Conversations V1 — siehe Abschnitt
2 und 7) ist vollständig umgesetzt, getestet und commitet. Rest dieses
Abschnitts bleibt als Empfehlung für die **weiteren** Schritte stehen —
weiterhin **nicht** Teil eines bereits erteilten Auftrags, außer explizit
bestätigt:

**Kann sofort parallel starten (keine Abhängigkeiten untereinander):**

- *Production Track:* Rechtstexte (Impressum/Datenschutz) mit echten
  Angaben füllen — kleinster Aufwand, größtes Compliance-Risiko wenn offen
- *Production Track:* persistiertes Browser-E2E-Testartefakt (Playwright)
  für den Demo-Flow — schließt Risiko 8 für alle drei bisherigen Slices
  gleichzeitig, kein neues Produkt-Feature
- *Konzeptarbeit:* Immobilien-Datenmodell (Phase C, `properties`-Entität)
  planen, damit Matching darauf aufbauen kann

**Echte Blocker (technisch, nicht verhandelbar):**

- Zahlungsanbieter fehlt → blockiert **ausschließlich** echten
  Zahlungsfluss/Verkauf, sonst nichts
- Grizzly-Architect-API ist von dieser Session aus nicht verifiziert →
  blockiert **ausschließlich** den Start der konkreten Adapter-Arbeit
  (Phase D), nicht die vorgelagerten Phasen B/C

**Nur „vor Production nötig", kein Entwicklungs-Blocker:**

- Rechtstexte-Platzhalter
- DSGVO-Löschjob-Durchsetzung
- E2E-Testabdeckung als persistiertes Artefakt (siehe Risiko 8)
- `leads.status='termin'`-Dual-Source-Refactor (siehe Risiko 9) und
  fehlende Per-Message-Zeitstempel (siehe Risiko 10) — technische Schuld,
  kein akuter Blocker, solange UI/Analytics sie weiterhin korrekt behandeln

Konkreter nächster Schritt, wenn nur **einer** gewählt werden soll:
**persistiertes Playwright-E2E für den Login-/Demo-Flow** — kleinster,
klar abgegrenzter Schnitt, schützt direkt CLAUDE.md-Priorität #1 (Demo-
Flow darf nicht kaputtgehen) und schließt die in allen drei Slices
dokumentierte E2E-Lücke, statt sie ein viertes Mal aufzuschieben.
Alternative, gleichwertig kleine Kandidaten: Rechtstexte befüllen
(Production Track) oder Erinnerungen für Termine (Ausbau der bestehenden
`appointments`-Tabelle, siehe Phase B).

Diese Empfehlung wird hier **nicht automatisch umgesetzt** — das ist die
nächste, separat zu bestätigende Aufgabe.
