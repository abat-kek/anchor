/**
 * Uebersetzung der RPC-Fehlercodes aus den Migrationen 0009/0010/0011 ins Deutsche.
 *
 * Diese Tabelle ist die einzige im Projekt (Ruling V3): Web und Mobile teilen sie sich,
 * damit die Formulierungen nicht auseinanderdriften.
 *
 * Hintergrund zur Signatur: Postgres meldet die Codes ueber `raise exception '<code>'`.
 * Supabase reicht sie im Feld `error.message` durch, haeufig mit Zusatztext davor oder
 * dahinter (z. B. `P0001: url_invalid` oder Praefixe aus PostgREST). Deshalb wird der
 * Code im Text *gesucht* und nicht auf Gleichheit geprueft. Ist kein bekannter Code
 * enthalten, liefert die Funktion bewusst einen neutralen Ersatztext — die rohe
 * Postgres-Meldung darf nie beim Nutzer landen.
 */

export type RpcErrorCode =
  | 'invalid_participant'
  | 'invalid_option'
  | 'option_not_in_trip'
  | 'trip_not_in_accommodation_phase'
  | 'url_required'
  | 'url_invalid'
  | 'title_required'
  | 'price_invalid'
  | 'invalid_date_range'
  | 'start_in_past'
  | 'trip_not_collecting';

export const RPC_ERROR_MESSAGES: Readonly<Record<RpcErrorCode, string>> = {
  invalid_participant:
    'Wir kennen dich in diesem Trip nicht. Bitte noch einmal über den Einladungslink beitreten.',
  invalid_option: 'Diesen Vorschlag gibt es nicht mehr.',
  option_not_in_trip: 'Dieser Vorschlag gehört zu einem anderen Trip.',
  trip_not_in_accommodation_phase: 'Der Trip ist gerade nicht in der Unterkunftsphase.',
  url_required: 'Bitte einen Link angeben.',
  url_invalid: 'Das sieht nicht nach einem Link aus.',
  title_required: 'Bitte einen Namen für die Unterkunft angeben.',
  price_invalid: 'Der Preis darf nicht negativ sein.',
  invalid_date_range: 'Das Enddatum muss nach dem Startdatum liegen.',
  start_in_past: 'Das Startdatum darf nicht in der Vergangenheit liegen.',
  trip_not_collecting: 'Für diesen Trip werden gerade keine Termine gesammelt.',
} as const;

/** Ersatztext, wenn kein bekannter Code in der Meldung steckt. */
export const UNKNOWN_RPC_ERROR_MESSAGE =
  'Das hat gerade nicht geklappt. Bitte versuch es noch einmal.';

const KNOWN_CODES = Object.keys(RPC_ERROR_MESSAGES) as RpcErrorCode[];

/**
 * Sucht einen bekannten Fehlercode in einer rohen Supabase-Fehlermeldung.
 * Die Grenzpruefung verhindert Treffer innerhalb laengerer Bezeichner.
 */
export function findRpcErrorCode(rawMessage: string | null | undefined): RpcErrorCode | null {
  if (!rawMessage) return null;

  for (const code of KNOWN_CODES) {
    const pattern = new RegExp(`(^|[^a-z0-9_])${code}([^a-z0-9_]|$)`, 'i');
    if (pattern.test(rawMessage)) return code;
  }

  return null;
}

/**
 * Uebersetzt eine rohe Supabase-Fehlermeldung in einen anzeigbaren deutschen Satz.
 *
 * @param rawMessage `error.message` aus dem Supabase-Client, darf null/leer sein.
 * @param fallbackMessage Text fuer unbekannte Codes; standardmaessig ein neutraler Satz.
 * @returns Immer ein anzeigbarer Satz, nie die rohe Postgres-Meldung.
 */
export function translateRpcError(
  rawMessage: string | null | undefined,
  fallbackMessage: string = UNKNOWN_RPC_ERROR_MESSAGE,
): string {
  const code = findRpcErrorCode(rawMessage);
  return code ? RPC_ERROR_MESSAGES[code] : fallbackMessage;
}
