import { describe, expect, it } from 'vitest';
import { dechunkBody, isChunkedTransferEncoding, parseHttpResponse } from '../src/domain/http-response';

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('parseHttpResponse', () => {
  it('parst Statuszeile, Header und Koerper einer einfachen Antwort', () => {
    const raw = toBytes(
      'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nX-Test: a\r\n\r\n<html>hi</html>',
    );
    const result = parseHttpResponse(raw);
    expect(result?.statusCode).toBe(200);
    expect(result?.headers['content-type']).toBe('text/html');
    expect(result?.headers['x-test']).toBe('a');
    expect(new TextDecoder().decode(result!.body)).toBe('<html>hi</html>');
  });

  it('liest Header-Namen unabhaengig von Gross-/Kleinschreibung', () => {
    const raw = toBytes('HTTP/1.1 200 OK\r\nTRANSFER-ENCODING: chunked\r\n\r\n');
    const result = parseHttpResponse(raw);
    expect(result?.headers['transfer-encoding']).toBe('chunked');
  });

  it('gibt null zurueck, wenn die Header-Leerzeile fehlt (mitten in den Headern abgeschnitten)', () => {
    const raw = toBytes('HTTP/1.1 200 OK\r\nContent-Type: text/ht');
    expect(parseHttpResponse(raw)).toBeNull();
  });

  it('gibt null zurueck, wenn die Statuszeile nicht dem Format entspricht', () => {
    const raw = toBytes('garbage\r\n\r\n');
    expect(parseHttpResponse(raw)).toBeNull();
  });

  it('parst einen Bot-Abwehr-202 wie im Vorbefund (kein Content-Type noetig)', () => {
    const raw = toBytes('HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\n\r\n');
    expect(parseHttpResponse(raw)?.statusCode).toBe(202);
  });
});

describe('isChunkedTransferEncoding', () => {
  it('erkennt "chunked" unabhaengig von Gross-/Kleinschreibung', () => {
    expect(isChunkedTransferEncoding({ 'transfer-encoding': 'chunked' })).toBe(true);
    expect(isChunkedTransferEncoding({ 'transfer-encoding': 'CHUNKED' })).toBe(true);
  });

  it('ist false ohne den Header oder mit anderem Wert', () => {
    expect(isChunkedTransferEncoding({})).toBe(false);
    expect(isChunkedTransferEncoding({ 'transfer-encoding': 'identity' })).toBe(false);
  });
});

describe('dechunkBody', () => {
  it('entschluesselt mehrere vollstaendige Chunks bis zum Terminator', () => {
    const raw = toBytes('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');
    const result = dechunkBody(raw, 1024);
    expect(new TextDecoder().decode(result)).toBe('hello world');
  });

  it('bricht die Grenze `maxOutputBytes` niemals — auch nicht mitten in einem Chunk', () => {
    const raw = toBytes('a\r\n0123456789\r\n0\r\n\r\n'); // Chunk-Groesse 0xa = 10 Bytes
    const result = dechunkBody(raw, 5);
    expect(new TextDecoder().decode(result)).toBe('01234');
  });

  it('bricht sauber ab, wenn die Chunk-Groessenzeile mitten drin abgeschnitten ist', () => {
    const raw = toBytes('5\r\nhello\r\n6\r\n wor'); // zweite Groessenzeile vollstaendig, Daten abgeschnitten
    const result = dechunkBody(raw, 1024);
    expect(new TextDecoder().decode(result)).toBe('hello wor');
  });

  it('bricht sauber ab, wenn nach dem ersten Chunk direkt abgeschnitten wird (keine zweite Groessenzeile)', () => {
    const raw = toBytes('5\r\nhello\r\n6\r\n');
    const result = dechunkBody(raw, 1024);
    expect(new TextDecoder().decode(result)).toBe('hello');
  });

  it('gibt einen leeren Puffer zurueck, wenn direkt der Terminator-Chunk kommt', () => {
    const raw = toBytes('0\r\n\r\n');
    expect(dechunkBody(raw, 1024)).toHaveLength(0);
  });

  it('bricht bei einer nicht-hexadezimalen Chunk-Groesse ab, statt zu werfen', () => {
    const raw = toBytes('zz\r\ngarbage\r\n');
    expect(() => dechunkBody(raw, 1024)).not.toThrow();
    expect(dechunkBody(raw, 1024)).toHaveLength(0);
  });
});
