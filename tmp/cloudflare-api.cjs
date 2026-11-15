const fs = require('fs');
const path = require('path');
const account = '9c2bf61a960942ec603e7899dacbe2fd';
function getToken() {
  const config = fs.readFileSync(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if (!token) throw new Error('Cloudflare login token unavailable');
  return token;
}
async function cfApi(endpoint, options = {}) {
  const response = await fetch('https://api.cloudflare.com/client/v4/' + endpoint, { ...options, headers: { Authorization: 'Bearer ' + getToken(), ...options.headers } });
  const body = await response.json();
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result;
}
module.exports = { cfApi, account };
if (require.main === module) (async () => {
  console.log('Workers subdomain:', await cfApi(`accounts/${account}/workers/subdomain`));
  console.log('Existing workers:', (await cfApi(`accounts/${account}/workers/scripts`)).map(s => s.id));
  const settings = await cfApi(`accounts/${account}/workers/scripts/trilora-lattice/settings`);
  console.log('Frontend bindings:', settings.bindings.map(b => ({ name: b.name, type: b.type, ...(b.name === 'VITE_API_URL' ? {value: b.text} : {}) })));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
