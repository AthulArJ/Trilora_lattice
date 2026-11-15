const fs = require('fs');
const path = require('path');
const { Miniflare } = require('C:/Users/athul/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/miniflare');
const source = fs.readFileSync('apps/api/.env', 'utf8');
const config = Object.fromEntries([...source.matchAll(/^\s*([A-Z_]+)\s*=\s*(.*)$/gm)].map(m => [m[1], m[2].replace(/^['"]|['"]$/g, '')]));
(async () => {
  const bindings = { NODE_ENV: 'production', CLOUDFLARE_WORKER: 'true', PORT: '4000', WEB_ORIGIN: 'https://lattice.trilora.net', SUPABASE_URL: config.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY };
  const mf = new Miniflare({ workers: [{ config: {
    name: 'lattice-api-check',
    manifest: { mainModule: 'api.js', modules: {'api.js': {type: 'esm', contents: fs.readFileSync('tmp/api-worker-build/api.js', 'utf8')}} },
    compatibilityDate: '2026-11-15',
    compatibilityFlags: ['nodejs_compat'],
    env: Object.fromEntries(Object.entries(bindings).map(([key,value]) => [key, {type: 'text', value}])),
  } }] });
  try {
    for (const [route, options] of [
      ['/health', {}],
      ['/api/v1/admin/users', {headers: {Origin: 'https://lattice.trilora.net'}}],
      ['/api/v1/admin/users/invite', {method: 'OPTIONS', headers: {Origin: 'https://lattice.trilora.net', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'}}],
    ]) {
      const response = await mf.dispatchFetch('https://api.test' + route, options);
      console.log(route, response.status, 'CORS:', response.headers.get('access-control-allow-origin'), await response.text());
      if (route === '/health' && response.status !== 200) throw new Error('Worker API health failed');
      if (route === '/api/v1/admin/users' && response.status !== 401) throw new Error('Admin endpoint must require authentication');
      if (options.method === 'OPTIONS' && response.headers.get('access-control-allow-origin') !== 'https://lattice.trilora.net') throw new Error('Production CORS failed');
    }
  } finally { await mf.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
