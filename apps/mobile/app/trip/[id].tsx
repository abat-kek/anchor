import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { countCommitted } from '@anchor/shared';

export default function TripStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [committed, setCommitted] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('collecting');

  async function refresh() {
    if (!id) return;
    const [{ data: parts }, { data: trip }] = await Promise.all([
      supabase.from('trip_participants').select('id, is_committed').eq('trip_id', id),
      supabase.from('trips').select('status').eq('id', id).single(),
    ]);
    setTotal((parts ?? []).length);
    setCommitted(countCommitted((parts ?? []).map((p) => ({ isCommitted: p.is_committed }))));
    if (trip) setStatus(trip.status);
  }

  useEffect(() => {
    void refresh();
    if (!id) return;
    const channel = supabase
      .channel(`trip-mobile:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_participants' }, () =>
        void refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'locked' ? (
        <Text style={{ fontSize: 22, fontWeight: '700' }}>🎉 Termin steht!</Text>
      ) : (
        <Text style={{ fontSize: 22, fontWeight: '700' }}>
          {committed}/{total} dabei
        </Text>
      )}
    </View>
  );
}
