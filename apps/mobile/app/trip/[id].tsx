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

  if (errorMessage) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Fehler: {errorMessage}</Text>
      </View>
    );
  }

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
