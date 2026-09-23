import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { buildJoinUrl } from '@anchor/shared';
import { supabase } from '../../lib/supabase';
import { saveParticipant } from '../../lib/participant-store';

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://anchor.kek95.duckdns.org';

export function CreateTripScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);

  async function createTrip() {
    setIsSubmitting(true);
    setErrorMessage(null);

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

    setIsSubmitting(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) {
      setErrorMessage(error?.message ?? 'Trip konnte nicht angelegt werden.');
      return;
    }

    await saveParticipant(row.trip_id, row.participant_id);
    setShareToken(row.share_token);
    router.push(`/trip/${row.trip_id}`);
  }

  async function shareLink() {
    if (!shareToken) return;
    const url = buildJoinUrl(WEB_BASE, shareToken);
    await Share.share({ message: `Bist du dabei? ${url}` });
  }

  const isDisabled = !title.trim() || isSubmitting;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Trip-Titel</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="z. B. Malle 2026"
        placeholderTextColor="#8a8a94"
        style={styles.input}
        autoFocus
      />

      <Pressable
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={createTrip}
        disabled={isDisabled}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Trip anlegen</Text>
        )}
      </Pressable>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {shareToken && (
        <>
          <Text style={styles.success}>Trip steht! Teile den Link mit deiner Crew:</Text>
          <Pressable style={styles.buttonSecondary} onPress={shareLink}>
            <Text style={styles.buttonText}>Link teilen</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: '#0b0b0f' },
  label: { color: '#fff', fontSize: 14, opacity: 0.8 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#17171d',
    color: '#fff',
  },
  button: {
    backgroundColor: '#2f6fed',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonSecondary: {
    backgroundColor: '#2f6fed',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff6b6b', fontSize: 14 },
  success: { color: '#fff', fontSize: 14 },
});
