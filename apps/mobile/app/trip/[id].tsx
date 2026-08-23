import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
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

  const refresh = useCallback(async (pid: string) => {
    const { data } = await supabase.rpc('get_trip_state', { p_participant_id: pid });
    if (data) setState(data as unknown as TripState);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      const pid = await getParticipant(tripId);
      if (!pid) return;
      void refresh(pid);
      timer = setInterval(() => void refresh(pid), POLL_MS);
    })();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tripId, refresh]);

  const status = state?.trip?.status ?? 'collecting';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'locked' ? (
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          🎉 Termin steht!
          {state?.locked_option
            ? ` ${state.locked_option.start_date} – ${state.locked_option.end_date}`
            : ''}
        </Text>
      ) : (
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          {state?.committed_count ?? 0}/{state?.total_participants ?? 0} dabei
        </Text>
      )}
    </View>
  );
}
