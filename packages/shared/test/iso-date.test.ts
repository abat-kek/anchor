import { afterEach, describe, expect, test } from 'vitest';
import { formatIsoDateGerman, parseIsoDate, startOfToday, toIsoDate } from '../src/domain/iso-date';

/**
 * Der Lauf steht laut vitest.config.ts auf TZ=UTC. Genau dort faellt die naive
 * Umrechnung ueber toISOString() nicht auf, weil lokale Zeit und UTC
 * uebereinstimmen. Diese Helfer stellen die beiden Zonen her, in denen sie
 * auffaellt. Node liest `process.env.TZ` zur Laufzeit neu, jedes danach
 * erzeugte Date rechnet in der gesetzten Zone.
 */
function setTimeZone(timeZone: string) {
  process.env.TZ = timeZone;
}

/** Die alte, falsche Umrechnung — als Messlatte, nicht zur Benutzung. */
function naiveIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

afterEach(() => {
  setTimeZone('UTC');
});

describe('toIsoDate', () => {
  test('schreibt oestlich von Greenwich das lokale Kalenderdatum', () => {
    // Arrange: Europe/Berlin, 1. Maerz 00:30 Ortszeit — in UTC noch der 28.02.
    setTimeZone('Europe/Berlin');
    const date = new Date(2026, 2, 1, 0, 30);

    // Act
    const isoDate = toIsoDate(date);

    // Assert
    expect(isoDate).toBe('2026-03-01');
    // Belegt, dass dieser Fall die alte Umrechnung wirklich zu Fall brachte.
    expect(naiveIsoDate(date)).toBe('2026-02-28');
  });

  test('schreibt westlich von Greenwich das lokale Kalenderdatum', () => {
    // Arrange: America/New_York, 28. Februar 23:30 Ortszeit — in UTC schon der 01.03.
    setTimeZone('America/New_York');
    const date = new Date(2026, 1, 28, 23, 30);

    // Act
    const isoDate = toIsoDate(date);

    // Assert
    expect(isoDate).toBe('2026-02-28');
    expect(naiveIsoDate(date)).toBe('2026-03-01');
  });

  test('ueberlebt den Hin- und Rueckweg oestlich von Greenwich', () => {
    setTimeZone('Europe/Berlin');

    expect(toIsoDate(parseIsoDate('2026-03-01') as Date)).toBe('2026-03-01');
  });

  test('ueberlebt den Hin- und Rueckweg westlich von Greenwich', () => {
    setTimeZone('America/New_York');

    expect(toIsoDate(parseIsoDate('2026-02-28') as Date)).toBe('2026-02-28');
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

  test('bleibt oestlich von Greenwich am laufenden Tag', () => {
    // Arrange: Berlin, kurz nach Mitternacht — in UTC ist noch der Vortag.
    setTimeZone('Europe/Berlin');
    const now = new Date(2026, 8, 21, 0, 30);

    // Act
    const today = toIsoDate(startOfToday(now));

    // Assert
    expect(today).toBe('2026-09-21');
    // Der alte Weg haette hier den Vortag geliefert und einen gueltigen
    // Vorschlag fuer heute als start_in_past abgelehnt.
    expect(naiveIsoDate(now)).toBe('2026-09-20');
  });

  test('bleibt westlich von Greenwich am laufenden Tag', () => {
    // Arrange: New York, kurz vor Mitternacht — in UTC ist bereits der Folgetag.
    setTimeZone('America/New_York');
    const now = new Date(2026, 8, 21, 23, 30);

    // Act
    const today = toIsoDate(startOfToday(now));

    // Assert
    expect(today).toBe('2026-09-21');
    expect(naiveIsoDate(now)).toBe('2026-09-22');
  });
});
