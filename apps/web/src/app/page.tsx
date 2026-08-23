import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let status = 'checking…';
  let data: unknown = null;
  let error: string | null = null;

  try {
    const result = await supabase.from('groups').select('id, name').limit(5);
    if (result.error) {
      error = result.error.message;
    } else {
      data = result.data;
      status = 'OK';
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Anchor — Web</h1>
      <p>Supabase-Anbindung: {error ? `Fehler: ${error}` : status}</p>
      <pre style={{ fontSize: 12 }}>{JSON.stringify(data ?? [], null, 2)}</pre>
    </main>
  );
}
