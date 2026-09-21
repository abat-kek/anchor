import { describe, expect, test } from 'vitest';
import { formatIsoDateGerman, parseIsoDate, startOfToday, toIsoDate } from '../src/domain/iso-date';

describe('toIsoDate', () => {
  test('schreibt das lokale Kalenderdatum, nicht das UTC-Datum', () => {
    // Arrange: 1. Maerz, kurz nach Mitternacht Ortszeit. In Zeitzonen oestlich
    // von Greenwich ist es in UTC noch der 28. Februar.
    const date = new Date(2026, 2, 1, 0, 30);

    // Act
    const isoDate = toIsoDate(date);

    // Assert
    expect(isoDate).toBe('2026-03-01');
  });

  test('fuellt Monat und Tag auf zwei Stellen auf', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseIsoDate', () => {
  test('liefert Mitternacht Ortszeit', () => {
    const date = parseIsoDate('2026-03-14');

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(14);
    expect(date?.getHours()).toBe(0);
  });

  test('gibt null zurueck bei leerer Eingabe', () => {
    expect(parseIsoDate('')).toBeNull();
  });

  test('gibt null zurueck bei fremdem Format', () => {
    expect(parseIsoDate('14.03.2026')).toBeNull();
  });

  test('gibt null zurueck bei einem Kalendertag, den es nicht gibt', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
  });

  test('nimmt den 29. Februar eines Schaltjahres an', () => {
    expect(parseIsoDate('2028-02-29')?.getDate()).toBe(29);
  });

  test('ist die Umkehrung von toIsoDate', () => {
    const isoDate = '2026-11-03';

    const roundTrip = toIsoDate(parseIsoDate(isoDate) as Date);

    expect(roundTrip).toBe(isoDate);
  });
});

describe('formatIsoDateGerman', () => {
  test('zeigt 2026-03-14 als 14.03.2026', () => {
    expect(formatIsoDateGerman('2026-03-14')).toBe('14.03.2026');
  });

  test('gibt null zurueck, wenn nichts anzuzeigen ist', () => {
    expect(formatIsoDateGerman('')).toBeNull();
  });
});

describe('startOfToday', () => {
  test('schneidet die Uhrzeit ab', () => {
    const today = startOfToday(new Date(2026, 8, 21, 17, 45, 12));

    expect(toIsoDate(today)).toBe('2026-09-21');
    expect(today.getHours()).toBe(0);
    expect(today.getMinutes()).toBe(0);
  });
});
