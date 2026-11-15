const fs = require('fs');
for (const path of ['.env', 'apps/web/.env', 'apps/api/.env']) {
  const values = Object.fromEntries([...fs.readFileSync(path, 'utf8').matchAll(/^\s*([A-Z_]+)\s*=\s*(.*)$/gm)].map(m => [m[1], m[2].replace(/^['"]|['"]$/g, '')]));
  console.log(path, Object.fromEntries(Object.entries(values).filter(([key]) => /^(VITE_API_URL|WEB_ORIGIN|SUPABASE_URL|NODE_ENV|PORT)$/.test(key))), {serviceRoleConfigured: Boolean(values.SUPABASE_SERVICE_ROLE_KEY)});
}
(async () => {
  const origin = 'https://lattice.trilora.net';
  const html = await (await fetch(origin)).text();
  const entry = html.match(/src="([^"\s]+\.js)"[^>]*><\/script>/)?.[1];
  if (!entry) throw new Error('Production entry script not found');
  const visited = new Set();
  async function inspect(url) {
    if (visited.has(url)) return;
    visited.add(url);
    const response = await fetch(url);
    const source = await response.text();
    console.log('Production chunk', url, response.status);
    if (url.includes('UsersAccessPage')) {
      console.log('API base matches:', source.match(/.{0,55}(?:localhost:4000|https:\/\/[^"\s]+).{0,50}/g));
      console.log('Account calls:', source.match(/.{0,55}\/api\/v1\/admin\/users.{0,75}/g));
    }
    const imports = [...source.matchAll(/["'](?:\.\/|\/assets\/)([^"']+\.js)["']/g)].map(m => m[1]);
    for (const name of new Set(imports.filter(name => /^(?:App-|UsersAccessPage-)/.test(name)))) await inspect(new URL(name, url).href);
  }
  await inspect(new URL(entry, origin).href);
  for (const path of ['/api/v1/admin/users', '/runtime-config.js']) {
    const r = await fetch(origin + path);
    console.log('Production path', path, r.status, r.headers.get('content-type'));
    if (path === '/runtime-config.js') {
      const body = await r.text();
      const json = body.match(/=(\{.*\});/)?.[1];
      if (json) { const config = JSON.parse(json); console.log('Runtime configuration keys:', Object.keys(config), 'API URL:', config.apiUrl ?? '(absent)'); }
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
