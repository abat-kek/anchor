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

  const loadTrips = useCallback(async (isActive: () => boolean) => {
    try {
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
      if (isActive()) setTrips(summaries);
    } catch (error) {
      // Handle errors gracefully; leave spinner state managed by finally
    } finally {
      if (isActive()) setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void loadTrips(() => isActive);
      return () => {
        isActive = false;
      };
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
