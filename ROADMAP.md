# EstateAI — Roadmap & Architekturplan

**Stand: 2026-08-09 · Korrekturrunde 1 + Product-Track-Slice 1
(Appointments) + Slice 2 (Analytics V1) + Slice 3 (Conversations V1) +
Verification-Track-Slice 1 (persistierte Playwright-E2E-Basis) +
Product-Track-Slice 4 (Conversations Foundation — kanonische
Conversations-/Messages-Domain) + Slice 5 (Automated Lead Follow-ups
Foundation) + Slice 6 (Production Follow-up Scheduler) + Slice 7
(Production E-Mail Delivery Foundation) + Engineering-Workflow-Hardening
(`estateai-engineering`-Skill) + Slice 8A (E-Mail Delivery Hardening) ·
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
| Conversations-Ansicht | ✅ DONE (2026-08-08, Product-Track-Slice 3 „Conversations V1" + Slice 4 „Conversations Foundation") | Master-Detail-Ansicht (Liste links, Verlauf rechts, responsive), Suche (Name), Filter (Status/Score), Empty States — seit Slice 4 auf der **kanonischen** `conversations`/`messages`-Domain statt `leads.messages`-JSONB (siehe Abschnitt 7). Sortierung nach `conversations.last_message_at` (echte Spalte, per Trigger gepflegt), Reihenfolge innerhalb einer Conversation nach `sequence` (nie `created_at` — siehe Risiko 10, jetzt gelöst). Lead-Detailseite liest denselben Server-Function-Aufruf, keine zweite Wahrheit mehr. Weiterhin kein Schreibzugriff in der UI selbst (nur der Widget-Chat schreibt, jetzt in die kanonische Domain, siehe unten) |
| Analytics-Dashboard | ✅ DONE (2026-08-07, Product-Track-Slice 2, „Analytics V1") | Echte, tenant-isolierte Kennzahlen statt Platzhalter: Lead-/Termin-KPIs, Zeitfilter (7/30/90 Tage/gesamt), Trends ggü. Vorperiode, 3-stufiger Funnel, Status-/Score-Verteilung, Tagesverläufe (nur für endliche Zeitfenster). Serverseitige Aggregation über eine RLS-gebundene `SECURITY INVOKER`-SQL-Funktion (`analytics_summary`, kein `company_id`-Parameter — Tenant-Isolation entsteht ausschließlich durch RLS), keine PII in der Antwort. `leads.status='termin'` ohne echten Termin wird bewusst **nicht** in „Aktive Termine"/Conversion mitgezählt, sondern separat als Altbestand ausgewiesen (siehe Abschnitt 9, Punkt 9). 12 SQL-Korrektheits-/RLS-Assertions gegen die echte DB (`supabase/tests/analytics_rls.sql`), 22 Unit-Tests für die reinen Kennzahl-Regeln |
| E2E-Testinfrastruktur (Playwright) | ✅ DONE (2026-08-08, Verification-Track-Slice 1) | `tests/e2e/` — Core-Journey-Suite (Auth-Guard, Dashboard, Leads inkl. Tenant-Isolation, Conversations, Appointments inkl. Storno-/Wiederherstell-Lifecycle, Analytics inkl. Zeitfensterwechsel, Navigation) + ein Mobile-Smoke-Test. Dedizierter QA-Mandant, deterministische/idempotente Fixtures per fixer ID, Auth per Admin-generiertem Magic-Link + `storageState` (kein neuer Signup). 10/10 grün, dreifach reproduzierbar. Ergänzt, ersetzt nicht, die bestehenden SQL-RLS-Tests. Version gepinnt auf `1.45.0` wegen macOS-Ventura-Browser-Binary-Inkompatibilität neuerer Playwright-Versionen auf dieser Entwicklungsmaschine |
| Automatisierte Follow-ups | 🟡 PARTIAL (2026-08-08/09, Slice 5 „Foundation" + Slice 6 „Production Scheduler" + Slice 7 „E-Mail Delivery Foundation" + Slice 8A „E-Mail Delivery Hardening" + Slice 8B „Inbound E-Mail Replies") | Engine + Scheduler + E-Mail-Kanal in **beide** Richtungen (Outbound inkl. Bounce/Complaint-Webhooks, Suppression, Retry/Backoff, echtem Unsubscribe; Inbound inkl. sicherer Conversation-Auflösung, Sender-Verifikation, Follow-up-Stopp bei echter Antwort) vollständig code-seitig fertig. **Scheduler operativ verifiziert** (echter `200` nach Korrektur von `CRON_SECRET`, siehe Risiko 14 — nicht mehr nur code-seitig). **Verbleibend, bevor tatsächlich eine echte E-Mail rausgeht/reinkommt:** `EMAIL_DELIVERY_ENABLED`/`EMAIL_PROVIDER_API_KEY`/`EMAIL_SENDER_ADDRESS`/`EMAIL_PROVIDER_WEBHOOK_SECRET`/`EMAIL_INBOUND_*` sind serverseitig standardmäßig nicht gesetzt (sicherer Default aus, siehe Abschnitt 7/Risiko 19/25/27) — ohne echten Resend-Account + verifizierte Domain (+ Inbound-MX-Record) bleibt der Kanal inaktiv und der Worker verhält sich weiterhin wie in Slice 6 (nur kanonischer Dashboard-Eintrag) |
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

**Klarstellung (ab Verification-Track-Slice 1, 2026-08-08):** orthogonal zu
Production/Product Track oben entwickelt sich EstateAI ab jetzt auf zwei
parallelen **Spuren**: **Track A — Produktentwicklung** (kontinuierlicher
Feature-Ausbau, siehe Phasen B–H) und **Track B — Continuous Verification**
(automatisierte Tests, perspektivisch auch echtes Pilotkunden-Feedback).
Track B **blockiert** Track A nicht — er läuft als Regressions-/
Qualitäts-Netz parallel mit, nicht als Vorbedingung. Der erste konkrete
Track-B-Baustein ist die persistierte Playwright-E2E-Basis unten (Production
Track, Risiko 8 in Abschnitt 9).

**Production Track** (nötig für Monetarisierung/echten Kundenbetrieb, aber
kein Blocker für Phase-B-Entwicklung):

- Rechtstexte (Impressum/Datenschutz) mit echten Angaben füllen — reine
  Business-/Redaktionsaufgabe, kein Coding-Blocker für anderes
- Zahlungsanbieter anbinden (Stripe o. ä.) über das bestehende
  `BillingProvider`-Interface
- DSGVO-Löschjob umsetzen (`data-retention.ts` → tatsächlicher Cron/Job)
- Auth/OAuth-Härtung, Monitoring, Tenant/RLS-Verifikation als laufende
  Produktionsreife-Pflege
- ✅ **DONE (2026-08-08, Verification-Track-Slice 1)** Persistierte
  Playwright-E2E-Basis (`tests/e2e/`, `playwright.config.ts`) — schützt den
  vollständigen Core-Journey-Demo-Flow (Auth-Guard → Dashboard → Leads →
  Conversations → Appointments → Analytics → Navigation) plus ein
  Mobile-Viewport-Smoke, gegen einen dedizierten QA-Mandanten mit
  deterministischen, idempotenten Fixtures (feste `e2e`-präfixte IDs,
  Teardown nach jedem Lauf). Auth ohne neuen Supabase-Signup: Admin-
  generierter Magic-Link (`auth.admin.generateLink`) + Playwright
  `storageState`. 10/10 Tests grün, dreifach reproduzierbar hintereinander
  verifiziert. Schließt Risiko 8 (Abschnitt 9) für die bisherigen
  Product-Track-Slices. Deckt dabei einen echten Produktfehler auf (siehe
  unten) — Details: `tests/e2e/README.md`.
- ✅ **DONE (2026-08-08, im Zuge von Verification-Track-Slice 1)**
  Echter Bugfix auf `/analytics`: `ResponsiveContainer` (recharts) geriet
  in eine React-Mount-Race ("Can't perform a state update on a component
  that hasn't mounted yet"), sichtbar beim Wechsel des Zeitfensters, wenn
  ein noch nicht gecachtes Fenster `AnalyticsBody` kurzzeitig unmountete.
  Behoben über `placeholderData: keepPreviousData` (React Query) +
  `ChartReady`-Wrapper (`analytics.tsx`) — vom neuen E2E-Test aufgedeckt,
  nicht vorher bekannt.

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
- ✅ **DONE (2026-08-08, Slice 4, „Conversations Foundation")** Kanonische
  `conversations`/`messages`-Domain ersetzt `leads.messages` (JSONB) als
  Source of Truth — vollständige Details in Abschnitt 7. Kurzfassung:
  additive Migration + verifizierter Backfill (172/172 Legacy-Nachrichten,
  0 Abweichungen bei Reihenfolge/Inhalt/Rolle/Mandant), RLS (16/16
  Assertions grün, `supabase/tests/conversations_rls.sql`), zentrale
  Server-Schicht (`src/lib/conversations/`), Widget-Chat schreibt per
  Dual-Write zusätzlich in die kanonische Domain (`leads.messages` bleibt
  unverändert als Legacy-/Rollback-Netz bestehen), Conversations-UI und
  Lead-Detail lesen beide ausschließlich aus der neuen Domain (eine
  Wahrheit). Löst Risiko 5 (kein Conversation-Modell) und Risiko 10 (keine
  Message-Zeitstempel) aus Abschnitt 9. Bewusst nicht Teil dieses Slices:
  Follow-ups, WhatsApp/E-Mail/Telefon-Kanäle, OpenClaw-Integration, Löschen
  der Legacy-JSONB-Spalte (siehe Abschnitt 7 für den geplanten
  Cleanup-Schritt)
- ✅ **DONE (2026-08-08, Slice 5, „Automated Lead Follow-ups Foundation")**
  Kanalunabhängige Follow-up-Engine auf der kanonischen
  Conversations-Domain — vollständige Details in Abschnitt 7. Kurzfassung:
  neue `conversation_followups`-Tabelle (Max-3-Limit als Lifetime-Cap, DB-
  erzwungen über CHECK `step between 1 and 3` + UNIQUE
  `(conversation_id, step)`, nicht nur UI-seitig), Scheduling aller 3
  Schritte im Voraus bei erster unbeantworteter KI-Nachricht (24h/72h/
  144h-Staffelung ab CLAUDE.md-Default), race-sicherer Claim-Worker
  (`processDueFollowups`, atomare `UPDATE ... WHERE status='scheduled'`),
  automatischer Abbruch bei Lead-Antwort (proaktiv + erneute Prüfung im
  Worker als Sicherheitsnetz) oder geschlossener Conversation,
  deterministische Templates (kein Live-KI-Aufruf), minimale UI (Lead-
  Detail: Status/Zeitpunkt pro Schritt + „Follow-ups stoppen"). 15/15
  RLS-Assertions grün (`supabase/tests/conversation_followups_rls.sql`),
  echter DB-Roundtrip-Integrationstest gegen die verbundene Projekt-DB.
  Vorab: read-only Untersuchung des in Slice 4 dokumentierten
  Datenverlust-Befunds (Risiko 13) — kein Löschpfad gefunden, siehe
  Abschnitt 9. Bewusst nicht Teil dieses Slices: echte externe Kanäle
  (E-Mail/WhatsApp/Telefon), automatischer Scheduler/Cron für den Worker
  (kein `pg_cron`/keine Edge Function im Projekt), OpenClaw-Integration,
  Kalender-Sync
- ✅ **DONE (2026-08-08, Slice 6, „Production Follow-up Scheduler")**
  Schließt Risiko 14 — `processDueFollowups` (Slice 5) läuft jetzt
  automatisch. Architektur: Vercel Cron (`vercel.json`, `*/5 * * * *`) →
  geschützter Worker-Endpoint (`GET/POST /api/internal/followups/process`)
  → `recoverStaleProcessingFollowups` + `processDueFollowups`. Kein
  Umbau der Slice-5-Domainlogik — der Endpoint orchestriert nur.
  Auth über Vercels eigene `CRON_SECRET`-Konvention (Vercel setzt den
  `Authorization`-Header automatisch, sobald die Env-Var im
  Vercel-Projekt gesetzt ist), zusätzlich serverseitig per
  Constant-Time-Vergleich geprüft, fail-closed ohne konfiguriertes
  Secret. Kill-Switch `FOLLOWUP_WORKER_ENABLED` (Default: an). Batch-
  Limit `FOLLOWUP_WORKER_BATCH_SIZE` (Default 50) — dabei ein echter
  Race-Bug in der ursprünglichen Slice-5-Claim-Query gefunden und
  behoben (ein reiner `id IN (Liste)`-Filter ohne zusätzliches
  `status='scheduled'` in der äußeren UPDATE-Klausel hätte das
  Double-Claim-Schutz beim Hinzufügen eines LIMIT unterlaufen können —
  siehe Abschnitt 7). Stale-Processing-Recovery ganz ohne neue Spalte
  (nutzt das bestehende, trigger-gepflegte `updated_at`), mit
  Double-Send-Schutz per Message-Abgleich vor jedem Reset. Observability
  über die bestehende `system_events`-Tabelle (keine neue Logging-
  Infrastruktur), keine personenbezogenen Daten geloggt. 9/9
  Integrationsszenarien (u. a. echte parallele Worker-Aufrufe gegen
  denselben fälligen Datensatz) gegen die verbundene Projekt-DB grün,
  keine Schemaänderung, RLS erneut vollständig verifiziert (15/15,
  unverändert). Bewusst nicht Teil dieses Slices: echter externer
  Versandkanal, neue Follow-up-Texte/-Intervalle, UI-Änderungen.
- ✅ **DONE (2026-08-08, Slice 7, „Production E-Mail Delivery
  Foundation")** Erster echter externer Versandkanal für Follow-ups —
  vollständige Details in Abschnitt 7. Kurzfassung: dreischichtige
  Adapter-Kette (`FollowupDeliveryAdapter` → `EmailDeliveryAdapter` →
  `EmailProvider` → Resend), Provider bewusst gewählt (Idempotency-Key-
  Unterstützung gegen Resends Doku verifiziert, TypeScript-freundlich,
  Vercel-Marketplace-fähig), aber kein Account/keine verifizierte Domain
  vorhanden — Kanal ist code-seitig fertig, aber standardmäßig
  deaktiviert (`EMAIL_DELIVERY_ENABLED` default aus) und fällt ohne
  vollständige Provider-Konfiguration automatisch auf den bestehenden
  `canonicalMessageDeliveryAdapter` zurück (kein Risiko für den
  bestehenden Demo-Flow). Zustellreihenfolge bewusst „Provider-Send vor
  kanonischer Message" (nicht umgekehrt), kombiniert mit dem Follow-up-
  Zeilen-eigenen `id` als Idempotency-Key — schließt das Crash-Fenster
  ohne neue Outbox-Tabelle (volle Analyse in Abschnitt 7). Recipient-
  Resolution serverseitig aus `leads.email`, fehlende/ungültige Adresse
  wird `skipped` (ein bereits im ursprünglichen Slice-5-CHECK
  vorgesehener, aber bis jetzt ungenutzter Status), nie `failed`.
  KI-Transparenz-Hinweis in jeder Mail, ehrlich formulierter (nicht
  automatisierter) Antwort-Hinweis statt eines vorgetäuschten
  One-Click-Unsubscribe. Minimale additive Migration (`skipped_at`,
  `delivery_provider`, `provider_message_id` auf
  `conversation_followups`, keine neue Tabelle), RLS unverändert
  (15/15 erneut grün), Security Advisor unverändert. 25 neue Unit-Tests
  + 11/11 neue Integrationsszenarien (inkl. echter Nebenläufigkeit und
  einer simulierten Crash-Recovery mit Idempotency-Key-Wiederverwendung)
  gegen die verbundene Projekt-DB grün, bestehende Slice-5/6-Suiten
  unverändert grün. Ein echter Cross-Test-Bug dabei gefunden und
  behoben: parallele Vitest-Testdateien, die beide den globalen
  Worker-Endpoint aufrufen, konnten sich gegenseitig fälliges
  Fixture-Material wegclaimen bzw. eine `fetch`-Stub-Instanz einer Datei
  in eine andere durchsickern lassen — behoben über
  `fileParallelism: false` (`vitest.config.ts`), was tatsächlich näher
  an der echten Produktion liegt (dort gibt es exakt einen Scheduler,
  nie zwei parallele). Bewusst nicht Teil dieses Slices: Bounce-/
  Complaint-Webhooks, Inbound-Reply-Verarbeitung, automatisiertes
  Retry/Backoff bei transienten Provider-Fehlern, echter
  One-Click-Unsubscribe-Endpoint, echter Provider-Roundtrip (keine
  Live-Credentials vorhanden) — alle als neue Risiken in Abschnitt 9
  festgehalten.
- ✅ **DONE (2026-08-09, Engineering-Workflow-Hardening, kein Produkt-Slice,
  aber unmittelbar vor Slice 8A durchgeführt)** Der wiederkehrende
  Implementierungs-Workflow (Git-Preflight, Architektur-zuerst, Supabase/
  RLS/Tenant-Regeln, Secrets, Quality Gates, Production-Verifikations-
  Wortwahl, STOPP-Prinzip) ist jetzt im Skill
  `.claude/skills/estateai-engineering/` zentralisiert statt in jedem
  Slice-Prompt wiederholt zu werden. CLAUDE.md bleibt kompakt für
  dauerhafte Produktfakten und verweist jetzt explizit auf den Skill; die
  Drei-Wege-Klassifikation (CLAUDE.md/Skill/Slice-Prompt) steht direkt in
  CLAUDE.md selbst (neuer Abschnitt am Dateianfang).
- ✅ **DONE (2026-08-09, Slice 8A, „E-Mail Delivery Hardening")** Sichert
  die Slice-7-E-Mail-Foundation gegen die wichtigsten realen
  Zustellprobleme ab — vollständige Details in Abschnitt 7. Kurzfassung:
  Resend-Webhook-Empfänger (`/api/internal/email/resend/webhook`, echte
  Svix-Signaturprüfung über das offizielle `svix`-Package, nicht
  nachgebaut), Event-Idempotenz über eine neue Dedup-Tabelle, getrennte
  `delivery_status`-Spur (accepted/delivered/bounced/complained/deferred)
  statt Überladung des bestehenden Follow-up-`status`, persistente
  Tenant-scoped Suppression-Liste (`email_suppressions`, geprüft vor
  jedem Versand), echter signierter One-Click-Unsubscribe-Endpoint
  (`/api/public/email/unsubscribe`, RFC 8058 `List-Unsubscribe-Post`),
  begrenztes Retry/Backoff (max. 3 Versuche) ausschließlich für transiente
  Fehler unter Wiederverwendung desselben Resend-Idempotency-Keys über
  alle Versuche hinweg (kein Doppelversand-Risiko, echter Test dafür
  vorhanden). Minimale additive Migration (3 neue Spalten auf
  `conversation_followups`, 2 neue Tabellen), RLS für beide neuen Tabellen
  (9/9 Assertions grün), Security Advisor zeigt genau 1 neues, erwartetes
  INFO (kein neues WARN). 40 neue Unit-Tests + 20 neue
  Integrationsszenarien (Webhook-Signatur echt/gefälscht/dupliziert,
  Bounce/Complaint/Delivered, Suppression vor Versand, Unsubscribe
  gültig/manipuliert/Tenant-Isolation, Retry erfolgreich/erschöpft/
  permanent) grün gegen die verbundene Projekt-DB, bestehende
  Slice-5/6/7-Suiten unverändert grün. Bewusst nicht Teil dieses Slices:
  vollständige Inbound-E-Mail-Conversations, echter Provider-Roundtrip
  (weiterhin keine Resend-Credentials vorhanden), Webhook-Secret noch
  nicht in Production gesetzt.
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

Bestehendes Schema (verifiziert, Stand 2026-08-08): `companies`, `leads`,
`profiles`, `user_roles`, `widget_throttle`, `system_events`,
`admin_audit_log`, **`appointments`** (✅ neu, Product-Track-Slice 1),
**`conversations`**/**`messages`** (✅ neu, Product-Track-Slice 4 — siehe
unten). **Kein** `agents`, `widgets`, `properties`/`immobilien` als eigene
Tabellen.

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

**Conversations V1 (✅ DONE, 2026-08-08, keine Migration) →
Conversations Foundation (✅ DONE, 2026-08-08, Slice 4, kanonische
Migration):** V1 las `leads.messages` (JSONB) direkt; Slice 4 ersetzt das
durch eine eigene, kanonische Domain — **`conversations`** (`id`,
`company_id`/`lead_id` server-seitig per Trigger abgeleitet, nie
Client-Input, `channel` text+check — heute nur `website`, `email`/
`whatsapp`/`phone` schon als erlaubte Werte vorbereitet, siehe
Omnichannel-Absatz unten —, `status` `open`/`closed`, `last_message_at`
per Trigger gepflegt) und **`messages`** (`id`, `conversation_id`,
`company_id` ebenfalls trigger-abgeleitet, `sender_type`
`lead`/`ai`/`agent`/`system`, `content`, `sequence`, `created_at`,
`is_legacy_import`).

*Reihenfolge/Zeitstempel (löst Risiko 10):* `leads.messages` hatte nie
einen Zeitstempel pro Nachricht. Statt das zu fingieren, ist `sequence`
(0-basiert, pro Conversation, immer server-seitig per Trigger vergeben —
Client-Werte werden ignoriert) die einzige Ordnungsquelle, für alte und
neue Nachrichten gleichermaßen. Migrierte Alt-Nachrichten bekommen
`is_legacy_import = true` und `created_at = leads.updated_at` (die
gleiche, bereits vorher als Näherung dokumentierte Aktivitätszeit — bewusst
NICHT `now()` beim Migrationslauf, damit die bereits existierende relative
Aktualitäts-Reihenfolge der Conversations-Liste erhalten bleibt) statt
eines erfundenen Pro-Nachricht-Zeitpunkts; die UI zeigt ohnehin keine
Pro-Nachricht-Uhrzeit an, das Flag ist eine Absicherung für künftigen Code.

*Sender-Mapping:* `user`→`lead`, `assistant`→`ai` (exakt die bisherige
Bedeutung), plus bereits vorbereitete, noch ungenutzte Werte `agent`
(menschliche Makler-Antwort) und `system` — kleinste heute sinnvolle
Semantik, keine Automation-Vorentscheidung (siehe Follow-up-Vorbereitung
unten).

*Backfill:* additive Migration
(`20260808014256_add_canonical_conversations.sql` +
`20260808014600_backfill_canonical_conversations.sql`), `leads.messages`
unverändert. 25/25 Leads mit Nachrichten → 25 Conversations, 172/172
Nachrichten migriert, per SQL-Assertion **innerhalb** der Migration
verifiziert (bricht die ganze Migration ab, falls auch nur eine Nachricht
abweicht) und danach unabhängig erneut gegen die echte DB geprüft: 0
Abweichungen bei Anzahl/Reihenfolge/Inhalt/Rolle/Mandant.

*RLS:* eigene, owner-scoped Policies analog `appointments` (kein
anon-Zugriff — der Widget-Chat schrieb `leads.messages` schon vorher
ausschließlich über den Service-Role-Client, nie über anon-RLS, siehe
`widget.chat.ts`; die neue Domain ändert daran nichts). 16/16 Assertions
gegen die echte DB verifiziert, `supabase/tests/conversations_rls.sql`.

*Schreibpfad:* Dual-Write, nicht Cutover — `persistLeadFromTranscript`
(`widget.chat.ts`) schreibt weiterhin unverändert das volle
`leads.messages`-Array (Null-Risiko für den bestehenden, bewährten Pfad),
und zusätzlich (eigener try/catch, darf den Chat-Response niemals
blockieren) nur die seit dem letzten Turn **neuen** Nachrichten in die
kanonische Domain (`syncCanonicalConversation`,
`src/lib/conversations/conversations.functions.ts`) — die Berechnung „was
ist neu" ist eine reine, getestete Funktion
(`computeNewTranscriptTurns`), kein Rätselraten anhand von Inhalten. Reale
Drift-Gefahr: wenn `persistLeadFromTranscript`s JSONB-Schreiblogik künftig
geändert wird, ohne den kanonischen Schreibpfad mitzuziehen, laufen beide
Quellen auseinander — dokumentiert, nicht automatisch verhindert.

*Lesepfad:* vollständiger Cutover — Conversations-Liste/-Detail
(`conversations.functions.ts`) und Lead-Detail (`leads/$leadId.tsx`, liest
jetzt denselben `getConversationDetail`-Aufruf statt eigenem
`leads.messages`-Zugriff — eine Wahrheit) lesen ausschließlich aus
`conversations`/`messages`. `leads.messages` wird von der App nirgends
mehr gelesen, bleibt aber als Spalte bestehen.

*Geplanter Cleanup (nicht Teil dieses Slices, hier vorgemerkt):* nach einer
Beobachtungsphase (mehrere reale Widget-Konversationen, die den
Dual-Write ohne Drift durchlaufen haben) kann `leads.messages` per eigener
Migration entfernt und `persistLeadFromTranscript` auf einen reinen
Kanonisch-Write umgestellt werden — bewusst nicht in diesem Slice, da noch
kein Beobachtungsfenster existiert.

**`conversation_followups` (✅ DONE, 2026-08-08, Slice 5, „Automated Lead
Follow-ups Foundation"):** kanalunabhängige Follow-up-Engine auf der
kanonischen Conversations-Domain. `id`, `conversation_id`, `company_id`
(server-seitig per Trigger aus `conversation_id` abgeleitet, nie
Client-Input — exakt das `tg_set_message_company`-Muster), `step`
(`smallint`, CHECK 1–3), `status`
(`scheduled`/`processing`/`sent`/`cancelled`/`failed`/`skipped`),
`scheduled_for`, `after_sequence` (der `messages.sequence`-Stand zum
Planungszeitpunkt — die Grundlage für die erneute Prüfung „hat der Lead
seitdem geantwortet?" beim Versand), `sent_at`/`cancelled_at`/`failed_at`,
`skip_reason`/`error_code`, `message_id` (die tatsächlich erzeugte
kanonische Nachricht, sobald versendet).

*Max-3-Limit, technisch abgesichert, nicht nur UI-seitig:* `step` ist per
CHECK auf 1–3 begrenzt, `(conversation_id, step)` ist UNIQUE — eine
Conversation kann strukturell nie mehr als 3 Follow-up-Zeilen haben, ganz
gleich was die Anwendungslogik tut. **Bewusste Produktentscheidung:** das
ist ein **Lifetime-Cap pro Conversation**, nicht „3 pro Stille-Episode" —
sobald einmal eine Sequenz geplant wurde (auch wenn sie durch eine
Lead-Antwort abgebrochen wurde), wird für dieselbe Conversation nie wieder
eine neue Sequenz geplant. Das ist die konservative Lesart von CLAUDE.md
„keine aggressive Nachfasslogik", dokumentiert hier bewusst als
Designentscheidung, nicht als Versehen — eine spätere Produktentscheidung
könnte das ändern (z. B. „3 pro Episode"), ist aber ein bewusster,
separater Schritt.

*Scheduling:* alle 3 Schritte werden auf einmal geplant, sobald die erste
noch unbeantwortete KI-Nachricht einer Conversation auftritt (gestaffelt:
Schritt 1 nach 24h, Schritt 2 nach weiteren 48h, Schritt 3 nach weiteren
72h ab demselben Ausgangspunkt — CLAUDE.md-Default, da keine spezifischeren
Werte vorgegeben sind; zentral in `followup-rules.ts` definiert, keine
Settings-UI). `ensureFollowupsForConversation` ist idempotent — ein
zweiter Aufruf für dieselbe Conversation ist ein No-op.

*Abbruch bei Lead-Antwort:* zweistufig — proaktiv
(`cancelOpenFollowupsOnLeadReply`, direkt beim Schreiben einer neuen
`sender_type='lead'`-Nachricht) und als Sicherheitsnetz erneut im Worker
unmittelbar vor dem Versand (Vergleich `after_sequence` gegen die aktuell
neueste `lead`-Nachricht) — „Regeln erneut prüfen", nicht nur einmal beim
Planen. Ebenso: eine geschlossene Conversation (`status='closed'`)
verhindert sowohl neues Planen als auch Versand bereits geplanter
Schritte.

*Worker (`processDueFollowups`):* race-sicher durch eine einzelne atomare
`UPDATE ... WHERE status = 'scheduled' AND scheduled_for <= now() RETURNING
*` — Postgres' eigene Zeilensperren-Semantik verhindert von selbst, dass
zwei gleichzeitige Aufrufe dieselbe Zeile doppelt verarbeiten, ganz ohne
Advisory Locks. **Noch nicht an einen automatischen Scheduler
angeschlossen** — im Projekt existiert weder `pg_cron` noch eine Edge
Function (geprüft, siehe Abschnitt 9/10); der Worker ist vollständig
fertig, getestet und aufrufbereit, wird aber aktuell nur von Tests direkt
aufgerufen.

*Delivery-Abstraktion:* `FollowupDeliveryAdapter`-Interface, austauschbar
für spätere echte Kanäle. Die einzige in diesem Slice existierende
Implementierung (`canonicalMessageDeliveryAdapter`) „versendet" einen
Follow-up, indem er ihn als normale kanonische `sender_type='ai'`-Nachricht
über den bestehenden zentralen `appendMessages`-Pfad schreibt — kein
zweiter Message-Schreibpfad, kein externer Kanal, keine WhatsApp-/
E-Mail-/Telefon-Anbindung, kein neues Package installiert.

*Templates:* deterministisch, fest definiert (`followup-rules.ts`), kein
Live-KI-Aufruf — drei kurze, freundliche, nicht-aufdringliche Texte
(Schritt 3 benennt sich selbst als letzte automatische Nachricht).

*UI:* Lead-Detail zeigt pro Schritt Status + Zeitpunkt (geplant/gesendet/
gestoppt) sowie einen „Follow-ups stoppen"-Button, solange noch etwas
`scheduled` ist — serverseitig autorisiert über dieselbe RLS-Policy wie
das Lesen, keine rein lokale UI-Änderung. Keine neue Settings-Seite.

*Legacy-Verhalten:* ausschließlich kanonisch geschrieben, kein Dual-Write
in `leads.messages` für Follow-up-Inhalte — Risiko 12 (Dual-Write-Drift)
wird durch dieses Slice nicht vergrößert, da Follow-ups nur die kanonische
Seite berühren.

**Production Follow-up Scheduler (✅ DONE, 2026-08-08, Slice 6):** gibt
`processDueFollowups` (Slice 5) erstmals eine automatische, produktive
Wirkung, ohne dessen Domainlogik anzufassen.

*Architektur-Entscheidung:* Vercel Cron statt `pg_cron` oder einer
Supabase Edge Function. Begründung: dieses Repo ist über GitHub bereits
mit einem realen, aktiven Vercel-Projekt verbunden (jeder Push auf `main`
löst automatisch ein Production-Deployment aus — verifiziert über die
Vercel-API/-CLI, nicht angenommen), der Build läuft bereits über den
Nitro-`vercel`-Preset, und `src/routes/api/public/widget.chat.ts` beweist
bereits, dass API-Routen unter diesem Stack korrekt als Vercel Functions
deployen. `pg_cron` ist auf diesem Supabase-Projekt nicht installiert
(geprüft) und hätte eine neue, ungenutzte DB-Extension eingeführt; eine
Supabase Edge Function hätte eine komplett neue Laufzeitumgebung ins
Projekt gebracht (aktuell keine einzige Edge Function vorhanden). Vercel
Cron ist die kleinste Lösung, die zur bestehenden, bereits produktiv
laufenden Infrastruktur passt.

*Worker-Endpoint:* `GET/POST /api/internal/followups/process`
(`src/routes/api/internal/followups.process.ts`) — bewusst dünn: nur
Auth, Kill-Switch, Aufruf von `recoverStaleProcessingFollowups` +
`processDueFollowups`, Observability. Keine Domainlogik-Duplikation.
Vercel Cron sendet immer GET (Vercel-Dokumentation verifiziert); POST
zusätzlich für manuelles/lokales Testen. Kein CORS, kein OPTIONS-Handler
— anders als der Widget-Endpoint wird dieser nie aus einem Browser heraus
aufgerufen, same-origin-only ist hier die bewusst engere, korrekte
Voreinstellung.

*Auth:* `CRON_SECRET` — exakt Vercels eigene dokumentierte Konvention
(nicht z. B. `FOLLOWUP_CRON_SECRET` erfunden): sobald diese Env-Var im
Vercel-Projekt gesetzt ist, sendet Vercel selbst automatisch
`Authorization: Bearer <secret>` bei jedem Cron-Aufruf mit. Der Endpoint
vertraut dem nicht blind, sondern prüft den Header bei jedem Request
selbst, per Constant-Time-Vergleich (SHA-256-Digest beider Werte vor
`timingSafeEqual`, damit ein Längenunterschied nicht selbst schon ein
Timing-Signal ist). Fehlt `CRON_SECRET` serverseitig, wird grundsätzlich
abgelehnt (fail closed). Kein Secret im Client-Bundle, keine
Query-Parameter, kein Logging des Secrets.

*Scheduler-Frequenz:* alle 5 Minuten (`*/5 * * * *`) — vom Auftraggeber
bestätigt zulässig (Vercel Pro-Plan oder höher; Hobby erlaubt nur 1x/Tag,
das konnte über die verfügbaren Tools nicht selbst verifiziert werden).
Die Business-Intervalle (24h/72h/144h) bleiben davon unberührt — Cron-
Frequenz und Follow-up-Fälligkeit sind getrennte Konzepte, wie in der
Aufgabenstellung gefordert.

*Kill-Switch:* `FOLLOWUP_WORKER_ENABLED` (Default: aktiviert — ein nicht
gesetzter Wert darf Follow-ups in einem frischen Deployment niemals
stillschweigend abschalten). Erkennt `false`/`0`/`no`/`off`
(groß-/kleinschreibungs- und Whitespace-unempfindlich) als „deaktiviert" —
bewusst mehr als nur das buchstäbliche `false`, um ein reales
Betriebsrisiko zu vermeiden (ein Operator, der `=0` setzt und erwartet,
dass das abschaltet, darf nicht stillschweigend ins Leere laufen).

*Batch-Limit:* `FOLLOWUP_WORKER_BATCH_SIZE` (Default 50, gültiger Bereich
25–100 laut Vorgabe). Da `UPDATE` in Postgres kein `LIMIT` kennt, geschieht
das Claimen zweistufig: eine gewöhnliche `SELECT ... ORDER BY
scheduled_for LIMIT n` wählt die ältesten fälligen Kandidaten, danach
claimt ein `UPDATE ... WHERE status = 'scheduled' AND id IN (...)` genau
diese. **Dabei wurde ein echter Race-Bug in der ursprünglichen
Slice-5-Fassung gefunden und behoben:** ein naiver zweistufiger Claim, der
in der äußeren UPDATE-Klausel nur `id IN (Kandidatenliste)` prüft (ohne
zusätzlich `status = 'scheduled'`), hätte den Double-Claim-Schutz
unterlaufen können — Postgres' Zeilensperren-Recheck nach einem
Lock-Konflikt prüft nur die tatsächliche WHERE-Klausel der äußeren
Anweisung erneut, und eine ID bleibt auch dann noch „in der Liste“, wenn
eine andere Transaktion den Status der Zeile inzwischen geändert hat. Die
tatsächliche Absicherung ist deshalb weiterhin `status = 'scheduled'`
direkt in der äußeren UPDATE-Klausel, nicht die SELECT-Vorauswahl — durch
9/9 grüne Integrationsszenarien verifiziert, darunter ein Test mit zwei
echten parallelen Worker-Aufrufen gegen denselben fälligen Datensatz.

*Stale-Processing-Recovery:* kein neues Schema-Feld — nutzt
`conversation_followups.updated_at`, das derselbe Trigger, der jeden
Status-Übergang stempelt, ohnehin schon pflegt. Ein `processing`-Eintrag,
dessen `updated_at` älter als `staleAfterMinutes` (Default 10) ist, hat
seinen Worker-Lauf nie zu Ende gebracht. **Doppelversand-Schutz:** vor
jedem Reset prüft die Recovery, ob bereits eine passende kanonische
Nachricht existiert (gleiche Conversation, exakter Template-Text, Sequence
ab dem Planungszeitpunkt) — falls ja, wird die Zeile nachträglich auf
`sent` gesetzt (die Zustellung war real, nur die Buchführung ist verloren
gegangen), falls nein, sicher zurück auf `scheduled` (dann erneut durch den
normalen atomaren Claim geschützt). In Tests wurde bewusst nicht versucht,
`updated_at` direkt zurückzudatieren (der Trigger überschreibt jeden
manuellen Wert bei jedem UPDATE) — stattdessen ein winziger, aber echter
Zeitabstand plus ein kleiner positiver Schwellenwert, um auch Taktversatz
zwischen Testprozess und DB-Server zu vertragen.

*Observability:* bestehende `system_events`-Tabelle (`kind='success'`/
`'error'`, `source='followups.worker'`), keine neue Logging-Infrastruktur.
Pro Lauf: `run_id`, Dauer, Anzahl geclaimt/gesendet/abgebrochen/
fehlgeschlagen/wiederhergestellt, Batch-Größe, Schwellenwert — keine
Nachrichteninhalte, keine Lead-/Personendaten.

*Deployment-Status:* siehe Abschnitt 10 für den ehrlichen, tatsächlich
verifizierten Stand (Code deployt vs. Cron tatsächlich aktiv vs. Secret
gesetzt) — hier bewusst nicht vorweggenommen, um Duplikation zu vermeiden.

**Production E-Mail Delivery Foundation (✅ DONE, 2026-08-08, Slice 7):**
erster echter externer Kanal für die Follow-up-Engine, ohne die
kanonische Conversations-/Message-Architektur oder die Slice-5/6-
Scheduling-/Idempotenzlogik anzufassen.

*Architekturkette (Vorgabe der Aufgabenstellung, wörtlich umgesetzt):*
`FollowupDeliveryAdapter` (bestehend, Slice 5) → `EmailDeliveryAdapter`
(`src/lib/followups/email-delivery-adapter.ts`, neu) → `EmailProvider`
(`src/lib/email/email-provider.ts`, neutrales Modell — `EmailAddress`,
`EmailMessage`, `EmailSendResult`) → `ResendEmailProvider`
(`src/lib/email/providers/resend-provider.ts`, einziger Ort mit
Resend-spezifischem Request-/Response-Wissen). Kein Provider-Detail
leckt oberhalb der Provider-Adapter-Schicht — ein späterer
Providerwechsel bliebe auf eine neue Datei plus eine Zeile in der
Adapter-Auswahl beschränkt.

*Provider-Entscheidung:* Resend, nach Untersuchung (kein bestehender
Account/Package im Repo gefunden — `grep` auf
`resend|sendgrid|postmark|mailgun|ses|nodemailer|smtp` über das ganze
Repo ergab nichts) und mit dem Auftraggeber bestätigt. Begründung:
TypeScript-native API, **Idempotency-Key-Unterstützung explizit gegen
Resends öffentliche Doku verifiziert** (`Idempotency-Key`-Header, 24h-
Fenster — die Grundlage der ganzen Doppelversand-Schutz-Strategie unten,
nicht angenommen), Domain-Verifikation + Bounce-/Complaint-/Delivered-
Webhooks vorhanden (`sent`, `delivered`, `bounced`, `complained`, u. a.
— per Recherche verifiziert), Inbound-E-Mail-Empfang ebenfalls vorhanden
(`email.received`-Event, eigenes „Inbound"-Feature), als
Vercel-Marketplace-Integration installierbar. Geprüfte Alternative:
Postmark (ähnliche Tiefe, aber kein kostenloser Dauertarif, keine
native Vercel-Marketplace-Integration) — nicht gewählt.
**Absenderdomain: bewusst noch nicht verifiziert** — der Auftraggeber
hat sich in diesem Slice explizit gegen eine sofortige Domain-Festlegung
entschieden („noch keine Domain verifiziert — offen lassen"); der Code
liest die Absenderadresse ausschließlich aus `EMAIL_SENDER_ADDRESS`
(Env-Var), erfindet nie einen Default. Damit ist der Kanal vollständig
implementiert, aber bis zur echten Account-/Domain-Einrichtung inert.

*Canonical-Message-Invariante (Aufgabenstellung Phase 5, wörtlich
erfüllt):* der externe Versand erzeugt **keinen** zweiten unabhängigen
Conversation-Pfad. `EmailDeliveryAdapter` schreibt exakt dieselbe
`messages`-Zeile (`sender_type='ai'`, Inhalt = das unveränderte
deterministische Template aus `getFollowupTemplate`) wie
`canonicalMessageDeliveryAdapter` — die E-Mail-spezifische Betreff-/
Anrede-/Signatur-/Transparenz-Hülle existiert ausschließlich in der
tatsächlich verschickten E-Mail, nie im gespeicherten kanonischen
Nachrichtentext. Das ist zugleich Voraussetzung dafür, dass
`recoverStaleProcessingFollowups` (unverändert aus Slice 6) für E-Mail
weiterhin korrekt funktioniert — der Content-Abgleich dort erwartet
genau diesen unveränderten Text.

*Delivery Ordering (Aufgabenstellung Phase 6 — explizite Variantenwahl
mit Begründung):* **Provider-Send zuerst, kanonische Message danach**
(Variante B, nicht A). Begründung anhand einer echten Crash-Fenster-
Analyse:
- Variante A (Message zuerst) hätte einen stillen, aber echten Fehler
  erlaubt: ein Absturz zwischen Message-Insert und Provider-Aufruf hätte
  von der bestehenden Slice-6-Recovery (die eine existierende passende
  Message als „wurde gesendet" interpretiert) fälschlich als erfolgreich
  zugestellt gewertet werden können, obwohl nie eine E-Mail rausging —
  eine unbemerkte Nicht-Zustellung, die als Erfolg gemeldet wird.
- Variante B birgt dagegen ein anderes Risiko: ein Absturz zwischen
  erfolgreichem Provider-Send und dem Schreiben der kanonischen Message
  bzw. dem finalen Status-Update. **Gelöst über denselben Mechanismus,
  der ohnehin für die Aufgabenstellung gefordert war:** jede
  E-Mail-Zustellung verwendet die eigene, bereits persistierte
  `conversation_followups.id` als Provider-Idempotency-Key. Ein erneuter
  Versuch (nach Stale-Recovery-Reset oder — hypothetisch — einem zweiten
  Claim) sendet denselben Key erneut; Resend gibt laut eigener Doku
  innerhalb von 24h dieselbe ursprüngliche Antwort zurück, statt ein
  zweites Mal real zuzustellen. Damit bleibt auch der zweite,
  gefährlichere Crash-Fall abgesichert, ohne eine neue Outbox-Tabelle.
  Durch einen echten Integrationstest verifiziert (simulierter Crash
  zwischen Provider-Accept und Status-Update, danach Stale-Recovery —
  kein zweiter `fetch`-Aufruf an Resend).

*Outbox-Entscheidung (Aufgabenstellung Phase 23/24 — explizit
begründet, nicht übersprungen):* **keine separate Outbox-/
Delivery-Attempt-Tabelle.** `conversation_followups` ist durch
`UNIQUE(conversation_id, step)` und den Max-3-Lifetime-Cap strukturell
bereits eine 1-Zeile-pro-Zustellversuch-Tabelle; zusammen mit der
Idempotency-Key-Wiederverwendung oben und der unveränderten
Slice-6-Stale-Recovery sind alle betrachteten Crash-Fenster geschlossen,
ohne eine neue Queue-Infrastruktur einzuführen. Eine Outbox hätte sich
nur gelohnt, wenn ein einzelner Follow-up mehrere unabhängige,
gleichzeitig offene Zustellversuche bräuchte (z. B. echtes
Multi-Channel-Fan-out) — das ist hier nicht der Fall.

*Recipient Resolution (Aufgabenstellung Phase 7):* serverseitig aus
`leads.email` (nullable, unvalidierte `text`-Spalte — vor diesem Slice
existierte keine echte Format-Validierung dafür im Code, nur eine
Plus-Adress-Sperre in `validate-email.ts` für Auth-Zwecke). Fehlt die
Adresse oder ist sie syntaktisch kein gültiges E-Mail-Format (per
`zod`, gleiche Bibliothek wie bereits in `settings/schemas.ts`
verwendet), wird der Follow-up **`skipped`** (neuer, im ursprünglichen
Slice-5-CHECK bereits erlaubter, aber bis jetzt ungenutzter Status),
nie `failed` — kein Fehler-Code, kein Alerting-Rauschen für einen
fachlich normalen Zustand. Vor dem eigentlichen Versand werden dieselben
Bedingungen wie beim kanonischen Kanal erneut geprüft (offene
Conversation, kein Lead-Reply seit Planung) — unverändert aus Slice 6.

*Sender Identity (Aufgabenstellung Phase 8):* Envelope-/Provider-„From"
ist immer die zentral konfigurierte, (sobald verifiziert) EstateAI-
Absenderadresse (`EMAIL_SENDER_ADDRESS`) — nie eine unverifizierte
Maklerdomain. Nur der **Display-Name** enthält den Firmennamen
(`"<Firmenname> · automatisierter Assistent"`), sanitisiert gegen
Header-Injection (CR/LF/Steuerzeichen entfernt, eigene Sanitizer-
Funktion, unabhängig von dem, was der Provider selbst ohnehin
escaped). Reply-To ebenfalls zentral konfiguriert
(`EMAIL_REPLY_TO`, fällt auf die Absenderadresse zurück) — bewusst
**kein** Versuch, eine echte Maklerantwortadresse vorzutäuschen, solange
keine echte Inbound-Verarbeitung existiert (siehe Risiko 21). Erweiterbar
für spätere Multi-Tenant-Absender (Aufgabenstellung Phase 20): die
Rückgabeform von `resolveSenderIdentity` ist bereits das, was eine
künftige per-Firma-Override-Logik liefern müsste — nur die interne
Auflösung würde sich ändern, keine Aufrufer. Keine Mehrfach-Domain-
Verwaltung gebaut, solange sie nicht gebraucht wird.

*Subject/Body (Aufgabenstellung Phase 9-11):* deterministische,
schrittabhängige Betreffzeilen (kein LLM-Aufruf), enthalten nur den
Firmennamen, keine sensiblen Lead-Daten. Text-Version ist die primäre,
robuste Fassung; HTML ist eine schlichte, responsive Single-Column-
Hülle ohne externe Bilder/Tracker/Template-Engine, beide bauen auf
demselben, event. HTML-escapeten `getFollowupTemplate`-Text auf.
KI-Transparenz: sichtbare Fußzeile in jeder Mail
(„Diese Nachricht wurde automatisiert von EstateAI im Auftrag von
&lt;Firma&gt; gesendet.") plus der bereits erwähnte Display-Name-Zusatz —
keine vorgetäuschte menschliche Identität.

*Opt-out (Aufgabenstellung Phase 12 — Lücke bewusst offen dokumentiert,
nicht verschleiert):* Lead-Antwort und „Follow-ups stoppen" (beide
unverändert aus Slice 5) verhindern weiterhin zuverlässig jeden
weiteren automatischen Versand. Was **fehlt**: ein echter
One-Click-Unsubscribe-Mechanismus mit eigenem öffentlichen Token-
Endpoint — das würde eine eigene, neue Security-Fläche aufmachen und
wurde bewusst nicht in dieses Slice gequetscht (Aufgabenstellung
erlaubt das explizit als Abgrenzung für einen Folge-Slice). Der
E-Mail-Footer enthält stattdessen einen ehrlichen, nicht-automatisierten
Hinweis („antworten Sie einfach auf diese E-Mail") — das erreicht
tatsächlich einen echten, von Menschen überwachten Posteingang
(`EMAIL_REPLY_TO`), auch wenn nichts davon automatisch verarbeitet wird.
Rechtlich/produktseitig als Lücke in Risiko 23 festgehalten, nicht als
„Unsubscribe unterstützt" beschönigt.

*Secrets/Kill-Switch (Aufgabenstellung Phase 14/15):*
`EMAIL_PROVIDER_API_KEY` ausschließlich serverseitig gelesen (nur in
der Route, als Konstruktor-Argument an `createResendEmailProvider`
durchgereicht, nie selbst aus `process.env` in tieferen Schichten
gelesen). Kein `VITE_*`-Prefix, kein Secret im Test-Fixture-Klartext
(alle Test-Keys eindeutig als `re_test_...` erkennbar), kein Secret in
`system_events`. Eigener Kill-Switch `EMAIL_DELIVERY_ENABLED` — anders
als `FOLLOWUP_WORKER_ENABLED` **default AUS**, nicht an (das
risikoreichste Verhalten dieses gesamten Slices ist ein tatsächlich
versendeter externer Kontakt, daher der sicherere Default). Fällt bei
`enabled=true`, aber unvollständiger/ungültiger Provider-Konfiguration
automatisch und ohne Fehlerzustand auf den bestehenden
`canonicalMessageDeliveryAdapter` zurück — es gibt keinen Zustand, in
dem ein Fehlkonfigurations-Versuch den Worker bricht.

*Rate-Limits/Retry (Aufgabenstellung Phase 21/22):* keine zusätzliche
Parallelisierung eingeführt — der Worker verarbeitet Follow-ups
weiterhin sequenziell innerhalb eines Laufs (unverändert aus Slice 6),
was bei Batch-Größe 50 pro 5-Minuten-Fenster unkritisch für Resends
Standard-Rate-Limits ist. Transiente Provider-Fehler (Timeout/429/5xx,
per Statuscode unterschieden vom Adapter, `errorCode`-Präfix
`transient:`/`permanent:`) landen aktuell direkt auf `failed` **ohne**
automatisches Backoff/Retry — bewusst nicht gebaut (Aufgabenstellung:
„nicht improvisieren, als Technical Debt dokumentieren"), siehe
Risiko 22. Normale Scheduler-Retries führen trotzdem nie zu
Doppelversand (siehe Delivery-Ordering oben) — `failed`-Zeilen werden
vom Claim (`status = 'scheduled'`) grundsätzlich nie erneut aufgegriffen.

*Datenmodell:* additive Migration
(`20260808192012_add_conversation_followups_email_delivery_columns.sql`)
— `skipped_at` (spiegelt `sent_at`/`cancelled_at`/`failed_at`),
`delivery_provider`, `provider_message_id` (bewusst kanalneutral
benannt, nicht `email_...` — könnte später auch für WhatsApp
wiederverwendet werden). Keine neue Tabelle, keine RLS-Änderung nötig
(15/15 Assertions erneut grün, siehe Abschnitt 9).

**E-Mail Delivery Hardening (✅ DONE, 2026-08-09, Slice 8A):** sichert die
Slice-7-Foundation gegen die wichtigsten realen Zustellprobleme ab, ohne
die Adapter-Kette oder die Idempotenz-/Crash-Strategie aus Slice 7
anzufassen.

*Webhook-Architektur:* Resend liefert Events über Svix aus (verifiziert
gegen Resends aktuelle Doku, nicht angenommen — `svix-id`/
`svix-timestamp`/`svix-signature`-Header, HMAC-Signatur). Die
Signaturprüfung nutzt das offizielle `svix`-npm-Package (`Webhook.verify`),
nicht eine selbst nachgebaute HMAC-Prüfung — ausdrückliche Vorgabe der
Aufgabenstellung, keine Webhook-Security aus Erinnerung zu implementieren.
Der Empfänger (`POST /api/internal/email/resend/webhook`) verifiziert den
**rohen** Request-Body (Resends eigene Doku warnt explizit davor, den
Body zu parsen und neu zu serialisieren, das würde die Signatur brechen),
lehnt bei fehlendem/ungültigem Secret oder fehlender/ungültiger Signatur
grundsätzlich mit 401 ab, ohne die DB zu berühren.

*Event-Idempotenz:* Resend dokumentiert „at-least-once"-Zustellung — eine
neue Tabelle `email_webhook_events` (Primärschlüssel = Svix' eigene
`svix-id`) dient als Dedup-Ledger. Ein wiederholt zugestelltes Event wird
korrekt mit „ok" quittiert, aber kein zweites Mal verarbeitet (kein
doppelter Statusübergang, keine doppelte Suppression).

*Delivery-Statusmodell:* bewusst **getrennt** vom bestehenden Follow-up-
`status` (Aufgabenstellung Phase C6 explizit) — drei neue Spalten auf
`conversation_followups` (`delivery_status`, `delivery_status_updated_at`,
`bounce_type`), nicht überladen. `status='sent'` bedeutet weiterhin nur
„Provider hat angenommen", nie „im Postfach zugestellt" — das war schon
in Slice 7 so und bleibt unverändert; `delivery_status` liefert erst durch
ein Webhook-Event echte Zustellinformation nach.

*Bounce/Complaint-Handling:* nur ein bestätigter **harter** Bounce
(Resend/AWS-SES-Klassifikation `bounce.type = "Permanent"`, verifiziert
anhand von Resends dokumentiertem Beispiel-Payload) suppresst sofort — ein
weicher/unklarer Bounce wird auf der Zeile vermerkt, suppresst aber nicht
automatisch (Aufgabenstellung: „soweit Bounce-Typ dies rechtfertigt"). Ein
Complaint suppresst dagegen immer, ohne Ausnahme, nie automatisch
zurückgesetzt.

*Suppression Foundation:* neue Tabelle `email_suppressions`
(`company_id`, `email`, `reason` ∈ `bounce`/`complaint`/`unsubscribe`/
`manual`), UNIQUE `(company_id, email)` — tenant-scoped, nicht global:
eine Suppression bei Firma A verändert Firma B's Möglichkeit, dieselbe
Adresse anzuschreiben, nicht. Vor **jedem** externen Versand geprüft
(`email-delivery-adapter.ts`) — auch vor jedem Retry-Versuch, nicht nur
beim ersten, weil ein Retry exakt denselben Claim-→-Prüfen-→-Versenden-
Pfad durchläuft wie ein Erstversuch. Ein suppresster Empfänger führt zu
`status='skipped'`, `skip_reason='recipient_suppressed'` — kein
Provider-Aufruf, kein `failed`.

*Unsubscribe:* echter, serverseitig signierter Token
(`companyId`+`email`, HMAC-SHA256, kein erratbarer Bare-ID-Zugriff), kein
Ablaufdatum (ein „Stopp"-Signal soll nicht stillschweigend verfallen).
Zwei Flows auf derselben URL: GET (Mensch klickt Link in der Mail) zeigt
nur eine Bestätigungsseite und mutiert **nichts** — E-Mail-Sicherheits-
scanner „vor-besuchen" Links in Postfächern automatisiert, ein
mutierendes GET hätte Leads ungewollt abgemeldet; POST (Bestätigungs-
Button oder ein Mail-Client, der `List-Unsubscribe-Post` nutzt) wendet die
Suppression sofort an, idempotent bei wiederholtem Aufruf. Jede
Follow-up-Mail trägt `List-Unsubscribe`/`List-Unsubscribe-Post`
(RFC 8058 One-Click), beide zeigen auf denselben Endpoint.

*Retry/Backoff:* nur für **transiente** Fehler (429, ausgewählte 5xx,
Netzwerkfehler — der Resend-Adapter aus Slice 7 unterschied das bereits,
Slice 8A nutzt dieses `retryable`-Flag jetzt aktiv). Zwei neue Spalten
(`attempt_count`, `next_attempt_at`) statt einer neuen Queue-Plattform;
die bestehende Claim-Query wurde um `coalesce(next_attempt_at,
scheduled_for) <= now()` erweitert — ein Follow-up ohne anstehenden Retry
verhält sich exakt wie zuvor. Backoff konservativ und begrenzt (5 Min. →
20 Min., max. 3 Versuche gesamt, mit Jitter), danach `failed` mit
maschinenlesbarem `retry_exhausted:`-Präfix. **Entscheidend:** derselbe
Resend-Idempotency-Key (die Follow-up-Zeilen-ID aus Slice 7) wird über
alle Versuche hinweg wiederverwendet — ein Timeout kann dadurch nie zu
zwei tatsächlich zugestellten E-Mails führen, durch einen echten
Integrationstest verifiziert (zwei reale Provider-Aufrufe, ein
fehlgeschlagener und ein erfolgreicher, mit identischem Idempotency-Key).
Vor jedem Retry-Versuch werden Suppression, Conversation-Status und
Lead-Antwort erneut geprüft — kostenlos, weil ein Retry denselben
Due-Row-Claim-Pfad durchläuft wie ein Erstversuch, nicht einen separaten.

*Datenmodell:* additive Migration
(`20260808230415_add_email_delivery_hardening.sql`) — 3 neue Spalten auf
`conversation_followups`, 2 neue Tabellen (`email_suppressions`,
`email_webhook_events`). RLS auf beiden neuen Tabellen (9/9 Assertions
grün, `supabase/tests/email_delivery_hardening_rls.sql`); die bestehenden
conversation_followups-Policies gelten unverändert auch für die neuen
Spalten. Security Advisor zeigt genau 1 neues INFO
(`email_webhook_events` „RLS enabled, no policies" — dieselbe bewusste,
service-role-only-Ausnahme wie `admin_audit_log`), kein neues WARN.

*Noch nicht Teil dieses Slices:* echter Provider-Roundtrip (weiterhin
keine Resend-Credentials), `EMAIL_PROVIDER_WEBHOOK_SECRET` noch nicht in
Production gesetzt, vollständige Inbound-E-Mail-Conversations.

**Inbound E-Mail Replies (🟡 CODE FERTIG / LOKAL GEGEN ECHTE DB VERIFIZIERT,
noch nicht live-provider-verifiziert, 2026-08-09, Slice 8B):** schließt
Risiko 21 code-/DB-seitig — eine echte Lead-Antwort per E-Mail kann jetzt
sicher einer bestehenden Conversation zugeordnet und als kanonische
`sender_type='lead'`-Message gespeichert werden, statt nirgends
anzukommen. Baut vollständig auf dem Slice-7/8A-Fundament auf
(`EmailProvider`-Adapterkette, `verifyResendWebhook`,
`email_webhook_events`), keine zweite parallele Infrastruktur.

*Recherche zuerst (Aufgabenstellung Phase 1):* gegen Resends aktuelle
Doku verifiziert, nicht aus Erinnerung übernommen. Das Inbound-Webhook-
Payload (`email.received`) ist **nur Metadaten** (`email_id`, `from`,
`to[]`, `attachments[]`-Metadaten, kein Body) — der tatsächliche Text-/
HTML-Body muss separat per `GET https://api.resend.com/emails/receiving/
{id}` abgerufen werden (neuer Client `resend-receiving.ts`, dieselbe
transiente/permanente Fehlerklassifikation wie `resend-provider.ts`).
Inbound nutzt denselben Svix-Mechanismus wie Outbound (`svix-id`/
`-timestamp`/`-signature`), aber ein **eigenes** Signing-Secret
(`EMAIL_INBOUND_WEBHOOK_SECRET` ≠ `EMAIL_PROVIDER_WEBHOOK_SECRET`) — ein
eigener Resend-„Webhook"-Eintrag auf einer eigenen Route.

*Reply-Adressierung:* `reply+<token>@<inboundDomain>` — Plus-Adressierung
ist **kein** dokumentiertes Resend-Feature, sondern eine Konsequenz aus
Standard-SMTP/RFC 5322 (Resend liefert die `to`-Adresse unverändert
zurück, unabhängig vom Local-Part-Inhalt; MX-Records greifen nur auf
Domain-Ebene) — im Code explizit so kommentiert, um keine erfundene
Provider-Eigenschaft zu behaupten. Der Token ist ein deterministischer,
serverseitig signierter HMAC (`reply-token.ts`, gleiches Muster wie
`unsubscribe-token.ts`, aber ein **separates** Secret
`EMAIL_INBOUND_TOKEN_SECRET` — unterschiedliche Autoritätsbereiche dürfen
kein Secret teilen). Payload ist ausschließlich `{conversationId}` —
**nie** `companyId` (Aufgabenstellung Phase 2 explizit) — `company_id`/
`lead_id` werden nach Token-Verifikation immer serverseitig aus der
`conversations`-Zeile neu abgeleitet, nie aus Token oder Request-Body
übernommen. Kein Ablaufdatum (bewusst, wie beim Unsubscribe-Token);
Rotation nur grobkörnig über das ganze Secret möglich — für v1 akzeptiert,
kein Schema für Persistenz/Widerruf einzelner Tokens nötig.

*Conversation Resolution + Sender-Verifikation:*
`resolveInboundConversation` ist die **einzige** Stelle, an der ein
Reply-Token zu einer Conversation/Company/Lead wird; das Webhook-Payload
liefert `company_id`/`lead_id`/`conversation_id` nie als vertrauenswürdig.
Ein gültiges Token allein genügt nicht — `inbound-sender.ts` vergleicht
die eingehende `From`-Adresse case-insensitive gegen `leads.email` (Anzeige
name wird sauber entfernt, letztes `<...>`-Paar gewinnt — relevant, weil
ein manipulierter Anzeigename selbst ein `<` enthalten könnte). Fehlende
Lead-E-Mail oder Mismatch → keine Message, kein Leak an den Absender.

*Webhook-Endpoint:* `POST /api/internal/email/resend/inbound` — bewusst
dünn (Signatur → Dedup → Orchestrierung in `inbound-webhook.functions.ts`
→ Observability), keine Business-Logik im Route-Handler. Dedup direkt
nach Signaturprüfung über dieselbe `email_webhook_events`-Tabelle wie
Slice 8A (keine zweite Ledger-Tabelle, Aufgabenstellung Phase 7).
Akzeptierter, dokumentierter Trade-off: identisch zu Slice 8A — ein
transienter Fehler *nach* dem Dedup-Insert (z. B. Receiving-API 503) wird
nicht durch eine Svix-Zustellwiederholung aufgefangen (Svix nutzt dieselbe
`svix-id` erneut, die dann sofort als Duplikat erkannt wird) — bewusst in
Kauf genommen für die härtere Garantie „dasselbe Event erzeugt nie zwei
Messages", als `error`-`system_events` sichtbar statt eine falsche
5xx-Retry-Erwartung zu wecken.

*Content-Extraktion + Quote-Trimming:* Text-Body hat Vorrang, HTML wird
nur bei fehlendem Text zu Plain-Text reduziert (Scripts/Styles/Tags
entfernt, Entities dekodiert — kein HTML wird je als kanonische Message
gespeichert). Quote-Trimming über die geprüfte Bibliothek
`email-reply-parser` (MIT, keine Abhängigkeiten, aktiv gepflegt) statt
selbstgebauter Regex-Heuristik (Aufgabenstellung: „keine riesige
E-Mail-Parsing-Engine", aber auch „keine Erfindung aus dem Nichts") —
degradiert konservativ auf reinen Text bei Nicht-Zitat-Inhalt. Leerer
Inhalt nach Normalisierung → keine leere Message, sauber protokollierter
Skip. Anhang-only-Mails (kein Text, aber `attachments.length > 0`)
bekommen einen eigenen, ehrlichen `attachment_only_unsupported`-Zustand —
kein Vortäuschen einer Verarbeitung, die nicht stattfand. Attachments
selbst sind explizit **nicht** Teil dieses Slices.

*Follow-up-Stopp + Closed-Conversation-Semantik:* nutzt denselben
zentralen `handleFollowupsAfterMessages`-Kompositionspunkt wie jeder
andere kanonische `'lead'`-Append (keine zweite Cancel-Implementierung) —
eine echte E-Mail-Antwort hat damit exakt denselben Effekt wie eine
Lead-Antwort über jeden anderen Kanal, inklusive bereits terminierter
Retry-Follow-ups. Reopen einer `status='closed'`-Conversation bei echter
Lead-Antwort wurde **nicht** blind entschieden, sondern zuerst
recherchiert (Aufgabenstellung Phase 14): kein bestehender Codepfad setzt
`status='closed'` je (grep über `src/lib/conversations/` und
`src/lib/followups/`) — daher unkritisch implementiert, statt hier zu
stoppen.

*Suppression-Interaktion:* Outbound-Suppression und Inbound-Annahme sind
bewusst getrennte Konzepte (Aufgabenstellung Phase 15) — ein zuvor
abgemeldeter/gebouncter Lead kann trotzdem antworten, die Message wird
angenommen, die Suppression bleibt unverändert bestehen, und es werden
keine neuen Follow-ups reaktiviert (strukturell garantiert: ein reiner
`'lead'`-Append löst nie `ensureFollowupsForConversation` aus).

*Datenmodell:* **keine neue Migration** — `email_webhook_events` (Slice
8A) wird unverändert für Inbound-Dedup wiederverwendet,
`conversations.status` (bestehender Wertebereich `open`/`closed`)
unverändert für Reopen. Einzige neue Env-Vars: `EMAIL_INBOUND_DOMAIN`,
`EMAIL_INBOUND_TOKEN_SECRET`, `EMAIL_INBOUND_WEBHOOK_SECRET` — alle
optional; fehlen sie, bleibt Outbound exakt wie in Slice 7/8A (statisches
`EMAIL_REPLY_TO`), Inbound schlägt fehlgeschlossen mit 401 fehl
(Aufgabenstellung Phase 21).

*UI:* keine Codeänderung nötig (Aufgabenstellung Phase 17 verifiziert,
nicht nur angenommen) — die bestehende Conversations-UI rendert
`sender_type='lead'`-Messages bereits generisch über
`{m.content}` in JSX (React-Auto-Escaping, kein
`dangerouslySetInnerHTML`), unabhängig vom Herkunftskanal. Per
Playwright-Regressionslauf (Szenario D) und dediziertem Integrationstest
bestätigt.

*Tests:* 12 neue Integrationsszenarien gegen die echte, verbundene
Supabase-DB mit echten Svix-Signaturen (`email.resend.inbound.
integration.test.ts`) — Happy Path (inkl. Follow-up-Stopp), Duplicate,
Invalid Signature, Invalid Token, Cross-Tenant (manipuliertes Token-
Payload bei wiederverwendeter Signatur), Sender Mismatch, Empty Content,
HTML/XSS-Sicherheit, Pending-Retry-Stopp, Unsubscribed-Lead-Reply,
Closed-Conversation-Reopen, zwei echte parallele Duplicate-Requests
(`Promise.all`, race gegen den `email_webhook_events`-Unique-Constraint).
Plus 61 neue Unit-Tests über die reinen Logikmodule (Token, Content-
Extraktion, Sender-Verifikation, Payload-Parsing, Receiving-API-Client).
Gesamte Suite (459 Tests, 31 Dateien) sowie der volle Playwright-Lauf
grün.

*Noch nicht Teil dieses Slices (Aufgabenstellung, explizit):* keine
automatische KI-Antwort auf eingehende E-Mails, kein Attachment-Support,
kein echter Live-Test gegen ein tatsächliches Resend-Konto/eine
verifizierte Inbound-Domain — siehe Risiko 21/27 unten für den exakt
verbleibenden operativen Rest.

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
| ~~`conversation_threads` + `messages`~~ | ~~F~~ | `company_id` | wie leads | ✅ **DONE, aus Phase F vorgezogen** — siehe oben, jetzt `conversations`/`messages`, bereits kanalvorbereitet |
| `workflows`/`automation_runs` | G | `company_id` | wie leads | Retry-/Fehlerzustände, Kosten pro Lauf — `conversation_followups` (Slice 5, siehe oben) deckt den Follow-up-Spezialfall bereits ab, ein generisches `workflows`-Modell bleibt für andere Automatisierungen offen |

**Omnichannel-Adapter-Prinzip (Phase F, Datenmodell bereits vorbereitet,
siehe oben):** externe Systeme wie OpenClaw dürfen künftig als
austauschbare Channel-/Gateway-Adapter auftreten, aber nie zur
kanonischen Datenquelle werden — d. h. immer `External Channel → Adapter →
EstateAI-`conversations`/`messages` (schreibt über denselben
`syncCanonicalConversation`-/`appendMessages`-Pfad wie der Website-Chat,
nur mit `channel = 'email'`/`'whatsapp'`/`'phone'` statt `'website'`),
niemals `External Channel → eigene Conversation-DB → EstateAI liest nur
mit`. Kein Channel wird in diesem Slice angebunden — nur das Datenmodell
verträgt es bereits ohne weitere Migration.

**Follow-ups (Phase G) — ✅ Engine DONE seit Slice 5, siehe oben.** Die in
Slice 4 vorbereitete `messages.sender_type`-Unterscheidung
(`lead`/`ai`/`agent`/`system`) wird von der Follow-up-Engine bereits
genutzt (Follow-ups werden als `sender_type='ai'` geschrieben). Weiterhin
offen: automatischer Scheduler/Cron für `processDueFollowups` (siehe
Risiko 14) und echte externe Kanäle.

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
5. **`leads.messages` als JSONB statt eigenes Conversation-Modell — ✅
   GELÖST (2026-08-08, Product-Track-Slice 4, „Conversations Foundation").**
   Kanonische `conversations`/`messages`-Tabellen mit Kanal-Feld (bereits
   `email`/`whatsapp`/`phone` vorbereitet) ersetzen `leads.messages` als
   Lesequelle vollständig; Details in Abschnitt 7. `leads.messages` bleibt
   als Legacy-Spalte bestehen (Dual-Write, siehe Abschnitt 7) — geplanter
   Cleanup nach Beobachtungsfenster, noch nicht terminiert.
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
8. **E2E-Testing-Lücke — ✅ GESCHLOSSEN (2026-08-08, Verification-Track-
   Slice 1).** Bis dahin: 202 Unit-Tests (alle grün), plus je ein manueller,
   gegen die echte Projekt-DB verifizierter SQL-Korrektheits-/RLS-Testlauf
   für Slice 1 (Appointments, 11/11) und Slice 2 (Analytics, 12/12); für
   Slice 3 (Conversations) ein vollständiger, aber nicht persistierter
   manueller Browser-Durchlauf. Es fehlte durchgängig ein **wiederholbares,
   im Repo persistiertes** Browser-/E2E-Testartefakt. Das ist jetzt
   vorhanden: `tests/e2e/` (Playwright) deckt Auth-Guard, Dashboard, Leads
   (inkl. Tenant-Isolation), Conversations (Suche/Filter), Appointments
   (echter Storno-/Wiederherstell-Lifecycle), Analytics (Zeitfensterwechsel)
   und die Navigation zwischen allen fünf Bereichen ab, plus einen
   Mobile-Viewport-Smoke-Test — 10/10 Tests grün, dreifach hintereinander
   reproduzierbar verifiziert (kein einmaliger Zufallstreffer). Auth ohne
   neuen Supabase-Signup (Admin-generierter Magic-Link + `storageState`),
   Fixtures dedizierter, isolierter QA-Mandant mit fixen IDs (idempotent,
   vollständig zurückgebaut nach jedem Lauf). Ergänzt, ersetzt nicht, die
   bestehenden SQL-RLS-Tests. Details/Architektur: `tests/e2e/README.md`.
   Verbleibend, bewusst nicht in diesem Slice gelöst (siehe Risiko 11):
   ein einzelner, spezifisch benannter, dev-server-only React-Warntext wird
   in der Konsolenfehler-Assertion gezielt gefiltert statt ursachenbehoben.
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
10. **`leads.messages` besitzt keinen Zeitstempel pro Nachricht — ✅
    GELÖST für die kanonische Domain (2026-08-08, Slice 4).** Ursprünglicher
    Befund aus Slice 3 bleibt für `leads.messages` selbst weiterhin wahr
    (das Legacy-JSONB-Feld hat und bekommt nie Zeitstempel), aber die neue
    `messages`-Tabelle löst das für alles, was die App tatsächlich liest:
    `sequence` (server-seitig, trigger-vergeben) ist die alleinige
    Ordnungsquelle, `created_at` ist für neue Nachrichten echt und für
    migrierte Alt-Nachrichten explizit als `is_legacy_import = true`
    markiert statt eine falsche Präzision vorzutäuschen — siehe Abschnitt 7
    für die volle Herleitung.
11. **Intermittente, dev-server-only React-Mount-Race** (neu identifiziert,
    Verification-Track-Slice 1) — der Konsolenfehler "Can't perform a React
    state update on a component that hasn't mounted yet" trat während der
    E2E-Entwicklung wiederholt, aber nicht reproduzierbar auf einer festen
    Seite auf (beobachtet auf `/dashboard`, `/conversations` **und**
    `/analytics` — nicht chartspezifisch). Gegen einen Produktionsbuild
    (`vite build` + `vite preview`) in mehreren Versuchen **nie**
    reproduziert, nur gegen `vite dev`. Verdächtiger Mechanismus: die
    `_authenticated`-Layout-Route setzt `ssr: false` mit asynchronem
    `beforeLoad` (`src/routes/_authenticated/route.tsx`) — jede
    authentifizierte Seite durchläuft dadurch einen
    pending→resolved-Mount-Übergang, dessen Timing sich unter Vites
    On-Demand-Modul-Kompilierung im Dev-Server verschiebt. Passt zur
    bereits vorher dokumentierten, ebenfalls dev-only auftretenden
    Hydration-Warnung auf `/auth` aus früheren Slices. **Nicht** in diesem
    Slice ursachenbehoben (würde eine eigene Untersuchung der
    Router-Pending-Transition erfordern — außerhalb des Schnitts „E2E-
    Basis", kein Produktionsdefekt). Aktuell in `core-journey.spec.ts`
    (`KNOWN_DEV_ONLY_MOUNT_RACE`) gezielt aus der
    Konsolenfehler-Assertion gefiltert (nur dieser eine Text, alles andere
    lässt den Test weiterhin fehlschlagen) — dokumentierter, bewusster
    Kompromiss statt stiller Unterdrückung. Ein echter Produktbug wurde bei
    derselben Untersuchung gefunden und behoben (recharts-`ResponsiveContainer`-
    Mount-Race auf `/analytics`, siehe Abschnitt 6/Risiko 8).
12. **Dual-Write-Drift-Risiko `leads.messages` ↔ `conversations`/`messages`**
    (neu, Slice 4) — `persistLeadFromTranscript` (`widget.chat.ts`) schreibt
    beide Ziele in einem Aufruf, aber über zwei unabhängige Code-Pfade
    (voller JSONB-Überschreib vs. inkrementeller kanonischer Append über
    `syncCanonicalConversation`). Ändert sich künftig die eine Seite ohne
    die andere mitzuziehen, laufen sie auseinander — kein automatischer
    Gleichlauf-Test dafür in diesem Slice (nur die Backfill-Parität wurde
    einmalig geprüft, nicht ein laufender Vergleich). Mitigiert dadurch,
    dass die App `leads.messages` nirgends mehr liest (Drift wäre unsichtbar
    für Nutzer, aber würde den späteren JSONB-Cleanup erschweren) — siehe
    Abschnitt 7 für den geplanten Cleanup-Schritt, der Drift dann endgültig
    unmöglich macht.
13. **Unerklärte Differenz in der Lead-Anzahl während dieser Session** (neu,
    Slice 4, transparent dokumentiert statt verschwiegen) — die Read-Only-
    Analyse zu Beginn dieses Slices zählte 25 Leads/172 Nachrichten (siehe
    Abschnitt 7); am Ende derselben Session zeigt dieselbe Abfrage 23
    Leads/166 Nachrichten (2 Leads mit zusammen 6 Nachrichten fehlen). Diese
    Session selbst wurde sorgfältig darauf geprüft, ob eigene Aktionen das
    verursacht haben können — Migrationen sind rein additiv (verifiziert),
    das RLS-Testskript nutzte ausschließlich fest-`99999999-`/`e2e`-
    präfixte Fixture-IDs (kein Treffer auf echte Leads), das
    Backfill-Verifikations-Query lief nach der Differenz erneut mit 0
    Abweichungen (die aktuell existierenden Daten sind intern vollständig
    konsistent). Kein Lösch-Weg für Leads existiert im UI-Code
    (`grep` auf `delete`/Leads ergab nichts); die DB-seitige
    „Owner deletes leads"-RLS-Policy existiert aber bereits seit der
    allerersten Migration (lange vor dieser Session) und macht eine externe
    Löschung technisch möglich. Ursache **nicht** abschließend geklärt — da
    dies ein reales, mit dem Projekt verbundenes Supabase-Projekt ist,
    plausibelste Erklärung ist externe/parallele Aktivität außerhalb dieser
    Session. Kein Datenverlust auf Seiten der neuen kanonischen Tabellen
    (Cascade-Löschung von `conversations`/`messages` bei Lead-Löschung ist
    korrektes, gewolltes Verhalten, keine Fehlfunktion) — aber der Nutzer
    sollte wissen, dass 2 Leads zwischen Sessionstart und -ende
    verschwunden sind, falls das nicht beabsichtigt war.
    **Update Slice 5:** vor Beginn dieses Slices erneut (read-only)
    untersucht — `DELETE FROM leads`/`.delete()`-Aufrufe im gesamten
    Code, Trigger auf `leads`, alle `public`-Schema-Funktionen (`pg_proc`),
    `pg_cron`-Extension (nicht installiert), verfügbare Postgres-Logs. Kein
    Löschpfad gefunden — Company-/User-Anzahl unverändert konsistent (4
    Companies, 3 Auth-User), keine Cascade-Löschung über eine Firma
    plausibel. Leads-/Message-/Conversation-Anzahl am Ende von Slice 5
    identisch zum Stand am Ende von Slice 4 (23/166/23) — **kein weiterer
    Datenverlust** während dieser Session. Bleibt ungeklärt, aber nicht
    blockierend; externe/parallele Aktivität weiterhin die plausibelste,
    unbewiesene Erklärung.
14. **`processDueFollowups` ist nicht an einen automatischen Scheduler
    angeschlossen — ✅ VOLLSTÄNDIG GELÖST, operativ verifiziert
    (2026-08-08/09).** Chronologie: Slice 6 implementierte Endpoint +
    Cron-Konfiguration vollständig (9/9 Integrationsszenarien grün); nach
    Slice 7 zeigte eine gezielte Diagnose, dass trotz vom Auftraggeber
    gesetztem `CRON_SECRET` und einem Redeploy weiterhin **43 echte
    Cron-Ticks in Folge mit 401** endeten (über zwei unabhängige
    Deployments, per Vercel Runtime Logs verifiziert — die exakte
    5-Minuten-Taktung über Stunden hinweg auf einem internen Pfad wurde
    als praktisch beweiskräftig für echten Vercel-Cron-Traffic bewertet,
    nicht Bot-Rauschen). Wahrscheinlichste Ursache: `CRON_SECRET` war im
    Vercel-Dashboard nicht (auch) für den Scope „Production" aktiviert.
    Der Auftraggeber wurde gebeten, dies im Dashboard zu prüfen und zu
    korrigieren. **Nach der Korrektur + einem weiteren Redeploy
    (`dpl_FAE5NJkrbQeNN6vLro4yaPbjwtJ2`, erstellt 22:52:55 UTC) lieferte
    der allererste Cron-Tick danach (22:55:10 UTC) einen echten `200`** —
    bestätigt nicht nur über den HTTP-Statuscode, sondern über einen
    exakt korrelierten `system_events`-Eintrag
    (`run 3ada0904-ada6-4f9b-b9a5-69bc4b1b1d9e`, `mode=canonical, claimed
    0, sent 0, ... recovered 0`, `durationMs: 1780`) — ein Beweis, dass
    der Worker-Code tatsächlich authentifiziert durchlief und real gegen
    die DB lief, nicht nur ein zufälliger 200 von anderswo. `claimed: 0`
    ist hierbei korrekt und erwartet (aktuell keine echten fälligen
    Follow-ups) — die Erfolgsbedingung war ausdrücklich ein erfolgreicher
    Lauf, nicht ein tatsächlich verarbeiteter Follow-up. **Der Production-
    Scheduler ist damit ab sofort operativ funktionsfähig, nicht nur
    code-seitig fertig.**
15. **Max-3-Follow-ups als Lifetime-Cap, nicht pro Episode** (offene
    Produktentscheidung, dokumentiert in Abschnitt 7) — sobald eine
    Follow-up-Sequenz einmal für eine Conversation existiert (auch wenn
    durch eine Lead-Antwort abgebrochen), wird nie wieder eine neue
    geplant, selbst wenn der Lead Monate später erneut länger nicht
    antwortet. Bewusst konservative Lesart von CLAUDE.md „keine aggressive
    Nachfasslogik", **kein** Bug — aber eine Stelle, an der ein Makler
    später berechtigt anderer Meinung sein könnte („nach einer neuen
    Interaktion sollte wieder nachgefasst werden dürfen"). Ändern wäre eine
    kleine, isolierte Anpassung an `shouldScheduleSequence`
    (`followup-rules.ts`), aber eine bewusste Produktentscheidung, kein
    Auto-Fix.
16. **Scheduler-Provider-Abhängigkeit auf Vercel Cron** (neu, Slice 6) —
    die Wahl fiel bewusst auf Vercel Cron, weil es zur bereits real
    laufenden Deployment-Infrastruktur passt (siehe Abschnitt 7), aber
    das bindet die Ausführungsgarantie an Vercels Cron-Verfügbarkeit und
    -Genauigkeit (laut Vercel-Dokumentation kann der tatsächliche
    Ausführungszeitpunkt je nach Plan um bis zu einer Stunde vom
    Schedule abweichen — für 5-Minuten-Follow-up-Fälligkeiten aktuell
    keine kritische Größenordnung, aber erwähnenswert). Ein Wechsel des
    Hosting-Anbieters würde auch einen Scheduler-Wechsel erfordern —
    der Worker-Endpoint selbst ist aber Plattform-agnostisch (reines
    HTTP + `CRON_SECRET`), sodass nur `vercel.json` betroffen wäre, nicht
    die Domainlogik.
17. **Kein aktives Alerting bei wiederholten Worker-Fehlschlägen** (neu,
    Slice 6) — Fehler landen strukturiert in `system_events`
    (`kind='error'`), aber niemand wird aktiv benachrichtigt, wenn der
    Worker mehrfach hintereinander fehlschlägt oder der Cron-Job aus
    irgendeinem Grund aufhört zu laufen. Für die aktuelle Projektphase
    (Demo-/frühe Kundenphase) bewusst nicht gebaut — „keine komplett neue
    Monitoring-Plattform einführen" war explizite Vorgabe dieses Slices.
    **Update Slice 7:** jetzt konkret relevanter, nicht mehr nur
    theoretisch — sobald `EMAIL_DELIVERY_ENABLED` aktiv geschaltet wird,
    betrifft ein stiller Ausfall echte Kundenkommunikation, nicht nur
    interne Nachrichten. Weiterhin nicht gebaut, aber jetzt mit höherer
    Priorität für einen künftigen Hardening-Slice (siehe Risiko 17
    Verweis in Abschnitt 10).
18. **`canonicalMessageDeliveryAdapter` als Default — 🟡 TEILWEISE GELÖST
    (2026-08-08, Slice 7).** Seit Slice 7 existiert mit dem
    `EmailDeliveryAdapter` erstmals ein echter externer Kanal, der
    tatsächlich eine E-Mail beim Interessenten zustellen kann — aber er
    ist **standardmäßig inaktiv** (`EMAIL_DELIVERY_ENABLED` default aus,
    zusätzlich fehlt ein echter Provider-Account/eine verifizierte
    Domain, siehe Risiko 19). Bis diese externen Voraussetzungen erfüllt
    sind, bleibt der tatsächliche Produktionszustand identisch zu vorher:
    ein „gesendeter" Follow-up ist ein kanonischer Message-Eintrag im
    Dashboard, kein tatsächlicher Kontakt beim Interessenten. Der Code-
    Pfad zur echten Zustellung existiert jetzt vollständig und getestet —
    nur der letzte, bewusst nicht automatisierte Schritt (Account/Domain/
    Secrets) fehlt noch.
19. **Kein E-Mail-Provider-Account/keine verifizierte Absenderdomain**
    (neu, Slice 7) — `EMAIL_PROVIDER_API_KEY` und `EMAIL_SENDER_ADDRESS`
    sind in Production nicht gesetzt; ohne beide bleibt
    `EMAIL_DELIVERY_ENABLED` wirkungslos (fällt automatisch auf den
    kanonischen Kanal zurück, siehe Risiko 18). Das ist eine bewusste,
    mit dem Auftraggeber abgestimmte Entscheidung dieses Slices („noch
    keine Domain verifiziert — offen lassen"), kein Versehen. Nötiger
    externer Schritt vor Aktivierung: Resend-Account anlegen, Domain
    (z. B. eine Subdomain von `estateai.de`) per DNS verifizieren,
    `EMAIL_PROVIDER_API_KEY`/`EMAIL_SENDER_ADDRESS` (+ optional
    `EMAIL_REPLY_TO`) in Vercel setzen, dann `EMAIL_DELIVERY_ENABLED=true`.
    **Update Slice 8B:** derselbe fehlende Account/dieselbe fehlende
    Domain blockiert jetzt zusätzlich Inbound (Risiko 21/27) —
    `EMAIL_PROVIDER_API_KEY` wird auch für den Receiving-API-Abruf
    wiederverwendet, kein separater Key nötig.
20. **Kein Bounce-/Complaint-/Delivered-Webhook-Handling — ✅ GELÖST
    (2026-08-09, Slice 8A).** Resend liefert diese Events über Svix aus
    (verifiziert); der neue `/api/internal/email/resend/webhook`-Endpoint
    verifiziert die Signatur echt, dedupliziert über
    `email_webhook_events`, aktualisiert `conversation_followups.
    delivery_status` und suppresst bei hartem Bounce/Complaint. **Noch
    offen:** `EMAIL_PROVIDER_WEBHOOK_SECRET` ist in Production nicht
    gesetzt (kein Resend-Account vorhanden, siehe Risiko 19) und kein
    echter Resend-Webhook wurde je live zugestellt/verifiziert — nur
    gegen real signierte Testrequests (siehe Risiko 25).
21. **Keine Inbound-Reply-Verarbeitung — 🟡 CODE-/DB-SEITIG GELÖST, noch
    nicht live-provider-verifiziert (2026-08-09, Slice 8B).** Eine echte
    Lead-Antwort per E-Mail wird jetzt sicher aufgelöst (signierter
    Reply-Token → `resolveInboundConversation` → Sender-Verifikation) und
    als kanonische `sender_type='lead'`-Message gespeichert, stoppt offene
    Follow-ups über denselben Pfad wie jeder andere Kanal, und kann eine
    geschlossene Conversation wieder öffnen — siehe Abschnitt 7 für die
    volle Architektur. Vollständig gegen die echte, verbundene Supabase-DB
    mit echten Svix-Signaturen integrationsgetestet (12 Szenarien inkl.
    Concurrent-Duplicate). **Ausdrücklich nicht als „live" zu verstehen**
    (Aufgabenstellung Phase 23): kein tatsächliches Resend-Konto, keine
    verifizierte Inbound-Domain, kein einziges echtes `email.received`-
    Event je empfangen — der externe Rest ist identisch zu Risiko 19/25
    (Account/Domain/Secrets fehlen weiterhin vollständig in Production)
    plus zusätzlich ein MX-Record auf der gewählten Inbound-Subdomain.
    Siehe Risiko 27 für den exakten verbleibenden externen Schritt.
22. **Kein automatisiertes Retry/Backoff bei transienten Provider-
    Fehlern — ✅ GELÖST (2026-08-09, Slice 8A).** Ein Timeout/429/5xx
    schedult jetzt einen begrenzten Retry (max. 3 Versuche gesamt, 5/20
    Min. Backoff mit Jitter) statt sofort `failed` zu setzen — unter
    Wiederverwendung desselben Resend-Idempotency-Keys über alle
    Versuche hinweg (kein neues Doppelversand-Risiko, echter
    Integrationstest dafür vorhanden, siehe Abschnitt 7). Nach
    Erschöpfung weiterhin `failed`, mit `retry_exhausted:`-Präfix statt
    des rohen Fehlercodes.
23. **Kein echter One-Click-Unsubscribe — ✅ GELÖST (2026-08-09,
    Slice 8A).** Ein echter, serverseitig signierter Token-Endpoint
    (`/api/public/email/unsubscribe`) ersetzt den reinen
    „antworten Sie"-Hinweis; jede Follow-up-Mail trägt zusätzlich
    `List-Unsubscribe`/`List-Unsubscribe-Post` (RFC 8058 One-Click).
24. **`fileParallelism: false` verlangsamt die gesamte Testsuite** (neu,
    Slice 7, operative Randnotiz, kein Produktrisiko) — die in diesem
    Slice gefundene Cross-File-Testinterferenz (siehe Abschnitt 6) wurde
    über sequenzielle statt paralleler Testdatei-Ausführung gelöst
    (`vitest.config.ts`). Das erhöht die Laufzeit von `npm test` spürbar
    (von wenigen Sekunden auf über eine Minute), ist aber die korrekte
    Lösung, kein Workaround (spiegelt die reale Ein-Scheduler-Situation
    in Produktion). Falls die Testsuite künftig deutlich wächst, könnte
    eine gezieltere Lösung (z. B. nur Integrationstests sequenziell,
    Unit-Tests weiterhin parallel) sinnvoll werden.
25. **Kein live-verifizierter Resend-Webhook** (neu, Slice 8A) — der
    Webhook-Empfänger ist vollständig implementiert und gegen real
    signierte Testrequests (über das echte `svix`-Package) verifiziert,
    aber kein tatsächliches Resend-Konto hat je ein echtes Event
    zugestellt (siehe Risiko 19 — weiterhin kein Account/keine
    verifizierte Domain). `EMAIL_PROVIDER_WEBHOOK_SECRET` ist in
    Production nicht gesetzt. Nötiger externer Schritt vor Aktivierung:
    im Resend-Dashboard einen Webhook-Endpoint auf
    `https://<domain>/api/internal/email/resend/webhook` anlegen, das dort
    generierte Signing-Secret als `EMAIL_PROVIDER_WEBHOOK_SECRET` in
    Vercel setzen.
26. **Neue Abhängigkeit: `svix`** (neu, Slice 8A) — für die
    Webhook-Signaturprüfung hinzugefügt (offizielles Package, von Resend
    selbst für Webhook-Zustellung genutzt). Zieht nur `standardwebhooks`
    als Unterabhängigkeit nach sich, keine der von `npm audit` gemeldeten
    Vulnerabilities stammt aus diesem Paket (alle bereits vor Slice 8A
    vorhanden — `@playwright/test`, `mermaid`, `postcss`, u. a., separat
    reproduziert). Serverseitig gebündelt, nicht im Client-Bundle
    (verifiziert).
27. **Kein live-verifizierter Resend-Inbound** (neu, Slice 8B) — analog zu
    Risiko 25, aber für den neuen Inbound-Pfad: vollständig gegen echte
    Svix-Signaturen und die echte, verbundene DB integrationsgetestet,
    aber kein tatsächliches Resend-Konto hat je ein echtes
    `email.received`-Event zugestellt. Nötige externe Schritte vor
    Aktivierung (zusätzlich zu Risiko 19/25): eine Inbound-Subdomain
    wählen (z. B. `reply.estateai.de`, bewusst nicht die primäre
    Versanddomain, um bestehenden Mailfluss nicht zu gefährden), im
    Resend-Dashboard als „Receiving Domain" hinzufügen, den von Resend
    vorgegebenen MX-Record (niedrigste Priorität) bei diesem DNS-Anbieter
    setzen, einen zweiten Resend-Webhook-Endpoint auf
    `https://<domain>/api/internal/email/resend/inbound` mit Event
    `email.received` anlegen, `EMAIL_INBOUND_DOMAIN`/
    `EMAIL_INBOUND_TOKEN_SECRET`/`EMAIL_INBOUND_WEBHOOK_SECRET` in Vercel
    setzen. Ohne diese Schritte bleibt Inbound bewusst fehlgeschlossen
    (401), Outbound unverändert unbeeinträchtigt.
28. **Bekannte Grenzen der Inbound-Content-Verarbeitung** (neu, Slice 8B,
    bewusst dokumentierte technische Schuld statt verschwiegen) —
    (a) Attachments werden erkannt (`attachment_only_unsupported`-Zustand
    bei anhang-only-Mails) aber nicht heruntergeladen/gespeichert, per
    Aufgabenstellung explizit auf einen späteren Slice verschoben;
    (b) Quote-Trimming über `email-reply-parser` degradiert bei rein aus
    einem Zitat bestehendem Text konservativ (lässt im Zweifel eine
    Kopfzeile wie „Am ... schrieb ..." stehen, statt eine Heuristik zu
    riskieren, die echten Lead-Text mitentfernt) — bewusste Abwägung laut
    Aufgabenstellung, kein Bug; (c) Weiterleitungen (Lead leitet eine
    EstateAI-Mail an eine dritte Person weiter, die dann antwortet) sind
    kein modelliertes Szenario — die `From`-Prüfung greift korrekt (fremde
    Absenderadresse → `sender_mismatch`, keine Message), das ist aber ein
    Fail-Closed-Nebeneffekt, keine bewusste Weiterleitungs-Unterstützung.

---

## 10. Empfehlung: nächster Schritt

**Update 2026-08-09 (Product-Track-Slice 8B, „Inbound E-Mail Replies"):**
schließt Risiko 21 code-/DB-seitig — eine echte Lead-Antwort per E-Mail
wird jetzt sicher einer Conversation zugeordnet, als kanonische
`sender_type='lead'`-Message gespeichert, stoppt offene Follow-ups und
kann eine geschlossene Conversation reaktivieren. Siehe Abschnitt 7 für
die volle Architektur, Risiko 21 (jetzt 🟡 statt offen) und die neuen
Risiken 27/28 für den exakten verbleibenden externen Rest. **Ehrlicher
Status, keine Übertreibung:** vollständig code-fertig und gegen die
echte, verbundene Supabase-DB mit echten Svix-Signaturen
integrationsgetestet (12 Szenarien) — aber **nicht live**, da weiterhin
kein Resend-Konto/keine verifizierte Domain existiert (identisch zu
Risiko 19/25, jetzt zusätzlich eine Inbound-MX-Konfiguration). Der
E-Mail-Kanal ist damit jetzt in **beide** Richtungen vollständig gebaut
und wartet auf denselben einen externen Schritt (Account + Domain), nicht
mehr auf weiteren Code.

Ausdrücklich **nicht** Teil dieses Slices (Aufgabenstellung, hart
vorgegeben, hier zur Erinnerung dokumentiert statt später vergessen):
keine automatische KI-Antwort auf eingehende E-Mails, kein
Attachment-Support. Beides bewusst offen für einen künftigen, separat zu
bestätigenden Slice — siehe „Konkreter nächster Schritt" unten.

**Update 2026-08-09 (Engineering-Workflow-Hardening + Product-Track-
Slice 8A, „E-Mail Delivery Hardening"):** zwei unabhängige Ergebnisse
dieser Session:

1. **Risiko 14 (Scheduler-Aktivierung) ist jetzt operativ, nicht nur
   code-seitig, gelöst.** Nach der vom Auftraggeber vorgenommenen
   Korrektur der `CRON_SECRET`-Konfiguration im Vercel-Dashboard lieferte
   der erste echte Cron-Tick nach dem folgenden Redeploy
   (`dpl_FAE5NJkrbQeNN6vLro4yaPbjwtJ2`, 22:55:10 UTC) einen echten `200` —
   verifiziert nicht nur über den HTTP-Status, sondern über einen exakt
   korrelierten `system_events`-Eintrag desselben Runs. Der
   Production-Scheduler läuft damit tatsächlich, nicht nur theoretisch.
2. **Slice 8A** sichert die Slice-7-E-Mail-Foundation gegen Bounce/
   Complaint/transiente Fehler/fehlendes Unsubscribe ab — siehe
   Abschnitt 7 für die volle Architektur, Risiken 20/22/23 sind jetzt
   gelöst.

**Exakter, ehrlich verifizierter Aktivierungsstatus des E-Mail-Kanals
selbst (keine Behauptung ohne Prüfung):** weiterhin **nicht live** —
`EMAIL_DELIVERY_ENABLED` ist default aus, und `EMAIL_PROVIDER_API_KEY`/
`EMAIL_SENDER_ADDRESS`/`EMAIL_PROVIDER_WEBHOOK_SECRET` fehlen weiterhin
vollständig in Production (kein Resend-Account, keine verifizierte
Domain — unverändert seit Slice 7, siehe Risiko 19). Bis diese Env-Vars
gesetzt sind, verhält sich das System weiterhin wie am Ende von Slice 6:
Follow-ups werden nur als kanonischer Dashboard-Eintrag „gesendet" — der
Scheduler selbst läuft jetzt zwar zuverlässig (siehe oben), aber ohne
Provider-Konfiguration bleibt er beim kanonischen Kanal, genau wie
entworfen.

Rest dieses Abschnitts bleibt als Empfehlung für die **weiteren** Schritte
stehen — weiterhin **nicht** Teil eines bereits erteilten Auftrags, außer
explizit bestätigt:

**Kann sofort parallel starten (keine Abhängigkeiten untereinander):**

- *Production Track:* Rechtstexte (Impressum/Datenschutz) mit echten
  Angaben füllen — kleinster Aufwand, größtes Compliance-Risiko wenn offen
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
- E-Mail-Kanal-Aktivierung, Outbound + Inbound (siehe Risiko 19/25/27) —
  Resend-Account anlegen, Absenderdomain per DNS verifizieren,
  `EMAIL_PROVIDER_API_KEY`/`EMAIL_SENDER_ADDRESS`/`EMAIL_REPLY_TO` in
  Vercel setzen, dann `EMAIL_DELIVERY_ENABLED=true`; für Slice 8A: im
  Resend-Dashboard einen Webhook-Endpoint auf
  `/api/internal/email/resend/webhook` anlegen und das Signing-Secret als
  `EMAIL_PROVIDER_WEBHOOK_SECRET` setzen; zusätzlich für Slice 8B: eine
  Inbound-Subdomain als Receiving Domain hinzufügen, den MX-Record
  setzen, einen zweiten Webhook-Endpoint auf
  `/api/internal/email/resend/inbound` (Event `email.received`) anlegen,
  `EMAIL_INBOUND_DOMAIN`/`EMAIL_INBOUND_TOKEN_SECRET`/
  `EMAIL_INBOUND_WEBHOOK_SECRET` setzen — technisch vollständig
  vorbereitet, aber bewusst nicht automatisiert (Secrets/Domain-
  Entscheidungen sind keine Dinge, die eine Session selbst festlegt)
- `leads.status='termin'`-Dual-Source-Refactor (siehe Risiko 9) — technische
  Schuld, kein akuter Blocker, solange UI/Analytics sie weiterhin korrekt
  behandeln
- Intermittente dev-only Mount-Race-Konsolenwarnung (Risiko 11) — kein
  Produktionsdefekt, aktuell gezielt aus der E2E-Assertion gefiltert
- `leads.messages`-JSONB-Cleanup nach Beobachtungsfenster (Risiko 12,
  Abschnitt 7) — kein akuter Blocker, die App liest die Legacy-Spalte
  bereits nirgends mehr

**Konkreter nächster Schritt — zwei gleichwertige Kandidaten, je nach
Priorität von Jannik:**

1. **Resend-Account/Domain-Aktivierung (kein Code-Slice, ein externer
   Schritt).** Mit Slice 8B ist der gesamte E-Mail-Kanal — Outbound
   *und* Inbound — vollständig code-fertig und getestet; der einzige
   verbleibende Schritt, um Risiken 19/25/27 gleichzeitig zu schließen,
   ist ein echtes Resend-Konto + eine per DNS verifizierte Domain +
   MX-Record für die Inbound-Subdomain (siehe Risiko 19/27 für die exakte
   Schrittliste). Höchster Hebel für den geringsten Aufwand: kein
   weiterer Code nötig, nur Account/DNS/Vercel-Env-Vars.
2. **Product-Track-Slice 8C — KI-Antwort auf eingehende E-Mails +
   Attachment-Support.** Die von Slice 8B bewusst ausgeklammerten Teile
   (siehe oben) — eine automatische KI-Antwort auf eine eingehende
   Lead-E-Mail (nutzt dieselbe kanonische Message, dieselbe
   `conversations`/`messages`-Struktur, vermutlich denselben
   KI-Antwortpfad wie der Website-Chat) und Attachment-Download/-Anzeige
   (Resends Inbound-Attachment-Metadaten sind bereits im Receiving-API-
   Client vorhanden, nur der Download/die Speicherung fehlt). Baut direkt
   auf Slice 8B auf, ist aber unabhängig von Kandidat 1 planbar (Tests
   können weiterhin mit signierten Fixtures laufen, ohne echten
   Provider).

Diese Empfehlung wird hier **nicht automatisch umgesetzt** — das ist die
nächste, separat zu bestätigende Aufgabe.
