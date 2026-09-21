# Prompt fuer die naechste Session — Anchor Scheibe 2 (Unterkunfts-Kuerung)

Alles zwischen den Linien in eine neue Claude-Code-Session einfuegen, Arbeitsverzeichnis
`C:\Users\KEK\Documents\Claude_Projekte\Privat\Idee`.

---

Bau Scheibe 2 von Anchor: die Unterkunfts-Kuerung.

**Der Plan liegt fertig vor** — `docs/superpowers/plans/2026-09-21-anchor-slice-2-accommodation.md`,
acht Tasks, SQL im Wortlaut. Task 4b laeuft mit: die native Datumsauswahl in der App ersetzt
die heutige Texteingabe `JJJJ-MM-TT`. Sie ist bewusst hier gebuendelt, weil sie denselben
APK-Build braucht wie Scheibe 2. Die zugehoerigen Produktentscheidungen (E1–E12) sind alle
getroffen und stehen in `docs/superpowers/plans/2026-09-21-scheiben-2-4-grobplan.md`; du musst
sie nicht neu aufmachen. Lies beide, bevor du anfaengst, dazu
`docs/superpowers/NACHTLAUF-STATUS-SLICE-1B.md` fuer den aktuellen Stand.

**Vorgehen:** eigener Git-Worktree, subagent-driven mit Review je Task, am Ende Merge nach
`master`. Der Reviewer bekommt den Plantext Zeichen fuer Zeichen so, wie ihn der Implementierer
bekommen hat — keine eigene Kurzfassung.

**Diese vier Dinge sind in der letzten Nacht real schiefgegangen, mach sie nicht nochmal:**

1. In jeder PL/pgSQL-Funktion mit `returns table(...)` **jede** Spaltenreferenz im Rumpf ueber
   einen Tabellen-Alias qualifizieren. Sonst: `column reference "id" is ambiguous`, und weder
   Typecheck noch Unit-Test noch Code-Review sehen das — die Funktion ist schlicht nie
   aufrufbar.
2. Jede neue Datenbankfunktion nach dem Einspielen **live aufrufen**, Erfolgsfall und ein
   erwarteter Fehlerfall, bevor der Deploy als fertig gilt.
3. Den Deploy-Tarball mit `git archive HEAD` bauen, nicht mit `tar .` aus dem
   Arbeitsverzeichnis — sonst reist die git-ignorierte `apps/web/.env.local` mit und
   ueberschreibt auf dem Server die Produktionskonfiguration. Kontrolle: das Build-Log muss
   `Environments: .env.production` melden, ohne `.env.local`.
4. Jedes absendende Formular braucht einen Guard gegen Doppelklick. Die RPCs sind nicht
   idempotent.

**Infrastruktur:** Backend und Web laufen auf LXC 113 (`192.168.2.180`), der Android-Build auf
LXC 116. Zugriff ueber `ssh root@192.168.2.90 "pct exec 113 -- <befehl>"`. Details in
`C:\Users\KEK\Documents\homelab\HOMELAB.md`, wiederverwendbare Muster in
`HEIMAPPS-PLAYBOOK.md`. **`labs` (LXC 114) gehoert anderen Apps und wird nicht angefasst.**

**Freigaben:**

- Code, Tests und Merge nach `master` laufen ohne Rueckfrage durch.
- **Der APK-Build auf CT 116 ist vorab freigegeben** (Kevin, 2026-09-21): Quellcode
  synchronisieren, `pct exec 116 -- bash /root/relaunch.sh`, Ergebnis pruefen — ohne erneut zu
  fragen. Umfang dieser Freigabe: ausschliesslich CT 116 und die dortigen Build-Artefakte.
  Danach den Fingerprint gegen `5bb811da…8d7f` pruefen und melden.
- **Der Eingriff auf CT 113 ist NICHT vorab freigegeben.** Migration einspielen, Web neu bauen
  und Dienst neu starten: dafuer legst du **einen** Warnblock vor und wartest **ein** Ja ab —
  nicht je Schritt einzeln fragen. Vor der Migration ein `pg_dump` nach `/opt/anchor/backups/`
  ziehen; ist `pg_dump` nicht erreichbar, wird nicht deployt, sondern gemeldet.

**Wenn unterwegs etwas offen ist:** entscheide es selbst, arbeite weiter und halte die
Entscheidung samt verworfener Alternativen in einer Fortschrittsdatei
`docs/superpowers/NACHTLAUF-STATUS-SLICE-2.md` fest — nach dem Muster der Slice-1b-Datei.

**Fertig ist die Scheibe, wenn:** ein Gast ueber den Live-Link zwei Unterkuenfte vorschlagen,
beide billigen, eine Stimme zuruecknehmen und eine Unterkunft kueren kann — nachgemessen gegen
`anchor.kek95.duckdns.org`, nicht nur lokal — und eine neue, signierte APK mit Fingerprint
`5bb811da…8d7f` unter `http://192.168.2.190:8080/anchor/anchor-latest.apk` liegt.

---

## Hinweise fuer Kevin (nicht Teil des Prompts)

- Task 6 (Open-Graph-Parsing) beginnt mit einer Messung: Liefern Airbnb und Booking gegen
  CT 113 ueberhaupt brauchbare Tags? Falls nein, endet der Task dort — der manuelle Pfad ist
  bereits vollwertig. Das ist so gewollt, kein Abbruch.
- Die native Datumsauswahl steckt jetzt als Task 4b im Slice-2-Plan. Scheitert der APK-Build an
  dem neuen nativen Modul, rollt die Session genau diesen einen Commit zurueck und liefert
  Scheibe 2 ohne ihn aus — die Unterkunfts-Kuerung haengt nicht an der Datumsauswahl.
