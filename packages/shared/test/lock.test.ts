import { describe, it, expect } from 'vitest';
import { resolveLock } from '../src/domain/lock';
import type { DateOption, DateTally, ResolveLockInput } from '../src/types';

const options: DateOption[] = [
  { id: 'o1', tripId: 't', startDate: '2026-03-14', endDate: '2026-03-16' },
  { id: 'o2', tripId: 't', startDate: '2026-03-21', endDate: '2026-03-23' },
];

function input(over: Partial<ResolveLockInput>): ResolveLockInput {
  return {
    now: '2026-03-01T12:00:00Z',
    deadline: '2026-03-10T12:00:00Z',
    options,
    tallies: [
      { optionId: 'o1', yes: 1, maybe: 0, no: 0 },
      { optionId: 'o2', yes: 0, maybe: 0, no: 0 },
    ],
    totalCommitted: 3,
    ...over,
  };
}

describe('resolveLock', () => {
  it('waits with no_options when there are none', () => {
    expect(resolveLock(input({ options: [], tallies: [] }))).toEqual({
      action: 'wait',
      reason: 'no_options',
    });
  });

  it('waits before deadline when nobody is unanimously available', () => {
    expect(resolveLock(input({}))).toEqual({ action: 'wait', reason: 'before_deadline' });
  });

  it('suggests early lock when an option has everyone committed as yes', () => {
    expect(
      resolveLock(
        input({
          totalCommitted: 3,
          tallies: [
            { optionId: 'o1', yes: 3, maybe: 0, no: 0 },
            { optionId: 'o2', yes: 1, maybe: 0, no: 0 },
          ],
        }),
      ),
    ).toEqual({ action: 'suggest_early_lock', optionId: 'o1' });
  });

  it('locks the best-attended option after the deadline', () => {
    expect(
      resolveLock(
        input({
          now: '2026-03-11T12:00:00Z',
          tallies: [
            { optionId: 'o1', yes: 1, maybe: 0, no: 0 },
            { optionId: 'o2', yes: 2, maybe: 0, no: 0 },
          ],
        }),
      ),
    ).toEqual({ action: 'lock', optionId: 'o2' });
  });

  it('waits with no_commitments when deadline passed but no viable date', () => {
    expect(
      resolveLock(
        input({
          now: '2026-03-11T12:00:00Z',
          totalCommitted: 0,
          tallies: [
            { optionId: 'o1', yes: 0, maybe: 0, no: 0 },
            { optionId: 'o2', yes: 0, maybe: 0, no: 0 },
          ],
        }),
      ),
    ).toEqual({ action: 'wait', reason: 'no_commitments' });
  });
});
