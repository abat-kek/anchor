export interface VoteTally {
  optionId: string;
  count: number;
}

export function tallyVotes(
  optionIds: string[],
  votes: { optionId: string }[],
): VoteTally[] {
  const counts: Record<string, number> = {};
  optionIds.forEach((id) => {
    counts[id] = 0;
  });

  votes.forEach((vote) => {
    if (vote.optionId in counts) {
      counts[vote.optionId]++;
    }
  });

  return optionIds.map((optionId) => ({
    optionId,
    count: counts[optionId],
  }));
}

export function winningOption(
  tallies: VoteTally[],
): string | null {
  if (tallies.length === 0) return null;

  let best: VoteTally | null = null;
  for (const t of tallies) {
    if (best === null || t.count > best.count) {
      best = t;
    }
  }

  return best && best.count > 0 ? best.optionId : null;
}
