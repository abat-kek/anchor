# Mobile-App-Parität + stabiler Release-Keystore — Design

**Datum:** 2026-08-31
**Kontext:** Nach dem Fix des Web-Join-Bugs (siehe Projekt-Memory `freundes-trip-app.md`) zeigte
sich beim Testen der Mobile-App (APK von `apk.kek.de`, gebaut auf CT 116), dass die App der
Web-Version in mehreren Punkten hinterherhinkt und Release-Builds instabil signiert sind
(wiederkehrende Play-Protect-Warnung). Dieses Dokument bündelt vier Arbeitspakete, die zusammen
volle Funktionsparität zwischen Mobile-App und Web-App herstellen sowie den APK-Build reparieren.

## Ziel

Die Mobile-App soll nach Abschluss:
- Trips anlegen **und** ihnen beitreten können, ohne den Browser zu verlassen.
- Auf der Trip-Detailseite dieselbe Funktionalität wie die Web-Seite bieten (Verfügbarkeit setzen,
  Zusage geben/zurückziehen).
- Bereits angelegte/beigetretene Trips nach einem App-Neustart wiederfinden.
- Release-Builds mit einer stabilen, wiedererkennbaren Signatur ausliefern.

## Nicht-Ziele (bewusst außerhalb dieses Scopes)

- iOS-Signierung/App-Links (`apple-app-site-association`) — Zielplattform ist aktuell nur Android
  (Sideload-APK).
- UI für `lock_trip` (manuelles Locken durch den Creator) — die Funktion existiert als RPC, wird
  aber aktuell weder auf Web noch Mobile bedient (Auto-Lock läuft ausschließlich über `pg_cron`).
  Kein Teil dieses Designs; separat zu bewerten, falls gewünscht.
- GitHub-Actions-Workflow (`android-apk.yml`) — bewusst ausgeklammert, da `apk.kek.de` (CT 116) die
  tatsächlich genutzte Build-Quelle ist.

## A) Mobile-Trip-Detail-UI (Verfügbarkeit + Zusage)

**Betroffene Datei:** `apps/mobile/app/trip/[id].tsx`

**Ist-Zustand:** Zeigt nur `{committed_count}/{total_participants} dabei` bzw. den gelockten
Termin an. Kein Weg, die eigene Verfügbarkeit zu setzen oder zuzusagen.

**Soll-Zustand (Parität mit `apps/web/app/trip/[id]/page.tsx`):**
- `TripState`-Interface um `options: {id, start_date, end_date}[]` und
  `me: {is_committed, availabilities: {date_option_id, availability}[]}` erweitern (beides liefert
  `get_trip_state` bereits, wird im Mobile-Code aktuell nur nicht ausgewertet).
- Pro Terminoption drei Buttons (Ja/Vielleicht/Nein), `React Native`-Pressables mit `StyleSheet`
  analog zum bestehenden Dark-Theme. Tap → `supabase.rpc('set_availability', {p_participant_id,
  p_date_option_id, p_availability})` → `refresh()`.
- Ein Zusage-Toggle-Button („Ich bin dabei" / „Zusage zurückziehen") → `supabase.rpc(
  'set_commitment', {p_participant_id, p_is_committed})` → `refresh()`.
- Ist `status === 'locked'`, werden alle interaktiven Elemente deaktiviert (`disabled`), wie auf
  Web.
- Fehler bei einem einzelnen RPC-Call (z. B. Netzwerkfehler beim Setzen der Verfügbarkeit) werden
  nicht-blockierend angezeigt (kleiner Fehlertext unter dem betroffenen Element), nicht als
  Vollbild-Fehler wie aktuell bei `get_trip_state`-Fehlern.

**Datenfluss:** unverändert (Polling alle 4s über `get_trip_state`), nur um die neuen
Schreib-RPCs ergänzt.

## B) Trip-Liste auf der Startseite

**Betroffene Dateien:** `apps/mobile/app/index.tsx`, `apps/mobile/src/lib/participant-store.ts`

**Ist-Zustand:** `index.tsx` ist eine statische Seite mit nur einem „Neuer Trip anlegen"-Button.
`participant-store.ts` speichert zwar pro Trip-ID eine `participant_id` in AsyncStorage
(`anchor:participant:<tripId>`), aber nichts liest diese Einträge aus, um eine Liste zu bilden.

**Soll-Zustand:**
- `participant-store.ts`: neue Funktion `listTripIds(): Promise<string[]>` —
  `AsyncStorage.getAllKeys()`, gefiltert auf den Präfix `anchor:participant:`, Trip-ID extrahiert.
- `index.tsx`: bei Mount **und** bei jedem `useFocusEffect` (Rückkehr von einem anderen Screen)
  `listTripIds()` aufrufen, pro Trip-ID `get_trip_state(participant_id)` abfragen (Datenquelle:
  immer frisch aus der DB, kein lokales Caching von Titel/Status — siehe Entscheidung im
  Brainstorming) und als Liste antippbarer Karten (Titel, `committed_count/total_participants`
  oder „🎉 Termin steht") oberhalb des bestehenden CTA-Buttons rendern.
- Tap auf eine Karte → `router.push('/trip/' + tripId)`.
- Schlägt eine einzelne `get_trip_state`-Abfrage fehl (z. B. Trip serverseitig gelöscht), wird nur
  diese Karte übersprungen, nicht die ganze Liste blockiert.
- Leerer Zustand (keine gespeicherten Trip-IDs): aktuelles Layout bleibt wie es ist.

## C) Stabiler Release-Keystore für CT 116

**Betroffene Datei:** `/root/build.sh` auf CT 116 (außerhalb dieses Repos, homelab-verwaltet).

**Verifizierter Ist-Zustand** (`android/app/build.gradle:112-115` nach `expo prebuild`):
```gradle
release {
    // Caution! In production, you need to generate your own keystore file.
    // see https://reactnative.dev/docs/signed-apk-android.
    signingConfig signingConfigs.debug
```
Release-Builds werden mit dem Debug-Keystore signiert (`signingConfigs.debug`, Store-Datei
`debug.keystore`, feste Alias/Passwort `androiddebugkey`/`android`). Dieser wird bei jedem
`expo prebuild`-Lauf neu erzeugt, da `android/` komplett verworfen und neu generiert wird
(bereits bekannter Fix-Eintrag in `HOMELAB.md` zu CT 116). Vermuteter, nicht abschließend
verifizierter Mechanismus: jede Neuerzeugung liefert einen neuen zufälligen Fingerprint → Android
und Play Protect behandeln jede APK als „nie zuvor gesehen".

**Soll-Zustand:**
1. Einmalig per `keytool -genkeypair` einen Release-Keystore erzeugen (RSA 2048, Gültigkeit
   ~25 Jahre), abgelegt außerhalb des per Tarball überschriebenen Quellverzeichnisses:
   `/opt/build/keys/anchor-release.keystore` (chmod 600). Store-/Key-Passwort und Alias in einer
   separaten `/opt/build/keys/anchor-release.env` (chmod 600), analog zum bestehenden
   `anchor-keys.txt`-Muster für Secrets in diesem Homelab.
2. `build.sh` erweitern: nach dem `expo prebuild`-Schritt (der `android/app/build.gradle` jedes
   Mal frisch generiert) die Datei per `sed` patchen —
   - einen `release {}`-Block innerhalb von `signingConfigs {}` einfügen, der `storeFile`,
     `storePassword`, `keyAlias`, `keyPassword` aus Umgebungsvariablen liest
     (`System.getenv('RELEASE_STORE_PASSWORD')` etc.) statt Klartext-Passwörter in die generierte,
     bei jedem Build neu erzeugte Datei zu schreiben.
   - `signingConfig signingConfigs.debug` innerhalb des `release`-`buildTypes`-Blocks (aktuell
     Zeile 115) auf `signingConfig signingConfigs.release` ändern.
   - `build.sh` lädt vorher `source /opt/build/keys/anchor-release.env`, um die Umgebungsvariablen
     für den Gradle-Prozess bereitzustellen.
3. Nach jedem Build (durch mich, als Verifikationsschritt, nicht nur behauptet): Fingerprint des
   signierten APKs (`apksigner verify --print-certs` oder `keytool -printcert -jarfile`) gegen den
   Fingerprint des persistenten Keystores (`keytool -list -keystore ...`) abgleichen — muss
   übereinstimmen und über zwei aufeinanderfolgende Builds identisch bleiben.

**Wichtige Nebenwirkung (an den Nutzer zu kommunizieren):** Bereits installierte APKs (debug-signiert)
lassen sich nicht auf eine release-signierte Version updaten — Android verweigert das
(„conflicting package"/Signaturkonflikt). Einmalige Deinstallation vor dem nächsten Update nötig.

## D) Nativer Join-Screen + Android App Links

**Abhängigkeit:** setzt (C) voraus — App-Links-Verifikation braucht den stabilen Fingerprint des
Release-Zertifikats. Reihenfolge: **C vor D.**

**D1 — Join-Screen in der App** (neue Datei `apps/mobile/app/join/[token].tsx`, Route in
`_layout.tsx` registrieren): funktional identisch zu `apps/web/app/join/[token]/page.tsx` —
Namensfeld, „Beitreten"-Button, `supabase.rpc('join_trip_via_token', {p_token, p_display_name})`,
bei Erfolg `saveParticipant(trip_id, participant_id)` (Mobile-`participant-store.ts`) und
`router.push('/trip/' + trip_id)`. Bei Fehler: Fehlertext anzeigen (keine pauschale
„Link ungültig"-Meldung ohne Unterscheidung — siehe Lehre aus dem Web-Bugfix; nach Möglichkeit
zwischen Netzwerkfehler und tatsächlich ungültigem Token unterscheiden).

**D2 — Android App Links**, damit ein getippter `https://anchor.kek95.duckdns.org/join/...`-Link
direkt die App statt den Browser öffnet:
- `app.json`: `android.intentFilters` mit `autoVerify: true` für Host `anchor.kek95.duckdns.org`,
  Pfadmuster `/join/*` (und optional `/trip/*` für spätere Nutzung).
- Statische Datei `https://anchor.kek95.duckdns.org/.well-known/assetlinks.json` (gehostet über
  Caddy auf CT 111, `apps/web`-Verzeichnis oder eigener Caddy-Static-Block) mit dem
  SHA-256-Fingerprint des Release-Signing-Zertifikats aus (C) und `package_name: de.anchor.app`.
- Ist die App nicht installiert oder schlägt die Verifikation fehl, fällt Android automatisch auf
  den Browser zurück (Betriebssystem-Standardverhalten, kein zusätzlicher Code nötig).

**Datenfluss D:** unverändert gegenüber Web-Join — derselbe RPC, derselbe Server, nur der Client
wechselt (App statt Next.js-Client).

## Reihenfolge / Abhängigkeiten

1. **C** (Release-Keystore) — Grundlage für D2, unabhängig von A/B.
2. **A** und **B** — unabhängig voneinander und von C/D, können parallel oder in beliebiger
   Reihenfolge umgesetzt werden.
3. **D1** (Join-Screen) — unabhängig von C, kann parallel zu A/B laufen.
4. **D2** (App Links) — erst nach C, da der Fingerprint gebraucht wird.

## Testing & Verifikation

- **Web-seitige RPCs** (`set_availability`, `set_commitment`, `join_trip_via_token`) sind bereits
  production-verifiziert (Web-Bugfix-Session) — für A/B/D1 wird nur der Client geändert, kein
  neuer Server-Code.
- **Kein RN-Test-Setup im Repo** (kein Jest/RN-Testing-Library gefunden). Verifikation von A, B, D1
  läuft über einen neuen CT-116-Build zum manuellen Sideload-Test — kann nicht durch mich
  automatisiert bestätigt werden.
- **C** wird durch mich per SSH auf CT 116 verifiziert (Fingerprint-Abgleich, siehe oben) —
  keine manuelle Prüfung durch den Nutzer nötig, aber der Reinstall-Hinweis (Nebenwirkung) muss
  kommuniziert werden.
- **D2** (App Links) wird durch mich über `adb`/Android-eigene Verifikationstools geprüft, soweit
  von CT 116 aus erreichbar; ein finaler Tap-Test auf einem echten Gerät bleibt beim Nutzer.

## Risiken / offene Punkte

- Der `sed`-Patch auf das generierte `build.gradle` (C) ist an die aktuelle Expo-Template-Struktur
  gebunden — bricht bei einem künftigen Expo-SDK-Upgrade, falls sich die generierte Datei
  strukturell ändert. Sollte beim nächsten Expo-Upgrade neu verifiziert werden (siehe
  `apps/mobile/AGENTS.md`-Warnung zu Versionssprüngen).
- `lock_trip` bleibt ohne UI (explizit außerhalb des Scopes) — falls das später gebraucht wird,
  eigene Spec.
