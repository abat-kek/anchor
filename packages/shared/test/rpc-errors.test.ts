import { describe, it, expect } from 'vitest';
import {
  RPC_ERROR_MESSAGES,
  UNKNOWN_RPC_ERROR_MESSAGE,
  findRpcErrorCode,
  translateRpcError,
  type RpcErrorCode,
} from '../src/domain/rpc-errors';

const ALL_CODES = Object.keys(RPC_ERROR_MESSAGES) as RpcErrorCode[];

describe('findRpcErrorCode', () => {
  it('finds a bare code', () => {
    expect(findRpcErrorCode('url_invalid')).toBe('url_invalid');
  });

  it('finds a code wrapped in the usual Postgres noise', () => {
    const raw = 'P0001: url_invalid CONTEXT: PL/pgSQL function add_accommodation_option';
    expect(findRpcErrorCode(raw)).toBe('url_invalid');
  });

  it('returns null for an unknown code', () => {
    expect(findRpcErrorCode('deadlock_detected')).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(findRpcErrorCode('')).toBeNull();
    expect(findRpcErrorCode(null)).toBeNull();
    expect(findRpcErrorCode(undefined)).toBeNull();
  });

  it('does not match a code that is only part of a longer identifier', () => {
    expect(findRpcErrorCode('url_invalid_but_different')).toBeNull();
    expect(findRpcErrorCode('legacy_url_invalid_v2')).toBeNull();
  });
});

describe('translateRpcError', () => {
  it('translates every known code to a non-empty German sentence', () => {
    for (const code of ALL_CODES) {
      const translated = translateRpcError(code);
      expect(translated).toBe(RPC_ERROR_MESSAGES[code]);
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toContain(code);
    }
  });

  it('uses the exact wording agreed for url_invalid', () => {
    expect(translateRpcError('url_invalid')).toBe('Das sieht nicht nach einem Link aus.');
  });

  it('never leaks the raw Postgres message for an unknown code', () => {
    const raw = 'P0001: duplicate key value violates unique constraint "accommodation_votes_pkey"';
    expect(translateRpcError(raw)).toBe(UNKNOWN_RPC_ERROR_MESSAGE);
    expect(translateRpcError(raw)).not.toContain('accommodation_votes_pkey');
  });

  it('accepts a caller-specific fallback for unknown codes', () => {
    expect(translateRpcError('something_else', 'Vorschlag konnte nicht gespeichert werden.')).toBe(
      'Vorschlag konnte nicht gespeichert werden.',
    );
  });

  it('prefers the known code over the caller fallback', () => {
    expect(translateRpcError('title_required', 'egal')).toBe(RPC_ERROR_MESSAGES.title_required);
  });

  it('handles null and undefined without throwing', () => {
    expect(translateRpcError(null)).toBe(UNKNOWN_RPC_ERROR_MESSAGE);
    expect(translateRpcError(undefined)).toBe(UNKNOWN_RPC_ERROR_MESSAGE);
  });

  it('covers all codes raised by migrations 0009/0010/0011', () => {
    expect(ALL_CODES).toEqual(
      expect.arrayContaining([
        'invalid_participant',
        'invalid_option',
        'option_not_in_trip',
        'trip_not_in_accommodation_phase',
        'url_required',
        'url_invalid',
        'title_required',
        'price_invalid',
        'invalid_date_range',
        'start_in_past',
        'trip_not_collecting',
      ]),
    );
  });
});
