/**
 * SSRF-Sperre fuer `parse-accommodation` (Task 6): reine, netzfreie Adressbereichs-
 * pruefung fuer IPv4 und IPv6. Die Edge Function loest den Hostnamen selbst per
 * `Deno.resolveDns` auf und prueft JEDE zurueckgegebene Adresse gegen die Funktionen
 * hier, bevor sie eine Verbindung aufbaut — und wiederholt das nach jeder
 * Weiterleitung. Dieses Modul entscheidet nur "ist diese Adresse intern/lokal",
 * nichts sonst; DNS-Aufloesung und Verbindungsaufbau bleiben in der Edge Function,
 * weil beides in der Deno-Laufzeit passieren muss und hier (Vitest/Node) nicht
 * pruefbar waere.
 *
 * Bewusste Fail-closed-Haltung ueberall: jede nicht sauber parsbare Adresse gilt
 * als gesperrt, nie als erlaubt. Ein Angreifer, der ein kaputtes Format liefert,
 * soll damit nie durchrutschen.
 */

interface Ipv4Block {
  /** Netzwerkadresse in Punkt-Dezimal-Schreibweise. */
  network: string;
  /** Anzahl fuehrender Maskenbits. */
  prefixLength: number;
}

/**
 * Fuer diese Funktion relevante gesperrte IPv4-Bereiche: RFC1918-Privatnetze
 * (inkl. `192.168.0.0/16`, das im Zielnetz tatsaechlich verwendet wird),
 * Loopback, Link-Local, CGNAT, "this network" sowie Multicast/reserviert.
 * Dokumentations- und Benchmark-Bereiche (TEST-NET, 198.18.0.0/15) sind
 * bewusst ausgelassen: sie sind im echten Internet nicht routbar und daher
 * fuer die SSRF-Frage ("erreicht die Anfrage das Heimnetz?") ohne Belang.
 */
const BLOCKED_IPV4_BLOCKS: readonly Ipv4Block[] = [
  { network: '0.0.0.0', prefixLength: 8 },
  { network: '10.0.0.0', prefixLength: 8 },
  { network: '100.64.0.0', prefixLength: 10 },
  { network: '127.0.0.0', prefixLength: 8 },
  { network: '169.254.0.0', prefixLength: 16 },
  { network: '172.16.0.0', prefixLength: 12 },
  { network: '192.168.0.0', prefixLength: 16 },
  { network: '224.0.0.0', prefixLength: 4 },
  { network: '240.0.0.0', prefixLength: 4 },
];

/** Parst eine IPv4-Punkt-Dezimal-Adresse zu einer 32-Bit-Ganzzahl, oder `null`. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function isIpv4InBlock(ipInt: number, block: Ipv4Block): boolean {
  const networkInt = ipv4ToInt(block.network);
  if (networkInt === null) return false;
  const mask = block.prefixLength === 0 ? 0 : (~0 << (32 - block.prefixLength)) >>> 0;
  return (ipInt & mask) === (networkInt & mask);
}

/** Ist `ip` (Punkt-Dezimal) eine private/lokale/reservierte IPv4-Adresse? */
export function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true;
  return BLOCKED_IPV4_BLOCKS.some((block) => isIpv4InBlock(ipInt, block));
}

/**
 * Zerlegt eine IPv6-Adresse in acht 16-Bit-Gruppen (als Zahlen). Loest `::`-
 * Kompression auf und wandelt eine eingebettete IPv4-Punkt-Dezimal-Endung
 * (`::ffff:192.168.1.1`, `::1.2.3.4`) in zwei Hex-Gruppen um. Gibt `null` bei
 * jedem nicht eindeutig parsbaren Format zurueck (fail-closed beim Aufrufer).
 */
export function expandIpv6ToGroups(ip: string): number[] | null {
  const zoneIndex = ip.indexOf('%');
  let addr = zoneIndex === -1 ? ip : ip.slice(0, zoneIndex);
  if (addr.length === 0) return null;

  const lastColon = addr.lastIndexOf(':');
  if (lastColon !== -1 && addr.slice(lastColon + 1).includes('.')) {
    const embeddedIpv4 = ipv4ToInt(addr.slice(lastColon + 1));
    if (embeddedIpv4 === null) return null;
    const highGroup = ((embeddedIpv4 >>> 16) & 0xffff).toString(16);
    const lowGroup = (embeddedIpv4 & 0xffff).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${highGroup}:${lowGroup}`;
  }

  const doubleColonMatches = addr.match(/::/g);
  if (doubleColonMatches && doubleColonMatches.length > 1) return null;

  let headParts: string[];
  let tailParts: string[];
  if (addr.includes('::')) {
    const [left, right] = addr.split('::');
    headParts = left ? left.split(':') : [];
    tailParts = right ? right.split(':') : [];
  } else {
    headParts = addr.split(':');
    tailParts = [];
  }

  const missingGroups = 8 - (headParts.length + tailParts.length);
  if (missingGroups < 0) return null;
  if (!addr.includes('::') && missingGroups !== 0) return null;
  if (addr.includes('::') && missingGroups === 0) return null; // "::" muesste dann leer sein

  const allParts = [...headParts, ...new Array(missingGroups).fill('0'), ...tailParts];
  if (allParts.length !== 8) return null;

  const groups: number[] = [];
  for (const part of allParts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    groups.push(Number.parseInt(part, 16));
  }
  return groups;
}

function ipv4FromLowGroups(high: number, low: number): string {
  return `${(high >>> 8) & 0xff}.${high & 0xff}.${(low >>> 8) & 0xff}.${low & 0xff}`;
}

/**
 * Ist `ip` eine private/lokale/reservierte IPv6-Adresse? Deckt Loopback
 * (`::1`), Link-Local (`fe80::/10`), Unique-Local (`fc00::/7`), Multicast
 * (`ff00::/8`), die unspezifizierte Adresse (`::`) sowie IPv4-abgebildete/
 * -kompatible Adressen ab — letztere werden auf ihre eingebettete IPv4-Form
 * zurueckgefuehrt und ueber {@link isBlockedIpv4} geprueft, damit ein
 * `::ffff:192.168.2.5` nicht an der IPv6-Pruefung vorbeikommt.
 */
export function isBlockedIpv6(ip: string): boolean {
  const groups = expandIpv6ToGroups(ip);
  if (!groups) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number, number, number, number, number, number, number, number,
  ];

  const isUnspecified = groups.every((g) => g === 0);
  const isLoopback = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1;
  const isLinkLocal = (g0 & 0xffc0) === 0xfe80;
  const isUniqueLocal = (g0 & 0xfe00) === 0xfc00;
  const isMulticast = (g0 & 0xff00) === 0xff00;

  if (isUnspecified || isLoopback || isLinkLocal || isUniqueLocal || isMulticast) return true;

  // IPv4-abgebildet, ::ffff:0:0/96 (der praxisrelevante Fall: IPv4-Dual-Stack-Server).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isBlockedIpv4(ipv4FromLowGroups(g6, g7));
  }

  // IPv4-kompatibel (veraltet), ::a.b.c.d/96 — ausser den bereits behandelten ::/128 und ::1/128.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isBlockedIpv4(ipv4FromLowGroups(g6, g7));
  }

  return false;
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return hostname.slice(1, -1);
  return hostname;
}

/**
 * Erkennt IP-Literale (v4 oder mit `[...]` geklammertes v6) in einem
 * `URL.hostname`-Wert. Ein Domainname enthaelt weder Doppelpunkt noch
 * eckige Klammern, daher genuegt diese einfache Unterscheidung.
 */
export function isIpLiteralHostname(hostname: string): boolean {
  const bare = stripIpv6Brackets(hostname);
  return ipv4ToInt(bare) !== null || bare.includes(':');
}

/**
 * Vereinheitlichte Sperrpruefung: nimmt eine rohe Adresse (wie sie
 * `Deno.resolveDns` oder ein geklammertes `URL.hostname` liefert), erkennt
 * die Familie an einem enthaltenen Doppelpunkt und delegiert an
 * {@link isBlockedIpv4} bzw. {@link isBlockedIpv6}.
 */
export function isBlockedIpAddress(ip: string): boolean {
  const bare = stripIpv6Brackets(ip);
  return bare.includes(':') ? isBlockedIpv6(bare) : isBlockedIpv4(bare);
}

/** Nur `https` ist erlaubt — kein `http`, kein `file:`, kein sonstiges Schema. */
export function isAllowedProtocol(protocol: string): boolean {
  return protocol === 'https:';
}
