# Lauf 2026-09-21: Slice 2 — Unterkunfts-Kuerung (+ Task 4b native Datumsauswahl)

Fortschrittsdatei fuer den unbeaufsichtigten Lauf. Bei verdichtetem Kontext ist diese Datei
der Wiedereinstieg: zuerst hier lesen, dann `git log --oneline`, dann Plan.

- Plan: `docs/superpowers/plans/2026-09-21-anchor-slice-2-accommodation.md`
- Entscheidungen E1-E12: `docs/superpowers/plans/2026-09-21-scheiben-2-4-grobplan.md`
- Vorlauf: `docs/superpowers/NACHTLAUF-STATUS-SLICE-1B.md`
- Worktree: `.claude/worktrees/anchor-slice-2`, Branch `worktree-anchor-slice-2`
- SDD-Ledger (feinkoerniger): `.superpowers/sdd/2026-09-21-anchor-slice-2-accommodation/progress.md`

## Vorgaben des Nutzers

| Frage | Antwort |
|---|---|
| Vorgehen | Eigener Worktree, subagent-driven mit Review je Task, am Ende Merge nach master |
| Reviewtext | Der Reviewer bekommt den Plantext Zeichen fuer Zeichen wie der Implementierer — keine Kurzfassung |
| Code, Tests, Merge nach master | Ohne Rueckfrage freigegeben |
| APK-Build CT 116 | **Vorab freigegeben** (Kevin, 2026-09-21): Quellcode sync, `pct exec 116 -- bash /root/relaunch.sh`, Ergebnis pruefen. Umfang: ausschliesslich CT 116 und dortige Build-Artefakte. Danach Fingerprint gegen `5bb811da…8d7f` pruefen |
| Eingriff CT 113 | **NICHT vorab freigegeben.** Ein Warnblock, ein Ja. Vor der Migration `pg_dump` nach `/opt/anchor/backups/`; ist `pg_dump` nicht erreichbar, wird nicht deployt, sondern gemeldet |
| labs (CT 114) | Wird nicht angefasst |
| Offene Punkte unterwegs | Selbst entscheiden, weiterarbeiten, Entscheidung samt verworfener Alternativen hier festhalten |

## Die vier Fallen aus dem 1b-Lauf (Vorgabe des Nutzers, nicht zu wiederholen)

1. In jeder PL/pgSQL-Funktion mit `returns table(...)` **jede** Spaltenreferenz im Rumpf ueber
   einen Tabellen-Alias qualifizieren — sonst `column reference "id" is ambiguous`, und weder
   Typecheck noch Unit-Test noch Code-Review sehen das.
2. Jede neue Datenbankfunktion nach dem Einspielen **live aufrufen** — Erfolgsfall und ein
   erwarteter Fehlerfall — bevor der Deploy als fertig gilt.
3. Deploy-Tarball mit `git archive HEAD` bauen, nicht `tar .` aus dem Arbeitsverzeichnis.
   Kontrolle: Build-Log meldet `Environments: .env.production`, ohne `.env.local`.
4. Jedes absendende Formular braucht einen Guard gegen Doppelklick. Die RPCs sind nicht idempotent.

## Ausgangsbefund dieser Session

Ein Vorlauf hatte bereits begonnen: Worktree und SDD-Ledger existierten, **Task 1 abgeschlossen**
(Migration 0011 inkl. Nachbesserungsrunde), **Task 2 implementiert, aber das Review nicht mehr
protokolliert** — Review-Paket lag gebaut da, Ergebnis fehlte. Tasks 3-7 unberuehrt.
Selbst nachgemessen: `pnpm typecheck` 3/3 gruen, `pnpm test` 52/52 gruen.

**Nachtrag:** Dieser Lauf lief ueber drei Sitzungen. Zweimal endete eine Sitzung mitten in einem
Dispatch (einmal Task 4, einmal Task 6 am Nutzungslimit); beide Male hatte der abgebrochene
Agent nichts hinterlassen, und der Wiedereinstieg lief ueber `git log` und das SDD-Ledger, nicht
ueber Erinnerung. Einmal fehlte dadurch ein bereits dispatchtes, nie protokolliertes Nachreview
(Task 3, Runde 3) — es wurde nachgeholt, nicht unterstellt.

## Fortschritt

| Task | Inhalt | Ergebnis | Commits |
|---|---|---|---|
| 1 | Migration 0011: zwei Tabellen, drei RPCs, `get_trip_state` erweitert | abgeschlossen, Review sauber nach einer Runde | `672337f`, `a4c2a52` |
| 2 | `resolveAccommodationWinner` mit Gleichstandsregel E3 | abgeschlossen, Review nachgeholt, eine Runde | `1b03fb2`, `0a04fd9` |
| 3 | Web: vorschlagen, abstimmen, kueren | abgeschlossen nach **drei** Nachbesserungsrunden | `002cc4c`, `7e76fae`, `5595015`, `602bf12`, `63b18bb` |
| 4 | Mobile: dasselbe nativ | abgeschlossen nach zwei Runden | `89603d0`, `7714a3f`, `10c5525` |
| 4b | Native Datumsauswahl statt Texteingabe `JJJJ-MM-TT` | abgeschlossen, getrennt zurueckrollbar | `ec793c3`, `7389a71` |
| 5 | E2E-Spec **plus** Herstellung der Playwright-Lauffaehigkeit | abgeschlossen, Review ohne Befund | `549d58b` |
| 6 | Open-Graph-Parsing (Zugabe laut E1) | abgeschlossen nach zwei Runden, **nicht ausgerollt** | `404d07a`, `2a04d0b`, `996bea2` |
| — | Schlusspruefung ueber den ganzen Branch + Behebungswelle | abgeschlossen, Nachreview "Bereit" | `66109a7`, `e0f4085` |
| 7 | Ausrollen CT 113 (Warnblock faellig) + APK CT 116 | offen | — |

Stand der Pruefungen, zuletzt vom Reviewer selbst gefahren: `npx turbo run typecheck test --force`
5/5 Tasks gruen (der E2E-Typecheck ist neu dabei), 14 Testdateien, 150 Tests, ohne Browser und
ohne Datenbank; `npx turbo run lint` unveraendert bei genau den drei bekannten Altlasten aus der
Zeit vor dieser Scheibe.

## Was diese Scheibe an Fallen selbst gefunden hat

Die vier Vorgaben des Nutzers sind eingehalten. Darueber hinaus haben die Reviews Fehler
gefunden, die in keiner Einzelpruefung sichtbar waren:

- **Die Absicherung der Kuerung hat fuenf Anlaeufe gekostet**, ueber beide Oberflaechen hinweg,
  und **jedes Mal hat eine Behebung eine andere aufgehoben**. Web: Rueckfrage lag zu 93 % dort,
  wo der Finger war → additive Einblendung → dadurch auf dem Telefon ausserhalb des Sichtfelds
  → `scrollIntoView` → das zog die Karte wieder unter den Finger. App: 600-ms-Zeitpuffer →
  geometrischer Sperrrand → Karte lief in den Sperrrand hinein → geklammert. Am Ende sperrt Web
  zeitlich und die App geometrisch **und** zeitlich. Die Kuerung ist unwiderruflich, es gibt
  keinen Ruecknahme-RPC — deshalb der Aufwand.
- **Ein einziger fehlgeschlagener Statusabruf** haette die Web-Seite dauerhaft durch den
  Fehlerbildschirm ersetzt, obwohl der Poll weiterlief. Auf Mobilfunk der Normalfall. Die App
  machte es bereits richtig; das war eine halbfertige Aenderung, keine Zurueckstellung.
- **Die E2E-Specs schrieben mit dem Service-Role-Key echte Zeilen und loeschten nichts.** Es gibt
  keinen lokalen Supabase-Stapel — wer sie startet, schreibt in die Produktion. Jetzt mit
  fail-closed-Umgebungssperre und `afterEach`-Aufraeumen, fuer alle drei Specs.
- **Die Playwright-Suite war noch nie lauffaehig** (`@playwright/test` stand nur als optionale
  Peer-Abhaengigkeit von `next` im Lockfile) und die Specs wurden vom Typecheck nie angesehen.
  Beides behoben; `typecheck` laeuft jetzt mit fuenf statt vier Tasks.
- **Ein Beleg in einem Implementiererbericht war erfunden** (ein `verify_jwt`-Eintrag in
  `supabase/config.toml`, den es dort nicht gibt). Die Schlussfolgerung stimmte zufaellig. Der
  Beleg wurde gestrichen — nicht durchgewinkt.

## Entscheidungen, die ich selbst getroffen habe

Alle Rulings stehen ausfuehrlich im SDD-Ledger. Hier die, die ueber einen einzelnen Task
hinauswirken:

| Nr. | Entscheidung | Verworfene Alternativen |
|---|---|---|
| V1 | Die JSON-Gestalt des `accommodation`-Blocks in `get_trip_state` verbindlich festgelegt und jedem Implementierer woertlich mitgegeben | Jeden Task selbst entscheiden lassen: der Plan laesst die Gestalt als Prosa offen, drei Tasks haengen daran, jede Eigenerfindung bricht die andere Seite |
| V2 | Bei Namenskonflikt Grobplan gegen Umsetzungsplan gilt der **Umsetzungsplan** (`toggle_accommodation_vote`, Spalten `title`/`image_url`) | Grobplan-Namen: der Grobplan bezeichnet sich in §6 selbst als noch nicht ausdetailliert |
| V3 | Die deutschen Fehlertexte zu den RPC-Fehlercodes **einmal** nach `packages/shared`, gemeinsam fuer Web und Mobile | Je Oberflaeche eine eigene Tabelle: driftet auseinander, waehrend Task 4 fachliche Gleichwertigkeit fordert |
| T1-1 | `choose_accommodation` an `anon` freigegeben, mit begruendendem Kommentar in der Migration | Nur `authenticated` wie `lock_trip`: das Abnahmekriterium verlangt woertlich, dass ein **Gast ueber den Live-Link** kueren kann, und Gaeste haben nur den anon-Key |
| T5-1 | Task 5 stellt zusaetzlich die **Lauffaehigkeit** der Playwright-Suite her | Nur die Datei schreiben, wie der Plan sagt: eine Spec, die niemand ausfuehren kann, ist kein Test, sondern Dokumentation |
| T5-2 | Die Suite laeuft **nicht** gegen die Produktionsdatenbank, und der Service-Role-Key wird **nicht** auf die Entwicklungsmaschine geholt | Einmal laufen lassen fuer ein gruenes Ergebnis: der Schluessel umgeht RLS vollstaendig, und die Specs legen echte Zeilen an. Die Abnahme laeuft stattdessen ueber den oeffentlichen Weg, Join-Link und anon-Key, wie ein echter Gast |
| T6-1 | Task 6 **gebaut**, nicht abgebrochen | Abbruch nach der Abbruchbedingung des Plans: die greift nicht, weil von zwei Zielen eines brauchbare Tags liefert (gemessen) |
| T6-2 | **Sicherheitsauflage ueber den Plan hinaus**: Sperre gegen private, lokale und Link-Local-Adressen nach der Namensaufloesung und nach jeder Weiterleitung | Nur die Planvorgaben (https, Groesse, Weiterleitungen): die Funktion holt eine frei waehlbare URL aus einem Container, aus dem das Heimnetz erreichbar ist — das waere eine serverseitige Anfragefaelschung mit `labs` (CT 114) in Reichweite |
| T6-3 | Die Edge Function wird **nicht ausgerollt** und bekommt keinen Aufrufer | Scharfschalten: Task 7 des Plans nennt ihr Ausrollen an keiner Stelle, ihr Netzwerkteil ist nie gelaufen, und das Abnahmekriterium der Scheibe kennt das Parsen nicht |

## Offene Punkte

**Vor dem Scharfschalten von Task 6** (Edge Function) wieder auf den Tisch:

1. Vier Fragen sind nur an einem echten Lauf zu klaeren: ob `Deno.connect` ein IPv6-Literal ohne
   Klammern annimmt; ob `Deno.startTls` in der Supabase-Edge-Laufzeit verfuegbar und erlaubt ist
   (nicht nur in der Deno-CLI); ob der selbstgebaute HTTP/1.1-Client reale CDN-Antworten korrekt
   liest; ob die `og:`-Tags in den ersten 256 KiB liegen.
2. TOCTOU an zwei Stellen: Wiederholungssperre und Trip-Statuspruefung, letztere mit einem
   Zeitfenster ueber die Dauer des externen Abrufs.
3. Unterschiedliche Antwortcodes erlauben das Abzaehlen gueltiger Teilnehmer-IDs.
4. Ein einmaliger Netzfehler friert eine Option dauerhaft auf `failed`, ein Wiederholungspfad
   fehlt.
5. `open-graph.ts` importiert `'./price'` ohne `.ts`-Endung. Praezedenz traegt (`lock.ts` tut
   dasselbe und wird von der live laufenden `auto-lock` geladen), aber ungeprueft.
6. Booking liefert an serverseitige Abrufe nur eine Bot-Abwehrseite (gemessen: HTTP 202,
   3 962 Byte, leerer Titel, auf Startseite und Hotelseite bitgleich). Airbnb liefert Markup —
   gemessen allerdings nur an der **Startseite**, nicht an einer Listing-Seite.

**Vor dem ersten echten E2E-Lauf:** Umgebungssperre und Aufraeumen einmal gegen eine
Wegwerf-Instanz ausprobieren — beides ist nie gelaufen. Ausserdem ruft `termin-lock.spec.ts` die
Funktion `auto-lock` gegen die konfigurierte Instanz auf, und die laeuft ueber **alle** Trips mit
abgelaufener Deadline, nicht nur den Testtrip; das nimmt kein `afterEach` zurueck.

**Paritaetsluecke, vorbestehend:** `proposeDateOption` in `apps/web/app/trip/[id]/page.tsx` nutzt
`isProposing` als State statt als Ref — zwei Klicks im selben React-Batch lesen denselben
Closure-Wert. Die App loest genau das mit `isProposingRef`. Stammt aus `27fa301`, nicht aus
dieser Scheibe.

**Kleinkram, bewusst liegengelassen:** die 600 ms der Web-Zeitsperre sind gerechnet, nicht
gemessen; die E2E-Umgebungssperre prueft nicht zwingend dieselbe URL, die der `next dev`-Server
benutzt (`.env.local` liest Playwright nicht); `cleanupTrackedRows` wertet Loeschfehler nicht
aus; die drei Validierungstexte stehen an drei Orten; `my_votes` kommt ohne `order by`;
`scrollIntoView` fragt `prefers-reduced-motion` nicht ab; `pnpm lint` prueft nur `web`, die neuen
Dateien in `packages/shared` und `apps/mobile` wurden nie gelintet.

**Nicht geprueft, weil hier nicht pruefbar:** die Migration ist nie ausgefuehrt worden, die
E2E-Suite nie gelaufen, die Mobile-Oberflaeche nie auf einem Geraet oder Emulator gesehen, die
Edge Function nie gestartet. Das Lesen war jeweils die einzige Pruefung.

## Task 7: Ausrollen — durchgefuehrt am 2026-09-22 (Freigabe Kevin, ein Ja auf einen Warnblock)

### Was gelaufen ist

| Schritt | Ergebnis (selbst gemessen) |
|---|---|
| Sicherung DB | `/opt/anchor/backups/vor-slice2-20260922-064937.sql`, 718 098 Bytes, 242 `CREATE`-Statements, Abschlusszeile `PostgreSQL database dump complete` vorhanden, Rechte 600 |
| Sicherung Web | `/opt/anchor/app.vor-slice2-20260922-065500`, 1,1 GB; danach 5,2 GB frei |
| Migration 0011 | Pruefsumme gegen das Repo identisch (`7c7288bb…`), eingespielt in **einer** Transaktion mit `ON_ERROR_STOP=1`, Exitcode 0 |
| Web-Deploy | Tarball aus `git archive HEAD` (847 721 Bytes, 190 Dateien, **keine** env-Datei, kein `node_modules`, kein `.next`), Pruefsumme nach der Uebertragung identisch |
| Build-Log | meldet `- Environments: .env.production` **ohne** `.env.local` — die Falle aus dem 1b-Lauf ist damit geschlossen |
| `.env.production` | unveraendert stehengeblieben (Zeitstempel vom 21.09.), weil im Repo keine env-Datei getrackt ist (`apps/web/.gitignore` ignoriert `.env*`) |
| Ausgeliefertes Bundle | kein Treffer auf `127.0.0.1:54321` in `.next/static/` oder `.next/server/`; die Treffer aus einem ersten, zu breiten grep lagen ausschliesslich im Turbopack-**Cache** und werden nicht ausgeliefert |
| Dienst | `anchor-web.service` neu gestartet, `active` |
| Erreichbarkeit | `https://anchor.kek95.duckdns.org/` = 200, `/trip/<id>` = 200, `https://anchor-api.kek95.duckdns.org/rest/v1/` = 401 ohne Schluessel (erwartet) |

### Die drei neuen Datenbankfunktionen, live aufgerufen

Ueber die **oeffentliche API** mit dem anon-Key, also genau auf dem Weg eines Gastes. 13 Aufrufe,
Erfolgs- **und** Fehlerfaelle:

| # | Aufruf | Ergebnis |
|---|---|---|
| 1 | `add_accommodation_option` x2 | HTTP 200, Trip springt von `locked` auf `accommodation` |
| 2 | dito, kaputte URL | HTTP 400 `url_invalid` |
| 3 | dito, leerer Titel | HTTP 400 `title_required` |
| 4 | `toggle_accommodation_vote` x4 | HTTP 200 `is_voted:true`, Stimmen 2 und 2 |
| 5 | dito, zweites Mal | HTTP 200 `is_voted:false`, Stimmen 2 und 1 |
| 6 | dito, Teilnehmer aus **fremdem** Trip | HTTP 400 `option_not_in_trip` |
| 7 | `get_trip_state` | `accommodation`-Block mit genau den neun festgelegten Feldern, `vote_count` und `my_votes` korrekt |
| 8 | `choose_accommodation`, fremder Teilnehmer | HTTP 400 `option_not_in_trip` |
| 9 | `choose_accommodation` | HTTP 204, Trip auf `active`, `chosen_accommodation_id` stimmt |
| 10 | zweite Kuerung | HTTP 400 `trip_not_in_accommodation_phase` |
| 11 | Stimme nach der Kuerung | HTTP 400 `trip_not_in_accommodation_phase` |
| 12 | Vorschlag nach der Kuerung | HTTP 400 `trip_not_in_accommodation_phase` |
| 13 | `get_trip_state` aus Sicht des zweiten Gastes | `chosen_accommodation` gesetzt, `my_votes` korrekt |

**Erster Anlauf war unbrauchbar**, und zwar wegen eines Fehlers in meinem Pruefskript, nicht in
der Datenbank: `psql -Atc` haengt an ein `insert ... returning` noch die Statuszeile `INSERT 0 1`,
die in der Variablen landete und jeden Folgeaufruf zerschoss. Behoben mit `-q` und `head -1`,
Teildaten geloescht, Lauf wiederholt.

### Abnahme ueber den Live-Link (`anchor.kek95.duckdns.org`, echter Browser)

Beitreten → zwei Unterkuenfte vorschlagen → beide billigen → eine Stimme zuruecknehmen →
kueren → Gegenprobe in der Datenbank (`status=active`, `chosen_accommodation_id` zeigt auf
"Stadthotel Mitte", 1 Stimme). Vollstaendig durchgelaufen.

Zwei Beobachtungen aus dem laufenden System:

- **Die Gleichstandsregel E3 arbeitet sichtbar.** Bei 1:1 markierte der Stern den **aelteren**
  Vorschlag; nach dem Zuruecknehmen der Stimme wanderte er korrekt zum fuehrenden.
- **Die Zeitsperre der Kuerung wurde erstmals gemessen statt gerechnet.** Der "Ja"-Knopf liegt
  nach dem Einblenden der Rueckfrage bei y 369-415 — also **genau dort**, wo der Finger den
  Ausloeser bei y 384 getroffen hat. Die Geometrie schuetzt auf Web also tatsaechlich nicht, der
  Befund der Schlusspruefung war richtig. Gemessen in einem Durchgang: bei 0 ms, 150 ms und
  450 ms **gesperrt**, erst bei 850 ms scharf. Das Doppelklick-Fenster von 100-250 ms liegt
  vollstaendig darin.

### APK-Build auf CT 116

| Pruefung | Ergebnis |
|---|---|
| Quellcode | derselbe `git archive HEAD`-Tarball wie fuer Web, Pruefsumme nach Uebertragung identisch |
| Natives Modul | `@react-native-community/datetimepicker` 9.1.0 kompiliert, `:react-native-community_datetimepicker:assembleRelease` durchgelaufen — das war der Risikopunkt von Task 4b |
| Artefakt | `anchor-20260922-0458.apk`, **42 606 255 Bytes** (Vorgaenger 42 422 591 — rund 184 KB mehr, passt zum neuen Modul) |
| Fingerprint | `5bb811da8d014f0c2cf40e4ea2c61dc5aa6424c73af83751b552b4af0d4a8d7f` — deckt sich mit dem dokumentierten stabilen Keystore, also **Update ohne Deinstallation** |
| Download | `http://192.168.2.190:8080/anchor/anchor-latest.apk` = HTTP 200, 42 606 255 Bytes, ZIP-Kopf korrekt |

### Testdaten

Alle in diesem Lauf angelegten Zeilen geloescht. Bestand danach: **12 Trips** (unveraendert
gegenueber dem Stand vor dem Deploy), 0 Unterkunfts-Optionen, 0 Stimmen, keine Abnahme-Gruppen.

### Was der Deploy nicht abgedeckt hat

- Die Edge Function `parse-accommodation` ist **nicht** ausgerollt. Task 7 des Plans nennt sie
  nicht, und ihr Netzwerkteil ist nie gelaufen. Kevin hat zu Recht angemerkt, dass sich das nicht
  testen laesst, ohne sie auszurollen — meine urspruengliche Begruendung war insofern zirkulaer.
  Richtig getrennt gehoert: **ausrollen und live pruefen** einerseits, **in die Oberflaeche
  anbinden** andererseits. Das Ausrollen liegt ausserhalb der erteilten Freigabe und wird
  einzeln nachgefragt.
- Die Mobile-Oberflaeche ist auf **keinem Geraet** gesehen worden. Die APK ist gebaut und
  signiert; ob die native Datumsauswahl und die Kuer-Rueckfrage sich auf einem Telefon so
  verhalten wie gedacht, steht aus.
- Die Playwright-Suite ist weiterhin nie gelaufen.
