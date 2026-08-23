import { useEffect, useState } from 'react';
import { Text, View } from '@/components/Themed';
import { supabase } from '@/src/lib/supabase';

export default function TabOneScreen() {
  const [status, setStatus] = useState('lädt…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { error: err } = await supabase.from('groups').select('id').limit(1);
        if (err) {
          setError(err.message);
        } else {
          setStatus('OK');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Anchor</Text>
      <Text>Supabase-Anbindung: {error ? `Fehler: ${error}` : status}</Text>
    </View>
  );
}
