/**
 * Umwandlung zwischen der ISO-Schreibweise `YYYY-MM-TT`, die ueber die RPCs und
 * durch `validateDateOptionInput` laeuft, und dem `Date`-Objekt, mit dem ein
 * nativer Kalenderdialog arbeitet — plus der lesbaren Anzeige `14.03.2026`.
 *
 * Die Umrechnung liegt hier und nicht in der App, weil sie reine Rechenlogik
 * mit einer bekannten Falle ist: `new Date('2026-03-14')` liest die Zeichenkette
 * als Mitternacht UTC, und `toISOString()` schreibt wieder in UTC. Oestlich und
 * westlich von Greenwich faellt dabei je nach Zeitzone ein Tag heraus oder
 * hinzu. Beide Funktionen rechnen deshalb ausschliesslich mit den lokalen
 * Bestandteilen eines `Date`.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/** Lokales Kalenderdatum eines `Date` als `YYYY-MM-TT`. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

/**
 * `YYYY-MM-TT` als lokales `Date` (Mitternacht Ortszeit). Gibt `null` zurueck,
 * wenn die Zeichenkette kein Datum in dieser Form ist — etwa die leere
 * Vorbelegung, solange der Nutzer noch nichts gewaehlt hat.
 */
export function parseIsoDate(isoDate: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  // Faengt Kalendertage ab, die es nicht gibt (2026-02-30 rutscht sonst auf den
  // 2. Maerz weiter und wuerde als gueltiges Datum durchgehen).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** `2026-03-14` als `14.03.2026`, oder `null` wenn nichts anzuzeigen ist. */
export function formatIsoDateGerman(isoDate: string): string | null {
  const date = parseIsoDate(isoDate);
  if (!date) return null;
  return `${padTwo(date.getDate())}.${padTwo(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** Heutiges Kalenderdatum, Mitternacht Ortszeit — die Untergrenze im Dialog. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
