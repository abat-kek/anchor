# Umsetzungs-Prompt: Android-Build-Pipeline (Anchor) beschleunigen

## Kontext

Self-hosted APK-Build-Pipeline für „Anchor" (Expo/React Native) läuft auf **LXC 116**
(`192.168.2.190`, Proxmox-Host `root@192.168.2.90`, Zugriff via `pct exec 116 -- ...`).
Dokumentiert in `C:\Users\KEK\Documents\homelab\HOMELAB.md` unter „116 — apk (Android-Build-Container)".

**Build-Pfad:** `/opt/build/anchor` (Quellcode, per Tarball übertragen, kein Git-Server).
**Build-Skript:** `/root/build.sh` — Ablauf: `pnpm install` → `npx expo prebuild --platform android --no-install`
→ (injiziert `org.gradle.jvmargs`) → `./gradlew assembleRelease`.
**Trigger:** `/root/relaunch.sh` (killt alte Gradle-Reste, startet `build.sh` neu, detached).
**Ergebnis:** `/opt/build/artifacts/anchor-latest.apk`, ausgeliefert über `https://apk.kek.de/anchor/anchor-latest.apk` (seit 2026-09-15: gemeinsamer Static-Server `apk-static.service` auf Port 8080 fuer mehrere Apps, Anchor per Symlink unter `/anchor/` statt im Root — vorher `https://apk.kek.de/anchor-latest.apk` direkt im Root, siehe homelab/HOMELAB.md „116 — apk").

**Aktueller Zustand (durch Analyse-Session verifiziert, Stand 2026-08-31):**
- Ein Vollbuild dauert **~11–12 Minuten**.
- CT 116: 4 Cores / **8192 MB RAM** (kürzlich von 6144 MB erhöht — OOM/Swap-Thrashing behoben,
  RAM ist NICHT mehr der Engpass; letzter Build lief mit max. 76% RAM-Auslastung, 0% Swap).
- `org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8` — **muss bleiben**,
  behebt einen separaten, verifizierten Metaspace-Fehler bei `reanimated:compileReleaseKotlin`.
  Nicht anfassen/entfernen.
- `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64` in
  `apps/mobile/android/gradle.properties` (wird von `expo prebuild` aus dem Expo-Template
  übernommen, nicht von `build.sh` gesetzt) — **Build kompiliert nativen Code für 4 ABIs**,
  inklusive der beiden Emulator-only-ABIs `x86`/`x86_64`, die für Sideload-APKs auf echten
  Handys nutzlos sind.
- `org.gradle.caching` ist **nirgends** gesetzt (kein Gradle-Build-Cache aktiv).
- `~/.gradle/caches` (3,6 GB, Dependency-Cache) liegt in `$HOME`, außerhalb von `android/`,
  und übersteht `expo prebuild` bereits — Dependencies werden NICHT erneut heruntergeladen.
- `ccache` ist **nicht installiert**. Keine `CMAKE_C_COMPILER_LAUNCHER`/`CMAKE_CXX_COMPILER_LAUNCHER`
  konfiguriert.
- `@expo/fingerprint` ist **nicht installiert** — `expo prebuild` läuft bedingungslos bei jedem
  Aufruf, ohne zu prüfen, ob sich native Config (`app.json`, native Patches, Config-Plugins)
  überhaupt geändert hat. Jeder Lauf erzeugt `android/` komplett neu, was den CMake-
  Inkrementell-Cache für reanimated/worklets/gesture-handler/screens wegwirft.
- **Proxmox-Host-Messung (per `pvesh get /nodes/<node>/rrddata`) für das letzte Build-Fenster
  12:10–12:21 Uhr:** Host-CPU 95–100% durchgehend, IO-Wait 0,0–0,6%, RAM 62–77%. Der Host hat
  nur **4 physische Kerne** (Intel i5-6500, 2015, kein Hyperthreading), CT 116 ist mit
  `cores: 4` konfiguriert — der Build sättigt während der gesamten Laufzeit praktisch 100%
  der gesamten Host-CPU. **Klarer Befund: CPU-gebunden, nicht IO- oder RAM-gebunden.** Das
  ist ein echtes Hardware-Limit, keine reine Konfigurationsfrage — die Maßnahmen unten
  reduzieren die zu leistende CPU-Arbeit, sie schaffen keine zusätzliche Kern-Kapazität.
- Insgesamt sind 24 vCPUs auf die 4 physischen Kerne verteilt (15 LXCs, 6-faches Overcommit).
  Die Live-Instanz (CT 113, Anchor-Backend) blieb während des gemessenen Builds bei stabilen
  ~9% CPU — keine akute Beeinträchtigung, aber strukturelles Risiko bei zeitlicher Überlappung
  von Build und echter Nutzerlast.
- Ein GitHub-Actions-Vergleich ist **nicht seriös möglich**: Der frühere Workflow für dieses
  Projekt scheiterte bereits vor dem Gradle-Build (pnpm-Versionskonflikt), es existieren keine
  Timing-Daten von Anchor selbst auf GitHub. Kein `actions/cache` war konfiguriert.

## Ziel dieser Session

Reihenfolge nach Aufwand/Ertrag umsetzen, nach jeder Maßnahme einen echten Build laufen lassen
und die Zeit messen (Log-Zeitstempel `date -u +%FT%TZ` vor/nach `./gradlew assembleRelease` in
`build.sh` ergänzen, falls noch nicht vorhanden), bevor die nächste Maßnahme angegangen wird —
damit die tatsächliche Wirkung je Schritt sauber zugeordnet werden kann statt geraten zu werden.

### Maßnahme 1 — ABI-Filter auf `arm64-v8a` reduzieren (höchste Priorität, geringster Aufwand)

**Was:** In `apps/mobile/app.json` (Expo-Config) unter `expo.android` explizit setzen (Expo
übernimmt das beim nächsten `prebuild` in `gradle.properties`), ODER — robuster gegen
`prebuild`-Overwrites — in `build.sh` nach dem `expo prebuild`-Aufruf per `sed` erzwingen,
analog zum bestehenden `org.gradle.jvmargs`-Injection-Pattern:
```bash
sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/' android/gradle.properties
```
**Begründung:** Fast alle Android-Handys ab ~2019 sind `arm64-v8a`. `armeabi-v7a` nur behalten,
falls explizit sehr alte/günstige Geräte im Freundeskreis unterstützt werden müssen — dann
`arm64-v8a,armeabi-v7a` (2 statt 4 ABIs). `x86`/`x86_64` in jedem Fall entfernen — die sind für
eine Sideload-APK für echte Geräte nutzlos.
**Erwartete Ersparnis:** Am größten von allen Maßnahmen — die native Kompilierung
(CMake/ninja für reanimated, worklets, gesture-handler, screens, react-native selbst) läuft
aktuell 4-fach. Bei Reduktion auf 1 ABI ist ein Rückgang der reinen Nativ-Kompilierzeit um
grob 60–75% zu erwarten (konservativ geschätzt, da JVM-seitige Tasks — Kotlin/Java-Compile,
Ressourcen-Verarbeitung — nicht pro ABI skalieren, nur der C++/CMake-Anteil). Diese Zahl vor
Ort messen und nicht ungeprüft übernehmen.
**Risiko:** Keins für die Beta (nur Sideload auf bekannte Freundes-Handys). Für einen späteren
Play-Store-Release mit `arm64-v8a`-only kein Problem (Google akzeptiert das), nur bei sehr
alten 32-bit-Geräten oder x86-Tablets gäbe es dann keine kompatible APK — für den aktuellen
Use-Case irrelevant.

### Maßnahme 2 — ccache für die native Kompilierung einrichten

**Was:**
1. `apt-get install -y ccache` in CT 116.
2. Persistentes Cache-Verzeichnis **außerhalb** von `/opt/build/anchor` anlegen, z. B.
   `/opt/build/ccache` (überlebt das `rm -rf /opt/build/anchor` vor jedem Quellcode-Update
   in der aktuellen Deploy-Routine).
3. `CCACHE_DIR=/opt/build/ccache` als Env in `build.sh` exportieren.
4. Android/CMake an ccache koppeln — der saubere Weg für den Android Gradle Plugin + CMake
   externalNativeBuild ist, in `apps/mobile/android/app/build.gradle` (bzw. wo `externalNativeBuild`
   für die betroffenen Module via Autolinking konfiguriert wird — bei RN/Expo passiert das primär
   in den jeweiligen `node_modules/react-native-*/android/build.gradle`-Dateien, NICHT zentral in
   der App) `-DCMAKE_C_COMPILER_LAUNCHER=ccache` und `-DCMAKE_CXX_COMPILER_LAUNCHER=ccache` an die
   `cppFlags`/`arguments` von `externalNativeBuild.cmake` zu übergeben. Da diese Dateien in
   `node_modules` liegen und bei jedem `pnpm install` überschrieben werden können, ist der
   robustere Ansatz ein **Gradle-`init.d`-Skript** (`~/.gradle/init.d/ccache.gradle`, überlebt
   sowohl `prebuild` als auch `pnpm install`), das für alle Subprojekte mit `externalNativeBuild`
   automatisch `-DCMAKE_C_COMPILER_LAUNCHER=ccache`/`-DCMAKE_CXX_COMPILER_LAUNCHER=ccache`
   injiziert. Vor der Umsetzung kurz recherchieren, ob es für RN/Expo bereits ein etabliertes
   Init-Skript-Pattern dafür gibt (React-Native-Community hat das Problem schon gelöst), statt
   es komplett neu zu erfinden.
**Begründung:** Ccache cached nach Quellcode-Hash der zu kompilierenden `.cpp`-Dateien, nicht
nach Ordner-Pfad/-Identität. Das macht ihn **immun** gegen das Problem, dass `expo prebuild`
den `android/`-Ordner jedes Mal neu erzeugt — solange sich reanimated/worklets/gesture-handler/
screens als npm-Pakete nicht ändern (gleiche Version → gleicher Quellcode → gleicher Hash →
Cache-Treffer), sollte ein Rebuild ohne native Änderungen fast nur noch JS/TS-Arbeit + Cache-
Hits sein.
**Erwartete Ersparnis:** Bei warmem Cache (ab dem zweiten Build mit gleichen nativen
Dependency-Versionen) potenziell sehr groß für den nativen Kompilier-Anteil — die genaue
Zahl hängt stark davon ab, wie groß dieser Anteil nach Maßnahme 1 (nur noch 1 ABI) überhaupt
noch ist. Nach Maßnahme 1 zuerst neu messen, danach ccache bewerten — die Kombination beider
ist der Ziel-Zustand, aber die Reihenfolge (erst ABI-Filter, dann ccache) macht die Wirkung
von ccache leichter messbar (kleinerer, klarerer verbleibender Anteil).
**Risiko:** Gering. Ccache ist Standard-Tooling, keine funktionale Änderung am Build-Ergebnis.
Achtung: `CCACHE_DIR` braucht Plattenplatz (typisch einige hundert MB bis wenige GB je nach
`max_size`) — auf CT 116 sind aktuell ~ausreichend Platz auf `local-lvm`, trotzdem `ccache -M`
(Cache-Größenlimit) explizit setzen, damit er nicht unbegrenzt wächst.

### Maßnahme 3 — Gradle Build-Cache aktivieren

**Was:** `org.gradle.caching=true` in `apps/mobile/android/gradle.properties` ergänzen
(gleiches Injection-Pattern wie beim bestehenden `org.gradle.jvmargs`-Fix in `build.sh`, da
`expo prebuild` die Datei jedes Mal neu erzeugt). Für persistenten Cache über `prebuild`-Läufe
hinweg zusätzlich einen lokalen Build-Cache-Pfad außerhalb von `android/` konfigurieren, z. B.
via `~/.gradle/init.d/build-cache.gradle`:
```groovy
buildCache {
    local {
        directory = "/opt/build/gradle-build-cache"
        removeUnusedEntriesAfterDays = 14
    }
}
```
**Begründung:** Ergänzt ccache (der nur die native C++/CMake-Seite abdeckt) um Caching der
JVM-seitigen Tasks (Kotlin-/Java-Compile-Outputs, Resource-Processing etc.) über Builds hinweg.
**Erwartete Ersparnis:** Moderat — kleiner als Maßnahme 1, ergänzt aber Maßnahme 2 sinnvoll,
da unterschiedliche Task-Typen abgedeckt werden. Erst nach 1+2 messen, ob der verbleibende
JVM-Anteil überhaupt noch relevant zur Gesamtzeit beiträgt, bevor hier Zeit investiert wird.
**Risiko:** Gering, Standard-Gradle-Feature.

### Maßnahme 4 (NICHT umsetzen ohne Rückfrage) — `expo prebuild` überspringen bei unveränderter nativer Config

**Was wäre die Idee:** Hash über `app.json`, `package.json` (native Dependencies) und ggf.
vorhandene native Patches bilden, `expo prebuild` nur ausführen, wenn sich der Hash seit dem
letzten Build geändert hat; sonst den bestehenden `android/`-Ordner samt CMake-Inkrementell-
Cache wiederverwenden.
**Warum zurückhaltend:** Das ist strukturell die "richtige" Lösung (adressiert die Ursache
direkt), aber deutlich aufwändiger und riskanter als 1–3: `expo prebuild` überspringen bedeutet,
dass Änderungen an Config-Plugins, Assets oder native Patches, die der Hash nicht erfasst,
unbemerkt durchrutschen können — das produziert im schlechtesten Fall eine APK mit veralteter
nativer Konfiguration, ohne dass ein Fehler auffällt. `@expo/fingerprint` (offizielles
Expo-Paket genau für diesen Zweck) wäre der sauberere Weg als ein selbstgebauter Hash, sollte
aber erst evaluiert werden, NACHDEM 1–3 umgesetzt und gemessen sind — es ist gut möglich, dass
ABI-Filter + ccache + Build-Cache die Bauzeit schon auf ein akzeptables Maß drücken, ohne dieses
strukturell komplexere Risiko einzugehen. Nur angehen, wenn nach 1–3 die Zeit immer noch spürbar
über z. B. 3–4 Minuten liegt UND der Nutzer explizit grünes Licht für den zusätzlichen Aufwand
gibt.

## Was unverändert bleiben muss

- `org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1536m` — behebt einen separaten,
  reproduzierten Metaspace-Fehler. Nicht entfernen, auch nicht "testweise", ohne den Fix
  erneut zu verifizieren.
- CT-116-RAM bei 8192 MB belassen (aktuell ausreichend, siehe Host-RRD-Messung oben) — es sei
  denn, eine der Maßnahmen erhöht den Speicherbedarf messbar (z. B. mehr parallele
  Compiler-Prozesse durch `org.gradle.workers.max`-Tuning — falls das angegangen wird, erneut
  mit `free -m` während eines Builds gegenmessen).

## Vorgehen in dieser Session

1. Maßnahme 1 umsetzen, Build laufen lassen (`pct exec 116 -- bash /root/relaunch.sh`), Dauer
   messen, Ergebnis kurz berichten.
2. Maßnahme 2 umsetzen, erneut messen.
3. Maßnahme 3 umsetzen, erneut messen.
4. Am Ende: Tabelle mit Vorher/Nachher-Zeiten je Maßnahme, `HOMELAB.md` (CT-116-Eintrag)
   entsprechend aktualisieren.
5. Maßnahme 4 nur nach expliziter Rückfrage beim Nutzer angehen.
