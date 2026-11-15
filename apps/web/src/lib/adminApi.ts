declare global {
  interface Window {
    __LATTICE_API_CONFIG__?: { apiUrl?: string };
  }
}

/** The admin API is a separate Fastify deployment, not the Supabase auth URL. */
export function adminApiUrl(path: string): string {
  const configured = (window.__LATTICE_API_CONFIG__?.apiUrl || import.meta.env.VITE_API_URL || '').trim();
  const base = configured || (import.meta.env.DEV ? 'http://localhost:4000' : '');
  const configurationError = 'Workspace admin API is not configured. Set VITE_API_URL to the deployed Fastify API HTTPS URL.';
  if (!base) throw new Error(configurationError);

  let url: URL;
  try { url = new URL(base); } catch { throw new Error(configurationError); }
  const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (!import.meta.env.DEV && (url.protocol !== 'https:' || loopback))) {
    throw new Error(configurationError);
  }
  return `${url.href.replace(/\/+$/, '')}${path}`;
}
