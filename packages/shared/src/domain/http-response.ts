/**
 * Reines Parsen einer rohen HTTP/1.1-Antwort (Statuszeile, Header, ggf.
 * "Transfer-Encoding: chunked"-Koerper) aus einem Byte-Puffer. Kein Netz,
 * kein Deno — die Edge Function `parse-accommodation` liest Bytes vom
 * TLS-Socket und reicht sie hierher weiter, der Rest ist testbare Logik.
 *
 * Absichtlich robust gegenueber Abschneidung: die Edge Function begrenzt die
 * gelesene Antwortgroesse, liest also moeglicherweise mitten in einem Chunk
 * auf. `dechunkBody` bricht dann sauber ab und liefert, was bis dahin
 * entschluesselt werden konnte, statt zu werfen — ein abgeschnittenes
 * Ergebnis ist hier der Normalfall, kein Fehlerfall.
 */

export interface ParsedHttpResponse {
  statusCode: number;
  /** Header-Namen sind kleingeschrieben. */
  headers: Record<string, string>;
  /** Rohe Bytes nach dem Leerzeilen-Trenner, ggf. noch chunk-codiert. */
  body: Uint8Array;
}

function indexOfBytes(haystack: Uint8Array, needle: number[], fromIndex: number): number {
  const limit = haystack.length - needle.length;
  outer: for (let i = fromIndex; i <= limit; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const CRLF = [13, 10];
const CRLFCRLF = [13, 10, 13, 10];

/**
 * Parst Statuszeile und Header aus einer rohen HTTP-Antwort. Gibt `null`
 * zurueck, wenn der Header-Abschluss (Leerzeile) nicht im Puffer steckt
 * (Antwort wurde vor Ende der Header abgeschnitten) oder die Statuszeile
 * nicht dem erwarteten Format entspricht.
 */
export function parseHttpResponse(raw: Uint8Array): ParsedHttpResponse | null {
  const headerEnd = indexOfBytes(raw, CRLFCRLF, 0);
  if (headerEnd === -1) return null;

  const headerText = new TextDecoder().decode(raw.subarray(0, headerEnd));
  const lines = headerText.split('\r\n');
  const statusLine = lines[0] ?? '';
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(statusLine);
  if (!statusMatch) return null;
  const statusCode = Number(statusMatch[1]);

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (key.length > 0) headers[key] = value;
  }

  return { statusCode, headers, body: raw.subarray(headerEnd + CRLFCRLF.length) };
}

/**
 * Entschluesselt einen (ggf. abgeschnittenen) "Transfer-Encoding: chunked"-
 * Koerper, hoechstens bis `maxOutputBytes`. Bricht bei jeder Unregelmaessigkeit
 * (kaputte Chunk-Groesse, abgeschnittene Chunk-Groessenzeile, abgeschnittene
 * Chunk-Nutzdaten) sofort ab und gibt zurueck, was bis dahin sicher
 * entschluesselt wurde — nie eine Exception fuer "die Antwort war zu kurz".
 */
export function dechunkBody(bytes: Uint8Array, maxOutputBytes: number): Uint8Array {
  const out = new Uint8Array(maxOutputBytes);
  let outLength = 0;
  let pos = 0;

  while (pos < bytes.length && outLength < maxOutputBytes) {
    const lineEnd = indexOfBytes(bytes, CRLF, pos);
    if (lineEnd === -1) break;

    const sizeLine = new TextDecoder().decode(bytes.subarray(pos, lineEnd)).split(';')[0]?.trim() ?? '';
    if (!/^[0-9a-fA-F]+$/.test(sizeLine)) break;
    const chunkSize = Number.parseInt(sizeLine, 16);
    if (!Number.isFinite(chunkSize) || chunkSize < 0) break;
    if (chunkSize === 0) break; // Terminator-Chunk

    const dataStart = lineEnd + CRLF.length;
    const availableInChunk = Math.min(chunkSize, bytes.length - dataStart);
    if (availableInChunk <= 0) break;

    const takeCount = Math.min(availableInChunk, maxOutputBytes - outLength);
    out.set(bytes.subarray(dataStart, dataStart + takeCount), outLength);
    outLength += takeCount;

    if (takeCount < chunkSize) break; // Antwort endete mitten in den Nutzdaten dieses Chunks
    pos = dataStart + chunkSize + CRLF.length; // Nutzdaten + trennendes CRLF ueberspringen
  }

  return out.subarray(0, outLength);
}

/** Enthaelt der Header "transfer-encoding" (Groß-/Kleinschreibung egal) den Wert "chunked"? */
export function isChunkedTransferEncoding(headers: Record<string, string>): boolean {
  return /chunked/i.test(headers['transfer-encoding'] ?? '');
}
