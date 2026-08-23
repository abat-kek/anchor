import { describe, it, expect } from 'vitest';
import { tallyVotes, winningOption } from '../src/domain/voting';

describe('tallyVotes', () => {
  it('counts votes for each option, ignoring unknown optionIds', () => {
    const tallies = tallyVotes(
      ['opt-a', 'opt-b', 'opt-c'],
      [
        { optionId: 'opt-a' },
        { optionId: 'opt-a' },
        { optionId: 'opt-b' },
        { optionId: 'unknown' }, // sollte ignoriert werden
      ],
    );
    expect(tallies).toEqual([
      { optionId: 'opt-a', count: 2 },
      { optionId: 'opt-b', count: 1 },
      { optionId: 'opt-c', count: 0 },
    ]);
  });

  it('respects the order of optionIds', () => {
    const tallies = tallyVotes(
      ['z', 'a', 'm'],
      [{ optionId: 'a' }],
    );
    expect(tallies.map((t) => t.optionId)).toEqual(['z', 'a', 'm']);
  });

  it('returns all zeros if no votes', () => {
    const tallies = tallyVotes(['opt-1', 'opt-2'], []);
    expect(tallies).toEqual([
      { optionId: 'opt-1', count: 0 },
      { optionId: 'opt-2', count: 0 },
    ]);
  });
});

describe('winningOption', () => {
  it('returns the option with highest count', () => {
    const tallies = [
      { optionId: 'a', count: 2 },
      { optionId: 'b', count: 5 },
      { optionId: 'c', count: 3 },
    ];
    expect(winningOption(tallies)).toBe('b');
  });

  it('returns first in tie', () => {
    const tallies = [
      { optionId: 'first', count: 3 },
      { optionId: 'second', count: 3 },
    ];
    expect(winningOption(tallies)).toBe('first');
  });

  it('returns null if all counts are zero', () => {
    const tallies = [
      { optionId: 'a', count: 0 },
      { optionId: 'b', count: 0 },
    ];
    expect(winningOption(tallies)).toBeNull();
  });

  it('returns null if empty list', () => {
    expect(winningOption([])).toBeNull();
  });

  it('returns the only option if single', () => {
    expect(winningOption([{ optionId: 'solo', count: 1 }])).toBe('solo');
  });

  it('returns null if single option with zero count', () => {
    expect(winningOption([{ optionId: 'lonely', count: 0 }])).toBeNull();
  });
});
