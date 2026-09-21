'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveAccommodationWinner, translateRpcError } from '@anchor/shared';

export interface AccommodationOptionRow {
  id: string;
  raw_url: string;
  title: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
  parse_status: string;
  created_at: string;
  vote_count: number;
}

export interface ChosenAccommodation {
  id: string;
  raw_url: string;
  title: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
}

/** Der `accommodation`-Block aus get_trip_state (Migration 0011). */
export interface AccommodationState {
  options: AccommodationOptionRow[];
  my_votes: string[];
  chosen_accommodation: ChosenAccommodation | null;
}

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

type PriceParseResult = { ok: true; priceCents: number | null } | { ok: false };

/** Eingabe in Euro ("89", "89,50", "89.50") in Cent umrechnen. Leer bedeutet kein Preis. */
export function parsePriceInput(rawPrice: string): PriceParseResult {
  const trimmed = rawPrice.trim();
  if (trimmed === '') return { ok: true, priceCents: null };

  const normalized = trimmed.replace(',', '.');
  if (!/^\d+([.]\d{1,2})?$/.test(normalized)) return { ok: false };

  return { ok: true, priceCents: Math.round(Number(normalized) * 100) };
}

export function formatPrice(priceCents: number | null, currency: string): string | null {
  if (priceCents === null) return null;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}

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
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isChoosing, setIsChoosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const options = accommodation.options;
  const myVotes = new Set(accommodation.my_votes);
  const winnerOptionId = resolveAccommodationWinner(
    options.map((option) => ({
      optionId: option.id,
      voteCount: option.vote_count,
      createdAt: option.created_at,
    })),
  );
  const optionIdToChoose = selectedOptionId ?? winnerOptionId;

  async function addOption() {
    // Guard gegen Doppelklick: add_accommodation_option ist nicht idempotent,
    // ein zweiter Klick legt denselben Vorschlag ein zweites Mal an.
    if (isAdding) return;
    const parsedPrice = parsePriceInput(stayPrice);
    if (!parsedPrice.ok) {
      setAddError('Bitte einen Preis wie 89 oder 89,50 angeben.');
      return;
    }
    setAddError(null);
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
      setIsAdding(false);
    }
  }

  async function toggleVote(optionId: string) {
    // Guard gegen Doppelklick: zwei schnelle Klicks wuerden die Stimme setzen und
    // sofort wieder zuruecknehmen, ohne dass der Nutzer die Umschaltung bemerkt.
    if (votingOptionId !== null) return;
    setVotingOptionId(optionId);
    try {
      const { error } = await supabase.rpc('toggle_accommodation_vote', {
        p_participant_id: participantId,
        p_option_id: optionId,
      });
      setActionError(error ? translateRpcError(error.message) : null);
      if (!error) onChanged();
    } finally {
      setVotingOptionId(null);
    }
  }

  async function chooseOption(optionId: string) {
    // Guard gegen Doppelklick: choose_accommodation schaltet den Trip auf 'active',
    // der zweite Aufruf faende die Unterkunftsphase nicht mehr vor und wuerde fehlschlagen.
    if (isChoosing) return;
    setIsChoosing(true);
    try {
      const { error } = await supabase.rpc('choose_accommodation', {
        p_participant_id: participantId,
        p_option_id: optionId,
      });
      setActionError(error ? translateRpcError(error.message) : null);
      if (!error) onChanged();
    } finally {
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
          isChoosing={isChoosing}
          onSelect={setSelectedOptionId}
          onChoose={() => optionIdToChoose && void chooseOption(optionIdToChoose)}
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
  isChoosing: boolean;
  onSelect: (optionId: string | null) => void;
  onChoose: () => void;
}

function ChoosePanel({
  options,
  optionIdToChoose,
  isChoosing,
  onSelect,
  onChoose,
}: ChoosePanelProps) {
  const isDisabled = isChoosing || !optionIdToChoose;
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
        onClick={onChoose}
        disabled={isDisabled}
        style={{
          padding: 12,
          width: '100%',
          fontSize: 16,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {isChoosing ? '…' : 'Diese Unterkunft nehmen wir'}
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
