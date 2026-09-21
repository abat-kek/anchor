'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { saveParticipant } from '@/lib/participant-store';

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('join_trip_via_token', {
      p_token: token,
      p_display_name: name.trim(),
    });
    if (err || !data?.[0]) {
      setBusy(false);
      setError('Beitritt fehlgeschlagen — Link ungültig?');
      return;
    }
    const { trip_id, participant_id } = data[0];
    saveParticipant(trip_id, participant_id);
    // replace statt push: join_trip_via_token ist nicht idempotent — bliebe der Join-Screen
    // im Back-Stack, erzeugte ein Zurück plus erneutes Absenden einen Geister-Teilnehmer
    // und verfälschte total_participants. busy bleibt gesetzt, bis die Navigation greift.
    router.replace(`/trip/${trip_id}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Du bist eingeladen 🎉</h1>
      <p>Sag kurz, wie du heißt — dann rein in den Trip.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dein Name"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12, boxSizing: 'border-box' }}
      />
      <button
        onClick={join}
        disabled={!name.trim() || busy}
        style={{ padding: 12, width: '100%', fontSize: 16, cursor: !name.trim() || busy ? 'not-allowed' : 'pointer' }}
      >
        {busy ? '…' : 'Beitreten'}
      </button>
      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}
    </main>
  );
}
