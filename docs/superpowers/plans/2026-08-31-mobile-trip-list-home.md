# Mobile-Trip-Liste auf der Startseite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Mobile-Startseite zeigt alle lokal bekannten Trips (angelegt oder beigetreten) als Liste, statt sie nach einem App-Neustart „verschwinden" zu lassen.

**Architecture:** `participant-store.ts` bekommt eine neue Funktion, die alle gespeicherten Trip-IDs aus `AsyncStorage` ausliest. Die Startseite lädt bei jedem Fokussieren (Mount + Rückkehr von einem anderen Screen) für jede bekannte Trip-ID frisch den Zustand per `get_trip_state` und rendert eine Liste. Kein lokales Caching von Titel/Status — immer aktuell aus der DB.

**Tech Stack:** Expo Router (`useFocusEffect`), React Native (`FlatList`, `StyleSheet`), `@react-native-async-storage/async-storage`, `@supabase/supabase-js`.

**Referenz:** Spec `docs/superpowers/specs/2026-08-31-mobile-parity-und-release-signing-design.md` (Abschnitt B).

**Kein Test-Runner im Mobile-Projekt vorhanden.** Verifikation über `pnpm --filter mobile typecheck`; funktionale Prüfung erfordert einen APK-Build + manuelles Sideload-Testen (nicht Teil dieses Plans).

---

### Task 1: `listTripIds()` in `participant-store.ts`

**Files:**
- Modify: `apps/mobile/src/lib/participant-store.ts` (komplette Datei)

- [ ] **Step 1: Datei komplett ersetzen**

Aktueller Inhalt:
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (tripId: string) => `anchor:participant:${tripId}`;

export async function saveParticipant(tripId: string, participantId: string): Promise<void> {
  await AsyncStorage.setItem(key(tripId), participantId);
}

export async function getParticipant(tripId: string): Promise<string | null> {
  return AsyncStorage.getItem(key(tripId));
}
```

Ersetzen durch:
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'anchor:participant:';
const key = (tripId: string) => `${PREFIX}${tripId}`;

export async function saveParticipant(tripId: string, participantId: string): Promise<void> {
  await AsyncStorage.setItem(key(tripId), participantId);
}

export async function getParticipant(tripId: string): Promise<string | null> {
  return AsyncStorage.getItem(key(tripId));
}

export async function listTripIds(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
}
```

- [ ] **Step 2: Typecheck ausführen**

Run: `pnpm --filter mobile typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/participant-store.ts
git commit -m "feat(mobile): add listTripIds to participant-store"
```

---

### Task 2: Startseite zu einer Trip-Liste umbauen

**Files:**
- Modify: `apps/mobile/app/index.tsx` (komplette Datei)

- [ ] **Step 1: Datei komplett ersetzen**

Aktueller Inhalt:
```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⚓ Anchor</Text>
      <Text style={styles.tagline}>Der Trip, der endlich stattfindet.</Text>
      <Pressable style={styles.button} onPress={() => router.push('/create')}>
        <Text style={styles.buttonText}>Neuen Trip anlegen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#0b0b0f',
  },
  logo: { fontSize: 28, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 16, opacity: 0.7, marginBottom: 12, textAlign: 'center', color: '#fff' },
  button: { backgroundColor: '#2f6fed', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

Ersetzen durch:
```tsx
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { getParticipant, listTripIds } from '../src/lib/participant-store';

interface TripSummary {
  id: string;
  title: string;
  status: string;
  committedCount: number;
  totalParticipants: number;
}

interface TripStateResponse {
  trip: { id: string; title: string; status: string } | null;
  total_participants: number;
  committed_count: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrips = useCallback(async () => {
    setIsLoading(true);
    const tripIds = await listTripIds();
    const summaries: TripSummary[] = [];
    for (const tripId of tripIds) {
      const participantId = await getParticipant(tripId);
      if (!participantId) continue;
      const { data, error } = await supabase.rpc('get_trip_state', {
        p_participant_id: participantId,
      });
      if (error || !data) continue;
      const response = data as unknown as TripStateResponse;
      if (!response.trip) continue;
      summaries.push({
        id: response.trip.id,
        title: response.trip.title,
        status: response.trip.status,
        committedCount: response.committed_count,
        totalParticipants: response.total_participants,
      });
    }
    setTrips(summaries);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTrips();
    }, [loadTrips]),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⚓ Anchor</Text>
      <Text style={styles.tagline}>Der Trip, der endlich stattfindet.</Text>

      {isLoading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <FlatList
          style={styles.list}
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.tripCard} onPress={() => router.push(`/trip/${item.id}`)}>
              <Text style={styles.tripTitle}>{item.title}</Text>
              <Text style={styles.tripStatus}>
                {item.status === 'locked'
                  ? '🎉 Termin steht'
                  : `${item.committedCount}/${item.totalParticipants} dabei`}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.button} onPress={() => router.push('/create')}>
        <Text style={styles.buttonText}>Neuer Trip anlegen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#0b0b0f',
  },
  logo: { fontSize: 28, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 16, opacity: 0.7, marginBottom: 12, textAlign: 'center', color: '#fff' },
  list: { width: '100%', maxHeight: 320 },
  tripCard: {
    width: '100%',
    backgroundColor: '#17171d',
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  tripTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tripStatus: { color: '#fff', opacity: 0.7, fontSize: 14, marginTop: 4 },
  button: { backgroundColor: '#2f6fed', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck ausführen**

Run: `pnpm --filter mobile typecheck`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/index.tsx
git commit -m "feat(mobile): show list of known trips on home screen"
```

---

## Self-Review-Notiz

- **Spec-Abdeckung:** Abschnitt B vollständig — `listTripIds()`, Fokus-basiertes Neuladen, Fehlertoleranz pro Karte (einzelner RPC-Fehler via `if (error || !data) continue;` übersprungen statt die ganze Liste zu blockieren), leerer Zustand bleibt wie im Original.
- **Typkonsistenz:** `TripSummary`/`TripStateResponse` sind neue, lokal in `index.tsx` definierte Typen (keine Kollision mit `TripState` aus `trip/[id].tsx`, da unterschiedliche Dateien/Scopes).
- **Kein manueller Funktionstest durch mich möglich** — siehe Hinweis oben.
