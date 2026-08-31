# Mobile-Trip-Detail: Verfügbarkeit + Zusage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Mobile-Trip-Detailseite bekommt dieselbe Funktionalität wie die Web-Version — Verfügbarkeit pro Terminoption setzen und eine Zusage geben/zurückziehen — statt nur den Fortschritt anzuzeigen.

**Architecture:** Einzelne Datei (`apps/mobile/app/trip/[id].tsx`) wird um zwei RPC-Aufrufe (`set_availability`, `set_commitment`) und die dazugehörige UI erweitert. Kein neuer Server-Code — die RPCs existieren bereits und werden bereits von der Web-Version produktiv genutzt.

**Tech Stack:** Expo Router, React Native (`StyleSheet`), `@supabase/supabase-js`, `@anchor/shared` (Typ `Availability`).

**Referenz:** `apps/web/app/trip/[id]/page.tsx` (funktionales Vorbild), Spec: `docs/superpowers/specs/2026-08-31-mobile-parity-und-release-signing-design.md` (Abschnitt A).

**Kein Test-Runner im Mobile-Projekt vorhanden** (kein Jest/RN-Testing-Library). Verifikation pro Task läuft über `pnpm --filter mobile typecheck` (TypeScript-Korrektheit) — funktionale UI-Verifikation erfordert einen APK-Build (CT 116) und manuelles Sideload-Testen, das ist kein Teil dieses Plans.

---

### Task 1: TripState-Interface um `options` und `me` erweitern

**Files:**
- Modify: `apps/mobile/app/trip/[id].tsx:1-14`

- [ ] **Step 1: Imports und Interfaces ersetzen**

Aktueller Inhalt (Zeilen 1–14):
```tsx
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { getParticipant } from '../../src/lib/participant-store';

const POLL_MS = 4000;

interface TripState {
  trip: { status: string } | null;
  total_participants: number;
  committed_count: number;
  locked_option: { start_date: string; end_date: string } | null;
}
```

Ersetzen durch:
```tsx
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { getParticipant } from '../../src/lib/participant-store';
import type { Availability } from '@anchor/shared';

const POLL_MS = 4000;

interface OptionRow {
  id: string;
  start_date: string;
  end_date: string;
}

interface TripState {
  trip: { status: string } | null;
  options: OptionRow[];
  total_participants: number;
  committed_count: number;
  me: {
    is_committed: boolean;
    availabilities: { date_option_id: string; availability: Availability }[];
  } | null;
  locked_option: { start_date: string; end_date: string } | null;
}
```

- [ ] **Step 2: Typecheck ausführen**

Run: `pnpm --filter mobile typecheck`
Expected: keine neuen Fehler (Interface-Änderung allein bricht nichts, `options`/`me` werden erst in Task 3 gelesen).

---

### Task 2: `participantId` im State halten, `setAvailability` und `toggleCommit` hinzufügen

**Files:**
- Modify: `apps/mobile/app/trip/[id].tsx` (Komponentenkörper)

- [ ] **Step 1: State um `participantId` erweitern und im Effekt setzen**

Aktueller Inhalt:
```tsx
export default function TripStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(id) ? id[0] : id;
  const [state, setState] = useState<TripState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async (pid: string) => {
    const { data, error } = await supabase.rpc('get_trip_state', { p_participant_id: pid });
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setErrorMessage(null);
    setState(data as unknown as TripState);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      const pid = await getParticipant(tripId);
      if (!pid) {
        setErrorMessage('Kein Teilnehmer gefunden.');
        return;
      }
      void refresh(pid);
      timer = setInterval(() => void refresh(pid), POLL_MS);
    })();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tripId, refresh]);
```

Ersetzen durch:
```tsx
export default function TripStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(id) ? id[0] : id;
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [state, setState] = useState<TripState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async (pid: string) => {
    const { data, error } = await supabase.rpc('get_trip_state', { p_participant_id: pid });
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setErrorMessage(null);
    setState(data as unknown as TripState);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      const pid = await getParticipant(tripId);
      if (!pid) {
        setErrorMessage('Kein Teilnehmer gefunden.');
        return;
      }
      setParticipantId(pid);
      void refresh(pid);
      timer = setInterval(() => void refresh(pid), POLL_MS);
    })();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tripId, refresh]);

  async function setAvailability(optionId: string, availability: Availability) {
    if (!participantId) return;
    setActionError(null);
    const { error } = await supabase.rpc('set_availability', {
      p_participant_id: participantId,
      p_date_option_id: optionId,
      p_availability: availability,
    });
    if (error) {
      setActionError(error.message);
      return;
    }
    void refresh(participantId);
  }

  async function toggleCommit() {
    if (!participantId || !state?.me) return;
    setActionError(null);
    const { error } = await supabase.rpc('set_commitment', {
      p_participant_id: participantId,
      p_is_committed: !state.me.is_committed,
    });
    if (error) {
      setActionError(error.message);
      return;
    }
    void refresh(participantId);
  }
```

- [ ] **Step 2: Typecheck ausführen**

Run: `pnpm --filter mobile typecheck`
Expected: keine Fehler (`setAvailability`/`toggleCommit` werden erst in Task 3 aus der JSX aufgerufen, aber referenzieren nur bereits vorhandene State-Variablen).

---

### Task 3: Render-Teil um Verfügbarkeits-Buttons und Zusage-Toggle erweitern

**Files:**
- Modify: `apps/mobile/app/trip/[id].tsx` (Return-Block + Styles)

- [ ] **Step 1: Loading-Return, Haupt-Return und Styles ersetzen**

Aktueller Inhalt (ab `if (!state) {`):
```tsx
  if (!state) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Lädt…</Text>
      </View>
    );
  }

  const status = state.trip?.status ?? 'collecting';

  return (
    <View style={styles.container}>
      {status === 'locked' ? (
        <Text style={styles.text}>
          🎉 Termin steht!
          {state.locked_option
            ? ` ${state.locked_option.start_date} – ${state.locked_option.end_date}`
            : ''}
        </Text>
      ) : (
        <Text style={styles.text}>
          {state.committed_count}/{state.total_participants} dabei
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0f' },
  text: { fontSize: 22, fontWeight: '700', color: '#fff' },
  error: { fontSize: 16, color: '#ff6b6b', padding: 24, textAlign: 'center' },
});
```

Ersetzen durch:
```tsx
  if (!state) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const status = state.trip?.status ?? 'collecting';
  const isLocked = status === 'locked';
  const myAvail = new Map(
    (state.me?.availabilities ?? []).map((a) => [a.date_option_id, a.availability]),
  );

  return (
    <View style={styles.scrollContainer}>
      {isLocked ? (
        <Text style={styles.headline}>
          🎉 Termin steht!
          {state.locked_option
            ? ` ${state.locked_option.start_date} – ${state.locked_option.end_date}`
            : ''}
        </Text>
      ) : (
        <Text style={styles.headline}>
          {state.committed_count}/{state.total_participants} dabei
        </Text>
      )}

      <Text style={styles.sectionTitle}>Wann kannst du?</Text>
      {state.options.map((option) => (
        <View key={option.id} style={styles.optionRow}>
          <Text style={styles.optionDate}>
            {option.start_date} – {option.end_date}
          </Text>
          <View style={styles.availabilityRow}>
            {(['yes', 'maybe', 'no'] as Availability[]).map((a) => {
              const isSelected = myAvail.get(option.id) === a;
              return (
                <Pressable
                  key={a}
                  style={[styles.availButton, isSelected && styles.availButtonSelected]}
                  onPress={() => setAvailability(option.id, a)}
                  disabled={isLocked}
                >
                  <Text style={styles.availButtonText}>
                    {a === 'yes' ? '✅ Ja' : a === 'maybe' ? '🤔 Vielleicht' : '❌ Nein'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {actionError && <Text style={styles.error}>{actionError}</Text>}

      {!isLocked && (
        <Pressable style={styles.commitButton} onPress={toggleCommit}>
          <Text style={styles.commitButtonText}>
            {state.me?.is_committed ? 'Zusage zurückziehen' : 'Ich bin dabei 🙌'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0f' },
  scrollContainer: { flex: 1, padding: 24, gap: 16, backgroundColor: '#0b0b0f' },
  headline: { fontSize: 22, fontWeight: '700', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 8 },
  optionRow: { gap: 8 },
  optionDate: { color: '#fff', fontSize: 14 },
  availabilityRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  availButton: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#17171d',
  },
  availButtonSelected: { borderColor: '#2f6fed', backgroundColor: '#1c2b4d' },
  availButtonText: { color: '#fff', fontSize: 14 },
  commitButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  commitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { fontSize: 14, color: '#ff6b6b' },
});
```

Hinweis: Der `errorMessage`-Return-Zweig weiter oben in der Datei (`if (errorMessage) { ... styles.error ... }`) bleibt unverändert stehen — `styles.error` wird jetzt für zwei Zwecke wiederverwendet (Vollbild-Fehler und `actionError`-Inline-Text), beide nutzen dieselbe rote Textfarbe, das ist beabsichtigt.

- [ ] **Step 2: Typecheck ausführen**

Run: `pnpm --filter mobile typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/trip/[id].tsx
git commit -m "feat(mobile): add availability + commitment UI to trip detail screen"
```

---

## Self-Review-Notiz

- **Spec-Abdeckung:** Abschnitt A der Spec vollständig abgedeckt (Interface-Erweiterung, Verfügbarkeits-Buttons, Zusage-Toggle, Locked-Zustand deaktiviert interaktive Elemente, nicht-blockierende Fehleranzeige über `actionError`).
- **Typkonsistenz:** `Availability` konsequent aus `@anchor/shared` importiert (identisch zum Web-Import in `apps/web/app/trip/[id]/page.tsx:7`), Funktionsnamen `setAvailability`/`toggleCommit` in Task 2 definiert und in Task 3 identisch verwendet.
- **Kein manueller Funktionstest durch mich möglich** — siehe Hinweis zum fehlenden Test-Runner oben.
