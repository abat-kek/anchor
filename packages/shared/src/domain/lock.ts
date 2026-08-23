import type { LockDecision, ResolveLockInput } from '../types';
import { selectBestOption } from './commitment';

export function resolveLock(inputData: ResolveLockInput): LockDecision {
  const { now, deadline, options, tallies, totalCommitted } = inputData;

  if (options.length === 0) return { action: 'wait', reason: 'no_options' };

  const deadlinePassed = new Date(now).getTime() >= new Date(deadline).getTime();
  const best = selectBestOption(tallies);

  if (deadlinePassed) {
    if (best === null) return { action: 'wait', reason: 'no_commitments' };
    return { action: 'lock', optionId: best };
  }

  if (totalCommitted > 0) {
    const unanimous = tallies.find((t) => t.yes === totalCommitted);
    if (unanimous) return { action: 'suggest_early_lock', optionId: unanimous.optionId };
  }

  return { action: 'wait', reason: 'before_deadline' };
}
