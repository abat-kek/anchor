# Anchor — Grobplan Scheiben 2, 3 und 4

**Datum:** 2026-09-21
**Status:** Grobplan zur Entscheidung — **noch kein ausdetaillierter Umsetzungsplan.**
**Basis:** [Roadmap](2026-08-23-anchor-v1-roadmap.md) §6, [Spec](../specs/2026-08-23-freundes-trip-app-design.md)

> Zweck dieses Dokuments: Vor der Umsetzung soll Kevin **einmal** eine Runde Entscheidungen
> treffen, statt bei jeder Scheibe neu gefragt zu werden. Jede Entscheidung steht unten in §5
> mit meiner Empfehlung und den verworfenen Alternativen. Danach werden die drei Scheiben
> einzeln nach dem Muster von Slice 1 und 1b ausdetailliert.

---

## 0. Ausgangslage (gemessen, nicht angenommen)

| Baustein | Zustand |
|---|---|
| `packages/shared/src/domain/voting.ts` | `tallyVotes`, `winningOption` vorhanden, 9 Tests gruen |
| `packages/shared/src/domain/balances.ts` | `computeBalances`, `simplifyDebts` vorhanden, 9 Tests gruen |
| `packages/shared/src/domain/nudge.ts` | `canSendNudge` (Frequenz-Capping) vorhanden, 10 Tests gruen |
| Datenbank | **Nur** der Termin-Teil existiert. Weder `accommodation_options`/`accommodation_votes` noch `expenses`/`expense_splits` noch `nudge_events` sind angelegt |
| `trips.status` | Das Enum kennt `accommodation`, `active`, `done` bereits — die Scheiben schalten nur weiter, kein Enum-Wechsel noetig |
| Zugriffsmodell | RLS haertet alles ab: kein direkter Tabellenzugriff, ausschliesslich `security definer`-RPCs, die `trip_id` serverseitig aus der `participant_id` ableiten. Jede neue Scheibe muss diesem Muster folgen |

Die Domain-Logik ist also fertig; was fehlt, ist jeweils Datenbank, RPCs und zwei Oberflaechen.

---

## 1. Scheibe 2 — Unterkunfts-Kuerung

**Ziel:** Teilnehmer droppen Unterkunfts-Links, die App zieht Titel/Bild/Preis, alle voten,
eine gewinnt.

**Datenbank (neue Migration):**

- `accommodation_options` — `id`, `trip_id`, `raw_url`, `parsed_title?`, `parsed_image_url?`,
  `parsed_price_cents?`, `parsed_currency?`, `affiliate_url?`, `added_by_participant_id`,
  `parse_status ('pending' | 'ok' | 'failed' | 'manual')`, `created_at`
- `accommodation_votes` — `id`, `option_id`, `participant_id`, eindeutig je Paar
- `trips` bekommt `chosen_accommodation_id?`

**RPCs (nach dem Muster aus 0003/0009):** `add_accommodation_option`, `set_accommodation_vote`,
`choose_accommodation`; `get_trip_state` wird um einen `accommodation`-Block erweitert.

**Edge Function `parse-accommodation`:** holt die Seite server-seitig, liest Open-Graph-Tags,
schreibt das Ergebnis zurueck. Faellt sie aus, bleibt `parse_status = 'failed'` und die
Oberflaeche bietet den manuellen Eingabepfad an — der ist laut Spec **gleichwertig**, kein
Notnagel.

**Risiko:** Airbnb und Booking liefern gegen Server-Anfragen oft kein oder irrefuehrendes
Open-Graph-Markup (Bot-Schutz). Der manuelle Pfad ist deshalb nicht Fallback, sondern
Hauptpfad-Kandidat — siehe Entscheidung E1.

**Aufwand grob:** 1 Migration, 4 RPCs, 1 Edge Function, 2 Oberflaechen, 1 E2E — etwa das
Anderthalbfache von Slice 1b.

---

## 2. Scheibe 3 — Kostenaufteilung

**Ziel:** Wer hat was bezahlt, wer schuldet wem; der Ausgleich passiert ausserhalb der App.

**Datenbank:**

- `expenses` — `id`, `trip_id`, `payer_participant_id`, `amount_cents`, `currency`,
  `description`, `created_at`
- `expense_splits` — `id`, `expense_id`, `participant_id`, `share_cents`
- Pflicht-Invariante: Summe der `share_cents` je Ausgabe = `amount_cents`. Diese Pruefung
  gehoert in die RPC, nicht in die Oberflaeche — dieselbe Lehre wie `start_in_past` in 0010.

**RPCs:** `add_expense` (Ausgabe und Aufteilung in **einer** Transaktion), `delete_expense`,
`get_trip_costs` (Ausgaben, Salden und Ausgleichsliste).

**Wo wird gerechnet?** `computeBalances`/`simplifyDebts` liegen als geprüfte TypeScript-Funktionen
vor. Entweder rechnet der Client — dann bleibt die Logik an einer Stelle — oder die Datenbank,
dann existiert sie zweimal. Siehe E4.

**Rundung:** Bei drei Personen und 10,00 EUR gehen 1000 Cent nicht glatt auf. Die Restcent-Regel
muss festgelegt werden — siehe E5.

**Aufwand grob:** vergleichbar mit Scheibe 2, ohne Edge Function, dafuer mit mehr Oberflaeche
(Ausgabe erfassen, Aufteilung waehlen, Salden, Settle-up).

---

## 3. Scheibe 4 — Nudge-Engine

**Ziel:** Die App meldet sich zum richtigen Moment, ohne zu nerven.

**Datenbank:** `nudge_events` — `id`, `group_id`, `trip_id?`, `type`, `recipient_participant_id`,
`channel ('push' | 'mail')`, `sent_at`. Diese Tabelle ist zugleich das Gedaechtnis fuer das
Frequenz-Capping.

**Ausloeser (v1, rein ereignisgetrieben):** Deadline naht, Termin gelockt, Unterkunft
entschieden, Trip vorbei. Der Idle-Nudge bleibt laut Spec v1.1.

**Technik:** Ein `pg_cron`-Job pro Viertelstunde sucht faellige Ereignisse — genau so laeuft
`run_auto_lock()` auf CT 113 bereits, das ist der erprobte Weg. Versand per Expo Push fuer
App-Nutzer; fuer Link-Gaeste ohne App braeuchte es einen Mail-Weg, und dafuer gibt es auf
CT 113 aktuell keinen Mailversand — siehe E7.

**Capping:** `canSendNudge` ist vorhanden. Die konkreten Werte (`minGapHours`, `maxPerWeek`)
sind noch nicht gesetzt — siehe E8.

**Aufwand grob:** die kleinste der drei Scheiben im Code, die groesste im Betrieb
(Push-Zustellung, Mailversand, Zustellbarkeit).

---

## 4. Reihenfolge

Scheibe 2 und 3 sind voneinander unabhaengig und koennten parallel laufen; Scheibe 4 setzt auf
beiden auf, weil sie deren Statuswechsel konsumiert. Empfehlung: **3 vor 2.** Die Kostenteilung
hat keinen Fremdsystem-Anteil — kein Bot-Schutz, kein Push-Dienst — und liefert damit den
sichersten naechsten Fortschritt; die Unterkunft traegt das groesste Risiko, an fremden
Webseiten zu scheitern.

---

## 5. Entscheidungen fuer Kevin

Jede Zeile ist so gestellt, dass ein Wort als Antwort reicht. Ohne Antwort nehme ich die
Empfehlung.

| Nr. | Frage | Meine Empfehlung | Alternative(n) |
|---|---|---|---|
| **E1** | Unterkunft: automatisches Metadaten-Parsen ueberhaupt bauen? | **Ja, aber als Zugabe** — zuerst der manuelle Pfad (Link, Titel, Preis von Hand), Parsing danach obendrauf. So haengt die Scheibe nicht am Bot-Schutz fremder Seiten | Parsing zuerst (schoener, aber die Scheibe kann daran scheitern); gar kein Parsing (dann ist „affiliate-ready" nur noch ein Feld) |
| **E2** | Voting-Modus | **Eine Stimme pro Person** — einfach und sofort verstaendlich | Mehrfachstimmen („alle, mit denen ich leben kann") — fairer bei vielen Optionen, aber erklaerungsbeduerftig |
| **E3** | Gleichstand beim Voting | **Aeltester Vorschlag gewinnt** — nachvollziehbar und ohne Zufall. `winningOption` hat heute **keine** definierte Regel und nimmt schlicht den ersten Treffer | Der Ersteller entscheidet; Stichwahl (mehr Runden, mehr Reibung) |
| **E4** | Wo werden Salden gerechnet? | **Im Client**, ueber die vorhandenen getesteten Funktionen — eine Quelle der Wahrheit | In SQL: ein Ergebnis fuer alle, aber die Logik existiert doppelt und faellt beim naechsten Aendern auseinander |
| **E5** | Restcent bei ungerader Teilung | **Der Zahler traegt den Rest** — unauffaellig, braucht keine Erklaerung | Reihum verteilen (gerechter, schwerer nachzuvollziehen); auf 5 Cent runden |
| **E6** | Settle-up-Weg | **PayPal.me-Deeplink plus „als bezahlt markieren"** | Nur IBAN anzeigen; gar kein Deeplink. In keinem Fall fliesst Geld durch die App |
| **E7** | Nudges an Link-Gaeste ohne App | **Vorerst nur Push, kein Mailversand** — Mail braucht SMTP-Zugang und eine Absender-Domain, die es auf CT 113 nicht gibt, und ist ein eigenes Vorhaben | Mail ueber einen externen Dienst (Aufwand plus laufende Abhaengigkeit); SMS (Kosten) |
| **E8** | Nudge-Frequenz | **Hoechstens 3 pro Woche und Person, mindestens 12 Stunden Abstand** | Strenger (1 pro Woche) — weniger wirksam; lockerer — der direkte Weg in die Deinstallation |
| **E9** | Reihenfolge | **Erst Kosten (3), dann Unterkunft (2), dann Nudges (4)** | Erst Unterkunft — naeher am Trip-Erlebnis, aber risikoreicher |
| **E10** | Creator-Auth | **Jetzt nachziehen, vor Scheibe 4** — `create_trip` laeuft bis heute anonym; ohne Konto gibt es keinen verlaesslichen Push-Empfaenger | Weiter anonym: schnell, aber die Nudges haengen in der Luft |
| **E11** | Web-Oberflaeche | **Zweckmaessig lassen** — die APK ist das Produkt, Web bleibt der Einstiegspfad fuer Gaeste | Web gestalterisch aufwerten (eigener Aufwand, siehe die Design-Regeln im Playbook) |

---

## 6. Was dieser Plan **nicht** ist

Er ersetzt keinen Umsetzungsplan. Jede Scheibe bekommt vor dem Bau ein eigenes Dokument mit
Tasks und Schritten, so wie Slice 1 und 1b — erst dann stehen SQL im Wortlaut, Testfaelle und
Abnahmekriterien fest.
