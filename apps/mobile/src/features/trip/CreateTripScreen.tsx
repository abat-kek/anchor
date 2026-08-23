import { useState } from 'react';
import { Alert, Button, Share, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export function CreateTripScreen() {
  const [title, setTitle] = useState('');
  const [shareToken, setShareToken] = useState<string | null>(null);

  async function createTrip() {
    const { data: group, error: gErr } = await supabase
      .from('groups')
      .insert({ name: `${title}-Crew` })
      .select('id')
      .single();
    if (gErr || !group) {
      Alert.alert('Fehler', gErr?.message ?? 'Gruppe');
      return;
    }

    const deadline = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: trip, error: tErr } = await supabase
      .from('trips')
      .insert({ group_id: group.id, title, deadline })
      .select('id, share_token')
      .single();
    if (tErr || !trip) {
      Alert.alert('Fehler', tErr?.message ?? 'Trip');
      return;
    }

    const { error: optErr } = await supabase.from('trip_date_options').insert([
      { trip_id: trip.id, start_date: '2026-03-14', end_date: '2026-03-16' },
      { trip_id: trip.id, start_date: '2026-03-21', end_date: '2026-03-23' },
    ]);

    if (optErr) {
      Alert.alert('Fehler', optErr.message);
      return;
    }

    setShareToken(trip.share_token);
  }

  async function shareLink() {
    if (!shareToken) return;
    const url = `https://anchor.app/join/${encodeURIComponent(shareToken)}`;
    await Share.share({ message: `Bist du dabei? ${url}` });
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Neuer Trip</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Trip-Titel (z. B. Malle 2026)"
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <Button title="Trip anlegen" onPress={createTrip} disabled={!title.trim()} />
      {shareToken && (
        <>
          <Text>Trip steht! Teile den Link mit deiner Crew:</Text>
          <Button title="Link teilen" onPress={shareLink} />
        </>
      )}
    </View>
  );
}
