# CLAUDE.md

Projektspezifische Hinweise für Claude Code in diesem Repository (**Anchor** — „Der Trip, der
endlich stattfindet"). pnpm-Monorepo: Next.js-Web (`apps/web`), Expo/React-Native-App
(`apps/mobile`), gemeinsames Paket `@anchor/shared` (`packages/shared`), selbst gehostetes
Supabase (`supabase/`).

**Zuerst lesen:** [BEST-PRACTICES.md](BEST-PRACTICES.md) — die destillierten Lehren aus den
bisherigen Scheiben. Das Lauftagebuch je Scheibe liegt unter `docs/superpowers/NACHTLAUF-STATUS-*.md`,
projektübergreifende technische Muster in `C:\Users\KEK\Documents\homelab\HEIMAPPS-PLAYBOOK.md`.

## Drei Regeln, deren Verletzung hier schon Schaden angerichtet hat

**1. In jeder PL/pgSQL-Funktion mit `returns table(...)` jede Spaltenreferenz im Rumpf über einen
Tabellen-Alias qualifizieren.** Die OUT-Spalten sind im Rumpf Variablen und kollidieren sonst mit
gleichnamigen Tabellenspalten (`column reference "id" is ambiguous`). Eine so gebaute Funktion ist
**nie aufrufbar**, und weder Typecheck noch Unit-Test noch Code-Review sehen das — nur der erste
echte Aufruf. Gilt auch für `returns jsonb`- und `returns void`-Funktionen, damit ein späteres
Hinzufügen eines OUT-Parameters nichts still bricht.

**2. Jede neue Datenbankfunktion nach dem Einspielen live aufrufen** — Erfolgsfall **und** ein
erwarteter Fehlerfall — bevor ein Deploy als fertig gilt. Am besten über die öffentliche API mit
dem anon-Key, dann sind die `grant`s mitgeprüft.

**3. Die RPCs sind nicht idempotent.** Jedes absendende Formular braucht einen Guard gegen
Doppelabsenden, und zwar über `useRef`, nicht über State: zwei Klicks im selben React-Batch lesen
denselben Closure-Wert, `disabled={isSubmitting}` allein trägt nicht.

## Zugriffsmodell — ausnahmslos

RLS lässt **keinen** direkten Tabellenzugriff zu. Aller Zugriff läuft über
`security definer`-RPCs mit `set search_path = public, extensions`, die die `trip_id`
serverseitig aus der `participant_id` ableiten. Der Client übergibt **nie** eine `trip_id`. Neue
Tabellen bekommen `enable row level security` ohne Policies — das ist Absicht, kein vergessener
Schritt.

Jede Regel, die Daten schützt, gehört in die RPC. Eine rein clientseitige Prüfung ist per direktem
API-Aufruf umgehbar und zählt als nicht vorhanden.

## Migrationen

`supabase/migrations/` ist fortlaufend nummeriert, ohne `if not exists` — **jede Migration läuft
genau einmal**. Eine bereits eingespielte Datei wird **nicht** nachträglich editiert; eine
Korrektur bekommt eine neue Nummer, sonst ist der Migrationsstand nicht mehr prüfbar. Der live
angewendete Stand steht in `C:\Users\KEK\Documents\homelab\HOMELAB.md` beim Eintrag zu CT 113.

## Fachlogik gehört nach `packages/shared`

Alles, was rechnet statt darzustellen, gehört dorthin — nicht in eine der beiden Oberflächen.
Zwei Gründe: Web und App können so gar nicht auseinanderdriften (fachliche Gleichwertigkeit ist
hier ein stehender Reviewpunkt), und `packages/shared` ist der einzige Ort mit Testaufbau.
**`apps/mobile` hat weder ein Test- noch ein Lint-Skript**, `turbo run lint` führt nur `web` aus.

Prüfläufe: `npx turbo run typecheck test --force` muss grün sein und läuft ohne Browser und ohne
Datenbank. `--force` ist wichtig — ein Turbo-Cache-Treffer ist kein Beleg, dass der eigene Code
geprüft wurde. `pnpm lint` ist seit vor Scheibe 2 rot mit genau drei bekannten Altlasten; eine
vierte wäre neu.

## E2E

Die Playwright-Suite legt über den **Service-Role-Key** echte Zeilen an. Sie hat seit Scheibe 2
eine fail-closed Umgebungssperre und räumt hinter sich auf, ist aber **nie gelaufen**. Vor dem
ersten Lauf Sperre und Aufräumen einmal gegen eine Wegwerf-Instanz ausprobieren. Ein lokaler
Supabase-Stapel existiert nicht (kein Docker auf der Entwicklungsmaschine).

## Infrastruktur und Freigaben

Backend und Web laufen auf **CT 113** (`192.168.2.180`), der Android-Build auf **CT 116**. Zugriff
über `ssh root@192.168.2.90 "pct exec <id> -- <befehl>"`, Details in
`C:\Users\KEK\Documents\homelab\HOMELAB.md`. **`labs` (CT 114) gehört anderen Apps und wird nicht
angefasst.**

Lesende Abfragen auf CT 113 sind frei. **Schreibende Eingriffe brauchen eine Freigabe** — einen
Warnblock, ein Ja, dann ohne weitere Rückfrage durchziehen. Vor einer Migration ein `pg_dump` nach
`/opt/anchor/backups/` (läuft nur **im** Container: `docker exec supabase-db pg_dump`, auf dem
CT-Host selbst ist keiner installiert).

Deploy-Tarball **immer** mit `git -c core.autocrlf=false archive HEAD` bauen, nie mit `tar .` aus
dem Arbeitsverzeichnis — sonst reist die git-ignorierte `apps/web/.env.local` mit und überschreibt
die Produktionskonfiguration. Kontrolle: Das Build-Log muss `Environments: .env.production` melden,
ohne `.env.local`. Das `-c core.autocrlf=false` ist nötig, weil `git archive` unter Windows sonst
CRLF-Zeilenenden in den Tarball schreibt (siehe BEST-PRACTICES.md, Deploy-Checkliste Punkt 4).

## Arbeitsweise, die sich hier bewährt hat

Mehrteilige Pläne laufen in einem eigenen Git-Worktree unter `.claude/worktrees/`,
subagent-getrieben mit einem Review je Task. **Der Reviewer bekommt den Plantext Zeichen für
Zeichen so, wie ihn der Implementierer bekommen hat** — keine eigene Kurzfassung, das hat schon
Scheinbefunde erzeugt.

Meldet ein Review dieselbe Fehlerklasse an derselben Stelle zum zweiten Mal, ist das Prüfverfahren
das Problem, nicht der Lösungsvorschlag: dann einen ausdrücklichen **Messauftrag** in den
Reviewprompt schreiben („miss das im Browser") statt einen weiteren Vorschlag. Generell gilt in
diesem Projekt: messen schlägt herleiten, und es ist fast immer billiger.
