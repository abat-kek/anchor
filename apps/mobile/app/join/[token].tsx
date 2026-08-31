import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { saveParticipant } from '../../src/lib/participant-store';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function join() {
    if (!token) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc('join_trip_via_token', {
      p_token: token,
      p_display_name: name.trim(),
    });

    setIsSubmitting(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error) {
      setErrorMessage(`Netzwerk-/Serverfehler: ${error.message}`);
      return;
    }
    if (!row) {
      setErrorMessage('Link ungültig oder Trip nicht gefunden.');
      return;
    }

    await saveParticipant(row.trip_id, row.participant_id);
    router.replace(`/trip/${row.trip_id}`);
  }

  const isDisabled = !name.trim() || isSubmitting || !token;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Du bist eingeladen 🎉</Text>
      <Text style={styles.subtitle}>Sag kurz, wie du heißt — dann rein in den Trip.</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Dein Name"
        placeholderTextColor="#8a8a94"
        style={styles.input}
        autoFocus
      />

      <Pressable
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={join}
        disabled={isDisabled}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Beitreten</Text>}
      </Pressable>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: 'center', backgroundColor: '#0b0b0f' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#fff', opacity: 0.7, fontSize: 14, marginBottom: 8 },
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff6b6b', fontSize: 14 },
});
