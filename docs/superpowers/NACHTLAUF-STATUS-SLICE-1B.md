# Nachtlauf 2026-09-21: Slice 1b + Join-Bug + Deploy

Fortschrittsdatei fuer den unbeaufsichtigten Lauf. Bei verdichtetem Kontext ist diese Datei
der Wiedereinstieg: zuerst hier lesen, dann `git log --oneline`, dann Plan.

- Plan: `docs/superpowers/plans/2026-09-02-anchor-slice-1b-date-proposals-participants.md`
- Worktree: `.claude/worktrees/anchor-slice-1b`, Branch `worktree-anchor-slice-1b`

## Vorgaben des Nutzers (vor dem Schlafengehen erteilt)

| Frage | Antwort |
|---|---|
| Mobile mitziehen | Ja, inklusive APK-Build auf CT 116 — die APK ist das Hauptprodukt, Web ist Fallback |
| Bei Blockade | Weiterarbeiten, Luecke melden |
| Worktree | Ja, neuer Worktree |
| Backend-Ort | Anchor-Backend bleibt auf CT 113; `labs` (CT 114) ist fuer andere Apps und wird nicht angefasst |
| Deploy CT 113 | Ausdruecklich freigegeben nach Warnblock |
| Offene Entscheidungen | Selbst entscheiden, Alternativen markieren |
| Danach | Grobplaene fuer Scheiben 2–4 plus Sammlung der Entscheidungen, die der Nutzer treffen soll |

## Ausgangsbefund (wichtig)

Slice 1b war **bereits implementiert** — acht Commits lagen ungemerged im Worktree
`.claude/worktrees/anchor-slice-1b` (Tasks 1–5 des Plans). Der Lauf ist daher kein Neubau,
sondern: verifizieren, Defekte beheben, mergen, ausrollen.

## Fortschritt

| Schritt | Ergebnis | Commit |
|---|---|---|
| Bestandsaufnahme | 8 Commits, `pnpm test` 47/47 gruen, `pnpm typecheck` 3/3 gruen (selbst nachgemessen) | — |
| Defekt 1 behoben | Web-Join `router.push` → `router.replace` (Geister-Teilnehmer) | `abc63f8` |
| Defekt 2 behoben | E2E nutzte feste Datumswerte aus der Vergangenheit → relativ zu heute | `abc63f8` |
| Sicherung CT 113 | `/opt/anchor/backups/vor-slice1b-20260921-133748.sql`, 705283 Bytes, 110 CREATE-Statements, Rechte 600 | — |

| Review | Subagent-Review des Branch-Diffs gegen den Plan: 0 CRITICAL, 1 HIGH, 1 MEDIUM, 2 LOW | — |
| HIGH behoben | Web-Formular ohne Absende-Guard (Doppelklick = zwei identische Terminfenster); Mobile hatte den Guard bereits | `27fa301` |
| MEDIUM behoben | `start_in_past` galt nur im Client und war per direktem RPC-Aufruf umgehbar — jetzt auch in der RPC | `27fa301` |
| Merge | Fast-forward nach `master`, `27fa301` | — |
| Migration 0009 | Auf CT 113 eingespielt (`CREATE FUNCTION`, `GRANT`, `CREATE FUNCTION`) | — |
| **Defekt live gefunden** | `propose_date_option` brach mit `column reference "id" is ambiguous` ab — die OUT-Spalten aus `returns table(id, …)` kollidieren mit den Tabellenspalten. Die Funktion war nie aufrufbar; Typecheck und Unit-Tests koennen das strukturell nicht sehen | — |
| Migration 0010 | Korrektur: jede Spaltenreferenz im Rumpf ueber Tabellen-Alias qualifiziert, eingespielt und live geprueft | `<folgt>` |
| **Defekt beim Deploy** | Mein Tarball schleppte die lokale, git-ignorierte `apps/web/.env.local` mit (`127.0.0.1:54321`) und reaktivierte damit den Bug vom 31.08. Erkannt an der Zeile `Environments: .env.local, .env.production` im Build-Log | — |
| Behoben | `.env.local` auf CT 113 nach `.env.local.bak-deploy-20260921` verschoben, neu gebaut (`Environments: .env.production`), Dienst neu gestartet | — |
| APK-Build | CT 116, `anchor-20260921-1345.apk` (42 422 591 Bytes), Fingerprint `5bb811da…8d7f` — identisch mit dem dokumentierten stabilen Keystore, also Update ohne Deinstallation | — |
| Grobplan 2–4 | `docs/superpowers/plans/2026-09-21-scheiben-2-4-grobplan.md` mit 11 Entscheidungsvorlagen | `<folgt>` |

## Abnahme gegen die laufenden Systeme (selbst nachgemessen)

| Pruefung | Ergebnis |
|---|---|
| Migrationen 0009 + 0010 eingespielt | ja, in Transaktion mit `ON_ERROR_STOP=1` |
| `propose_date_option` ueber die oeffentliche API | legt Terminfenster an, liefert es zurueck |
| Startdatum in der Vergangenheit ueber die oeffentliche API | wird mit `start_in_past` abgelehnt |
| `get_trip_state` liefert `participants` | ja, mit Name und Zusage-Status |
| Web erreichbar | `/` = 200, `/join/<token>` = 200 ueber `anchor.kek95.duckdns.org` |
| Ausgeliefertes Bundle | enthaelt `anchor-api.kek95.duckdns.org`, **kein** Treffer auf `127.0.0.1:54321` |
| APK herunterladbar | `http://192.168.2.190:8080/anchor/anchor-latest.apk` = 200 |
| Testdaten | beide Abnahme-Trips wieder geloescht, Bestand unveraendert bei 11 Trips |

**Was die Sicherung nicht abdeckt:** alles ausserhalb der Anchor-Datenbank auf CT 113, die
uebrigen Dienste dieses Containers, bereits in fremden Browsern geoeffnete Join-Links und den
Zustand der App auf Geraeten.

## Entscheidungen, die ich selbst getroffen habe

| Nr. | Entscheidung | Verworfene Alternativen |
|---|---|---|
| E1 | Den Ambiguitaets-Fehler als **neue Migration 0010** beheben, 0009 unveraendert lassen | 0009 nachtraeglich editieren — die Datei war live schon angewendet, ein stiller Inhaltswechsel macht den Migrationsstand unpruefbar |
| E2 | Die Regel „kein Startdatum in der Vergangenheit" **auch serverseitig** durchsetzen | Nur im Client lassen: RLS laesst ausschliesslich RPC-Aufrufe zu, eine rein clientseitige Regel ist per `curl` umgehbar |
| E3 | APK aus dem **verifizierten** Stand bauen, keine zusaetzliche Datumsauswahl (native Date-Picker) mehr einbauen | Date-Picker vor dem Build nachruesten: braucht ein natives Modul, damit ein neues `expo prebuild` mit voller C++-Kompilierung, und haette die fertige APK unbeaufsichtigt aufs Spiel gesetzt. Steht als Vorschlag in „Offene Punkte" |
| E4 | Kein Unique-Constraint auf `(trip_id, start_date, end_date)` | Waere sauberer gegen Duplikate, kann aber auf bestehende Daten treffen und die Migration mitten in der Nacht scheitern lassen. Der Doppelklick-Guard deckt den praktischen Fall ab |
| E5 | Testdaten nach der Abnahme **hart geloescht** | Stehenlassen: sie waeren in jeder Trip-Liste sichtbar. Es waren ausschliesslich in dieser Nacht selbst angelegte Zeilen |

## Offene Punkte

1. **Datumsauswahl auf dem Handy.** Die Mobile-App erwartet die Eingabe als Text im Format
   `JJJJ-MM-TT`. Fuer eine App, die „cool" sein soll, ist das die schwaechste Stelle des
   Bildschirms. Vorschlag: `@react-native-community/datetimepicker` nachruesten — eigener
   kleiner Auftrag samt neuem APK-Build.
2. **Doppelte Terminvorschlaege** sind weiterhin moeglich, wenn zwei Personen dasselbe Fenster
   vorschlagen (siehe E4).
3. **Fehlermeldungen** aus den RPCs erscheinen roh (`trip_not_collecting`), nicht uebersetzt.
4. **Playwright-E2E wurde nicht ausgefuehrt** — die Suite braucht einen Browser und den
   Service-Role-Key; die fachliche Abnahme lief stattdessen direkt gegen die oeffentliche API.
5. **`apps/web/src/app/`** ist weiterhin totes Scaffolding.
