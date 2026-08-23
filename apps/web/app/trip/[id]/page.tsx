'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getParticipant } from '@/lib/participant-store';
import { countCommitted, type Availability } from '@anchor/shared';

interface OptionRow {
  id: string;
  start_date: string;
  end_date: string;
}

export default function TripPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [committedCount, setCommittedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [status, setStatus] = useState<string>('collecting');
  const [myAvail, setMyAvail] = useState<Record<string, Availability>>({});
  const [amCommitted, setAmCommitted] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: opts }, { data: parts }, { data: trip }] = await Promise.all([
      supabase
        .from('trip_date_options')
        .select('id, start_date, end_date')
        .eq('trip_id', tripId)
        .order('start_date'),
      supabase.from('trip_participants').select('id, is_committed').eq('trip_id', tripId),
      supabase.from('trips').select('status').eq('id', tripId).single(),
    ]);
    setOptions(opts ?? []);
    setTotalCount((parts ?? []).length);
    setCommittedCount(countCommitted((parts ?? []).map((p) => ({ isCommitted: p.is_committed }))));
    if (trip) setStatus(trip.status);
    const me = (parts ?? []).find((p) => p.id === participantId);
    if (me) setAmCommitted(me.is_committed);
  }, [tripId, participantId]);

  useEffect(() => {
    setParticipantId(getParticipant(tripId));
  }, [tripId]);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_participants' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, refresh]);

  async function setAvailability(optionId: string, availability: Availability) {
    if (!participantId) return;
    setMyAvail((prev) => ({ ...prev, [optionId]: availability }));
    await supabase.rpc('set_availability', {
      p_participant_id: participantId,
      p_date_option_id: optionId,
      p_availability: availability,
    });
  }

  async function toggleCommit() {
    if (!participantId) return;
    const next = !amCommitted;
    setAmCommitted(next);
    await supabase.rpc('set_commitment', { p_participant_id: participantId, p_is_committed: next });
    await refresh();
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Der Trip</h1>
      {status === 'locked' ? (
        <p style={{ fontWeight: 700, fontSize: 18 }}>🎉 Termin steht fest!</p>
      ) : (
        <p style={{ fontSize: 20, fontWeight: 700 }}>
          {committedCount}/{totalCount} dabei
        </p>
      )}

      <h2>Wann kannst du?</h2>
      {options.map((o) => (
        <div key={o.id} style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>
            {o.start_date} – {o.end_date}
          </div>
          {(['yes', 'maybe', 'no'] as Availability[]).map((a) => (
            <button
              key={a}
              onClick={() => setAvailability(o.id, a)}
              style={{
                marginRight: 8,
                padding: 8,
                fontWeight: myAvail[o.id] === a ? 700 : 400,
                marginBottom: 4,
              }}
            >
              {a === 'yes' ? '✅ Ja' : a === 'maybe' ? '🤔 Vielleicht' : '❌ Nein'}
            </button>
          ))}
        </div>
      ))}

      {status !== 'locked' && (
        <button
          onClick={toggleCommit}
          style={{
            padding: 12,
            width: '100%',
            marginTop: 16,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          {amCommitted ? 'Zusage zurückziehen' : 'Ich bin dabei 🙌'}
        </button>
      )}
    </main>
  );
}
