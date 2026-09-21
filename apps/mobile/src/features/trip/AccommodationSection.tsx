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
  useWindowDimensions,
  View,
  type GestureResponderEvent,
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
 * Zweite, nachgeordnete Sperre: der Ja-Knopf der Kuerungs-Rueckfrage reagiert die
 * ersten Millisekunden nicht. Sie deckt den klassischen Doppeltipp (100-250 ms)
 * deterministisch ab, misst aber die Zeit ab dem Einhaengen der Komponente und
 * nicht ab dem sichtbaren Erscheinen des Fensters — auf einem langsamen Geraet
 * schrumpft das wirksame Fenster. Sie traegt deshalb nicht allein; die
 * eigentliche Absicherung ist `CONFIRM_SAFE_GAP_PX` (siehe ConfirmChoiceDialog).
 */
const CONFIRM_ARM_MS = 600;

/**
 * Mindestabstand zwischen der Stelle, an der der Finger den Kuer-Knopf getroffen
 * hat, und der gesamten Rueckfragekarte. Grosszuegig bemessen: eine Fingerkuppe
 * deckt rund 45 px ab, der Abstand liegt darueber.
 */
const CONFIRM_SAFE_GAP_PX = 56;

/** Der angetippte Vorschlag samt Trefferpunkt des Fingers auf dem Bildschirm. */
interface PendingChoice {
  optionId: string;
  /** `nativeEvent.pageY` des Tipps — Fensterkoordinate, gleiche Ebene wie das Modal. */
  tapPageY: number;
}

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
  const [linkError, setLinkError] = useState<string | null>(null);

  // Die sichtbaren Sperren sind State (sie sollen neu rendern), die eigentlichen
  // Doppeltipp-Guards sind Refs: `disabled` an einem Pressable greift erst nach
  // dem naechsten Render, zwei schnelle Tipps lesen bis dahin denselben
  // State-Closure-Wert und kaemen beide durch.
  const isAddingRef = useRef(false);
  const votingOptionIdRef = useRef<string | null>(null);
  const isChoosingRef = useRef(false);

  // Was der Nutzer angetippt hat, festgehalten im Moment des Tipps: die Option-ID
  // und die Bildschirmhoehe des Treffers. Erst die Bestaetigung loest den RPC aus,
  // und sie nennt den Titel dieser festen ID. Ein Poll, der die Liste
  // zwischendurch umsortiert, aendert daran nichts.
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);

  const options = accommodation.options;
  const myVotes = new Set(accommodation.my_votes);
  const winnerOptionId = resolveAccommodationWinner(
    options.map((option) => ({
      optionId: option.id,
      voteCount: option.vote_count,
      createdAt: option.created_at,
    })),
  );
  const pendingOption = pendingChoice
    ? (options.find((option) => option.id === pendingChoice.optionId) ?? null)
    : null;

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
        setPendingChoice(null);
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
        <ChosenStayCard
          stay={accommodation.chosen_accommodation}
          onOpenLink={(rawUrl) => openStayLink(rawUrl, setLinkError)}
        />
        {linkError && <Text style={styles.error}>{linkError}</Text>}
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
          canChoose={canEdit && pendingChoice === null}
          onToggleVote={() => void toggleVote(option.id)}
          onRequestChoose={(event) =>
            setPendingChoice({ optionId: option.id, tapPageY: event.nativeEvent.pageY })
          }
          onOpenLink={(rawUrl) => openStayLink(rawUrl, setLinkError)}
        />
      ))}

      {actionError && <Text style={styles.error}>{actionError}</Text>}
      {linkError && <Text style={styles.error}>{linkError}</Text>}

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

      {pendingChoice && pendingOption && (
        <ConfirmChoiceDialog
          stayTitle={pendingOption.title}
          tapPageY={pendingChoice.tapPageY}
          isChoosing={isChoosing}
          errorMessage={actionError}
          onCancel={() => setPendingChoice(null)}
          onConfirm={() => void chooseOption(pendingOption.id)}
        />
      )}
    </View>
  );
}

/**
 * Oeffnet den Link im Browser. Schlaegt das fehl — kein Browser fuer dieses
 * Schema, ein kaputter Link aus dem Parsing — waere der Knopf sonst ein Knopf
 * ohne Wirkung und ohne Meldung: der rohe Link steht nirgends auf der Karte.
 */
function openStayLink(rawUrl: string, setLinkError: (message: string | null) => void) {
  // Erst die alte Meldung raeumen, sonst bleibt sie nach einem geglueckten
  // zweiten Versuch stehen.
  setLinkError(null);
  void Linking.openURL(rawUrl).catch(() => {
    setLinkError(`Dieser Link lässt sich nicht öffnen: ${rawUrl}`);
  });
}

function ChosenStayCard({
  stay,
  onOpenLink,
}: {
  stay: ChosenAccommodation;
  onOpenLink: (rawUrl: string) => void;
}) {
  const price = formatPrice(stay.price_cents, stay.currency);
  return (
    <View style={[styles.card, styles.cardChosen]}>
      {stay.image_url && (
        <Image source={{ uri: stay.image_url }} style={styles.image} resizeMode="cover" />
      )}
      <Text style={styles.chosenTitle}>🏠 {stay.title}</Text>
      {price && <Text style={styles.price}>{price}</Text>}
      <Pressable
        onPress={() => onOpenLink(stay.raw_url)}
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
  onRequestChoose: (event: GestureResponderEvent) => void;
  onOpenLink: (rawUrl: string) => void;
}

function StayOptionCard({
  option,
  isVotedByMe,
  isWinner,
  isBusy,
  canChoose,
  onToggleVote,
  onRequestChoose,
  onOpenLink,
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
        onPress={() => onOpenLink(option.raw_url)}
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
  /** Bildschirmhoehe des Tipps, der die Rueckfrage ausgeloest hat. */
  tapPageY: number;
  isChoosing: boolean;
  /** Fehler der letzten Kuerung — er muss IM Fenster stehen, nicht dahinter. */
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Die Rueckfrage liegt als Modal ueber dem Bildschirm: so ist sie ohne Scrollen
 * sichtbar, egal wie weit unten in der Liste der Ausloeser stand.
 *
 * Gegen den zweiten Tipp eines Doppeltipps schuetzt in erster Linie die Geometrie,
 * nicht die Zeit. `tapPageY` ist die Fensterkoordinate des Tipps, der die
 * Rueckfrage ausgeloest hat — dieselbe Koordinatenebene, in der auch das
 * bildschirmfuellende Modal liegt. Die Karte wird an den Bildschirmrand
 * gegenueber dem Treffer gelegt, und der Rand des Hintergrunds auf der
 * Trefferseite wird auf `tapPageY + CONFIRM_SAFE_GAP_PX` (beziehungsweise
 * `windowHeight - tapPageY + CONFIRM_SAFE_GAP_PX`) aufgeblockt. Damit beginnt die
 * Karte — und mit ihr jeder ihrer Knoepfe, unabhaengig von Reihenfolge,
 * Textlaenge und Kartenhoehe — erst mindestens 56 px hinter dem Punkt, an dem der
 * Finger gerade war. Ein zweiter Tipp an derselben Stelle landet auf dem
 * durchsichtigen Hintergrund, der nichts ausloest.
 *
 * Die Zeitsperre (`CONFIRM_ARM_MS`) bleibt zusaetzlich bestehen, traegt aber nicht
 * mehr allein.
 */
function ConfirmChoiceDialog({
  stayTitle,
  tapPageY,
  isChoosing,
  errorMessage,
  onCancel,
  onConfirm,
}: ConfirmChoiceDialogProps) {
  const [isArmed, setIsArmed] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    const timer = setTimeout(() => setIsArmed(true), CONFIRM_ARM_MS);
    return () => clearTimeout(timer);
  }, []);

  const isConfirmDisabled = !isArmed || isChoosing;
  const isTapInUpperHalf = tapPageY < windowHeight / 2;
  const keepAwayFromTap = isTapInUpperHalf
    ? { justifyContent: 'flex-end' as const, paddingTop: tapPageY + CONFIRM_SAFE_GAP_PX }
    : {
        justifyContent: 'flex-start' as const,
        paddingBottom: windowHeight - tapPageY + CONFIRM_SAFE_GAP_PX,
      };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={isChoosing ? undefined : onCancel}
    >
      <View style={[styles.modalBackdrop, keepAwayFromTap]}>
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
          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
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
    paddingHorizontal: 24,
    paddingVertical: 24,
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
