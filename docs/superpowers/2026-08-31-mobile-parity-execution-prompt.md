# Prompt für neue Session: Mobile-Parität + Release-Signing umsetzen

Kopiere den folgenden Block als erste Nachricht in eine neue Claude-Code-Session (im selben
Projektverzeichnis, damit Projekt-Memory geladen wird).

---

Setze die vier Implementierungspläne aus `docs/superpowers/plans/` um:

1. `2026-08-31-mobile-trip-detail-availability.md`
2. `2026-08-31-mobile-trip-list-home.md`
3. `2026-08-31-ct116-release-keystore.md`
4. `2026-08-31-mobile-join-flow-applinks.md`

Zugrundeliegende Spec: `docs/superpowers/specs/2026-08-31-mobile-parity-und-release-signing-design.md`.

**Vorgehen:** superpowers:subagent-driven-development — pro Task ein frischer Subagent, danach
zweistufiges Review (Spec-Compliance, dann Code-Qualität). Vorher superpowers:using-git-worktrees
nutzen (Ausführung nicht direkt auf `master`, wie im Repo bisher üblich).

**Reihenfolge der vier Pläne:**
1. Plan 3 (Release-Keystore, CT 116) zuerst — unabhängig, schafft die Grundlage für Plan 4/D2.
2. Plan 1 (Mobile-Trip-Detail) und Plan 2 (Trip-Liste) — unabhängig voneinander und von 3/4,
   Reihenfolge egal. Trotzdem wie von subagent-driven-development vorgeschrieben nacheinander
   dispatchen, nie parallel.
3. Plan 4, Teil D1 (Join-Screen) — unabhängig, kann vor oder nach 1/2 laufen.
4. Plan 4, Teil D2 (Android App Links) — erst nachdem Plan 3 abgeschlossen ist (braucht den dort
   ermittelten SHA-256-Fingerprint als Eingabe für den `assetlinks.json`-Task).

**Modellwahl pro Task** (Kriterien direkt aus superpowers:subagent-driven-development
Model-Selection-Abschnitt, hier auf die konkreten Tasks angewendet):

| Task | Charakter | Modell |
|---|---|---|
| Plan 1 (alle Tasks), Plan 2 Task 1 (`listTripIds`), Plan 4 D1 Task 1 (Join-Screen) | mechanisch, 1–2 Dateien, Spec zeigt kompletten Code | `haiku` |
| Plan 2 Task 2 (Startseite: Datenfluss aus mehreren Async-Aufrufen + Liste + Navigation) | Integration/Koordination mehrerer Aufrufe | `sonnet` |
| Plan 3 (alle Tasks: Keystore erzeugen, Gradle-Block anhängen, Build auslösen, Fingerprint-Abgleich) | Infrastruktur, Fehlerfolgen bei falscher Ausführung schwer rückgängig zu machen, erfordert Sorgfalt bei Secrets-Handling | `opus` |
| Plan 4 D2 (`intentFilters`, `assetlinks.json`, Manifest-Verifikation) | mehrere Systeme (App-Config + Web-Deploy + Android-Verifikationslogik) müssen konsistent zusammenpassen | `sonnet` |
| Spec-Compliance-Reviewer (alle Tasks) | Abgleich Code ↔ Spec, Detailarbeit | `sonnet` |
| Code-Quality-Reviewer (alle Tasks) | tiefere Beurteilung, insbesondere bei Plan 3 (Secrets-Handling, Gradle-Robustheit) | `opus` |
| Finaler Gesamt-Review nach allen vier Plänen | größter Kontext, höchste Verantwortung | `opus` |

**Wichtige Abweichung von der Standard-„Continuous execution ohne Rückfragen"-Regel des Skills:**
Plan 3 verändert echte, produktiv genutzte Homelab-Infrastruktur (CT 116 via SSH,
`root@192.168.2.90`, siehe Memory `homelab-infrastructure`) — Keystore erzeugen, `build.sh`
patchen, zwei echte Builds auslösen. Das ist umkehrbar (Backups/keine Zerstörung bestehender
Artefakte), aber wirkt nach außen. Vor dem ersten schreibenden Schritt in Plan 3 **einmal** beim
Nutzer nachfragen/ansagen, dann ohne weitere Rückfrage durchziehen — genau wie in der Session, in
der dieser Plan entstand, bereits mit dem `.env.local`-Fix auf CT 113 gehandhabt. Für Plan 4/D2
gilt dasselbe für den Schritt, der `assetlinks.json` direkt auf die laufende CT-113-Instanz
schreibt (Task 3, Step 3 in Plan 4).

**Bekannte Lücke, die keiner der vier Pläne selbst abdeckt:** Bevor ein CT-116-Build den Code aus
Plan 1/2/4-D1 wiedergeben kann, muss der geänderte Mobile-Quellcode per Tarball nach
`/opt/build/anchor` übertragen werden (Deploy-Pattern aus `HEIMAPPS-PLAYBOOK.md`, Abschnitt
„Deploy-Pattern: Node/Vite-App auf LXC via Docker Compose" — analog anzuwenden, auch wenn das
Anchor-Mobile-Setup kein Docker-Compose nutzt, nur der Tarball-Transfer-Teil ist relevant). Das ist
kein separater Plan-Task, sondern ein Schritt, den der Controller (du) selbst zwischen „Plan 1/2/4-D1
fertig" und „Plan 4 Task 4 (Build+Verifikation)" einschieben muss.

**Nach Abschluss aller vier Pläne:** finalen Code-Reviewer über die gesamte Änderung dispatchen,
danach superpowers:finishing-a-development-branch.
