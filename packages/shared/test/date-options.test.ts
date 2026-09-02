import { describe, it, expect } from 'vitest';
import { validateDateOptionInput } from '../src/domain/date-options';

describe('validateDateOptionInput', () => {
  const today = '2026-03-01';

  it('accepts a valid future range', () => {
    expect(validateDateOptionInput('2026-03-14', '2026-03-16', today)).toEqual({ ok: true });
  });

  it('rejects when start date is missing', () => {
    expect(validateDateOptionInput('', '2026-03-16', today)).toEqual({
      ok: false,
      reason: 'missing_dates',
    });
  });

  it('rejects when end date is before start date', () => {
    expect(validateDateOptionInput('2026-03-16', '2026-03-14', today)).toEqual({
      ok: false,
      reason: 'end_before_start',
    });
  });

  it('rejects a start date in the past', () => {
    expect(validateDateOptionInput('2026-02-01', '2026-02-03', today)).toEqual({
      ok: false,
      reason: 'start_in_past',
    });
  });

  it('accepts the start date being today', () => {
    expect(validateDateOptionInput(today, '2026-03-05', today)).toEqual({ ok: true });
  });
});
