import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/athul/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
console.log('start');
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--no-sandbox']}); console.log('browser');
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.route('**/*',async r=>{const u=r.request().url();if(new URL(u).pathname.endsWith('/src/main.tsx'))return r.continue({url:u.replace('/src/main.tsx','/src/screenshot.tsx')});if(u.includes('localhost:4000')||u.includes('supabase.co'))return r.abort();return r.continue()});
try {await p.goto('http://127.0.0.1:4176/',{waitUntil:'domcontentloaded',timeout:12000});console.log('goto',await p.title()); await p.waitForTimeout(2000); console.log((await p.locator('body').innerText()).slice(0,500)); console.log(await p.locator('.wi-donut').count());} catch(e) {console.log('ERR',e.message)}
await b.close();
