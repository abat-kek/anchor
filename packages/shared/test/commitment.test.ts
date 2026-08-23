import { describe, it, expect } from 'vitest';
import { countCommitted, computeTallies, selectBestOption } from '../src/domain/commitment';
import type { DateOption, DateAvailability } from '../src/types';

describe('countCommitted', () => {
  it('returns 0 for empty list', () => {
    expect(countCommitted([])).toBe(0);
  });
  it('counts only committed participants', () => {
    expect(
      countCommitted([{ isCommitted: true }, { isCommitted: false }, { isCommitted: true }]),
    ).toBe(2);
  });
});

describe('computeTallies', () => {
  const options: DateOption[] = [
    { id: 'o1', tripId: 't', startDate: '2026-03-14', endDate: '2026-03-16' },
    { id: 'o2', tripId: 't', startDate: '2026-03-21', endDate: '2026-03-23' },
  ];
  const committed = ['p1', 'p2'];

  it('counts availabilities only for committed participants', () => {
    const avail: DateAvailability[] = [
      { dateOptionId: 'o1', participantId: 'p1', availability: 'yes' },
      { dateOptionId: 'o1', participantId: 'p2', availability: 'maybe' },
      { dateOptionId: 'o1', participantId: 'p3', availability: 'yes' }, // p3 nicht committed → ignoriert
      { dateOptionId: 'o2', participantId: 'p1', availability: 'no' },
    ];
    const tallies = computeTallies(options, avail, committed);
    expect(tallies).toEqual([
      { optionId: 'o1', yes: 1, maybe: 1, no: 0 },
      { optionId: 'o2', yes: 0, maybe: 0, no: 1 },
    ]);
  });

  it('returns zero tallies for options without availabilities', () => {
    expect(computeTallies(options, [], committed)).toEqual([
      { optionId: 'o1', yes: 0, maybe: 0, no: 0 },
      { optionId: 'o2', yes: 0, maybe: 0, no: 0 },
    ]);
  });
});

describe('selectBestOption', () => {
  it('returns null when no option has yes or maybe', () => {
    expect(selectBestOption([{ optionId: 'o1', yes: 0, maybe: 0, no: 3 }])).toBeNull();
  });
  it('picks the option with most yes', () => {
    expect(
      selectBestOption([
        { optionId: 'o1', yes: 2, maybe: 1, no: 0 },
        { optionId: 'o2', yes: 3, maybe: 0, no: 0 },
      ]),
    ).toBe('o2');
  });
  it('breaks yes-ties by most maybe', () => {
    expect(
      selectBestOption([
        { optionId: 'o1', yes: 2, maybe: 0, no: 0 },
        { optionId: 'o2', yes: 2, maybe: 2, no: 0 },
      ]),
    ).toBe('o2');
  });
  it('breaks full ties by first (caller sorts by date)', () => {
    expect(
      selectBestOption([
        { optionId: 'o1', yes: 2, maybe: 1, no: 0 },
        { optionId: 'o2', yes: 2, maybe: 1, no: 0 },
      ]),
    ).toBe('o1');
  });
});
