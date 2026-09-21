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

  it('compares timestamps as real points in time, not as strings, across timezone offsets', () => {
    // Beide Werte bezeichnen denselben Zeitpunkt (00:00 UTC == 02:00 UTC+2).
    // Ein Zeichenkettenvergleich wuerde faelschlich 'utc-offset' als aelter
    // werten, weil '+00:00' lexikographisch vor '+02:00' liegt, obwohl es
    // sich um denselben Zeitpunkt handelt - hier existiert also kein echter
    // Gleichstand-Gewinner ueber die Zeit, sondern der Zweitschluessel
    // (optionId) muss entscheiden.
    const tallies = [
      { optionId: 'z-offset-utc', voteCount: 2, createdAt: '2026-03-01T00:00:00.000+00:00' },
      { optionId: 'a-offset-plus2', voteCount: 2, createdAt: '2026-03-01T02:00:00.000+02:00' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBe('a-offset-plus2');
  });

  it('breaks a tie of identical voteCount and identical timestamp by the smaller optionId, regardless of array order', () => {
    const first = { optionId: 'alpha', voteCount: 4, createdAt: '2026-04-05T10:00:00.000Z' };
    const second = { optionId: 'beta', voteCount: 4, createdAt: '2026-04-05T10:00:00.000Z' };

    expect(resolveAccommodationWinner([first, second])).toBe('alpha');
    expect(resolveAccommodationWinner([second, first])).toBe('alpha');
  });

  it('treats a negative voteCount as if it were zero and ignores that option', () => {
    const tallies = [
      { optionId: 'negative', voteCount: -3, createdAt: '2026-01-01T00:00:00.000Z' },
      { optionId: 'positive', voteCount: 1, createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBe('positive');
  });

  it('does not throw on an unparsable createdAt and treats it as the youngest possible timestamp, so it loses ties against a valid one', () => {
    const tallies = [
      { optionId: 'broken-timestamp', voteCount: 2, createdAt: 'not-a-real-date' },
      { optionId: 'valid-timestamp', voteCount: 2, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(() => resolveAccommodationWinner(tallies)).not.toThrow();
    expect(resolveAccommodationWinner(tallies)).toBe('valid-timestamp');
  });

  it('falls back to optionId when both createdAt values are unparsable', () => {
    const tallies = [
      { optionId: 'zulu', voteCount: 1, createdAt: 'not-a-real-date' },
      { optionId: 'alpha', voteCount: 1, createdAt: 'also-not-a-real-date' },
    ];
    expect(resolveAccommodationWinner(tallies)).toBe('alpha');
  });
});
