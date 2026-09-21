/**
 * Liest `og:title` / `og:image` / `og:price:amount` aus rohem HTML-Text.
 * Reine Zeichenkettenlogik, keine DOM-Abhaengigkeit (in der Edge Function
 * steht kein DOM-Parser zur Verfuegung, und ein vollstaendiger HTML-Parser
 * waere fuer drei `<meta>`-Werte deutlich mehr, als die Aufgabe verlangt).
 *
 * `og:title` ist bewusst nicht nur ein Datenfeld, sondern das Signal fuer
 * Erfolg: liefert eine Seite keinen Titel-Tag, gilt sie als geparst
 * gescheitert (siehe `supabase/functions/parse-accommodation/index.ts`),
 * unabhaengig vom HTTP-Status. Genau das unterscheidet echtes
 * Unterkunfts-Markup (Airbnb) von einer Bot-Abwehrseite, die mit 200/202
 * antwortet, aber keine `og:`-Tags enthaelt (Booking, siehe Vorbefund
 * Task 6, Schritt 1).
 */

export interface OpenGraphData {
  title: string | null;
  imageUrl: string | null;
  /** In Cent, gerundet. `null`, wenn `og:price:amount` fehlt oder nicht als Zahl lesbar ist. */
  priceAmountCents: number | null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Findet den `content`-Wert eines `<meta property="{propertyName}" ...>`-Tags.
 * `property` und `content` koennen in beliebiger Reihenfolge stehen (beide
 * Varianten kommen in freier Wildbahn vor), Anfuehrungszeichen einfach oder
 * doppelt.
 */
function extractMetaContent(html: string, propertyName: string): string | null {
  const propertyThenContent = new RegExp(
    `<meta[^>]*?\\bproperty=["']${propertyName}["'][^>]*?\\bcontent=["']([^"']*)["']`,
    'i',
  );
  const contentThenProperty = new RegExp(
    `<meta[^>]*?\\bcontent=["']([^"']*)["'][^>]*?\\bproperty=["']${propertyName}["']`,
    'i',
  );

  const match = propertyThenContent.exec(html) ?? contentThenProperty.exec(html);
  if (!match?.[1]) return null;
  const decoded = decodeHtmlEntities(match[1]).trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * Wandelt eine `og:price:amount`-Rohangabe ("89.50", "89,50") in Cent um.
 * Liefert `null` bei allem, was keine plausible, nicht-negative Zahl ist —
 * eine kaputte Preisangabe darf `price_cents` nicht mit Muell ueberschreiben.
 */
function parseOgPriceAmountCents(rawAmount: string): number | null {
  const normalized = rawAmount.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function extractOpenGraphTags(html: string): OpenGraphData {
  const title = extractMetaContent(html, 'og:title');
  const imageUrl = extractMetaContent(html, 'og:image');
  const rawPriceAmount = extractMetaContent(html, 'og:price:amount');

  return {
    title,
    imageUrl,
    priceAmountCents: rawPriceAmount ? parseOgPriceAmountCents(rawPriceAmount) : null,
  };
}
