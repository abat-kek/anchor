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

