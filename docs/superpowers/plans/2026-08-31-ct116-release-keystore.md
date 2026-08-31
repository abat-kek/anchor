# Stabiler Release-Keystore für CT 116 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APK-Releases von CT 116 (`apk.kek.de`) werden mit einem dauerhaften, dedizierten Release-Keystore signiert statt mit dem bei jedem Build neu erzeugten Debug-Keystore — Play Protect soll nicht mehr jede Installation als „nie zuvor gesehen" behandeln.

**Architecture:** Ein einmalig erzeugter Keystore liegt außerhalb des per Tarball überschriebenen Quellverzeichnisses (`/opt/build/keys/`, chmod 600). `build.sh` hängt nach dem `expo prebuild`-Schritt (der `android/app/build.gradle` bei jedem Lauf frisch generiert) einen separaten `android { signingConfigs { release { ... } } buildTypes { release { signingConfig signingConfigs.release } } }`-Block ans Ende der Datei an — Gradle merged mehrfach benannte `signingConfigs`/`buildTypes`-Blöcke additiv, das ist robuster als eine `sed`-Zeileneinfügung an eine bestimmte Zeilennummer, die sich mit künftigen Expo-Versionen verschieben kann.

**Tech Stack:** Bash, `keytool` (Teil des auf CT 116 installierten JDK 17), Gradle/Android-Signing-DSL.

**Ausführungskontext:** Dieser Plan wird nicht von einem Menschen an einem lokalen Rechner ausgeführt, sondern von mir per SSH gegen den Proxmox-Host (`ssh root@192.168.2.90 "pct exec 116 -- <befehl>"`) — siehe Memory `homelab-infrastructure`. Jeder Schritt ist entsprechend als SSH/`pct exec`-Befehl formuliert.

**Sicherheit:** Store-/Key-Passwort werden bei der Ausführung zufällig generiert und ausschließlich in `/opt/build/keys/anchor-release.env` (chmod 600) auf CT 116 abgelegt — sie erscheinen an keiner Stelle in diesem committeten Plan-Dokument, in Git-Historie oder in Chat-Ausgaben im Klartext.

**Referenz:** Spec `docs/superpowers/specs/2026-08-31-mobile-parity-und-release-signing-design.md` (Abschnitt C), verifizierter Ist-Zustand in `android/app/build.gradle:100-133` auf CT 116 (siehe Spec).

---

### Task 1: Release-Keystore + Credentials-Datei erzeugen

**Files (auf CT 116, außerhalb dieses Repos):**
- Create: `/opt/build/keys/anchor-release.keystore`
- Create: `/opt/build/keys/anchor-release.env`

- [ ] **Step 1: Verzeichnis anlegen**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash -c 'mkdir -p /opt/build/keys && chmod 700 /opt/build/keys'"
```
Expected: kein Fehler, Exit-Code 0.

- [ ] **Step 2: Passwörter generieren und Keystore erzeugen (ein zusammenhängender Befehl, Passwörter verlassen die Shell auf CT 116 nicht)**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash -c '
set -e
STOREPASS=\$(openssl rand -base64 48 | tr -dc A-Za-z0-9 | head -c 32)
KEYPASS=\$(openssl rand -base64 48 | tr -dc A-Za-z0-9 | head -c 32)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore /opt/build/keys/anchor-release.keystore \
  -alias anchor-release -keyalg RSA -keysize 2048 -validity 9125 \
  -storepass \"\$STOREPASS\" -keypass \"\$KEYPASS\" \
  -dname \"CN=Anchor, OU=Homelab, O=KEK, L=Local, S=NRW, C=DE\"
{
  echo \"export RELEASE_KEY_ALIAS=anchor-release\"
  echo \"export RELEASE_STORE_PASSWORD=\$STOREPASS\"
  echo \"export RELEASE_KEY_PASSWORD=\$KEYPASS\"
} > /opt/build/keys/anchor-release.env
chmod 600 /opt/build/keys/anchor-release.keystore /opt/build/keys/anchor-release.env
ls -la /opt/build/keys/
'"
```
Expected: `keytool`-Ausgabe „Zertifikat gespeichert in Datei..." (oder englisches Äquivalent je nach Locale) ohne Fehler, `ls -la` zeigt beide Dateien mit `-rw-------` (600).

- [ ] **Step 3: Verifizieren, dass keine Passwörter im Klartext in einem Log/Output landen, das ich weiterverarbeite**

Prüfe die eigene Tool-Ausgabe von Step 2: der `keytool`-Output enthält keine Passwörter (nur DN/Zertifikatsdaten). Nicht `cat /opt/build/keys/anchor-release.env` ausführen und die Ausgabe weiterverwenden — Existenz reicht (`ls -la`).

---

### Task 2: `build.sh` um Release-Signing erweitern

**Files:**
- Modify (auf CT 116): `/root/build.sh`

- [ ] **Step 1: Env-Export-Block um `source` der Credentials-Datei ergänzen**

Aktueller Anfang der Datei:
```bash
#!/usr/bin/env bash
set -e
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH=$PATH:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin
export EXPO_PUBLIC_SUPABASE_URL=https://anchor-api.kek95.duckdns.org
export EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3NDk3NjM1LCJleHAiOjIxMDI4NTc2MzV9.M_LaWTd9tQrD7SRUAhIzfRBF1EQy4PFtNUGFIUyb4kQ
export EXPO_PUBLIC_WEB_BASE_URL=https://anchor.kek95.duckdns.org
export CCACHE_DIR=/opt/build/ccache
```

Ersetzen durch (eine neue Zeile ergänzt):
```bash
#!/usr/bin/env bash
set -e
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH=$PATH:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin
export EXPO_PUBLIC_SUPABASE_URL=https://anchor-api.kek95.duckdns.org
export EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3NDk3NjM1LCJleHAiOjIxMDI4NTc2MzV9.M_LaWTd9tQrD7SRUAhIzfRBF1EQy4PFtNUGFIUyb4kQ
export EXPO_PUBLIC_WEB_BASE_URL=https://anchor.kek95.duckdns.org
export CCACHE_DIR=/opt/build/ccache
source /opt/build/keys/anchor-release.env
```

Ausführung (direkt auf CT 116, kein lokaler Editor verfügbar):
```bash
ssh root@192.168.2.90 "pct exec 116 -- sed -i '/export CCACHE_DIR=/a source /opt/build/keys/anchor-release.env' /root/build.sh"
```

- [ ] **Step 2: Signing-Block nach dem `expo prebuild`-Schritt anhängen**

Aktueller Abschnitt (nach `npx expo prebuild --platform android --no-install`):
```bash
echo "=== expo prebuild (android) ==="
cd apps/mobile
npx expo prebuild --platform android --no-install

echo "=== Gradle JVM-Speicher erhöhen ...
```

Neuer Abschnitt dazwischen (nach `npx expo prebuild ...`, vor dem JVM-Speicher-Kommentar):
```bash
echo "=== expo prebuild (android) ==="
cd apps/mobile
npx expo prebuild --platform android --no-install

echo "=== Release-Signing-Config anhängen ==="
cat >> android/app/build.gradle <<'EOF'

android {
    signingConfigs {
        release {
            storeFile file("/opt/build/keys/anchor-release.keystore")
            storePassword System.getenv("RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("RELEASE_KEY_ALIAS")
            keyPassword System.getenv("RELEASE_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
EOF
tail -15 android/app/build.gradle

echo "=== Gradle JVM-Speicher erhöhen ...
```

Ausführung:
```bash
ssh root@192.168.2.90 "pct exec 116 -- python3 -c \"
import re
p = '/root/build.sh'
s = open(p).read()
marker = 'npx expo prebuild --platform android --no-install\n'
addition = '''
echo \\\"=== Release-Signing-Config anhaengen ===\\\"
cat >> android/app/build.gradle <<'GRADLEEOF'

android {
    signingConfigs {
        release {
            storeFile file(\\\"/opt/build/keys/anchor-release.keystore\\\")
            storePassword System.getenv(\\\"RELEASE_STORE_PASSWORD\\\")
            keyAlias System.getenv(\\\"RELEASE_KEY_ALIAS\\\")
            keyPassword System.getenv(\\\"RELEASE_KEY_PASSWORD\\\")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
GRADLEEOF
tail -15 android/app/build.gradle
'''
assert s.count(marker) == 1, 'marker not found exactly once'
s = s.replace(marker, marker + addition, 1)
open(p, 'w').write(s)
print('patched')
\""
```
Expected: Ausgabe `patched`. (Die Python-Variante wird der direkten Heredoc-in-SSH-Verschachtelung vorgezogen, weil verschachtelte Quotes über zwei SSH/`pct exec`-Ebenen sonst fehleranfällig sind — `assert` bricht kontrolliert ab, falls der Marker nicht exakt einmal vorkommt, statt still eine falsche Stelle zu treffen.)

- [ ] **Step 3: Diff gegenkontrollieren**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- grep -n -A2 'expo prebuild --platform android' /root/build.sh"
ssh root@192.168.2.90 "pct exec 116 -- grep -n 'Release-Signing-Config\|source /opt/build/keys' /root/build.sh"
```
Expected: beide neuen Zeilen (`source ...`, `Release-Signing-Config anhaengen`) sind vorhanden, an den erwarteten Stellen.

---

### Task 3: Build auslösen und Signatur verifizieren

**Files:** keine (Ausführung + Verifikation)

- [ ] **Step 1: Build auslösen**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash /root/relaunch.sh"
```
Expected: Build läuft durch bis `BUILD-DONE` (Laufzeit je nach `HOMELAB.md`/Build-Speed-Memory mehrere Minuten — vorher `anchor-build-speed`-Memory auf aktuellen Laufzeit-Richtwert prüfen).

- [ ] **Step 2: Signatur des neuen APKs auslesen**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash -c 'keytool -printcert -jarfile /opt/build/artifacts/anchor-latest.apk | grep SHA256'"
```
Expected: eine `SHA256:`-Zeile mit einem Fingerprint.

- [ ] **Step 3: Fingerprint gegen den Keystore selbst abgleichen**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash -c 'source /opt/build/keys/anchor-release.env && keytool -list -v -keystore /opt/build/keys/anchor-release.keystore -alias \$RELEASE_KEY_ALIAS -storepass \$RELEASE_STORE_PASSWORD | grep SHA256'"
```
Expected: identischer `SHA256:`-Fingerprint wie in Step 2. **Nur wenn diese beiden Werte übereinstimmen, ist der Fix bestätigt** — sonst wurde der Signing-Block nicht wirksam (z. B. falscher Property-Name, Gradle hat den alten Block priorisiert).

- [ ] **Step 4: Zweiten Build auslösen und Stabilität über zwei Builds bestätigen**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash /root/relaunch.sh"
ssh root@192.168.2.90 "pct exec 116 -- bash -c 'keytool -printcert -jarfile /opt/build/artifacts/anchor-latest.apk | grep SHA256'"
```
Expected: derselbe Fingerprint wie in Step 2/3 — bestätigt, dass die Signatur jetzt über Builds hinweg stabil ist (nicht mehr vom sich ändernden Debug-Keystore abhängig).

---

## Wichtige Nebenwirkung (an den Nutzer zu kommunizieren, nicht Teil der Ausführung)

Wer die App bereits installiert hat, muss sie vor dem nächsten Update **einmal deinstallieren** — Android verweigert ein Update, wenn sich die Signatur ändert ("conflicting package"/Signaturkonflikt).

## Self-Review-Notiz

- **Spec-Abdeckung:** Abschnitt C vollständig — persistenter Keystore außerhalb des Tarball-Verzeichnisses, Passwörter nie im Klartext in generierten Dateien oder diesem Plan, Fingerprint-Verifikation über zwei Builds hinweg.
- **Abweichung von der Spec-Formulierung:** Die Spec sprach allgemein von einem „`sed`-Patch"; dieser Plan nutzt stattdessen einen anhängenden `android {}`-Block (append statt In-Place-Zeileneinfügung) — funktional identisches Ergebnis (Gradle merged benannte `signingConfigs`/`buildTypes`-Elemente), aber robuster gegen Verschiebungen der generierten Datei bei künftigen Expo-Versionen. Deckt sich mit der Spec-Absicht, ist aber technisch präziser als dort skizziert.
- **Risiko explizit übernommen aus der Spec:** Bricht bei einem künftigen Expo-SDK-Upgrade, falls sich `android`/`signingConfigs`/`buildTypes`-Benennung in AGP grundlegend ändert (unwahrscheinlich, da Kern-DSL) — bei nächstem Expo-Upgrade laut `apps/mobile/AGENTS.md`-Hinweis ohnehin neu zu verifizieren.
