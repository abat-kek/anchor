import { useState } from 'react';
import { Alert, Button, Share, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { saveParticipant } from '../../lib/participant-store';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://anchor.kek95.duckdns.org';

export function CreateTripScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [shareToken, setShareToken] = useState<string | null>(null);

  async function createTrip() {
    const deadline = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.rpc('create_trip', {
      p_title: title.trim(),
      p_destination: null,
      p_deadline: deadline,
      p_date_options: [
        { start_date: '2026-03-14', end_date: '2026-03-16' },
        { start_date: '2026-03-21', end_date: '2026-03-23' },
      ],
    });

    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) {
      Alert.alert('Fehler', error?.message ?? 'Trip konnte nicht angelegt werden');
      return;
    }
    await saveParticipant(row.trip_id, row.participant_id);
    setShareToken(row.share_token);
    router.push(`/trip/${row.trip_id}`);
  }

  async function shareLink() {
    if (!shareToken) return;
    const url = `${WEB_BASE}/join/${encodeURIComponent(shareToken)}`;
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
