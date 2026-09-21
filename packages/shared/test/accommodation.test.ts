import { describe, it, expect } from 'vitest';
import { resolveAccommodationWinner } from '../src/domain/accommodation';

describe('resolveAccommodationWinner', () => {
  it('returns the option with the clearly highest vote count', () => {
    const tallies = [
      { optionId: 'a', voteCount: 2, createdAt: '2026-01-01T00:00:00.000Z' },
      { optionId: 'b', voteCount: 5, createdAt: '2026-01-02T00:00:00.000Z' },
      { optionId: 'c', voteCount: 3, createdAt: '2026-01-03T00:00:00.000Z' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBe('b');
  });

  it('breaks a tie in favor of the older proposal, even when it is last in the array', () => {
    const tallies = [
      { optionId: 'newer', voteCount: 3, createdAt: '2026-02-01T00:00:00.000Z' },
      { optionId: 'older', voteCount: 3, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBe('older');
  });

  it('returns null if no votes were cast at all', () => {
    const tallies = [
      { optionId: 'a', voteCount: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      { optionId: 'b', voteCount: 0, createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(resolveAccommodationWinner([])).toBeNull();
  });

  it('picks the option with votes over the one without any', () => {
    const tallies = [
      { optionId: 'no-votes', voteCount: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      { optionId: 'has-votes', voteCount: 1, createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBe('has-votes');
  });
});
