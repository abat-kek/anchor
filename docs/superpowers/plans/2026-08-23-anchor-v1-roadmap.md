# Anchor — v1 Implementierungs-Roadmap

> **Index-Dokument.** Dies ist die Landkarte für den v1-Bau. Die einzelnen vertikalen
> Scheiben haben je ein eigenes, voll ausdetailliertes Plan-Dokument (siehe §7). Jede
> Scheibe ist für sich lauffähig und testbar.

**App-Name (Working):** Anchor
**Basis-Spec:** [`docs/superpowers/specs/2026-08-23-freundes-trip-app-design.md`](../specs/2026-08-23-freundes-trip-app-design.md)
**Datum:** 2026-08-23

---

## 1. Ziel & Leitplanken

**Ziel:** Eine B2C-App für Freundesgruppen, die verhindert, dass Pläne im Sand verlaufen.
MVP-Wedge: „Der Trip, der endlich stattfindet."

**v1-Flow (Produkt-Sicht):**
`Nudge/Kickoff → Link-first Zusagen → Termin-Lock → Unterkunfts-Kürung → Kostenaufteilung`

**Build-Reihenfolge (bewusst NICHT = Flow-Reihenfolge):** Wir bauen den risikoreichsten
Kern zuerst, damit früh etwas Lauffähiges existiert.

**Feste Entscheidungen (aus dieser Session, nicht wieder aufmachen):**
- **Metadaten-Parsing:** Server-seitiger Open-Graph-Fetch via Supabase Edge Function +
  **gleichwertiger manueller Eingabepfad** (kein reiner Fallback). `raw_url` immer speichern,
  `affiliate_url` als nachrüstbares Feld. Kein offizielles Airbnb/Booking-API in v1.
- **Affiliate-Realität:** Airbnb hat sein Affiliate-Programm 2021 eingestellt. „Affiliate-ready"
  meint Booking.com/Expedia/Vrbo/Travelpayouts. In v1 nur das Feld vorhalten, nichts scharf.
- **Idle-Nudge** („Gruppe X Wochen still") → **v1.1**. In v1 nur event-getriebene Nudges.
- **Kein Geldfluss** durch die App (Splitwise-Style Buchhaltung + Settle-up-Deeplink).

---

## 2. Tech-Stack & Werkzeuge (zur Review)

| Bereich | Wahl | Begründung |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Ein Repo für App + Web + geteilte Logik; schnelle Task-Caches |
| Sprache | **TypeScript (strict)** überall | Nutzer-Stack, ein Typ-System vom DB-Row bis UI |
| Mobile | **Expo (SDK 52+) + expo-router**, React Native | iOS+Android aus einer Codebase, sauberes Push |
| Web | **Next.js (App Router)** | Schlankes Link-first-Frontend, SSR für Link-Unfurl |
| Backend | **Supabase** (Postgres + RLS + Auth + Realtime + Edge Functions) | Ein Managed-Backend, Realtime für „7/10 dabei", Deno-Edge für OG-Fetch/Cron |
| Geteilte Logik | **`packages/shared`** (pure Domain-Funktionen + Zod) | Kern-Logik pur & unit-testbar ohne DB |
| Unit-Tests | **Vitest** | Für `packages/shared` — hier lebt die TDD-Dichte |
| Web-E2E | **Playwright** | Kritischer Link-first-Flow deterministisch getestet |
| Auth | **Supabase Auth**, Magic-Link/OTP (Apple/Google in v1.1) | Niedrige Hürde; Link-Gäste brauchen gar keinen Login (Token-Zugang) |
| Scheduling | **pg_cron** + Edge Functions | Deadline-Auto-Lock & Nudge-Dispatch laufen server-seitig |

> **Alle Zeilen dieser Tabelle sind Entscheidungen zur Freigabe.** Einspruch bitte vor
> Scheibe 0.

---

## 3. Monorepo-Layout (Ziel-Struktur)

```
anchor/
├── package.json                 # pnpm workspace root, turbo scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── apps/
│   ├── mobile/                  # Expo App (Anchor)
│   │   ├── app/                 # expo-router Routen
│   │   ├── src/
│   │   │   ├── features/        # trip/, group/, accommodation/, cost/
│   │   │   ├── lib/             # supabase-client, hooks
│   │   │   └── components/
│   │   ├── app.json
│   │   └── package.json
│   └── web/                     # Next.js Link-first-Frontend
│       ├── app/
│       │   ├── join/[token]/    # Gruppe/Trip beitreten
│       │   └── trip/[id]/       # Gast-Ansicht: Verfügbarkeit, Voting
│       ├── src/lib/
│       └── package.json
├── packages/
│   └── shared/                  # Pure Domain-Logik + Typen (Vitest)
│       ├── src/
│       │   ├── types.ts         # Domain-Typen (siehe §5)
│       │   ├── domain/
│       │   │   ├── commitment.ts
│       │   │   ├── lock.ts
│       │   │   ├── voting.ts
│       │   │   └── balances.ts
│       │   └── index.ts
│       ├── test/
│       └── package.json
└── supabase/
    ├── migrations/              # SQL (Tabellen, RLS, pg_cron)
    ├── functions/               # Edge Functions (Deno)
    │   ├── parse-accommodation/
    │   ├── auto-lock/
    │   └── nudge-dispatch/
    └── config.toml
```

**Prinzip (aus coding-style-Regeln):** viele kleine, fokussierte Dateien; Domain-Logik pur
und DB-frei in `packages/shared`; UI ruft geteilte Logik auf, dupliziert sie nicht.

---

## 4. Datenmodell → Postgres-Tabellen

Verfeinerung von Spec §5. **Ein einheitliches Teilnehmer-Konzept** (`trip_participants`)
vereint App-User und Link-Gäste — Commitments/Votes/Expenses referenzieren immer eine
`trip_participant.id`, nie polymorph verstreut.

| Tabelle | Kernspalten |
|---|---|
| `profiles` | `id (=auth.users.id)`, `display_name`, `push_token?` |
| `groups` | `id`, `name`, `invite_token (unique)`, `created_by`, `created_at`, `last_activity_at` |
| `memberships` | `group_id`, `user_id`, `role ('owner'\|'member')` |
| `link_guests` | `id`, `group_id`, `display_name`, `email?`, `converted_user_id?` |
| `trips` | `id`, `group_id`, `title`, `status`, `destination?`, `deadline`, `locked_date_option_id?`, `created_by`, `created_at` |
| `trip_participants` | `id`, `trip_id`, `user_id?`, `link_guest_id?`, `display_name`, `is_committed bool` |
| `trip_date_options` | `id`, `trip_id`, `start_date`, `end_date` |
| `date_availabilities` | `id`, `trip_id`, `date_option_id`, `participant_id`, `availability ('yes'\|'maybe'\|'no')` |
| `accommodation_options` | `id`, `trip_id`, `raw_url`, `parsed_title?`, `parsed_image_url?`, `parsed_price?`, `affiliate_url?`, `added_by`, `created_at` |
| `accommodation_votes` | `id`, `option_id`, `participant_id` |
| `expenses` | `id`, `trip_id`, `payer_participant_id`, `amount_cents`, `currency`, `description`, `created_at` |
| `expense_splits` | `id`, `expense_id`, `participant_id`, `share_cents` |
| `nudge_events` | `id`, `group_id`, `trip_id?`, `type`, `recipient`, `sent_at` |

**Naming-Mapping zur Spec:** Spec-`DateCommitment` wird aufgeteilt in (a) `is_committed`
auf `trip_participants` (das verbindliche „ich komme" → treibt den „7/10 dabei"-Zähler) und
(b) `date_availabilities` (Verfügbarkeit je Terminfenster). Sauberer als ein Misch-Objekt.

**Status-Enum `trips.status`:** `draft → collecting → locked → accommodation → active → done`.
(Slice 1 nutzt `draft`/`collecting`/`locked`; spätere Scheiben schalten weiter.)

---

## 5. Verbindliche Typ-Kontrakte (`packages/shared/src/types.ts`)

Diese Namen sind **verbindlich** — alle Scheiben-Pläne referenzieren exakt diese Signaturen.

```typescript
export type TripStatus =
  | 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';

export type Availability = 'yes' | 'maybe' | 'no';

export interface DateOption {
  id: string;
  tripId: string;
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string;   // ISO date 'YYYY-MM-DD'
}

export interface DateAvailability {
  dateOptionId: string;
  participantId: string;
  availability: Availability;
}

export interface DateTally {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
}

export type LockDecision =
  | { action: 'lock'; optionId: string }
  | { action: 'suggest_early_lock'; optionId: string }
  | { action: 'wait'; reason: 'before_deadline' | 'no_options' | 'no_commitments' };

export interface ResolveLockInput {
  now: string;              // ISO datetime
  deadline: string;         // ISO datetime
  options: DateOption[];
  tallies: DateTally[];
  totalCommitted: number;   // Anzahl Teilnehmer mit is_committed=true
}

// Kosten (Scheibe 3)
export interface Expense {
  id: string;
  payerParticipantId: string;
  amountCents: number;
  currency: string;
}
export interface ExpenseSplit {
  expenseId: string;
  participantId: string;
  shareCents: number;
}
export interface Balance { participantId: string; netCents: number; } // >0: bekommt Geld
export interface Settlement { fromParticipantId: string; toParticipantId: string; amountCents: number; }
```

**Verbindliche Domain-Funktions-Signaturen:**

```typescript
// domain/commitment.ts
export function countCommitted(participants: { isCommitted: boolean }[]): number;
export function computeTallies(
  options: DateOption[],
  availabilities: DateAvailability[],
  committedParticipantIds: string[],
): DateTally[];
export function selectBestOption(tallies: DateTally[]): string | null;

// domain/lock.ts
export function resolveLock(input: ResolveLockInput): LockDecision;

// domain/voting.ts (Scheibe 2)
export function tallyVotes(
  optionIds: string[],
  votes: { optionId: string }[],
): { optionId: string; count: number }[];
export function winningOption(
  tallies: { optionId: string; count: number }[],
): string | null;

// domain/balances.ts (Scheibe 3)
export function computeBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
): Balance[];
export function simplifyDebts(balances: Balance[]): Settlement[];
```

---

## 6. Die 5 vertikalen Scheiben

Jede Scheibe liefert lauffähige, demobare Software. Reihenfolge = Build-Reihenfolge.

### Scheibe 0 — Fundament / Scaffolding
**Plan:** [`2026-08-23-anchor-slice-0-foundation.md`](2026-08-23-anchor-slice-0-foundation.md)
**Liefert:** Monorepo steht; Expo-App + Next.js-Web starten; `packages/shared` mit grünem
Vitest; Supabase lokal läuft mit erster Migration + generierten DB-Typen; Supabase-Client in
beiden Apps verbunden; ein echter Unit-Test beweist die Test-Pipeline.
**Akzeptanz:** `pnpm test` grün, App + Web zeigen einen Screen der aus Supabase liest.

### Scheibe 1 — Termin-Lock  ⭐ erste lauffähige Feature-Scheibe
**Plan:** [`2026-08-23-anchor-slice-1-termin-lock.md`](2026-08-23-anchor-slice-1-termin-lock.md)
**Liefert (end-to-end):**
- Minimal: Gruppe + Trip anlegen (App), Invite-Link erzeugen.
- Link-first (Web): Gast öffnet `/join/[token]`, tritt bei, setzt Verfügbarkeit je
  Terminfenster, drückt „Ich bin dabei" (`is_committed`).
- Sozial sichtbar: Live-Zähler „7/10 dabei" (Supabase Realtime), Deadline sichtbar.
- **Auto-Lock:** pg_cron-Edge-Function lockt bei Deadline den best-besuchten Termin
  (`resolveLock`); Creator kann früh manuell locken; „alle dabei" → Early-Lock-Vorschlag.
- Kein-Termin-für-alle-Fall: best-besuchter Termin gewinnt (Spec §7).
**Domain-Kern (TDD):** `commitment.ts` + `lock.ts` (pure, voll getestet).
**Akzeptanz:** Playwright-E2E: Gast tritt bei → sagt zu → Deadline überschritten →
Trip ist `locked` mit korrektem Terminfenster.

### Scheibe 2 — Unterkunfts-Kürung
**Plan:** _(just-in-time vor Umsetzung)_
**Liefert:** Teilnehmer droppen Unterkunfts-Links; Edge Function `parse-accommodation`
zieht OG-Metadaten server-seitig (Titel/Bild/Preis) mit Cache; **manueller Eingabepfad
gleichwertig**; Voting; Gewinner-Kürung (`voting.ts`); `raw_url` + `affiliate_url`-Feld
vorgehalten (affiliate-ready). Fallback bei Parse-Fehler: nur URL + manueller Titel.
**Domain-Kern (TDD):** `voting.ts`.
**Akzeptanz:** Link droppen → Metadaten erscheinen (oder manueller Titel) → voten →
Gewinner wird gekürt; Parse-Ausfall degradiert sauber zum manuellen Pfad.

### Scheibe 3 — Kostenaufteilung
**Plan:** _(just-in-time vor Umsetzung)_
**Liefert:** Ausgaben-Ledger (wer zahlte was, geteilt unter wem); Saldenberechnung
(`computeBalances`); Schuldenvereinfachung (`simplifyDebts`); Settle-up via PayPal/Bank-
Deeplink (**kein Geldfluss durch die App**); Nicht-App-Gäste als reine Namen erfassbar.
**Domain-Kern (TDD):** `balances.ts` (inkl. Rundungs-Edgecases in Cents).
**Akzeptanz:** Mehrere Ausgaben → korrekte Salden → minimale Settlement-Liste → Deeplink.

### Scheibe 4 — Nudge-Engine (die Seele, event-getrieben)
**Plan:** _(just-in-time vor Umsetzung)_
**Liefert:** Event-getriebene Nudges (Deadline naht, Termin gelockt, Unterkunft entschieden,
Post-Trip); Expo Push für App-User, Mail-Fallback für Link-Gäste; `nudge_events`-Log +
**Frequenz-Capping** gegen Fatigue. **Idle-Nudge bleibt v1.1.**
**Domain-Kern (TDD):** Capping-Logik (welcher Nudge darf feuern, gegeben Historie).
**Akzeptanz:** Deadline-nah-Trip triggert genau einen Push; zweiter Trigger im Cap-Fenster
wird unterdrückt.

---

## 7. Build-Reihenfolge & Abhängigkeiten

```
Scheibe 0 (Fundament)
   └─> Scheibe 1 (Termin-Lock)         [nutzt: groups, trips, participants, realtime, cron]
          ├─> Scheibe 2 (Unterkunft)   [nutzt: trip=locked, edge functions]
          ├─> Scheibe 3 (Kosten)       [nutzt: trip_participants]
          └─> Scheibe 4 (Nudges)       [konsumiert Status-Wechsel aus 1–3]
```

Scheiben 2 und 3 sind nach Scheibe 1 **parallelisierbar** (unabhängige Subsysteme).
Scheibe 4 kommt zuletzt, weil sie die Events aus 1–3 konsumiert.

---

## 8. Was bewusst NICHT in v1 ist (aus Spec §10 + Session)

- Echte Zahlungsabwicklung / Anzahlungen
- Täglicher Gruppen-Chat (bleibt WhatsApp)
- Dauerhaftes Foto-/Doc-Archiv (v1.1)
- Flüge/Aktivitäten buchen
- Automatik für wiederkehrende Trips (v1.1)
- **Idle-„Keep-warm"-Nudge (v1.1)**
- Scharfes Affiliate (Phase 2)
- Mobile-E2E-Suite (Detox/Maestro) — v1: Unit-Tests + manueller Smoke, Web-E2E via Playwright
```
