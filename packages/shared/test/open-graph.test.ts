import { describe, expect, it } from 'vitest';
import { extractOpenGraphTags } from '../src/domain/open-graph';

describe('extractOpenGraphTags', () => {
  it('liest og:title, og:image und og:price:amount aus typischem Markup', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Schoene Wohnung am See" />
        <meta property="og:image" content="https://example.com/bild.jpg" />
        <meta property="og:price:amount" content="89.50" />
      </head></html>
    `;
    const result = extractOpenGraphTags(html);
    expect(result.title).toBe('Schoene Wohnung am See');
    expect(result.imageUrl).toBe('https://example.com/bild.jpg');
    expect(result.priceAmountCents).toBe(8950);
  });

  it('liest Tags, bei denen content vor property steht', () => {
    const html = '<meta content="Andere Reihenfolge" property="og:title">';
    expect(extractOpenGraphTags(html).title).toBe('Andere Reihenfolge');
  });

  it('akzeptiert einfache Anfuehrungszeichen', () => {
    const html = "<meta property='og:title' content='Mit einfachen Quotes'>";
    expect(extractOpenGraphTags(html).title).toBe('Mit einfachen Quotes');
  });

  it('dekodiert gaengige HTML-Entities im Titel', () => {
    const html = '<meta property="og:title" content="Katz &amp; Hund&#39;s Bude">';
    expect(extractOpenGraphTags(html).title).toBe("Katz & Hund's Bude");
  });

  it('akzeptiert Komma als Dezimaltrennzeichen bei og:price:amount', () => {
    const html = '<meta property="og:price:amount" content="1234,56">';
    expect(extractOpenGraphTags(html).priceAmountCents).toBe(123456);
  });

  it('liefert null fuer eine unplausible (negative oder nicht-numerische) Preisangabe', () => {
    expect(
      extractOpenGraphTags('<meta property="og:price:amount" content="-5">').priceAmountCents,
    ).toBeNull();
    expect(
      extractOpenGraphTags('<meta property="og:price:amount" content="kostenlos">').priceAmountCents,
    ).toBeNull();
  });

  it('kappt eine unplausibel hohe og:price:amount statt einen integer-Ueberlauf zu riskieren (G1)', () => {
    // price_cents ist int4 (max. 2.147.483.647) — 999999999999 Euro waeren
    // weit jenseits davon und wuerden ein Datenbank-update ohne diese Kappung
    // komplett scheitern lassen.
    expect(
      extractOpenGraphTags('<meta property="og:price:amount" content="999999999999">').priceAmountCents,
    ).toBeNull();
    // Knapp UNTER der Grenze (MAX_PRICE_CENTS = 100_000_000 Cent = 1.000.000,00)
    // bleibt gueltig.
    expect(
      extractOpenGraphTags('<meta property="og:price:amount" content="999999.99">').priceAmountCents,
    ).toBe(99_999_999);
  });

  it('liefert durchgehend null, wenn keine og:-Tags vorhanden sind (Bot-Abwehrseite wie im Vorbefund)', () => {
    const html = '<html><head><title></title></head><body></body></html>';
    const result = extractOpenGraphTags(html);
    expect(result.title).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.priceAmountCents).toBeNull();
  });

  it('ignoriert einen leeren content-Wert (kein Titel gilt als kein Titel)', () => {
    const html = '<meta property="og:title" content="">';
    expect(extractOpenGraphTags(html).title).toBeNull();
  });

  it('akzeptiert einen https-Bildlink innerhalb der Laengengrenze (G2)', () => {
    const html = '<meta property="og:image" content="https://example.com/bild.jpg">';
    expect(extractOpenGraphTags(html).imageUrl).toBe('https://example.com/bild.jpg');
  });

  it('lehnt eine data:-URI als og:image ab (G2)', () => {
    const html = '<meta property="og:image" content="data:image/png;base64,AAAA">';
    expect(extractOpenGraphTags(html).imageUrl).toBeNull();
  });

  it('lehnt ein http:-Bild ab (G2)', () => {
    const html = '<meta property="og:image" content="http://example.com/bild.jpg">';
    expect(extractOpenGraphTags(html).imageUrl).toBeNull();
  });

  it('lehnt eine og:image-URL jenseits der Laengengrenze ab (G2)', () => {
    const overlyLongPath = 'a'.repeat(2100);
    const html = `<meta property="og:image" content="https://example.com/${overlyLongPath}">`;
    expect(extractOpenGraphTags(html).imageUrl).toBeNull();
  });
});
