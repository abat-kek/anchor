import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
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

/**
 * Wartezeit, bis der Ja-Knopf der Kuerungs-Rueckfrage reagiert.
 *
 * Auf dem Telefon ist der zweite Tipp eines Doppeltipps das eigentliche Risiko:
 * `choose_accommodation` ist unwiderruflich, und anders als im Browser laesst
 * sich die Position des Ja-Knopfes nicht zuverlaessig weit genug vom eben
 * getippten Knopf weghalten — die Liste ist scrollbar, der Ausloeser kann
 * ueberall stehen. Die kurze Sperre wirkt unabhaengig von der Position.
 */
const CONFIRM_ARM_MS = 600;

interface AccommodationSectionProps {
  participantId: string;
  accommodation: AccommodationState;
  /** Vorschlagen, Abstimmen und Kueren sind nur in 'locked'/'accommodation' erlaubt. */
  canEdit: boolean;
  onChanged: () => void;
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
  const [isChoosing, setIsChoosing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Die sichtbaren Sperren sind State (sie sollen neu rendern), die eigentlichen
  // Doppeltipp-Guards sind Refs: `disabled` an einem Pressable greift erst nach
  // dem naechsten Render, zwei schnelle Tipps lesen bis dahin denselben
  // State-Closure-Wert und kaemen beide durch.
  const isAddingRef = useRef(false);
  const votingOptionIdRef = useRef<string | null>(null);
  const isChoosingRef = useRef(false);

  // Was der Nutzer angetippt hat, festgehalten im Moment des Tipps. Erst die
  // Bestaetigung loest den RPC aus, und sie nennt den Titel dieser festen ID.
  // Ein Poll, der die Liste zwischendurch umsortiert, aendert daran nichts.
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
  const pendingChoice = options.find((option) => option.id === pendingChoiceId) ?? null;

  async function addOption() {
    // Guard gegen Doppeltipp: add_accommodation_option ist nicht idempotent,
    // ein zweiter Tipp legt denselben Vorschlag ein zweites Mal an.
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
    // Guard gegen Doppeltipp: zwei schnelle Tipps wuerden die Stimme setzen und
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
    // Guard gegen Doppeltipp: choose_accommodation schaltet den Trip auf 'active',
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wo schlafen wir?</Text>
        <ChosenStayCard stay={accommodation.chosen_accommodation} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Wo schlafen wir?</Text>
      {options.length === 0 && (
        <Text style={styles.hint}>Noch kein Vorschlag da — mach den Anfang mit einem Link.</Text>
      )}

      {options.map((option) => (
        <StayOptionCard
          key={option.id}
          option={option}
          isVotedByMe={myVotes.has(option.id)}
          isWinner={option.id === winnerOptionId}
          isBusy={votingOptionId !== null || !canEdit}
          canChoose={canEdit && pendingChoiceId === null}
          onToggleVote={() => void toggleVote(option.id)}
          onRequestChoose={() => setPendingChoiceId(option.id)}
        />
      ))}

      {actionError && <Text style={styles.error}>{actionError}</Text>}

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

      {pendingChoice && (
        <ConfirmChoiceDialog
          stayTitle={pendingChoice.title}
          isChoosing={isChoosing}
          onCancel={() => setPendingChoiceId(null)}
          onConfirm={() => void chooseOption(pendingChoice.id)}
        />
      )}
    </View>
  );
}

function openStayLink(rawUrl: string) {
  void Linking.openURL(rawUrl).catch(() => {
    // Ein nicht oeffenbarer Link ist kein Grund, den Bildschirm zu stoeren;
    // der rohe Link steht als Text unter dem Titel.
  });
}

function ChosenStayCard({ stay }: { stay: ChosenAccommodation }) {
  const price = formatPrice(stay.price_cents, stay.currency);
  return (
    <View style={[styles.card, styles.cardChosen]}>
      {stay.image_url && (
        <Image source={{ uri: stay.image_url }} style={styles.image} resizeMode="cover" />
      )}
      <Text style={styles.chosenTitle}>🏠 {stay.title}</Text>
      {price && <Text style={styles.price}>{price}</Text>}
      <Pressable
        onPress={() => openStayLink(stay.raw_url)}
        accessibilityRole="link"
        accessibilityLabel={`Zur Unterkunft ${stay.title}`}
      >
        <Text style={styles.link}>Zur Unterkunft</Text>
      </Pressable>
    </View>
  );
}

interface StayOptionCardProps {
  option: AccommodationOptionRow;
  isVotedByMe: boolean;
  isWinner: boolean;
  isBusy: boolean;
  canChoose: boolean;
  onToggleVote: () => void;
  onRequestChoose: () => void;
}

function StayOptionCard({
  option,
  isVotedByMe,
  isWinner,
  isBusy,
  canChoose,
  onToggleVote,
  onRequestChoose,
}: StayOptionCardProps) {
  const price = formatPrice(option.price_cents, option.currency);
  return (
    <View style={styles.card}>
      {option.image_url && (
        <Image source={{ uri: option.image_url }} style={styles.image} resizeMode="cover" />
      )}
      <Text style={[styles.optionTitle, isWinner && styles.optionTitleWinner]}>
        {isWinner ? '⭐ ' : ''}
        {option.title}
      </Text>
      {price && <Text style={styles.price}>{price}</Text>}
      <Pressable
        onPress={() => openStayLink(option.raw_url)}
        accessibilityRole="link"
        accessibilityLabel={`Link zu ${option.title} öffnen`}
      >
        <Text style={styles.link}>Link öffnen</Text>
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable
          onPress={onToggleVote}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityState={{ selected: isVotedByMe, disabled: isBusy }}
          style={[styles.voteButton, isVotedByMe && styles.voteButtonSelected, isBusy && styles.disabled]}
        >
          <Text style={styles.buttonText}>
            {isVotedByMe ? '☑' : '☐'} Dafür · {option.vote_count}
          </Text>
        </Pressable>
        <Pressable
          onPress={onRequestChoose}
          disabled={!canChoose}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canChoose }}
          style={[styles.chooseButton, !canChoose && styles.disabled]}
        >
          <Text style={styles.buttonText}>Diese nehmen wir</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ConfirmChoiceDialogProps {
  stayTitle: string;
  isChoosing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Die Rueckfrage liegt als Modal ueber dem Bildschirm: so ist sie ohne Scrollen
 * sichtbar, egal wie weit unten in der Liste der Ausloeser stand. Der Ja-Knopf
 * ist die ersten Millisekunden gesperrt, damit der zweite Tipp eines Doppeltipps
 * die unwiderrufliche Kuerung nicht aus Versehen bestaetigt.
 */
function ConfirmChoiceDialog({
  stayTitle,
  isChoosing,
  onCancel,
  onConfirm,
}: ConfirmChoiceDialogProps) {
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsArmed(true), CONFIRM_ARM_MS);
    return () => clearTimeout(timer);
  }, []);

  const isConfirmDisabled = !isArmed || isChoosing;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={isChoosing ? undefined : onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard} accessibilityViewIsModal accessibilityRole="alert">
          <Text style={styles.modalQuestion}>
            Wirklich <Text style={styles.modalTitleStrong}>{stayTitle}</Text> küren? Danach lässt
            sich die Unterkunft nicht mehr ändern.
          </Text>
          <Pressable
            onPress={onConfirm}
            disabled={isConfirmDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isConfirmDisabled }}
            style={[styles.confirmButton, isConfirmDisabled && styles.disabled]}
          >
            {isChoosing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Ja, {stayTitle} nehmen wir</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onCancel}
            disabled={isChoosing}
            accessibilityRole="button"
            accessibilityState={{ disabled: isChoosing }}
            style={[styles.cancelButton, isChoosing && styles.disabled]}
          >
            <Text style={styles.buttonText}>Abbrechen</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    <View style={styles.addForm}>
      <Text style={styles.sectionTitle}>Unterkunft vorschlagen</Text>
      <TextInput
        value={url}
        onChangeText={onUrlChange}
        placeholder="https://…"
        placeholderTextColor="#8a8a94"
        accessibilityLabel="Link zur Unterkunft"
        autoCapitalize="none"
        keyboardType="url"
        style={styles.input}
      />
      <TextInput
        value={title}
        onChangeText={onTitleChange}
        placeholder="Name der Unterkunft"
        placeholderTextColor="#8a8a94"
        accessibilityLabel="Name der Unterkunft"
        style={styles.input}
      />
      <TextInput
        value={price}
        onChangeText={onPriceChange}
        placeholder="Preis in Euro (optional)"
        placeholderTextColor="#8a8a94"
        accessibilityLabel="Preis in Euro"
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <Pressable
        onPress={onSubmit}
        disabled={isAdding}
        accessibilityRole="button"
        accessibilityState={{ disabled: isAdding }}
        style={[styles.submitButton, isAdding && styles.disabled]}
      >
        {isAdding ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Vorschlagen</Text>}
      </Pressable>
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 8 },
  hint: { color: '#c7c7d1', fontSize: 14 },
  card: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: '#17171d',
  },
  cardChosen: { borderColor: '#2a7', borderWidth: 2 },
  image: { width: '100%', height: 140, borderRadius: 8, backgroundColor: '#23232b' },
  optionTitle: { color: '#fff', fontSize: 15 },
  optionTitleWinner: { fontWeight: '700' },
  chosenTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  price: { color: '#c7c7d1', fontSize: 14 },
  link: { color: '#79a6ff', fontSize: 14, paddingVertical: 4 },
  cardActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  voteButton: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1d1d24',
  },
  voteButtonSelected: { borderColor: '#2f6fed', backgroundColor: '#1c2b4d' },
  chooseButton: {
    borderWidth: 1,
    borderColor: '#2a7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#14251c',
  },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  addForm: { gap: 8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    backgroundColor: '#17171d',
  },
  submitButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  error: { fontSize: 14, color: '#ff6b6b' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#17171d',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#2a7',
    padding: 20,
    gap: 12,
  },
  modalQuestion: { color: '#fff', fontSize: 16, lineHeight: 22 },
  modalTitleStrong: { fontWeight: '700' },
  confirmButton: {
    backgroundColor: '#2a7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
});
