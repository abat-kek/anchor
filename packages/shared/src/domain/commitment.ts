import type { DateOption, DateAvailability, DateTally } from '../types';

export function countCommitted(participants: { isCommitted: boolean }[]): number {
  return participants.filter((p) => p.isCommitted).length;
}

export function computeTallies(
  options: DateOption[],
  availabilities: DateAvailability[],
  committedParticipantIds: string[],
): DateTally[] {
  const committed = new Set(committedParticipantIds);
  return options.map((option) => {
    const relevant = availabilities.filter(
      (a) => a.dateOptionId === option.id && committed.has(a.participantId),
    );
    return {
      optionId: option.id,
      yes: relevant.filter((a) => a.availability === 'yes').length,
      maybe: relevant.filter((a) => a.availability === 'maybe').length,
      no: relevant.filter((a) => a.availability === 'no').length,
    };
  });
}

export function selectBestOption(tallies: DateTally[]): string | null {
  let best: DateTally | null = null;
  for (const t of tallies) {
    if (t.yes === 0 && t.maybe === 0) continue;
    if (
      best === null ||
      t.yes > best.yes ||
      (t.yes === best.yes && t.maybe > best.maybe)
    ) {
      best = t;
    }
  }
  return best ? best.optionId : null;
}
