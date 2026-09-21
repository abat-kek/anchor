import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Feste Zeitzone fuer den Lauf. Ohne sie haengt das Ergebnis der
    // iso-date-Tests an der Zone des ausfuehrenden Rechners: in UTC — dem
    // Normalfall im CI-Container — verhaelt sich die naive Umrechnung ueber
    // toISOString() wie die richtige, eine Regression liefe glatt durch.
    // UTC ist bewusst gewaehlt, weil es der unguenstigste Ausgangspunkt ist;
    // die beiden Grenzfaelle oestlich und westlich von Greenwich stellt
    // test/iso-date.test.ts selbst her.
    env: { TZ: 'UTC' },
  },
});
