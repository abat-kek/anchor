import type { NudgeInput } from '../types';

/**
 * Determine whether a nudge is allowed to be sent based on frequency capping rules.
 *
 * Rules (both must be satisfied):
 * 1. At least minGapHours must have elapsed since the last nudge of any type.
 * 2. No more than maxPerWeek nudges of any type should have been sent in the last 7 days.
 *
 * Returns true if the nudge can be sent; false otherwise.
 */
export function canSendNudge(input: NudgeInput): boolean {
  const { now, history, minGapHours, maxPerWeek } = input;

  const nowTime = new Date(now).getTime();
  const minGapMs = minGapHours * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const weekAgoTime = nowTime - sevenDaysMs;

  // Rule 1: Check minGap since last nudge
  if (history.length > 0) {
    const lastEntry = history[history.length - 1];
    if (lastEntry) {
      const lastNudgeTime = new Date(lastEntry.sentAt).getTime();
      const timeSinceLast = nowTime - lastNudgeTime;
      if (timeSinceLast < minGapMs) {
        return false;
      }
    }
  }

  // Rule 2: Check maxPerWeek within last 7 days
  const recentNudges = history.filter((entry) => {
    const entryTime = new Date(entry.sentAt).getTime();
    return !isNaN(entryTime) && entryTime >= weekAgoTime;
  });

  if (recentNudges.length >= maxPerWeek) {
    return false;
  }

  return true;
}
