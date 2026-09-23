/**
 * Konstruiert den öffentlichen Join-Link für einen Trip.
 * Der Link wird mit dem anon-Key aufgerufen, um ohne Authentifizierung
 * einem Trip beitreten zu können.
 */

/**
 * Baut aus einer Web-Basis-URL und einem Share-Token den öffentlichen Join-Link.
 * Das Token wird für die URL-Sicherheit kodiert (RFC 3986).
 *
 * @param webBaseUrl Die Basis-URL der Web-App (z. B. 'https://anchor.kek95.duckdns.org' oder 'http://localhost:3000')
 * @param shareToken Das urlsafe Share-Token aus public.trips.share_token
 * @returns Die vollständige Join-URL, z. B. 'https://anchor.kek95.duckdns.org/join/TOKEN'
 */
export function buildJoinUrl(webBaseUrl: string, shareToken: string): string {
  // Entferne trailing slash aus der Basis-URL, um `//join` zu vermeiden
  const base = webBaseUrl.endsWith('/') ? webBaseUrl.slice(0, -1) : webBaseUrl;
  // Token percent-kodieren für URL-Sicherheit
  const encodedToken = encodeURIComponent(shareToken);
  return `${base}/join/${encodedToken}`;
}
