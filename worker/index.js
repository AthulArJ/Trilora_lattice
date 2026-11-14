function isPublicSupabaseKey(key) {
  if (key.startsWith('sb_publishable_')) return true;

  // Legacy anon keys are JWTs. Never send a service-role JWT to the browser.
  const payloadPart = key.split('.')[1];
  if (!payloadPart) return false;
  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/runtime-config.js') {
      const supabaseUrl = (env.VITE_SUPABASE_URL || '').trim().replace(/^https\\:\/\//, 'https://').replace(/\\+$/, '');
      const candidateKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
      const supabasePublishableKey = isPublicSupabaseKey(candidateKey) ? candidateKey : '';
      const config = JSON.stringify({ supabaseUrl, supabasePublishableKey });

      return new Response(`window.__LATTICE_RUNTIME_CONFIG__=${config};`, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
