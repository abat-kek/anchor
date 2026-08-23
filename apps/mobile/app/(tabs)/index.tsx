import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';

export default function TabOneScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⚓ Anchor</Text>
      <Text style={styles.tagline}>Der Trip, der endlich stattfindet.</Text>
      <Pressable style={styles.button} onPress={() => router.push('/create')}>
        <Text style={styles.buttonText}>Neuen Trip anlegen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  logo: { fontSize: 28, fontWeight: '800' },
  tagline: { fontSize: 16, opacity: 0.7, marginBottom: 12, textAlign: 'center' },
  button: { backgroundColor: '#2f6fed', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
