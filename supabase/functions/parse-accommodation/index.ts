import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isAllowedProtocol, isBlockedIpAddress, isIpLiteralHostname } from '@anchor/domain/url-safety.ts';
import { dechunkBody, isChunkedTransferEncoding, parseHttpResponse } from '@anchor/domain/http-response.ts';
import { extractOpenGraphTags } from '@anchor/domain/open-graph.ts';

/**
 * Task 6 (Zugabe, E1): parst `og:title`/`og:image`/`og:price:amount` von der
 * Seite hinter `raw_url` und schreibt sie in `accommodation_options` zurueck
 * (RLS erlaubt keinen direkten Tabellenzugriff — dieselbe Rolle wie in
 * `auto-lock`: die Function laeuft mit dem Service-Role-Key und umgeht RLS
 * bewusst serverseitig).
 *
 * WICHTIG — Sicherheitsauflage (siehe Task-6-Brief, ueber den Plan hinaus):
 * diese Function holt eine vom Nutzer frei gewaehlte URL serverseitig ab.
 * Der Container hat Netzzugriff auf 192.168.2.0/24 und weitere Container, die
 * NICHT dieser Anwendung gehoeren. Ohne Sperre koennte ein Gast ueber einen
 * vorgeblichen "Unterkunfts-Link" interne Dienste abklopfen (SSRF). Die
 * gesamte Guard-Logik unten existiert ausschliesslich dafuer.
 *
 * Warum `option_id` statt einer vom Aufrufer mitgegebenen URL: die Zeile zu
 * `option_id` enthaelt `raw_url` bereits validiert durch
 * `add_accommodation_option` (0011_accommodation.sql: `^https?://`-Pflicht,
 * nicht leer). Ein Aufrufer, der stattdessen eine beliebige URL im Body
 * mitschicken duerfte, koennte diese Vorpruefung und die Bindung an einen
 * echten, bereits angelegten Vorschlag umgehen. Die Option muss zudem
 * existieren, bevor ueberhaupt ein Fetch versucht wird.
 */

const HTTPS_PORT = 443;

/**
 * `og:`-Tags stehen laut HTML/SEO-Konvention immer frueh in `<head>`. 256 KiB
 * sind fuer jede realistische Seite (auch Airbnbs 596 KB schwere Startseite
 * aus dem Vorbefund) reichlich Vorlauf, begrenzen aber Speicher und Zeit hart.
 * Findet sich innerhalb dieser Grenze kein `og:title`, gilt der Versuch als
 * gescheitert — das ist der Normalfall, kein Bug.
 */
const MAX_BODY_BYTES = 262_144;
/** Kappungsgrenze fuer die ROHEN Socket-Bytes (Header + Chunk-Framing-Overhead obendrauf). */
const MAX_RAW_RESPONSE_BYTES = MAX_BODY_BYTES + 65_536;
const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 6_000;
/** Harte Obergrenze fuer die GESAMTE Operation, ueber alle Weiterleitungen hinweg. */
const OVERALL_DEADLINE_MS = 12_000;

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Rennen gegen ein Zeitlimit, das eine bereits offene Ressource (Socket)
 * sofort schliesst, falls das Zeitlimit zuerst greift und die Ressource
 * TROTZDEM spaeter noch zustande kommt. Ohne dieses Nachraeumen wuerde ein
 * langsamer, aber irgendwann erfolgreicher Verbindungsaufbau die Socket
 * unbemerkt offen halten, weil die aeussere Funktion laengst mit "gescheitert"
 * weitergemacht hat.
 */
function raceWithCleanup<T extends { close(): void }>(
  pending: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('timeout'));
      pending.then(
        (value) => {
          try {
            value.close();
          } catch {
            // War schon zu, oder schliesst sich selbst weg — beides in Ordnung.
          }
        },
        () => {
          // Kam ohnehin nie zustande.
        },
      );
    }, timeoutMs);

    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function withTimeout<T>(pending: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Loest `hostname` selbst auf (A + AAAA) und prueft JEDE zurueckgegebene
 * Adresse gegen die private/lokale Sperrliste (siehe
 * `packages/shared/src/domain/url-safety.ts`), BEVOR irgendeine Verbindung
 * aufgebaut wird. Ist der Hostname bereits ein IP-Literal, entfaellt die
 * Namensaufloesung, die Adresse wird direkt geprueft.
 *
 * Fail-closed ueber die gesamte Antwort: eine einzelne unsichere Adresse in
 * einer Split-Antwort (unterschiedliche Records fuer A und AAAA, oder ein
 * DNS-Server, der mehrere Adressen zurueckgibt) sperrt den ganzen Host.
 */
async function resolveSafeConnectIp(hostname: string): Promise<string | null> {
  if (isIpLiteralHostname(hostname)) {
    const bare = stripIpv6Brackets(hostname);
    return isBlockedIpAddress(bare) ? null : bare;
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA'),
  ]);
  const ipv4 = ipv4Result.status === 'fulfilled' ? ipv4Result.value : [];
  const ipv6 = ipv6Result.status === 'fulfilled' ? ipv6Result.value : [];
  const allIps = [...ipv4, ...ipv6];
  if (allIps.length === 0) return null;
  if (allIps.some((ip) => isBlockedIpAddress(ip))) return null;

  return allIps[0] ?? null;
}

/**
 * Liest hoechstens `maxBytes` vom Socket, in kleinen Schritten statt in
 * einem Rutsch — die Antwort wird abgeschnitten gelesen, nicht vollstaendig
 * in den Speicher geholt. Jeder einzelne `read()` traegt sein eigenes
 * Zeitlimit, damit eine Gegenstelle, die absichtlich extrem langsam
 * ausliefert ("slow loris"), die Function nicht haengen laesst.
 */
async function readCapped(conn: Deno.Conn, maxBytes: number, perReadTimeoutMs: number): Promise<Uint8Array> {
  const result = new Uint8Array(maxBytes);
  let total = 0;
  const readBuffer = new Uint8Array(16_384);

  while (total < maxBytes) {
    const bytesRead = await withTimeout(conn.read(readBuffer), perReadTimeoutMs);
    if (bytesRead === null) break; // Gegenstelle hat die Verbindung geschlossen (EOF)

    const takeCount = Math.min(bytesRead, maxBytes - total);
    result.set(readBuffer.subarray(0, takeCount), total);
    total += takeCount;

    if (takeCount < bytesRead) break; // Kappungsgrenze erreicht — Rest des Sockets wird nicht mehr gelesen
  }

  return result.subarray(0, total);
}

interface RawHttpResult {
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
}

/**
 * Baut die TCP-Verbindung DIREKT zur vorab geprueften IP auf (`Deno.connect`
 * mit einem IP-Literal loest selbst keinen Hostnamen auf — es gibt schlicht
 * nichts mehr aufzuloesen) und hebt sie erst DANACH per `Deno.startTls` auf
 * TLS, mit `hostname` = dem echten Domainnamen fuer SNI und vollstaendige
 * Zertifikatspruefung.
 *
 * Das schliesst die DNS-Rebinding-Luecke, vor der die Sicherheitsauflage
 * warnt: `fetch()` oder ein `Deno.connectTls({ hostname })` wuerden den
 * Hostnamen ein zweites Mal selbst aufloesen — mit einem kurzlebigen TTL
 * koennte diese zweite Aufloesung eine andere (interne) Adresse liefern als
 * die, die wir gerade geprueft haben. Weil hier stattdessen `Deno.connect`
 * eine bereits aufgeloeste, geprueft-oeffentliche IP als Verbindungsziel
 * bekommt und `Deno.startTls` nachweislich keine eigene Verbindung aufbaut
 * oder Namen aufloest (nur SNI/Zertifikatspruefung auf der schon
 * bestehenden Verbindung), gibt es diese zweite Aufloesung hier nicht.
 * Recherchiert und mit den Deno-API-Referenzseiten gegengeprueft, nicht
 * geraten (`Deno.ConnectTlsOptions` kennt anders als `Deno.ConnectQuicOptions`
 * KEIN getrenntes `hostname`/`servername`-Paar — nur dieser Zwei-Schritt-Weg
 * ueber die rohe TCP-Verbindung trennt Verbindungsziel und SNI-Namen sauber).
 */
async function performPinnedHttpsRequest(
  originalHostname: string,
  connectIp: string,
  path: string,
): Promise<RawHttpResult | null> {
  let tcpConn: Deno.TcpConn | null = null;
  let tlsConn: Deno.TlsConn | null = null;

  try {
    tcpConn = await raceWithCleanup(
      Deno.connect({ hostname: connectIp, port: HTTPS_PORT }),
      CONNECT_TIMEOUT_MS,
    );
    // `tcpConn` bleibt bis hierher zugewiesen, DAMIT das `finally` unten die
    // rohe Verbindung noch schliessen kann, falls `startTls` scheitert (etwa
    // eine Zertifikatspruefung, die fehlschlaegt). Erst nach einem
    // ERFOLGREICHEN Handshake wird sie auf null gesetzt (siehe unten) — die
    // Verbindung "gehoert" ab dann der TLS-Huelle (Deno-Doku: startTls
    // konsumiert sie), ein zusaetzliches close() darauf waere falsch.
    tlsConn = await raceWithCleanup(
      Deno.startTls(tcpConn, { hostname: originalHostname }),
      CONNECT_TIMEOUT_MS,
    );
    tcpConn = null;

    const requestText =
      `GET ${path} HTTP/1.1\r\n` +
      `Host: ${originalHostname}\r\n` +
      'User-Agent: AnchorAccommodationBot/1.0\r\n' +
      'Accept: text/html\r\n' +
      // Bewusst KEIN Accept-Encoding: ohne diesen Header liefert ein
      // wohlerzogener Server unkomprimierten Text — wir muessten sonst gzip/br
      // selbst entpacken, wofuer die Deno-Standardbibliothek nichts Fertiges
      // mitbringt und ein eigener Decoder hier den Rahmen sprengen wuerde.
      'Connection: close\r\n\r\n';
    await withTimeout(tlsConn.write(new TextEncoder().encode(requestText)), CONNECT_TIMEOUT_MS);

    const raw = await readCapped(tlsConn, MAX_RAW_RESPONSE_BYTES, READ_TIMEOUT_MS);
    const parsed = parseHttpResponse(raw);
    if (!parsed) return null;

    const bodyBytes = isChunkedTransferEncoding(parsed.headers)
      ? dechunkBody(parsed.body, MAX_BODY_BYTES)
      : parsed.body.subarray(0, MAX_BODY_BYTES);

    return {
      statusCode: parsed.statusCode,
      headers: parsed.headers,
      bodyText: new TextDecoder('utf-8', { fatal: false }).decode(bodyBytes),
    };
  } catch {
    return null;
  } finally {
    try {
      tlsConn?.close();
    } catch {
      // bereits zu
    }
    try {
      tcpConn?.close();
    } catch {
      // bereits zu, oder von startTls uebernommen
    }
  }
}

/**
 * Holt `startUrl` ab und liefert den (abgeschnittenen) HTML-Text zurueck,
 * oder `null` bei JEDER Art von Fehlschlag — falsches Schema, gesperrte
 * Zieladresse, Zeitueberschreitung, zu viele Weiterleitungen, kein
 * lesbarer HTTP-Antwortkopf, HTTP-Status ausserhalb 2xx. `null` ist hier
 * ausdruecklich kein Ausnahmefall: der Aufrufer setzt dafuer `parse_status
 * = 'failed'`, was der Produktentscheidung E1 entspricht (Zugabe, kein
 * Notnagel).
 *
 * Die https-Pruefung und die Adresssperre laufen bei JEDEM Schleifendurchlauf
 * neu — also auch nach jeder Weiterleitung, nicht nur beim ersten Aufruf.
 */
async function fetchHtmlSafely(startUrl: string): Promise<string | null> {
  const deadline = Date.now() + OVERALL_DEADLINE_MS;

  let currentUrl: URL;
  try {
    currentUrl = new URL(startUrl);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() > deadline) return null;
    if (!isAllowedProtocol(currentUrl.protocol)) return null;
    // Nur der https-Standardport — ein abweichender Port vergroessert die
    // Angriffsflaeche (Portscan interner Dienste) ohne fachlichen Nutzen:
    // keine reale Unterkunfts-Seite haengt an einem exotischen Port.
    if (currentUrl.port !== '') return null;

    const connectIp = await resolveSafeConnectIp(currentUrl.hostname);
    if (!connectIp) return null;

    const path = `${currentUrl.pathname}${currentUrl.search}` || '/';
    const result = await performPinnedHttpsRequest(currentUrl.hostname, connectIp, path);
    if (!result) return null;

    if (REDIRECT_STATUS_CODES.has(result.statusCode)) {
      const location = result.headers['location'];
      if (!location) return null;
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        return null;
      }
      continue;
    }

    if (result.statusCode < 200 || result.statusCode >= 300) return null;
    return result.bodyText;
  }

  return null; // Weiterleitungs-Obergrenze ueberschritten
}

const OPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }

  let optionId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.option_id === 'string') optionId = body.option_id;
  } catch {
    return new Response('invalid_json', { status: 400 });
  }
  if (!optionId || !OPTION_ID_PATTERN.test(optionId)) {
    return new Response('invalid_option_id', { status: 400 });
  }

  // RLS laesst keinen direkten Tabellenzugriff zu (0005_rls_hardening.sql) —
  // wie auto-lock arbeitet diese Function daher mit dem Service-Role-Key.
  const { data: option, error: fetchError } = await supabase
    .from('accommodation_options')
    .select('id, raw_url, price_cents')
    .eq('id', optionId)
    .maybeSingle();

  if (fetchError) return new Response(fetchError.message, { status: 500 });
  if (!option) return new Response('option_not_found', { status: 404 });

  const html = await fetchHtmlSafely(option.raw_url);
  const tags = html
    ? extractOpenGraphTags(html)
    : { title: null, imageUrl: null, priceAmountCents: null };

  // og:title ist der Erfolgsanker: ohne ihn gilt der Versuch als gescheitert,
  // selbst bei HTTP 200/202 (siehe packages/shared/src/domain/open-graph.ts
  // und Vorbefund Task 6, Schritt 1 — Booking antwortet mit 202, aber ohne
  // jedes og:-Tag).
  const parseStatus: 'ok' | 'failed' = tags.title ? 'ok' : 'failed';

  const updates: Record<string, unknown> = { parse_status: parseStatus };
  if (tags.imageUrl) updates.image_url = tags.imageUrl;
  // Ein von Hand eingegebener Preis ist nach E1 gleichwertig, nicht
  // zweitrangig — er wird nie ueberschrieben. Nur eine LEERE Preisangabe
  // wird nachtraeglich befuellt. `title` wird hier bewusst NIE geschrieben:
  // der manuelle Titel ist immer vorhanden (DB-Pflichtfeld, siehe
  // add_accommodation_option) und soll nicht stillschweigend durch eine
  // Maschine ersetzt werden.
  if (tags.priceAmountCents !== null && option.price_cents === null) {
    updates.price_cents = tags.priceAmountCents;
  }

  const { error: updateError } = await supabase
    .from('accommodation_options')
    .update(updates)
    .eq('id', optionId);

  if (updateError) return new Response(updateError.message, { status: 500 });

  return new Response(JSON.stringify({ option_id: optionId, parse_status: parseStatus }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
