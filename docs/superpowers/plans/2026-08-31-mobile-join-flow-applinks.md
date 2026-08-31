# Mobile-Join-Flow + Android App Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App-Nutzer können einem Trip beitreten, ohne die App zu verlassen — sowohl über einen neuen In-App-Join-Screen als auch dadurch, dass ein getippter Einladungslink (`https://anchor.kek95.duckdns.org/join/...`) direkt die App statt den Browser öffnet.

**Architecture:** Zwei unabhängige Teile — (D1) ein neuer Expo-Router-Screen, der `join_trip_via_token` aufruft (identische RPC wie Web), und (D2) Android App Links (`intentFilters` mit `autoVerify` + `assetlinks.json` auf dem Web-Server), die vom Betriebssystem beim Antippen eines passenden Links ausgewertet werden.

**Tech Stack:** Expo Router (dynamische Route `join/[token]`), `@supabase/supabase-js`, Android Digital Asset Links (`.well-known/assetlinks.json`, ausgeliefert über das bestehende Next.js `public/`-Verzeichnis).

**Abhängigkeit:** D2 benötigt den SHA-256-Fingerprint des Release-Zertifikats aus
`docs/superpowers/plans/2026-08-31-ct116-release-keystore.md` (Task 3, Step 2/3). **Dieser Plan
kann D1 unabhängig davon starten, D2 erst nach Abschluss des Keystore-Plans.**

**Referenz:** `apps/web/app/join/[token]/page.tsx` (funktionales Vorbild für D1), Spec `docs/superpowers/specs/2026-08-31-mobile-parity-und-release-signing-design.md` (Abschnitt D).

**Kein Test-Runner im Mobile-Projekt vorhanden.** Verifikation über `pnpm --filter mobile typecheck`; App-Links-Verifikation wird von mir per `adb`/Android-Bordmitteln geprüft (siehe Task 4); ein finaler Tap-Test auf einem echten Gerät bleibt beim Nutzer.

---

## Teil D1: Join-Screen in der App

### Task 1: Route `join/[token]` anlegen und registrieren

**Files:**
- Create: `apps/mobile/app/join/[token].tsx`
- Modify: `apps/mobile/app/_layout.tsx:32-37`

- [ ] **Step 1: Neue Datei `apps/mobile/app/join/[token].tsx` anlegen**

```tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { saveParticipant } from '../../src/lib/participant-store';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function join() {
    if (!token) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc('join_trip_via_token', {
      p_token: token,
      p_display_name: name.trim(),
    });

    setIsSubmitting(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error) {
      setErrorMessage(`Netzwerk-/Serverfehler: ${error.message}`);
      return;
    }
    if (!row) {
      setErrorMessage('Link ungültig oder Trip nicht gefunden.');
      return;
    }

    await saveParticipant(row.trip_id, row.participant_id);
    router.replace(`/trip/${row.trip_id}`);
  }

  const isDisabled = !name.trim() || isSubmitting || !token;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Du bist eingeladen 🎉</Text>
      <Text style={styles.subtitle}>Sag kurz, wie du heißt — dann rein in den Trip.</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Dein Name"
        placeholderTextColor="#8a8a94"
        style={styles.input}
        autoFocus
      />

      <Pressable
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={join}
        disabled={isDisabled}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Beitreten</Text>}
      </Pressable>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: '#0b0b0f' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#fff', opacity: 0.7, fontSize: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#17171d',
    color: '#fff',
  },
  button: {
    backgroundColor: '#2f6fed',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff6b6b', fontSize: 14 },
});
```

Hinweis zur Fehlerbehandlung: anders als die ursprüngliche Web-Version (die jeden Fehler pauschal als „Link ungültig" meldete — das war die eigentliche Ursache der Verwirrung beim Web-Bug) unterscheidet dieser Screen zwischen einem RPC-/Netzwerkfehler (`error` gesetzt) und einem tatsächlich leeren Ergebnis (`!row`, entspricht der `invalid_token`-Exception aus `join_trip_via_token`).

- [ ] **Step 2: Route in `_layout.tsx` registrieren**

Aktueller Inhalt:
```tsx
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#0b0b0f' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'Neuer Trip' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip-Status' }} />
      </Stack>
```

Ersetzen durch:
```tsx
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#0b0b0f' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'Neuer Trip' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip-Status' }} />
        <Stack.Screen name="join/[token]" options={{ title: 'Einladung' }} />
      </Stack>
```

- [ ] **Step 3: Typecheck ausführen**

Run: `pnpm --filter mobile typecheck`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/join/[token].tsx apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): add native join screen"
```

---

## Teil D2: Android App Links

**Voraussetzung vor Start:** Task 3 aus `2026-08-31-ct116-release-keystore.md` ist abgeschlossen, der SHA-256-Fingerprint liegt vor (aus `keytool -printcert -jarfile .../anchor-latest.apk | grep SHA256`).

### Task 2: `intentFilters` in `app.json` ergänzen

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: `android`-Block erweitern**

Aktueller Inhalt:
```json
    "android": {
      "package": "de.anchor.app",
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
```

Ersetzen durch:
```json
    "android": {
      "package": "de.anchor.app",
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false,
      "intentFilters": [
        {
          "autoVerify": true,
          "action": "VIEW",
          "data": {
            "scheme": "https",
            "host": "anchor.kek95.duckdns.org",
            "pathPrefix": "/join"
          },
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
```

Beleg für Feldnamen/Schema (`autoVerify`, `action`, `data.scheme`/`data.host`/`data.pathPrefix`,
`category`): Expo-SDK-57-Dokumentation (`docs.expo.dev/versions/v57.0.0/config/app/`) für die
Grundstruktur, Android-Entwicklerdokumentation
(`developer.android.com/training/app-links/verify-android-applinks`) für `pathPrefix` als
gültiges natives `<data>`-Attribut — beide am 2026-08-31 abgerufen, nicht nur aus Modellwissen
übernommen.

- [ ] **Step 2: JSON-Validität prüfen**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/mobile/app.json', 'utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app.json
git commit -m "feat(mobile): configure Android App Links for join deep-linking"
```

---

### Task 3: `assetlinks.json` erzeugen und ausliefern

**Files:**
- Create: `apps/web/public/.well-known/assetlinks.json` (Repo, für künftige volle Redeploys)
- Create (direkt auf CT 113, sofort wirksam ohne Rebuild — Next.js liefert `public/`-Dateien zur Laufzeit von der Festplatte): `/opt/anchor/app/apps/web/public/.well-known/assetlinks.json`

- [ ] **Step 1: Datei-Inhalt mit dem Fingerprint aus dem Keystore-Plan befüllen**

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "de.anchor.app",
      "sha256_cert_fingerprints": [
        "<FINGERPRINT-AUS-KEYSTORE-PLAN-TASK-3-STEP-2>"
      ]
    }
  }
]
```

`<FINGERPRINT-AUS-KEYSTORE-PLAN-TASK-3-STEP-2>` durch den tatsächlichen Wert ersetzen (Format mit
Doppelpunkten, exakt wie von `keytool -printcert` ausgegeben — Android akzeptiert das
Doppelpunkt-Format).

- [ ] **Step 2: Im Repo ablegen (für künftige volle Redeploys)**

Datei unter `apps/web/public/.well-known/assetlinks.json` mit obigem Inhalt anlegen.

- [ ] **Step 3: Direkt auf die laufende CT-113-Instanz schreiben (sofort wirksam)**

Run (Inhalt aus Step 1, mit echtem Fingerprint):
```bash
ssh root@192.168.2.90 "pct exec 113 -- bash -c 'mkdir -p /opt/anchor/app/apps/web/public/.well-known && cat > /opt/anchor/app/apps/web/public/.well-known/assetlinks.json' " <<'EOF'
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "de.anchor.app",
      "sha256_cert_fingerprints": ["<FINGERPRINT>"]
    }
  }
]
EOF
```

- [ ] **Step 4: Ausgelieferte Datei per curl verifizieren**

Run: `curl -s https://anchor.kek95.duckdns.org/.well-known/assetlinks.json`
Expected: identischer JSON-Inhalt wie in Step 1/3, HTTP 200, `Content-Type: application/json`.

- [ ] **Step 5: Commit (nur der Repo-Teil, nicht die Live-Änderung auf CT 113)**

```bash
git add apps/web/public/.well-known/assetlinks.json
git commit -m "feat(web): serve Digital Asset Links file for Android App Links verification"
```

---

### Task 4: App neu bauen und App-Links-Verifikation prüfen

**Files:** keine (Ausführung + Verifikation)

- [ ] **Step 1: Neuen APK-Build mit den `app.json`-Änderungen auslösen**

Voraussetzung: Quellcode auf CT 116 muss den Stand aus D1/D2 enthalten (Tarball-Transfer gemäß
`HEIMAPPS-PLAYBOOK.md`-Deploy-Pattern, nicht Teil dieses Plans — separater Deploy-Schritt).

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- bash /root/relaunch.sh"
```

- [ ] **Step 2: Generiertes `AndroidManifest.xml` auf den `intent-filter` prüfen**

Run:
```bash
ssh root@192.168.2.90 "pct exec 116 -- grep -A 15 'autoVerify' /opt/build/anchor/apps/mobile/android/app/src/main/AndroidManifest.xml"
```
Expected: `intent-filter android:autoVerify="true"` mit `action.VIEW`, Kategorien `BROWSABLE`/`DEFAULT`
und `data`-Element mit `android:host="anchor.kek95.duckdns.org"` und
`android:pathPrefix="/join"`.

- [ ] **Step 3: Ergebnis dieses Plans zusammenfassen**

Kein automatisierter End-to-End-App-Links-Verifikationstest möglich ohne ein an `adb` angeschlossenes
Android-Gerät oder einen laufenden Emulator (auf CT 116 nicht vorhanden — reiner Build-Host ohne
Display/Emulator). Der finale Beleg („Link antippen öffnet die App") bleibt ein manueller Schritt
beim Nutzer nach der APK-Installation.

---

## Self-Review-Notiz

- **Spec-Abdeckung:** Abschnitt D vollständig — D1 (Join-Screen, funktional identisch zu Web, mit
  der aus dem Web-Bugfix gelernten Unterscheidung Netzwerkfehler vs. ungültiger Token) und D2
  (`intentFilters` + `assetlinks.json`), inklusive der in der Spec geforderten Reihenfolge
  (D2 nach C).
- **Typkonsistenz:** `join_trip_via_token`-Rückgabeform (`trip_id`, `participant_id`) identisch zur
  Web-Version (`apps/web/app/join/[token]/page.tsx:27`) und zur bereits bestehenden Nutzung in
  `apps/mobile/src/features/trip/CreateTripScreen.tsx:41` (`row.trip_id`/`row.participant_id`).
- **Placeholder-Scan:** `<FINGERPRINT-AUS-KEYSTORE-PLAN-TASK-3-STEP-2>`/`<FINGERPRINT>` sind
  bewusste, klar benannte Platzhalter für einen Wert, der erst zur Ausführungszeit aus einem
  anderen Plan bekannt ist — kein TBD/„später ausfüllen", sondern eine explizite Abhängigkeit mit
  genannter Quelle.
