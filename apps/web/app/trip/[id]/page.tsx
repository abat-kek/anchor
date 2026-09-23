'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getParticipant } from '@/lib/participant-store';
import {
  EMPTY_ACCOMMODATION_STATE,
  buildJoinUrl,
  startOfToday,
  toIsoDate,
  translateRpcError,
  validateDateOptionInput,
  type AccommodationState,
  type Availability,
} from '@anchor/shared';
import { AccommodationSection } from './accommodation-section';

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

export default function TripPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [state, setState] = useState<TripState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fehler einzelner Aktionen (Verfuegbarkeit, Zusage). Bewusst getrennt von
  // `error`: der ersetzt die ganze Seite, ein missglueckter Klick darf das nicht.
  const [actionError, setActionError] = useState<string | null>(null);
  const [proposeStart, setProposeStart] = useState('');
  const [proposeEnd, setProposeEnd] = useState('');
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [isProposing, setIsProposing] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [shareCopiedMessage, setShareCopiedMessage] = useState<string | null>(null);
  // Der eigentliche Guard gegen Doppelklick. `isProposing` allein traegt nicht: zwei
  // Klicks im selben React-Batch lesen denselben Closure-Wert. Der State bleibt nur
  // fuer die Anzeige (disabled, Beschriftung). Wie `isProposingRef` in der App.
  const isProposingRef = useRef(false);
  // Guard gegen Doppeltipp beim Einladen
  const isShareLinkRef = useRef(false);

  // Laufende Nummer der juengsten Anfrage. get_trip_state wird vom 4-Sekunden-Poll
  // und von jeder Schreibaktion angestossen; die Antworten koennen sich ueberholen.
  // Ohne diesen Zaehler wirft eine verspaetete Poll-Antwort, die vor einer Stimmabgabe
  // losgeschickt wurde, das frische Ergebnis wieder auf den alten Stand zurueck.
  const latestRefreshRef = useRef(0);

  const refresh = useCallback(async (pid: string) => {
    const requestNumber = latestRefreshRef.current + 1;
    latestRefreshRef.current = requestNumber;

    const { data, error } = await supabase.rpc('get_trip_state', { p_participant_id: pid });

    // Inzwischen ist eine neuere Anfrage unterwegs oder schon angekommen: verwerfen.
    if (requestNumber !== latestRefreshRef.current) return;

    if (error) {
      setError(translateRpcError(error.message));
      return;
    }
    // Der Fehlerbildschirm ersetzt die ganze Seite. Ohne dieses Raeumen bliebe er
    // bis zum Neuladen stehen, obwohl der 4-Sekunden-Poll laengst wieder Antworten
    // liefert — ein einzelner Aussetzer auf Mobilfunk legte die Seite dauerhaft lahm.
    setError(null);
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
    setActionError(null);
    const { error: rpcError } = await supabase.rpc('set_availability', {
      p_participant_id: participantId,
      p_date_option_id: optionId,
      p_availability: availability,
    });
    // Ohne diese Auswertung malt der Poll den alten Zustand zurueck und der Klick
    // wirkt, als sei er verpufft — genau wie mobil wird der Fehler benannt.
    if (rpcError) {
      setActionError(translateRpcError(rpcError.message));
      return;
    }
    void refresh(participantId);
  }

  async function toggleCommit() {
    if (!participantId || !state?.me) return;
    setActionError(null);
    const { error: rpcError } = await supabase.rpc('set_commitment', {
      p_participant_id: participantId,
      p_is_committed: !state.me.is_committed,
    });
    if (rpcError) {
      setActionError(translateRpcError(rpcError.message));
      return;
    }
    void refresh(participantId);
  }

  function describeDateValidation(reason: 'missing_dates' | 'end_before_start' | 'start_in_past') {
    if (reason === 'missing_dates') return 'Bitte beide Daten angeben.';
    if (reason === 'end_before_start') return 'Das Enddatum muss nach dem Startdatum liegen.';
    return 'Das Startdatum darf nicht in der Vergangenheit liegen.';
  }

  async function proposeDateOption() {
    if (!participantId || isProposingRef.current) return;
    // Lokales Kalenderdatum, nicht `toISOString()`: das rechnet in UTC und haelt
    // in Deutschland zwischen Mitternacht und 02:00 (MESZ) noch den Vortag fuer
    // heute — ein Start, den `propose_date_option` danach mit `start_in_past`
    // ablehnt. Derselbe Helfer wie in der App.
    const today = toIsoDate(startOfToday());
    const validation = validateDateOptionInput(proposeStart, proposeEnd, today);
    if (!validation.ok) {
      setProposeError(describeDateValidation(validation.reason));
      return;
    }
    setProposeError(null);
    // Guard gegen Doppelklick: propose_date_option legt pro Aufruf eine neue Zeile an,
    // ohne ihn entstehen aus einem zweiten Klick zwei identische Terminfenster.
    isProposingRef.current = true;
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
      isProposingRef.current = false;
      setIsProposing(false);
    }
  }

  async function handleShareLink() {
    if (!participantId || isShareLinkRef.current) return;
    setActionError(null);
    setShareCopiedMessage(null);
    isShareLinkRef.current = true;
    setIsShareLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_trip_share_token', {
        p_participant_id: participantId,
      });
      if (error) {
        setActionError(translateRpcError(error.message));
        return;
      }
      const shareToken = data as string;
      const url = buildJoinUrl(window.location.origin, shareToken);

      // Versuchen Sie, die Share-API zu verwenden
      if (navigator.share) {
        try {
          await navigator.share({ text: `Bist du dabei? ${url}` });
        } catch (shareError: unknown) {
          // Wenn der Nutzer den Share-Dialog abbricht (AbortError), ist das kein Fehler
          if (!(shareError instanceof Error && shareError.name === 'AbortError')) {
            throw shareError;
          }
        }
      } else {
        // Fallback auf Clipboard-Kopieren
        try {
          await navigator.clipboard.writeText(url);
          setShareCopiedMessage('Link kopiert! 📋');
          setTimeout(() => setShareCopiedMessage(null), 2000);
        } catch {
          setActionError('Link konnte nicht kopiert werden.');
        }
      }
    } finally {
      isShareLinkRef.current = false;
      setIsShareLoading(false);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{state?.trip?.title ?? 'Der Trip'}</h1>
        <button
          onClick={handleShareLink}
          disabled={isShareLoading}
          style={{
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: '#2f6fed',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            cursor: isShareLoading ? 'not-allowed' : 'pointer',
            opacity: isShareLoading ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isShareLoading ? '…' : 'Freunde einladen'}
        </button>
      </div>

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

      {shareCopiedMessage && <p style={{ color: 'green' }}>{shareCopiedMessage}</p>}

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

      {actionError && <p style={{ color: 'crimson' }}>{actionError}</p>}

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
          accommodation={state?.accommodation ?? EMPTY_ACCOMMODATION_STATE}
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
