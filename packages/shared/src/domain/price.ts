/**
 * Euro-Eingabe <-> Cent. Liegt in shared, weil Web und Mobile dieselbe
 * Umrechnung brauchen und Scheibe 3 (Kosten) sie ebenfalls verwenden wird.
 */

/**
 * Obergrenze fuer Preise: 1.000.000,00 in der jeweiligen Waehrung.
 *
 * Die Spalte `accommodation_options.price_cents` ist ein `integer` (int4,
 * max. 2.147.483.647). Ohne lokale Grenze wuerde eine Eingabe wie "25000000"
 * erst in Postgres als "integer out of range" auflaufen — ein Fehler ohne
 * bekannten Code, den der Nutzer nur als allgemeine Stoerung zu sehen
 * bekaeme. Die Grenze liegt bewusst deutlich unter int4, damit die Meldung
 * ueber einen unplausiblen Preis spricht und nicht ueber Zahlenbereiche.
 */
export const MAX_PRICE_CENTS = 100_000_000;

export type PriceParseFailure = 'not_a_number' | 'too_large';

export type PriceParseResult =
  | { ok: true; priceCents: number | null }
  | { ok: false; reason: PriceParseFailure };

/**
 * Nimmt eine Preiseingabe in Euro ("89", "89,50", "89.50") und rechnet sie in
 * Cent um. Eine leere Eingabe ist gueltig und bedeutet "kein Preis" (`null`),
 * weil der Preis fachlich optional ist.
 */
export function parsePriceInput(rawPrice: string): PriceParseResult {
  const trimmed = rawPrice.trim();
  if (trimmed === '') return { ok: true, priceCents: null };

  const normalized = trimmed.replace(',', '.');
  if (!/^\d+([.]\d{1,2})?$/.test(normalized)) return { ok: false, reason: 'not_a_number' };

  const priceCents = Math.round(Number(normalized) * 100);
  if (priceCents > MAX_PRICE_CENTS) return { ok: false, reason: 'too_large' };

  return { ok: true, priceCents };
}

export function describePriceParseFailure(reason: PriceParseFailure): string {
  if (reason === 'too_large') {
    return 'Dieser Preis ist zu hoch — bitte höchstens 1.000.000 angeben.';
  }
  return 'Bitte einen Preis wie 89 oder 89,50 angeben.';
}

/**
 * Formatiert Cent als deutschen Waehrungsbetrag. Gibt `null` zurueck, wenn
 * kein Preis hinterlegt ist, damit der Aufrufer die Zeile ganz weglassen kann.
 * Ein unbekannter Waehrungscode darf die Anzeige nicht sprengen, deshalb der
 * schlichte Ersatz.
 */
export function formatPrice(priceCents: number | null, currency: string): string | null {
  if (priceCents === null) return null;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}
