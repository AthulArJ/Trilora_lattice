// Local validation only. Existing credentials stay in memory and are never printed.
const fs = require('node:fs');
const path = require('node:path');
process.env.NODE_ENV = 'production';
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH = path.resolve('tmp/api-runtime-validation.log');
const { unstable_dev } = require('C:/Users/athul/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler');
const env = Object.fromEntries([...fs.readFileSync('apps/api/.env', 'utf8').matchAll(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/gm)].map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]));
let worker;
const timeout = setTimeout(() => { console.log('VALIDATION: overall timeout'); process.exit(124); }, 45000);
function redact(value) {
  let text = String(value);
  for (const [key, secret] of Object.entries(env)) if (secret && /KEY|TOKEN|SECRET/.test(key)) text = text.split(secret).join('[REDACTED]');
  return text;
}
(async () => {
  worker = await unstable_dev(process.env.LATTICE_CONTROL_TEST ? 'tmp/api-adapter-control.js' : 'worker/api.js', {
    config: 'wrangler.api.jsonc', local: true, envFiles: [], persist: false,
    port: 8788, inspectorPort: 0, logLevel: 'none',
    vars: { NODE_ENV: 'production', CLOUDFLARE_WORKER: 'true', PORT: '4000', WEB_ORIGIN: 'https://lattice.trilora.net', SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY },
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false, showInteractiveDevSession: false },
  });
  console.log('VALIDATION: local Wrangler listening on port', worker.port);
  const cases = process.env.LATTICE_CONTROL_TEST ? [
    ['Node HTTP adapter health', '/health', {}, 200],
    ['Worker Supabase read-only connection', '/read-only-supabase-check', {}, 200],
  ] : [
    ['health', '/health', {}, 200],
    ['users requires login', '/api/v1/admin/users', {headers: {Origin: 'https://lattice.trilora.net'}}, 401],
    ['invite requires login', '/api/v1/admin/users/invite', {method: 'POST', headers: {Origin: 'https://lattice.trilora.net', 'content-type': 'application/json'}, body: '{}'}, 401],
    ['production CORS', '/api/v1/admin/users/invite', {method: 'OPTIONS', headers: {Origin: 'https://lattice.trilora.net', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'}}, 204],
  ];
  for (const [name, route, options, expected] of cases) {
    const r = await fetch(`http://${worker.address}:${worker.port}${route}`, {...options, signal: AbortSignal.timeout(15000)});
    const body = await r.text();
    console.log('VALIDATION:', JSON.stringify({name,status:r.status,expected,cors:r.headers.get('access-control-allow-origin'),body:r.headers.get('content-type')?.includes('json') ? redact(body).slice(0,1600) : '(runtime HTML error; stack recorded in local log)'}));
    if (r.status !== expected) process.exitCode = 1;
  }
})().catch(e => { console.log('VALIDATION ERROR:', redact(e.message)); process.exitCode = 1; })
  .finally(async () => { if (worker) await Promise.race([worker.stop(), new Promise(resolve => setTimeout(resolve, 5000))]); clearTimeout(timeout); });
