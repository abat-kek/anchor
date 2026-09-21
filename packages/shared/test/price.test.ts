import { describe, it, expect } from 'vitest';
import {
  MAX_PRICE_CENTS,
  describePriceParseFailure,
  formatPrice,
  parsePriceInput,
} from '../src/domain/price';

describe('parsePriceInput', () => {
  it('treats an empty or blank input as "no price"', () => {
    expect(parsePriceInput('')).toEqual({ ok: true, priceCents: null });
    expect(parsePriceInput('   ')).toEqual({ ok: true, priceCents: null });
  });

  it('converts whole euros to cents', () => {
    expect(parsePriceInput('89')).toEqual({ ok: true, priceCents: 8900 });
  });

  it('accepts a comma as decimal separator', () => {
    expect(parsePriceInput('89,50')).toEqual({ ok: true, priceCents: 8950 });
  });

  it('accepts a dot as decimal separator', () => {
    expect(parsePriceInput('89.50')).toEqual({ ok: true, priceCents: 8950 });
  });

  it('accepts a single decimal digit', () => {
    expect(parsePriceInput('89,5')).toEqual({ ok: true, priceCents: 8950 });
  });

  it('ignores surrounding whitespace', () => {
    expect(parsePriceInput('  120,00 ')).toEqual({ ok: true, priceCents: 12000 });
  });

  it('rounds to whole cents instead of producing a float', () => {
    const result = parsePriceInput('0,07');
    expect(result).toEqual({ ok: true, priceCents: 7 });
    if (result.ok && result.priceCents !== null) {
      expect(Number.isInteger(result.priceCents)).toBe(true);
    }
  });

  it('rejects text, signs, currency symbols and three decimals', () => {
    for (const input of ['abc', '-5', '+5', '89 EUR', '89,505', '1.2.3', '1e3']) {
      expect(parsePriceInput(input)).toEqual({ ok: false, reason: 'not_a_number' });
    }
  });

  it('accepts a price exactly at the upper bound', () => {
    expect(parsePriceInput('1000000')).toEqual({ ok: true, priceCents: MAX_PRICE_CENTS });
  });

  it('rejects a price above the upper bound instead of letting int4 overflow', () => {
    expect(parsePriceInput('25000000')).toEqual({ ok: false, reason: 'too_large' });
    expect(parsePriceInput('1000000,01')).toEqual({ ok: false, reason: 'too_large' });
  });

  it('keeps the upper bound well below the int4 maximum', () => {
    expect(MAX_PRICE_CENTS).toBeLessThan(2147483647);
  });
});

describe('describePriceParseFailure', () => {
  it('explains an unparsable price', () => {
    expect(describePriceParseFailure('not_a_number')).toContain('89');
  });

  it('explains a price above the bound', () => {
    expect(describePriceParseFailure('too_large')).toContain('1.000.000');
  });
});

describe('formatPrice', () => {
  it('returns null when no price is set', () => {
    expect(formatPrice(null, 'EUR')).toBeNull();
  });

  it('formats cents as a German currency amount', () => {
    const formatted = formatPrice(8950, 'EUR');
    expect(formatted).toContain('89');
    expect(formatted).toContain('50');
    expect(formatted).toContain('€');
  });

  it('formats zero as a real amount, not as "no price"', () => {
    expect(formatPrice(0, 'EUR')).not.toBeNull();
  });

  it('falls back to a plain amount for an unknown currency code', () => {
    expect(formatPrice(8950, 'NOT_A_CURRENCY')).toBe('89.50 NOT_A_CURRENCY');
  });
});
