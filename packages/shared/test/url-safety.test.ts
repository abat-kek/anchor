import { describe, expect, it } from 'vitest';
import {
  expandIpv6ToGroups,
  isAllowedProtocol,
  isBlockedIpAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  isIpLiteralHostname,
} from '../src/domain/url-safety';

describe('isAllowedProtocol', () => {
  it('erlaubt nur https', () => {
    expect(isAllowedProtocol('https:')).toBe(true);
  });

  it('lehnt http, file und andere Schemata ab', () => {
    expect(isAllowedProtocol('http:')).toBe(false);
    expect(isAllowedProtocol('file:')).toBe(false);
    expect(isAllowedProtocol('ftp:')).toBe(false);
  });
});

describe('isBlockedIpv4', () => {
  it('sperrt das Heimnetz 192.168.2.0/24 aus der Aufgabenstellung', () => {
    expect(isBlockedIpv4('192.168.2.5')).toBe(true);
    expect(isBlockedIpv4('192.168.0.1')).toBe(true);
    expect(isBlockedIpv4('192.168.255.255')).toBe(true);
  });

  it('sperrt RFC1918, Loopback, Link-Local und CGNAT', () => {
    expect(isBlockedIpv4('10.0.0.1')).toBe(true);
    expect(isBlockedIpv4('172.16.0.1')).toBe(true);
    expect(isBlockedIpv4('172.31.255.255')).toBe(true);
    expect(isBlockedIpv4('127.0.0.1')).toBe(true);
    expect(isBlockedIpv4('169.254.1.1')).toBe(true);
    expect(isBlockedIpv4('100.64.0.1')).toBe(true);
  });

  it('sperrt 0.0.0.0/8, Multicast und den reservierten Bereich', () => {
    expect(isBlockedIpv4('0.0.0.0')).toBe(true);
    expect(isBlockedIpv4('224.0.0.1')).toBe(true);
    expect(isBlockedIpv4('255.255.255.255')).toBe(true);
  });

  it('laesst oeffentliche Adressen durch', () => {
    expect(isBlockedIpv4('8.8.8.8')).toBe(false);
    expect(isBlockedIpv4('1.1.1.1')).toBe(false);
    // Knapp ausserhalb von 172.16.0.0/12 (Obergrenze 172.31.255.255).
    expect(isBlockedIpv4('172.32.0.1')).toBe(false);
  });

  it('sperrt (fail-closed) alles, was keine gueltige IPv4-Adresse ist', () => {
    expect(isBlockedIpv4('not-an-ip')).toBe(true);
    expect(isBlockedIpv4('999.1.1.1')).toBe(true);
    expect(isBlockedIpv4('1.2.3')).toBe(true);
  });
});

describe('expandIpv6ToGroups', () => {
  it('expandiert eine vollstaendig ausgeschriebene Adresse', () => {
    expect(expandIpv6ToGroups('2001:0db8:0000:0000:0000:0000:0000:0001')).toEqual([
      0x2001, 0x0db8, 0, 0, 0, 0, 0, 1,
    ]);
  });

  it('loest "::"-Kompression an verschiedenen Stellen auf', () => {
    expect(expandIpv6ToGroups('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6ToGroups('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6ToGroups('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('wandelt eine eingebettete IPv4-Endung in zwei Hex-Gruppen um', () => {
    expect(expandIpv6ToGroups('::ffff:192.168.2.5')).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0205]);
  });

  it('gibt bei kaputtem Format null zurueck', () => {
    expect(expandIpv6ToGroups('::1::2')).toBeNull();
    expect(expandIpv6ToGroups('gggg::1')).toBeNull();
    expect(expandIpv6ToGroups('1:2:3')).toBeNull();
  });
});

describe('isBlockedIpv6', () => {
  it('sperrt Loopback, Link-Local, Unique-Local und Multicast', () => {
    expect(isBlockedIpv6('::1')).toBe(true);
    expect(isBlockedIpv6('fe80::1')).toBe(true);
    expect(isBlockedIpv6('fc00::1')).toBe(true);
    expect(isBlockedIpv6('fd12:3456::1')).toBe(true);
    expect(isBlockedIpv6('ff02::1')).toBe(true);
    expect(isBlockedIpv6('::')).toBe(true);
  });

  it('verfolgt IPv4-abgebildete Adressen bis zur eingebetteten IPv4 und sperrt sie dort', () => {
    expect(isBlockedIpv6('::ffff:192.168.2.5')).toBe(true);
    expect(isBlockedIpv6('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIpv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('laesst eine oeffentliche IPv6-Adresse durch', () => {
    expect(isBlockedIpv6('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS
  });

  it('sperrt (fail-closed) nicht parsbare Adressen', () => {
    expect(isBlockedIpv6('nope')).toBe(true);
  });
});

describe('isIpLiteralHostname', () => {
  it('erkennt IPv4- und geklammerte IPv6-Literale', () => {
    expect(isIpLiteralHostname('192.168.2.5')).toBe(true);
    expect(isIpLiteralHostname('[::1]')).toBe(true);
  });

  it('erkennt einen normalen Domainnamen nicht als Literal', () => {
    expect(isIpLiteralHostname('www.airbnb.de')).toBe(false);
  });
});

describe('isBlockedIpAddress', () => {
  it('erkennt die Adressfamilie automatisch und delegiert korrekt', () => {
    expect(isBlockedIpAddress('192.168.2.5')).toBe(true);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('sperrt eine geklammerte IPv6-Adresse ebenso wie eine ungeklammerte', () => {
    expect(isBlockedIpAddress('[::1]')).toBe(true);
  });
});
