import { useEffect, useState } from 'react';
import { Text, View } from '@/components/Themed';
import { supabase } from '@/src/lib/supabase';

export default function TabOneScreen() {
  const [status, setStatus] = useState('lädt…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('groups')
      .select('id')
      .limit(1)
      .then(({ error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          setStatus('OK');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Anchor</Text>
      <Text>Supabase-Anbindung: {error ? `Fehler: ${error}` : status}</Text>
    </View>
  );
}
