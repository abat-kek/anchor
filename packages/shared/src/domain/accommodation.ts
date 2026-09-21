export interface AccommodationTally {
  optionId: string;
  voteCount: number;
  createdAt: string; // ISO datetime, entscheidet den Gleichstand
}

/**
 * Parst `createdAt` zu einem vergleichbaren Zeitpunkt (ms seit Epoch).
 *
 * `createdAt` kommt aus `get_trip_state` (siehe
 * `supabase/migrations/0011_accommodation.sql`), wo Postgres einen
 * `timestamptz` in der Session-Zone nach jsonb rendert. Zwei Werte fuer
 * denselben Zeitpunkt koennen also mit unterschiedlichem Offset ankommen
 * (`+00:00` neben `+02:00`); ein Zeichenkettenvergleich waere dafuer falsch,
 * `Date.parse` normalisiert korrekt auf UTC-Millisekunden.
 *
 * Ist der Wert nicht parsbar, geben wir `Number.POSITIVE_INFINITY` zurueck:
 * ein unparsbarer Vorschlag gilt damit als "juengstmoeglich" und verliert
 * jeden Gleichstand gegen jeden Vorschlag mit gueltigem Zeitstempel. Das ist
 * eine bewusste Entscheidung — die Funktion darf nicht werfen und soll bei
 * kaputten Daten nicht zufaellig (Array-Reihenfolge) kueren. Sind beide
 * Zeitstempel unparsbar, entscheidet weiterhin der stabile Zweitschluessel
 * (kleinste `optionId`).
 */
function parseCreatedAt(createdAt: string): number {
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * Gewinner nach Approval Voting (E2). Negative `voteCount`-Werte werden wie 0
 * behandelt, also ignoriert.
 *
 * Tie-Break-Regel (E3), in dieser Reihenfolge:
 * 1. Hoechste `voteCount` gewinnt.
 * 2. Bei gleicher `voteCount` gewinnt der aeltere Zeitpunkt aus `createdAt`
 *    (echter Zeitpunktvergleich via {@link parseCreatedAt}, kein
 *    Zeichenkettenvergleich) — nicht die Eingabereihenfolge des Arrays.
 * 3. Sind `voteCount` UND Zeitpunkt gleich (z.B. mehrere Inserts in
 *    derselben Transaktion mit `default now()`), gewinnt die lexikographisch
 *    kleinere `optionId` als stabiler, reihenfolgeunabhaengiger
 *    Zweitschluessel.
 *
 * Gibt null zurueck, solange keine einzige Stimme abgegeben wurde.
 */
export function resolveAccommodationWinner(
  tallies: AccommodationTally[],
): string | null {
  let best: AccommodationTally | null = null;
  let bestCreatedAt = Number.POSITIVE_INFINITY;

  for (const tally of tallies) {
    if (tally.voteCount <= 0) continue;

    const createdAt = parseCreatedAt(tally.createdAt);

    if (best === null || tally.voteCount > best.voteCount) {
      best = tally;
      bestCreatedAt = createdAt;
      continue;
    }

    if (tally.voteCount < best.voteCount) continue;

    if (
      createdAt < bestCreatedAt ||
      (createdAt === bestCreatedAt && tally.optionId < best.optionId)
    ) {
      best = tally;
      bestCreatedAt = createdAt;
    }
  }

  return best ? best.optionId : null;
}
