# Best Practices aus dem Anchor-Projekt

Lessons Learned aus dem Bau der vertikalen Scheiben von „Der Trip, der endlich stattfindet"
(Stand: Scheibe 2, 2026-09-22), formuliert so, dass sie sich auf die noch offenen Scheiben 3
(Kosten) und 4 (Nudges) übertragen lassen. Projektübergreifende, rein technische Muster (Deploy,
Shell-Fallen, Debug-Reihenfolge) stehen zusätzlich in `homelab/HEIMAPPS-PLAYBOOK.md` — diese Datei
hier ist die vollständigere, projektbezogene Fassung inklusive der fachlichen Punkte.

Die Laufprotokolle je Scheibe (`docs/superpowers/NACHTLAUF-STATUS-*.md`) sind das Tagebuch; diese
Datei ist die Destillation daraus.

---

## Was gut gelaufen ist (weitermachen)

**Ein Zugriffsmodell, das keine Ausnahmen kennt.** RLS lässt keinen direkten Tabellenzugriff zu;
aller Zugriff läuft über `security definer`-RPCs, die die `trip_id` serverseitig aus der
`participant_id` ableiten. Der Client übergibt **nie** eine `trip_id`. Neue Tabellen bekommen
`enable row level security` ohne Policies — das ist Absicht, nicht ein vergessener Schritt. Weil
das Muster ausnahmslos gilt, ist bei jeder neuen Funktion sofort klar, wie sie auszusehen hat, und
ein Review kann gegen eine Regel prüfen statt gegen Geschmack. **Übertragbar:** Für Scheibe 3
(Kosten) und 4 (Nudges) unverändert fortsetzen.

**Jede Regel, die zählt, steht serverseitig — nicht nur im Client.** „Kein Startdatum in der
Vergangenheit" stand zunächst nur im Client und war per direktem RPC-Aufruf umgehbar. Seither gilt:
Wenn eine Regel Daten schützt, gehört sie in die RPC; die Clientprüfung ist Komfort, nicht
Absicherung. In Scheibe 2 hat dasselbe Argument den Statuscheck in `toggle_accommodation_vote`
erzwungen — sonst wären Stimmen nach der Kürung weitergelaufen und `vote_count` und
`chosen_accommodation` auseinandergedriftet.

**Fachlogik einmal in `packages/shared`, nie zweimal in den Oberflächen.** Gewinnerermittlung,
Fehlertext-Übersetzung, Preis-Parsing, ISO-Datumsumwandlung liegen dort, mit vitest. Zwei Gründe,
die sich beide bewährt haben: Web und Mobile können gar nicht auseinanderdriften, und alles, was
dort liegt, ist ohne Datenbank und ohne Gerät testbar — in `apps/mobile` gibt es kein Test-Setup.
**Regel für die Zukunft:** Sobald in einer Oberfläche eine Funktion entsteht, die rechnet statt
darzustellen, gehört sie in `packages/shared`, bevor die zweite Oberfläche gebaut wird — danach
kostet derselbe Umzug zwei Änderungen plus die Drift dazwischen.

**Web und Mobile Weg für Weg vergleichen, nicht „sieht vergleichbar aus".** Die fachliche
Gleichwertigkeit war schon in Scheibe 1b ein Reviewpunkt und ist es geblieben. Die produktivste
Frage im Schlussreview lautete: *welcher Weg im Browser hat in der App keine Entsprechung?* Genau
so wurden drei echte Unterschiede gefunden, die keine Einzelprüfung sehen konnte — die App wertete
RPC-Fehler aus, Web nicht; die App räumte den Fehlerzustand ab, Web nicht; die App rechnete „heute"
lokal, Web in UTC.

**Zwei Commits, wenn zwei Risiken drinstecken.** Die native Datumsauswahl (Task 4b) brachte ein
natives Modul mit und damit ein Build-Risiko, das die Unterkunfts-Kürung nicht hatte. Getrennt
committet heißt: scheitert der APK-Build am Modul, wird **ein** Commit zurückgerollt statt der
ganzen Scheibe. Der Reviewer hat die Trennbarkeit ausdrücklich geprüft (Hunks disjunkt).

---

## Was besser gemacht werden sollte (für Scheibe 3 gleich einplanen)

**Unwiderrufliche Aktionen brauchen ihre Absicherung im ersten Entwurf, nicht in Runde fünf.**
`choose_accommodation` hat kein Gegenstück — es gibt keinen RPC, der die Kürung zurücknimmt. Die
Absicherung gegen einen versehentlichen zweiten Klick hat über beide Oberflächen **fünf**
Nachbesserungsrunden gekostet, und jede Runde hat die vorige teilweise aufgehoben (Details im
Playbook unter „Eine Behebung kann eine fruehere aufheben"). **Regel für die Zukunft:** Bei jeder
Aktion ohne Rücknahme-RPC gleich beim Entwurf festlegen, wie der versehentliche Doppelauslöser
verhindert wird — und die Lösung **messen**, nicht herleiten. Für Scheibe 3 betrifft das
`delete_expense` und jedes „als bezahlt markieren".

**Die RPCs sind nicht idempotent — jedes absendende Formular braucht einen Guard.** Zweimal
Vorschlagen heißt zwei Zeilen, zweimal Abstimmen schaltet die Stimme wieder aus. Ein
`disabled={isSubmitting}` allein trägt nicht: beide Klick-Handler stammen aus demselben Render und
lesen denselben Closure-Wert. **Richtig ist ein `useRef`-Guard**, geprüft am Funktionskopf, im
`finally` zurückgesetzt. In Web hängt das an genau einer Stelle noch offen (`proposeDateOption`
nutzt State statt Ref) — beim nächsten Anfassen dieser Datei mitnehmen.

**Jede Statusprüfung gehört in dieselbe Transaktion wie das Schreiben.** Die Edge Function prüft
den Trip-Status einmal zu Beginn und schreibt bis zu zwölf Sekunden später — dazwischen kann der
Trip den Status wechseln. Die SQL-RPCs haben dieses Problem nicht, weil Prüfung und `update` in
einer Transaktion liegen. **Regel für die Zukunft:** Sobald zwischen Prüfung und Schreiben ein
Netzaufruf liegt, ist die Prüfung eine Momentaufnahme — entweder das Schreiben bedingt formulieren
(`where ... and status = ...`) oder das Zeitfenster bewusst in Kauf nehmen und hinschreiben.

**Serverseitige Abrufe fremder URLs sind ein Loch ins Heimnetz, wenn man sie nicht schließt.** Die
Edge Function holt eine vom Gast frei wählbare URL aus einem Container, aus dem `192.168.2.0/24`
und die Nachbarcontainer erreichbar sind. Der Plan nannte als Schutz nur „nur https, Größe
begrenzen, Weiterleitungen begrenzen" — das reicht nicht. **Regel für die Zukunft:** Sperre gegen
private, lokale und Link-Local-Bereiche **nach der Namensauflösung** und **nach jeder
Weiterleitung**, IPv4 und IPv6 inklusive der Formen, in denen IPv4 in IPv6 eingebettet auftritt
(NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, Teredo `2001::/32`). Eine Hostnamensprüfung genügt nicht:
ein öffentlicher Name darf auf eine interne Adresse zeigen. Umgesetzt über
`Deno.connect(geprüfte IP)` plus `Deno.startTls(echter Hostname)`, damit die Zertifikatsprüfung
intakt bleibt.

**Ein Zeitlimit, das fünf von sechs Phasen abdeckt, ist keins.** Dieselbe Funktion hatte eine
Gesamt-Deadline, die nur am Schleifenkopf geprüft wurde. Eine Gegenstelle, die alle fünf Sekunden
ein Byte schickt, hätte die Verbindung rechnerisch 19 Tage offen gehalten. **Regel für die
Zukunft:** Jede Phase — Namensauflösung, Verbindungsaufbau, TLS, Anfrage schreiben, Antwort lesen,
Weiterleitungskette — gegen **dieselbe absolute** Deadline minnen. Dann ist die Summe nicht
additiv, sondern durch das Gesamtlimit gedeckelt.

**Eine Spec, die niemand ausführen kann, ist Dokumentation.** Die Playwright-Suite dieses Projekts
war von Anfang an nicht lauffähig (`@playwright/test` stand nur als optionale Peer-Abhängigkeit
von `next` im Lockfile), und die Specs wurden vom Typecheck nie angesehen, weil `tsconfig.json`
sie ausschließt. Zwei Scheiben lang stand „E2E nicht ausgeführt" als offener Punkt, ohne dass
jemand merkte, dass es gar nicht ging. **Regel für die Zukunft:** Beim Anlegen einer Testart
sofort prüfen, ob sie an einer Pipeline hängt und mit einem einzigen Befehl startet. Ein Testtyp
ohne Aufrufweg verrottet still.

**Beim Löschen von Teilnehmern ist die Kaskade schon heute nicht sauber.**
`accommodation_options.added_by_participant_id` kaskadiert, `trips.chosen_accommodation_id` steht
auf `on delete set null`. Wird ein Teilnehmer gelöscht, verschwindet seine Option — und mit ihr
die Kürung, wortlos; der Trip bleibt auf `status = 'active'` ohne Unterkunft zurück, und beide
Oberflächen zeigen dann eine Liste ohne Handlungsmöglichkeit. Heute unerreichbar, weil es keinen
Lösch-RPC gibt. **Regel für die Zukunft:** Bevor in irgendeiner Scheibe ein Lösch-RPC für
Teilnehmer entsteht, diese Kette zuerst auflösen.

---

## Abnahme und Deploy (Rezept, das funktioniert hat)

1. **Sicherung zuerst**, und ihre Vollständigkeit prüfen — bei `pg_dump` über
   `grep -c "PostgreSQL database dump complete"`, nicht über die Dateigröße.
2. **Migration in einer Transaktion** mit `ON_ERROR_STOP=1`, vorher Prüfsumme gegen das Repo.
   Die Migrationen dieses Projekts sind bewusst **nicht** wiederholbar (kein `if not exists`) —
   sie dürfen genau einmal laufen.
3. **Jede neue Datenbankfunktion live aufrufen**, Erfolgs- **und** erwarteter Fehlerfall, über die
   **öffentliche API mit dem anon-Key** statt über `psql`. Das prüft die `grant`s gleich mit. In
   Scheibe 2 waren das 13 Aufrufe; sie haben bestätigt, was kein Typecheck sehen kann.
4. **Deploy-Tarball mit `git archive HEAD`**, Prüfsumme beidseitig, über das bestehende
   Verzeichnis entpacken (die `.env.production` liegt nur auf dem Server).
5. **Build-Log auf `Environments: .env.production`** prüfen, ohne `.env.local`.
6. **Abnahme über den Live-Link im echten Browser**, nicht nur über die API — und dabei die Dinge
   messen, die sich messen lassen (Pixelpositionen, Sperrzeiten) statt sie aus dem Code zu lesen.
7. **Testdaten löschen**, Bestand gegen den Stand davor vergleichen.

---

## Standing Rule

Wenn nach einer abgeschlossenen Scheibe eine weitere Erkenntnis anfällt — aus Nutzer-Feedback, aus
einem Review, aus einem Fehlschlag im Betrieb — wird sie nicht nur behoben, sondern hier als
Lesson Learned aufgenommen (Symptom, Regel für die Zukunft). Rein technische, projektunabhängige
Muster wandern zusätzlich in `homelab/HEIMAPPS-PLAYBOOK.md`. Ziel: dieselbe Fehlerklasse entsteht
in der nächsten Scheibe gar nicht erst.
