/**
 * Gemeinsamer Zugang der E2E-Suite zur Datenbank — mit zwei Sicherungen, die
 * jede Spec-Datei braucht und die keine von ihnen selbst mitbringen soll.
 *
 * 1. Umgebungssperre: die Suite schreibt mit dem Service-Role-Key echte Gruppen
 *    und Trips an. Welche Instanz das trifft, entscheidet allein
 *    `NEXT_PUBLIC_SUPABASE_URL` aus der Umgebung — es gibt keinen lokalen
 *    Supabase-Stapel, der versehentliche Lauf trifft also die Instanz, die
 *    gerade konfiguriert ist. Deshalb gilt hier "verboten, ausser ausdruecklich
 *    erlaubt": nur erkennbar lokale oder als Test benannte Hosts kommen ohne
 *    Weiteres durch.
 * 2. Aufraeumen: `cleanupTrackedRows` loescht am Ende jedes Tests, was er
 *    angelegt hat. Ohne das bleiben nach jedem Lauf Trips stehen.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Hosts, bei denen ein Schreibzugriff per Definition niemandem wehtut. */
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'host.docker.internal'];

/** Hostbestandteile, die eine Nicht-Produktivinstanz kenntlich machen. */
const TEST_HOST_MARKERS = ['staging', 'e2e', 'sandbox', 'localhost'];

/**
 * Notausgang fuer eine Testinstanz, die weder lokal ist noch einen der Marker
 * traegt. Bewusst ein ganzer Satz statt `1`: ein versehentlich gesetztes Flag
 * soll nicht reichen, um die Sperre zu oeffnen.
 */
const OVERRIDE_ENV_VAR = 'ANCHOR_E2E_ALLOW_NON_LOCAL_SUPABASE';
const OVERRIDE_VALUE = 'ja-das-ist-keine-produktion';

function assertDisposableInstance(rawUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`E2E abgebrochen: NEXT_PUBLIC_SUPABASE_URL ist keine gueltige URL (${rawUrl}).`);
  }

  const isLocal = LOCAL_HOSTNAMES.includes(hostname) || hostname.endsWith('.local');
  const isMarkedAsTest = TEST_HOST_MARKERS.some((marker) => hostname.includes(marker));
  const isExplicitlyAllowed = process.env[OVERRIDE_ENV_VAR] === OVERRIDE_VALUE;

  if (isLocal || isMarkedAsTest || isExplicitlyAllowed) return;

  throw new Error(
    [
      `E2E abgebrochen: "${hostname}" sieht nach einer Produktivinstanz aus.`,
      'Die Suite legt mit dem Service-Role-Key Gruppen und Trips an — dort will das niemand.',
      'Zeige auf eine lokale oder als Test benannte Instanz, oder setze bewusst',
      `${OVERRIDE_ENV_VAR}=${OVERRIDE_VALUE}.`,
    ].join(' '),
  );
}

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'E2E abgebrochen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein.',
    );
  }
  assertDisposableInstance(url);
  return createClient(url, serviceRoleKey);
}

export const admin = createAdminClient();

const trackedTripIds = new Set<string>();
const trackedGroupIds = new Set<string>();

/** Trip zum Aufraeumen vormerken — direkt nach dem Anlegen aufrufen. */
export function trackTrip(tripId: string): void {
  trackedTripIds.add(tripId);
}

/** Gruppe zum Aufraeumen vormerken — direkt nach dem Anlegen aufrufen. */
export function trackGroup(groupId: string): void {
  trackedGroupIds.add(groupId);
}

/**
 * Loescht alles Vorgemerkte. Teilnehmer, Terminfenster, Unterkunfts-Vorschlaege
 * und Stimmen haengen per `on delete cascade` am Trip und gehen mit ihm; der
 * Trip selbst zuerst, damit auch dann nichts stehen bleibt, wenn die Gruppe
 * einmal nicht kaskadiert.
 */
export async function cleanupTrackedRows(): Promise<void> {
  for (const tripId of trackedTripIds) {
    await admin.from('trips').delete().eq('id', tripId);
  }
  trackedTripIds.clear();

  for (const groupId of trackedGroupIds) {
    await admin.from('groups').delete().eq('id', groupId);
  }
  trackedGroupIds.clear();
}
