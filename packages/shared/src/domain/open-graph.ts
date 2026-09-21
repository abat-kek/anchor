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

import { MAX_PRICE_CENTS } from './price';

export interface OpenGraphData {
  title: string | null;
  /** `null`, wenn og:image fehlt ODER kein `https`-Bildlink innerhalb der Laengengrenze ist. */
  imageUrl: string | null;
  /** In Cent, gerundet. `null`, wenn `og:price:amount` fehlt, nicht lesbar oder unplausibel gross ist. */
  priceAmountCents: number | null;
}

/**
 * Obergrenze fuer die Laenge einer aus `og:image` uebernommenen URL. Ohne
 * diese Grenze koennte eine bis zu ~256-KiB-lange `data:`-URI (die Function
 * liest maximal 256 KiB Body) ungefiltert in die Datenbank wandern — die
 * Oberflaechen rendern `image_url` direkt als `<img src>`/`Image source`.
 * 2048 Zeichen sind fuer eine echte Bild-URL grosszuegig genug (siehe RFC
 * 3986 / gaengige Browser-/Server-Limits), lassen eine eingebettete
 * Bild-URL aber weit hinter sich.
 */
const MAX_IMAGE_URL_LENGTH = 2048;

/**
 * Nur `https`-Bildlinks innerhalb der Laengengrenze gelten als sicher genug,
 * um ungeprueft in `accommodation_options.image_url` zu landen. Weder
 * `data:`- noch `http:`-URIs kommen durch. Ein nicht als URL parsbarer Wert
 * gilt ebenfalls als unsicher (fail-closed).
 */
function isSafeImageUrl(rawUrl: string): boolean {
  if (rawUrl.length > MAX_IMAGE_URL_LENGTH) return false;
  try {
    return new URL(rawUrl).protocol === 'https:';
  } catch {
    return false;
  }
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
 *
 * Die Obergrenze `MAX_PRICE_CENTS` (aus `./price`, dieselbe Grenze wie fuer
 * die manuelle Preiseingabe) ist hier PFLICHT, nicht nur Kosmetik:
 * `price_cents` ist in Postgres ein `integer` (int4, max. 2.147.483.647).
 * Ohne diese Grenze wuerde ein `og:price:amount` wie "999999999999" das
 * gesamte `update` in der Edge Function mit einem Bereichsfehler scheitern
 * lassen — und damit wuerde nicht einmal mehr `parse_status` geschrieben.
 */
function parseOgPriceAmountCents(rawAmount: string): number | null {
  const normalized = rawAmount.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const cents = Math.round(parsed * 100);
  return cents > MAX_PRICE_CENTS ? null : cents;
}

export function extractOpenGraphTags(html: string): OpenGraphData {
  const title = extractMetaContent(html, 'og:title');
  const rawImageUrl = extractMetaContent(html, 'og:image');
  const rawPriceAmount = extractMetaContent(html, 'og:price:amount');

  return {
    title,
    imageUrl: rawImageUrl && isSafeImageUrl(rawImageUrl) ? rawImageUrl : null,
    priceAmountCents: rawPriceAmount ? parseOgPriceAmountCents(rawPriceAmount) : null,
  };
}
