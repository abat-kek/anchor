/**
 * Der `accommodation`-Block aus `get_trip_state`
 * (siehe `supabase/migrations/0011_accommodation.sql`).
 *
 * Die Feldnamen sind bewusst snake_case: das ist die Gestalt, die der RPC
 * liefert, nicht ein umbenanntes Domaenenmodell. Web und Mobile lesen
 * dieselbe Antwort, deshalb liegen die Typen hier statt doppelt in beiden Apps.
 */

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

export interface AccommodationState {
  options: AccommodationOptionRow[];
  my_votes: string[];
  chosen_accommodation: ChosenAccommodation | null;
}

/** Ausgangszustand, solange `get_trip_state` noch nicht geantwortet hat. */
export const EMPTY_ACCOMMODATION_STATE: AccommodationState = Object.freeze({
  options: [],
  my_votes: [],
  chosen_accommodation: null,
});
