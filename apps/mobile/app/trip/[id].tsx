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
                  style={[styles.availButton, isSelected && styles.availButtonSelected, isLocked && styles.availButtonDisabled]}
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
  availButtonDisabled: { opacity: 0.5 },
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
