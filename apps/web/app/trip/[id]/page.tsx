'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getParticipant } from '@/lib/participant-store';
import { translateRpcError, validateDateOptionInput, type Availability } from '@anchor/shared';
import { AccommodationSection, type AccommodationState } from './accommodation-section';

interface OptionRow {
  id: string;
  start_date: string;
  end_date: string;
}

interface ParticipantRow {
  id: string;
  display_name: string;
  is_committed: boolean;
}

interface TripState {
  trip: {
    id: string;
    title: string;
    status: string;
    deadline: string;
    locked_date_option_id: string | null;
  } | null;
  options: OptionRow[];
  total_participants: number;
  committed_count: number;
  participants: ParticipantRow[];
  me: {
    is_committed: boolean;
    availabilities: { date_option_id: string; availability: Availability }[];
  } | null;
  locked_option: { start_date: string; end_date: string } | null;
  accommodation: AccommodationState;
}

const POLL_MS = 4000;

// Ab 'locked' ist der Termin entschieden; die Terminabstimmung bleibt in allen
// Folgestatus geschlossen, sonst waere sie in der Unterkunftsphase wieder offen.
const DATE_DECIDED_STATUSES = ['locked', 'accommodation', 'active', 'done'];
const ACCOMMODATION_EDITABLE_STATUSES = ['locked', 'accommodation'];

const EMPTY_ACCOMMODATION: AccommodationState = {
  options: [],
  my_votes: [],
  chosen_accommodation: null,
};

export default function TripPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [state, setState] = useState<TripState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposeStart, setProposeStart] = useState('');
  const [proposeEnd, setProposeEnd] = useState('');
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [isProposing, setIsProposing] = useState(false);

  const refresh = useCallback(async (pid: string) => {
    const { data, error } = await supabase.rpc('get_trip_state', { p_participant_id: pid });
    if (error) {
      setError(translateRpcError(error.message));
      return;
    }
    setState(data as unknown as TripState);
  }, []);

  useEffect(() => {
    setParticipantId(getParticipant(tripId));
  }, [tripId]);

  useEffect(() => {
    if (!participantId) return;
    void refresh(participantId);
    const timer = setInterval(() => void refresh(participantId), POLL_MS);
    return () => clearInterval(timer);
  }, [participantId, refresh]);

  const refreshMine = useCallback(() => {
    if (participantId) void refresh(participantId);
  }, [participantId, refresh]);

  async function setAvailability(optionId: string, availability: Availability) {
    if (!participantId) return;
    await supabase.rpc('set_availability', {
      p_participant_id: participantId,
      p_date_option_id: optionId,
      p_availability: availability,
    });
    void refresh(participantId);
  }

  async function toggleCommit() {
    if (!participantId || !state?.me) return;
    await supabase.rpc('set_commitment', {
      p_participant_id: participantId,
      p_is_committed: !state.me.is_committed,
    });
    void refresh(participantId);
  }

  function describeDateValidation(reason: 'missing_dates' | 'end_before_start' | 'start_in_past') {
    if (reason === 'missing_dates') return 'Bitte beide Daten angeben.';
    if (reason === 'end_before_start') return 'Das Enddatum muss nach dem Startdatum liegen.';
    return 'Das Startdatum darf nicht in der Vergangenheit liegen.';
  }

  async function proposeDateOption() {
    if (!participantId || isProposing) return;
    const today = new Date().toISOString().slice(0, 10);
    const validation = validateDateOptionInput(proposeStart, proposeEnd, today);
    if (!validation.ok) {
      setProposeError(describeDateValidation(validation.reason));
      return;
    }
    setProposeError(null);
    // Guard gegen Doppelklick: propose_date_option legt pro Aufruf eine neue Zeile an,
    // ohne ihn entstehen aus einem zweiten Klick zwei identische Terminfenster.
    setIsProposing(true);
    try {
      const { error } = await supabase.rpc('propose_date_option', {
        p_participant_id: participantId,
        p_start_date: proposeStart,
        p_end_date: proposeEnd,
      });
      if (error) {
        setProposeError(translateRpcError(error.message));
        return;
      }
      setProposeStart('');
      setProposeEnd('');
      void refresh(participantId);
    } finally {
      setIsProposing(false);
    }
  }

  const wrap = { padding: 24, maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui' } as const;

  if (!participantId) {
    return (
      <main style={wrap}>
        <h1>Der Trip</h1>
        <p>Kein Teilnehmer gefunden — bitte über den Einladungslink beitreten.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={wrap}>
        <h1>Der Trip</h1>
        <p style={{ color: 'crimson' }}>Fehler: {error}</p>
      </main>
    );
  }

  const status = state?.trip?.status ?? 'collecting';
  const myAvail = new Map(
    (state?.me?.availabilities ?? []).map((a) => [a.date_option_id, a.availability]),
  );
  const isLocked = DATE_DECIDED_STATUSES.includes(status);

  return (
    <main style={wrap}>
      <h1>{state?.trip?.title ?? 'Der Trip'}</h1>

      {isLocked ? (
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          🎉 Termin steht fest!
          {state?.locked_option
            ? ` ${state.locked_option.start_date} – ${state.locked_option.end_date}`
            : ''}
        </p>
      ) : (
        <p style={{ fontSize: 20, fontWeight: 700 }}>
          {state?.committed_count ?? 0}/{state?.total_participants ?? 0} dabei
        </p>
      )}

      <h2>Wann kannst du?</h2>
      {(state?.options ?? []).map((o) => (
        <div key={o.id} style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>
            {o.start_date} – {o.end_date}
          </div>
          {(['yes', 'maybe', 'no'] as Availability[]).map((a) => (
            <button
              key={a}
              onClick={() => setAvailability(o.id, a)}
              disabled={isLocked}
              style={{
                marginRight: 8,
                padding: 8,
                marginBottom: 4,
                fontWeight: myAvail.get(o.id) === a ? 700 : 400,
                cursor: isLocked ? 'default' : 'pointer',
              }}
            >
              {a === 'yes' ? '✅ Ja' : a === 'maybe' ? '🤔 Vielleicht' : '❌ Nein'}
            </button>
          ))}
        </div>
      ))}

      {!isLocked && (
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Eigenen Termin vorschlagen</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={proposeStart}
              onChange={(e) => setProposeStart(e.target.value)}
              aria-label="Startdatum"
              style={{ padding: 8 }}
            />
            <input
              type="date"
              value={proposeEnd}
              onChange={(e) => setProposeEnd(e.target.value)}
              aria-label="Enddatum"
              style={{ padding: 8 }}
            />
            <button
              onClick={proposeDateOption}
              disabled={isProposing}
              style={{ padding: 8, cursor: isProposing ? 'not-allowed' : 'pointer' }}
            >
              {isProposing ? '…' : 'Vorschlagen'}
            </button>
          </div>
          {proposeError && <p style={{ color: 'crimson', marginTop: 8 }}>{proposeError}</p>}
        </div>
      )}

      {isLocked && (
        <AccommodationSection
          participantId={participantId}
          accommodation={state?.accommodation ?? EMPTY_ACCOMMODATION}
          canEdit={ACCOMMODATION_EDITABLE_STATUSES.includes(status)}
          onChanged={refreshMine}
        />
      )}

      <h2>Wer ist dabei</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(state?.participants ?? []).map((p) => (
          <li key={p.id} style={{ padding: '4px 0' }}>
            {p.is_committed ? '✅' : '⏳'} {p.display_name}
          </li>
        ))}
      </ul>

      {!isLocked && (
        <button
          onClick={toggleCommit}
          style={{ padding: 12, width: '100%', marginTop: 16, fontSize: 16, cursor: 'pointer' }}
        >
          {state?.me?.is_committed ? 'Zusage zurückziehen' : 'Ich bin dabei 🙌'}
        </button>
      )}
    </main>
  );
}
