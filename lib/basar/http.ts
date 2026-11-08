const loopback = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

export function publicOrigin(request: Request, configured = process.env.BASAR_PUBLIC_ORIGIN): string {
  if (configured) {
    const origin = new URL(configured);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('BASAR_PUBLIC_ORIGIN muss eine vollständige HTTP(S)-Origin ohne Pfad sein.');
    }
    return origin.origin;
  }
  const internal = new URL(request.url);
  const host = request.headers.get('host');
  // Next.js normalizes loopback URLs; retain the browser's actual loopback host.
  if (host && loopback(internal.hostname)) {
    const local = new URL(`${internal.protocol}//${host}`);
    if (loopback(local.hostname) && local.port === internal.port) return local.origin;
  }
  return internal.origin;
}

export function isSameOrigin(request: Request, configured?: string): boolean {
  return request.headers.get('origin') === publicOrigin(request, configured);
}

export function sessionCookie(request: Request, token: string | null): string {
  const path = process.env.NEXT_PUBLIC_BASE_PATH || '/';
  return `basar_session=${token || ''}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${publicOrigin(request).startsWith('https:') ? '; Secure' : ''}`;
}
