import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { getParticipant } from '../../src/lib/participant-store';
import { validateDateOptionInput, type Availability } from '@anchor/shared';

const POLL_MS = 4000;

interface OptionRow {
  id: string;
  start_date: string;
  end_date: string;
}

interface ParticipantRow {
  id: string;
  display_name: string;
  is_committed: boolean;
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
  participants: ParticipantRow[];
}

export default function TripStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(id) ? id[0] : id;
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [state, setState] = useState<TripState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposeStart, setProposeStart] = useState('');
  const [proposeEnd, setProposeEnd] = useState('');
  const [proposeError, setProposeError] = useState<string | null>(null);

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
    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleCommit() {
    if (!participantId || !state?.me) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('set_commitment', {
        p_participant_id: participantId,
        p_is_committed: !state.me.is_committed,
      });
      if (error) {
        setActionError(error.message);
        return;
      }
      void refresh(participantId);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function proposeDateOption() {
    if (!participantId) return;
    const today = new Date().toISOString().slice(0, 10);
    const validation = validateDateOptionInput(proposeStart, proposeEnd, today);
    if (!validation.ok) {
      setProposeError(
        validation.reason === 'missing_dates'
          ? 'Bitte beide Daten im Format JJJJ-MM-TT angeben.'
          : validation.reason === 'end_before_start'
            ? 'Das Enddatum muss nach dem Startdatum liegen.'
            : 'Das Startdatum darf nicht in der Vergangenheit liegen.',
      );
      return;
    }
    setProposeError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('propose_date_option', {
        p_participant_id: participantId,
        p_start_date: proposeStart,
        p_end_date: proposeEnd,
      });
      if (error) {
        setProposeError(error.message);
        return;
      }
      setProposeStart('');
      setProposeEnd('');
      void refresh(participantId);
    } finally {
      setIsSubmitting(false);
    }
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

      {state.options.length > 0 && <Text style={styles.sectionTitle}>Wann kannst du?</Text>}
      {state.options.map((option) => (
        <View key={option.id} style={styles.optionRow}>
          <Text style={styles.optionDate}>
            {option.start_date} – {option.end_date}
          </Text>
          <View style={styles.availabilityRow}>
            {(['yes', 'maybe', 'no'] as Availability[]).map((a) => {
              const isSelected = myAvail.get(option.id) === a;
              const isDisabled = isLocked || isSubmitting;
              return (
                <Pressable
                  key={a}
                  style={[styles.availButton, isSelected && styles.availButtonSelected, isDisabled && styles.availButtonDisabled]}
                  onPress={() => setAvailability(option.id, a)}
                  disabled={isDisabled}
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
        <View style={styles.proposeSection}>
          <Text style={styles.sectionTitle}>Eigenen Termin vorschlagen</Text>
          <View style={styles.proposeRow}>
            <TextInput
              value={proposeStart}
              onChangeText={setProposeStart}
              placeholder="Start JJJJ-MM-TT"
              placeholderTextColor="#8a8a94"
              accessibilityLabel="Startdatum"
              style={styles.proposeInput}
            />
            <TextInput
              value={proposeEnd}
              onChangeText={setProposeEnd}
              placeholder="Ende JJJJ-MM-TT"
              placeholderTextColor="#8a8a94"
              accessibilityLabel="Enddatum"
              style={styles.proposeInput}
            />
          </View>
          <Pressable style={styles.proposeButton} onPress={proposeDateOption} disabled={isSubmitting}>
            <Text style={styles.commitButtonText}>Vorschlagen</Text>
          </Pressable>
          {proposeError && <Text style={styles.error}>{proposeError}</Text>}
        </View>
      )}

      {!isLocked && (
        <Pressable
          style={[styles.commitButton, isSubmitting && styles.commitButtonDisabled]}
          onPress={toggleCommit}
          disabled={isSubmitting}
        >
          <Text style={styles.commitButtonText}>
            {state.me?.is_committed ? 'Zusage zurückziehen' : 'Ich bin dabei 🙌'}
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Wer ist dabei</Text>
      {state.participants.map((p) => (
        <Text key={p.id} style={styles.participantRow}>
          {p.is_committed ? '✅' : '⏳'} {p.display_name}
        </Text>
      ))}
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
  commitButtonDisabled: { opacity: 0.4 },
  commitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { fontSize: 14, color: '#ff6b6b' },
  proposeSection: { gap: 8, marginTop: 8 },
  proposeRow: { flexDirection: 'row', gap: 8 },
  proposeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    backgroundColor: '#17171d',
  },
  proposeButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  participantRow: { color: '#fff', fontSize: 14, paddingVertical: 2 },
});
