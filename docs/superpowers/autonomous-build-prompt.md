# Autonomer Build-Prompt — Anchor v1

> **Verwendung:** In einer **frischen Claude-Code-Session** im Projektordner
> `C:\Users\KEK\Documents\MCP\Projekte\Idee` starten, idealerweise mit auto-akzeptierten
> Permissions (unbeaufsichtigter Lauf). Diesen gesamten Text als ersten Prompt einfügen.
> Voraussetzung für den **vollständigen** Lauf: Node ≥ 20, git, **Docker (laufend)**;
> pnpm & Supabase-CLI werden bei Bedarf selbst nachinstalliert.

---

## Mission

Baue **Anchor v1** vollständig, autonom und ohne Rückfragen/Checkpoints fertig. Am Ende
reviewt ein Mensch nur das fertige, grün getestete Produkt. Arbeite diszipliniert nach den
vorhandenen Plan-Dokumenten und liefere verifizierbare Qualität.

## Quellen der Wahrheit (zuerst vollständig lesen)

1. `docs/superpowers/specs/2026-08-23-freundes-trip-app-design.md` — Vision & Scope
2. `docs/superpowers/plans/2026-08-23-anchor-v1-roadmap.md` — Architektur, Monorepo, **verbindliche Typ-Kontrakte**, 5 Scheiben
3. `docs/superpowers/plans/2026-08-23-anchor-slice-0-foundation.md` — Scaffolding (Schritt für Schritt)
4. `docs/superpowers/plans/2026-08-23-anchor-slice-1-termin-lock.md` — Termin-Lock (Schritt für Schritt, TDD)

Die Roadmap-Typ-Kontrakte (§5) sind **verbindlich** — Namen/Signaturen exakt einhalten.

## Autonomie-Regeln (kein Checkpoint)

- **Niemals anhalten, um zu fragen.** Wenn etwas unklar/blockiert ist: die sinnvollste,
  konservative Entscheidung treffen, sie in `BUILD_REPORT.md` unter „Entscheidungen" dokumentieren
  und weiterarbeiten.
- **Keine Scope-Erweiterung.** Nur v1-Scope aus der Roadmap. Nichts, was in Spec §10 / Roadmap §8
  ausgeschlossen ist (kein Geldfluss, kein Idle-Nudge, kein Chat, kein Foto-Archiv).
- **TDD ist Pflicht** für die gesamte Domain-Logik: erst der fehlschlagende Test, dann Minimal-
  Implementierung, dann grün. Reihenfolge exakt wie in den Plänen.
- **Häufig committen** (nach jedem grünen Task), Conventional-Commits-Format (`feat:`, `test:`,
  `chore:`, `fix:`). Kein Attribution-Footer.
- **Immutabilität & kleine Dateien** (siehe globale coding-style-Regeln): neue Objekte statt
  Mutation, Dateien fokussiert (< 400 Zeilen Richtwert).

## Umgebungs-Setup (einmalig, zu Beginn)

- pnpm via corepack aktivieren: `corepack enable` und `corepack prepare pnpm@9 --activate`.
- Supabase-CLI als Dev-Dependency: `pnpm add -D -w supabase` (Aufruf via `pnpm supabase ...`).
- Prüfe `docker info`. **Ist Docker verfügbar:** vollständiger Lauf inkl. `supabase start`,
  Migrationen anwenden, `gen types --local`, Edge-Function serven, Playwright-E2E.
  **Ist Docker NICHT verfügbar:** in den *reduzierten Modus* wechseln (siehe unten).

## Ausführungsreihenfolge

Arbeite Scheibe für Scheibe. Nach jeder Scheibe: Quality-Gate (unten) grün, dann committen.

1. **Scheibe 0 — Fundament**: exakt nach `slice-0-foundation.md`.
2. **Scheibe 1 — Termin-Lock**: exakt nach `slice-1-termin-lock.md` (alle 9 Tasks, TDD).
3. **Scheibe 2 — Unterkunfts-Kürung**: Zuerst mit dem `writing-plans`-Vorgehen einen
   detaillierten Task-Plan `docs/superpowers/plans/2026-08-23-anchor-slice-2-unterkunft.md`
   schreiben (gegen den jetzt real existierenden Code), dann umsetzen. Kern:
   - Domain `packages/shared/src/domain/voting.ts` (`tallyVotes`, `winningOption`) **per TDD**.
   - Edge Function `supabase/functions/parse-accommodation` (server-seitiger Open-Graph-Fetch:
     `og:title`/`og:image`; Preis best-effort aus JSON-LD; Timeout; Cache in DB-Spalten).
   - **Manueller Eingabepfad ist gleichwertig** — kein reiner Fallback. `raw_url` immer
     speichern, `affiliate_url` als nullable Feld vorhalten (nichts scharf schalten).
   - Tabellen `accommodation_options`, `accommodation_votes` + RPCs (droppen/voten) analog zum
     capability-Muster aus Scheibe 1.
   - Web/App-UI: Links droppen, Metadaten/Manuell anzeigen, voten, Gewinner küren.
4. **Scheibe 3 — Kostenaufteilung**: analog Plan schreiben, dann umsetzen. Kern:
   - Domain `packages/shared/src/domain/balances.ts` (`computeBalances`, `simplifyDebts` als
     Greedy-Min-Cash-Flow) **per TDD**, inkl. Cent-Rundungs-Edgecases.
   - Tabellen `expenses`, `expense_splits` + RPCs. Nicht-App-Gäste als reine Namen erfassbar.
   - Settle-up via Deeplink (PayPal/Bank) — **kein Geldfluss durch die App**.
   - Web/App-UI: Ausgabe erfassen, Salden anzeigen, Settlement-Liste + Deeplink.
5. **Scheibe 4 — Nudge-Engine (event-getrieben)**: analog Plan schreiben, dann umsetzen. Kern:
   - Domain: Frequenz-Capping-Logik (welcher Nudge darf feuern, gegeben `nudge_events`-Historie)
     **per TDD**.
   - Edge Function `supabase/functions/nudge-dispatch` (per pg_cron): Deadline naht, Termin
     gelockt, Unterkunft entschieden, Post-Trip. Expo-Push für App-User, Mail-Fallback für
     Link-Gäste. **Idle-Nudge NICHT bauen (v1.1).**
   - `nudge_events`-Log schreiben; Capping strikt einhalten.

## Quality-Gate (nach jeder Scheibe, muss grün sein)

```bash
pnpm test         # alle Vitest-Suiten grün
pnpm typecheck    # kein Typfehler in allen Paketen
pnpm lint         # falls konfiguriert
pnpm --filter web build   # Next.js baut durch
```

Bei Docker verfügbar zusätzlich: `pnpm supabase db reset` fehlerfrei, betroffene Edge-Function
serven, Playwright-E2E der Scheibe grün.

**Regel:** Ein Quality-Gate darf nie „rot" übersprungen werden. Fehler zuerst beheben
(nutze systematic-debugging), dann weiter. Tests nicht abschwächen, um sie grün zu bekommen.

## Reduzierter Modus (falls Docker NICHT verfügbar)

Wenn `docker info` fehlschlägt, ist lokales Supabase nicht startbar. Dann:
- Baue & teste **alles Backend-Unabhängige** vollständig grün: gesamte Domain-Logik
  (`commitment`, `lock`, `voting`, `balances`, Nudge-Capping) mit voller Vitest-Abdeckung;
  Monorepo-, Next.js- und Expo-Scaffolding; alle UI-Komponenten (Typecheck grün);
  `pnpm --filter web build` grün.
- Schreibe **alle** SQL-Migrationen und Edge-Function-Dateien als Code (nicht angewendet).
- `packages/shared/src/db-types.ts`: hand-authore einen minimalen, zur Migration passenden
  `Database`-Typ und markiere ihn klar „regenerieren via `supabase gen types --local`, sobald
  Docker läuft".
- Führe **keine** DB-/E2E-Schritte aus; dokumentiere sie in `BUILD_REPORT.md` als offene,
  exakt beschriebene Restschritte.

## Definition of Done

- Alle grün ausführbaren Quality-Gates grün; keine roten/geskippten Kern-Tests.
- Jede umgesetzte Scheibe erfüllt ihre Akzeptanzkriterien (siehe Plan-Dokumente).
- Sauberer git-Verlauf mit sinnvollen Commits.
- `BUILD_REPORT.md` im Projekt-Root mit:
  1. **Zusammenfassung** (was fertig & grün ist),
  2. **Test-/Typecheck-/Build-Ergebnisse** (kopierte Ausgaben),
  3. **Offene Restschritte** (v. a. alles, was Docker/Supabase-Zugang braucht — exakt, kopierbar),
  4. **Getroffene Entscheidungen** (jede autonome Entscheidung mit Begründung),
  5. **Bekannte Risiken / TODOs** für den menschlichen Review.

## Was der Mensch nach Rückkehr tun muss (im Report auflisten)

- Docker starten (falls im reduzierten Modus gebaut) und die DB-/E2E-Schritte nachziehen, **oder**
- ein Supabase-Cloud-Projekt anlegen + `SUPABASE_ACCESS_TOKEN`/Projekt-Ref bereitstellen, dann
  `supabase link` + `supabase db push` + Functions deployen.
- Entscheidung Home-Lab-Self-Host vs. Supabase-Cloud fürs Beta-Deployment.
