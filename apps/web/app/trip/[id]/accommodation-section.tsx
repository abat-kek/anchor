'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  describePriceParseFailure,
  formatPrice,
  parsePriceInput,
  resolveAccommodationWinner,
  translateRpcError,
  type AccommodationOptionRow,
  type AccommodationState,
  type ChosenAccommodation,
} from '@anchor/shared';

interface AccommodationSectionProps {
  participantId: string;
  accommodation: AccommodationState;
  /** Vorschlagen, Abstimmen und Kueren sind nur in 'locked'/'accommodation' erlaubt. */
  canEdit: boolean;
  onChanged: () => void;
}

const cardStyle = {
  border: '1px solid #ccc',
  borderRadius: 6,
  padding: 12,
  marginBottom: 12,
} as const;

export function AccommodationSection({
  participantId,
  accommodation,
  canEdit,
  onChanged,
}: AccommodationSectionProps) {
  const [stayUrl, setStayUrl] = useState('');
  const [stayTitle, setStayTitle] = useState('');
  const [stayPrice, setStayPrice] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);
  const [isChoosing, setIsChoosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Die sichtbaren Sperren sind State (sie sollen neu rendern), die eigentlichen
  // Doppelklick-Guards sind Refs: zwei Klick-Events in derselben React-Batch
  // wuerden denselben State-Closure-Wert lesen und beide durchkommen.
  const isAddingRef = useRef(false);
  const votingOptionIdRef = useRef<string | null>(null);
  const isChoosingRef = useRef(false);

  // null = der Nutzer hat das Auswahlfeld noch nicht angefasst, es gilt die Vorbelegung.
  // Der Wrapper-Objekt-Zustand erlaubt es, bewusst "nichts" zu waehlen.
  const [userChoice, setUserChoice] = useState<{ optionId: string | null } | null>(null);

  // Was der Nutzer angeklickt hat, festgehalten im Moment des Klicks. Erst die
  // Bestaetigung loest den RPC aus, und sie nennt den Titel dieser festen ID.
  const [pendingChoiceId, setPendingChoiceId] = useState<string | null>(null);

  const options = accommodation.options;
  const myVotes = new Set(accommodation.my_votes);
  const winnerOptionId = resolveAccommodationWinner(
    options.map((option) => ({
      optionId: option.id,
      voteCount: option.vote_count,
      createdAt: option.created_at,
    })),
  );

  // Die Vorbelegung folgt dem Gewinner aus dem Poll, solange der Nutzer nichts
  // eigenes gewaehlt hat. Sie darf sich also zwischen Blick und Klick aendern —
  // deshalb kuert der Knopf nicht direkt, sondern haelt die ID fest und laesst
  // den Nutzer den Titel bestaetigen (choose_accommodation ist irreversibel).
  const optionIdToChoose = userChoice ? userChoice.optionId : winnerOptionId;
  const pendingChoice = options.find((option) => option.id === pendingChoiceId) ?? null;

  async function addOption() {
    // Guard gegen Doppelklick: add_accommodation_option ist nicht idempotent,
    // ein zweiter Klick legt denselben Vorschlag ein zweites Mal an.
    if (isAddingRef.current) return;

    const parsedPrice = parsePriceInput(stayPrice);
    if (!parsedPrice.ok) {
      setAddError(describePriceParseFailure(parsedPrice.reason));
      return;
    }
    setAddError(null);

    isAddingRef.current = true;
    setIsAdding(true);
    try {
      const { error } = await supabase.rpc('add_accommodation_option', {
        p_participant_id: participantId,
        p_raw_url: stayUrl,
        p_title: stayTitle,
        p_price_cents: parsedPrice.priceCents,
      });
      if (error) {
        setAddError(translateRpcError(error.message));
        return;
      }
      setStayUrl('');
      setStayTitle('');
      setStayPrice('');
      onChanged();
    } finally {
      isAddingRef.current = false;
      setIsAdding(false);
    }
  }

  async function toggleVote(optionId: string) {
    // Guard gegen Doppelklick: zwei schnelle Klicks wuerden die Stimme setzen und
    // sofort wieder zuruecknehmen, ohne dass der Nutzer die Umschaltung bemerkt.
    if (votingOptionIdRef.current !== null) return;
    votingOptionIdRef.current = optionId;
    setVotingOptionId(optionId);
    try {
      const { error } = await supabase.rpc('toggle_accommodation_vote', {
        p_participant_id: participantId,
        p_option_id: optionId,
      });
      setActionError(error ? translateRpcError(error.message) : null);
      if (!error) onChanged();
    } finally {
      votingOptionIdRef.current = null;
      setVotingOptionId(null);
    }
  }

  async function chooseOption(optionId: string) {
    // Guard gegen Doppelklick: choose_accommodation schaltet den Trip auf 'active',
    // der zweite Aufruf faende die Unterkunftsphase nicht mehr vor und wuerde fehlschlagen.
    if (isChoosingRef.current) return;
    isChoosingRef.current = true;
    setIsChoosing(true);
    try {
      const { error } = await supabase.rpc('choose_accommodation', {
        p_participant_id: participantId,
        p_option_id: optionId,
      });
      setActionError(error ? translateRpcError(error.message) : null);
      if (!error) {
        setPendingChoiceId(null);
        onChanged();
      }
    } finally {
      isChoosingRef.current = false;
      setIsChoosing(false);
    }
  }

  if (accommodation.chosen_accommodation) {
    return (
      <section style={{ marginTop: 24 }}>
        <h2>Wo schlafen wir?</h2>
        <ChosenStayCard stay={accommodation.chosen_accommodation} />
      </section>
    );
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2>Wo schlafen wir?</h2>
      {options.length === 0 && <p>Noch kein Vorschlag da — mach den Anfang mit einem Link.</p>}

      {options.map((option) => (
        <StayOptionCard
          key={option.id}
          option={option}
          isVotedByMe={myVotes.has(option.id)}
          isWinner={option.id === winnerOptionId}
          isBusy={votingOptionId !== null || !canEdit}
          onToggleVote={() => void toggleVote(option.id)}
        />
      ))}

      {canEdit && options.length > 0 && (
        <ChoosePanel
          options={options}
          optionIdToChoose={optionIdToChoose}
          pendingChoice={pendingChoice}
          isChoosing={isChoosing}
          onSelect={(optionId) => {
            setUserChoice({ optionId });
            setPendingChoiceId(null);
          }}
          onRequestChoose={() => setPendingChoiceId(optionIdToChoose)}
          onCancelChoose={() => setPendingChoiceId(null)}
          onConfirmChoose={() => pendingChoice && void chooseOption(pendingChoice.id)}
        />
      )}

      {actionError && <p style={{ color: 'crimson', marginTop: 8 }}>{actionError}</p>}

      {canEdit && (
        <AddStayForm
          url={stayUrl}
          title={stayTitle}
          price={stayPrice}
          isAdding={isAdding}
          errorMessage={addError}
          onUrlChange={setStayUrl}
          onTitleChange={setStayTitle}
          onPriceChange={setStayPrice}
          onSubmit={() => void addOption()}
        />
      )}
    </section>
  );
}

function ChosenStayCard({ stay }: { stay: ChosenAccommodation }) {
  const price = formatPrice(stay.price_cents, stay.currency);
  return (
    <div style={{ ...cardStyle, borderColor: '#2a7', borderWidth: 2 }}>
      <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>🏠 {stay.title}</p>
      {price && <p style={{ margin: '4px 0' }}>{price}</p>}
      <a href={stay.raw_url} target="_blank" rel="noopener noreferrer">
        Zur Unterkunft
      </a>
    </div>
  );
}

interface StayOptionCardProps {
  option: AccommodationOptionRow;
  isVotedByMe: boolean;
  isWinner: boolean;
  isBusy: boolean;
  onToggleVote: () => void;
}

function StayOptionCard({
  option,
  isVotedByMe,
  isWinner,
  isBusy,
  onToggleVote,
}: StayOptionCardProps) {
  const price = formatPrice(option.price_cents, option.currency);
  return (
    <div style={cardStyle}>
      <p style={{ fontWeight: isWinner ? 700 : 400, margin: 0 }}>
        {isWinner ? '⭐ ' : ''}
        {option.title}
      </p>
      {price && <p style={{ margin: '4px 0' }}>{price}</p>}
      <a href={option.raw_url} target="_blank" rel="noopener noreferrer">
        Link öffnen
      </a>
      <div style={{ marginTop: 8 }}>
        <button
          onClick={onToggleVote}
          disabled={isBusy}
          aria-pressed={isVotedByMe}
          style={{ padding: 8, cursor: isBusy ? 'not-allowed' : 'pointer' }}
        >
          {isVotedByMe ? '☑' : '☐'} Dafür · {option.vote_count}
        </button>
      </div>
    </div>
  );
}

interface ChoosePanelProps {
  options: AccommodationOptionRow[];
  optionIdToChoose: string | null;
  /** Der im Klickmoment festgehaltene Vorschlag, oder null solange nichts ansteht. */
  pendingChoice: AccommodationOptionRow | null;
  isChoosing: boolean;
  onSelect: (optionId: string | null) => void;
  onRequestChoose: () => void;
  onCancelChoose: () => void;
  onConfirmChoose: () => void;
}

function ChoosePanel({
  options,
  optionIdToChoose,
  pendingChoice,
  isChoosing,
  onSelect,
  onRequestChoose,
  onCancelChoose,
  onConfirmChoose,
}: ChoosePanelProps) {
  if (pendingChoice) {
    return (
      <ConfirmChoice
        stayTitle={pendingChoice.title}
        isChoosing={isChoosing}
        onCancel={onCancelChoose}
        onConfirm={onConfirmChoose}
      />
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor="stay-choice" style={{ display: 'block', marginBottom: 4 }}>
        Vorschlag küren
      </label>
      <select
        id="stay-choice"
        value={optionIdToChoose ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        style={{ padding: 8, width: '100%', marginBottom: 8 }}
      >
        <option value="">Bitte auswählen</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title} ({option.vote_count})
          </option>
        ))}
      </select>
      <button
        onClick={onRequestChoose}
        disabled={!optionIdToChoose}
        style={{
          padding: 12,
          width: '100%',
          fontSize: 16,
          cursor: optionIdToChoose ? 'pointer' : 'not-allowed',
        }}
      >
        Diese Unterkunft nehmen wir
      </button>
    </div>
  );
}

interface ConfirmChoiceProps {
  stayTitle: string;
  isChoosing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmChoice({ stayTitle, isChoosing, onCancel, onConfirm }: ConfirmChoiceProps) {
  return (
    <div style={{ ...cardStyle, marginTop: 16, borderColor: '#2a7' }}>
      <p style={{ marginTop: 0 }}>
        Wirklich <strong>{stayTitle}</strong> küren? Danach lässt sich die Unterkunft nicht mehr
        ändern.
      </p>
      <button
        onClick={onConfirm}
        disabled={isChoosing}
        style={{
          padding: 12,
          width: '100%',
          fontSize: 16,
          cursor: isChoosing ? 'not-allowed' : 'pointer',
        }}
      >
        {isChoosing ? '…' : `Ja, ${stayTitle} nehmen wir`}
      </button>
      <button
        onClick={onCancel}
        disabled={isChoosing}
        style={{ padding: 8, width: '100%', marginTop: 8, cursor: 'pointer' }}
      >
        Abbrechen
      </button>
    </div>
  );
}

interface AddStayFormProps {
  url: string;
  title: string;
  price: string;
  isAdding: boolean;
  errorMessage: string | null;
  onUrlChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onSubmit: () => void;
}

function AddStayForm({
  url,
  title,
  price,
  isAdding,
  errorMessage,
  onUrlChange,
  onTitleChange,
  onPriceChange,
  onSubmit,
}: AddStayFormProps) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>Unterkunft vorschlagen</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://…"
          aria-label="Link zur Unterkunft"
          style={{ padding: 8 }}
        />
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Name der Unterkunft"
          aria-label="Name der Unterkunft"
          style={{ padding: 8 }}
        />
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          placeholder="Preis in Euro (optional)"
          aria-label="Preis in Euro"
          style={{ padding: 8 }}
        />
        <button
          onClick={onSubmit}
          disabled={isAdding}
          style={{ padding: 8, cursor: isAdding ? 'not-allowed' : 'pointer' }}
        >
          {isAdding ? '…' : 'Vorschlagen'}
        </button>
      </div>
      {errorMessage && <p style={{ color: 'crimson', marginTop: 8 }}>{errorMessage}</p>}
    </div>
  );
}
