export interface AccommodationTally {
  optionId: string;
  voteCount: number;
  createdAt: string; // ISO datetime, entscheidet den Gleichstand
}

/**
 * Gewinner nach Approval Voting (E2). Bei Gleichstand gewinnt der aeltere
 * Vorschlag (E3) — nicht die Eingabereihenfolge des Arrays.
 * Gibt null zurueck, solange keine einzige Stimme abgegeben wurde.
 */
export function resolveAccommodationWinner(
  tallies: AccommodationTally[],
): string | null {
  let best: AccommodationTally | null = null;

  for (const tally of tallies) {
    if (tally.voteCount <= 0) continue;

    if (
      best === null ||
      tally.voteCount > best.voteCount ||
      (tally.voteCount === best.voteCount && tally.createdAt < best.createdAt)
    ) {
      best = tally;
    }
  }

  return best ? best.optionId : null;
}
