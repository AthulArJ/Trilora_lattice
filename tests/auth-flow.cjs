// Uses the production web build and the real Supabase JS client; Auth HTTP responses
// are isolated fixtures. No real users, tokens, passwords, or workspace data are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'invite@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Invited person' }, created_at: '2026-01-01T00:00:00Z' };
function token(method, expired = false) {
  return ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000) + (expired ? -3600 : 3600), iat: Math.floor(Date.now()/1000), role: 'authenticated', session_id: '22222222-2222-4222-8222-222222222222', amr: [{ method }] })).toString('base64url'), 'fixture'].join('.');
}
const otp = token('otp'), passwordToken = token('password');
const session = access_token => ({ access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'fixture-refresh', user });
const dist = path.resolve('apps/web/dist');
const server = http.createServer((req, res) => {
  const file = path.join(dist, new URL(req.url, 'http://localhost').pathname === '/' ? 'index.html' : new URL(req.url, 'http://localhost').pathname);
  try { res.setHeader('content-type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.statusCode=404; res.end(); }
});
let browser, base;
async function fixture() {
  const context = await browser.newContext();
  const state = { updates: 0, workspaceReads: 0, failUpdate: false, failSignIn: false, rejectToken: false, order: [] };
  await context.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.__LATTICE_RUNTIME_CONFIG__={supabaseUrl:'https://auth.lattice.test',supabasePublishableKey:'fixture-key'};window.__LATTICE_API_CONFIG__={apiUrl:'https://api.lattice.test'};` }));
  await context.route('https://auth.lattice.test/**', async route => {
    const req = route.request(), url = new URL(req.url());
    let status=200, body;
    if (url.pathname === '/auth/v1/user' && req.method()==='PUT') {
      state.updates++; state.order.push('update');
      if (state.holdUpdate) await new Promise(resolve=>{state.releaseUpdate=resolve;state.updateStarted();});
      if (state.failUpdate) { status=422; body={ msg:'Password rejected by policy', code:'weak_password' }; }
      else body=user;
    } else if (url.pathname === '/auth/v1/user') {
      if (state.rejectToken) { status=401; body={msg:'Expired fixture token'}; } else body=user;
    } else if (url.pathname === '/auth/v1/token') {
      state.order.push('password-sign-in');
      if (state.failSignIn) { status=503; body={msg:'Sign-in unavailable'}; }
      else body=session(url.searchParams.get('grant_type')==='refresh_token' ? otp : passwordToken);
    } else if (url.pathname === '/auth/v1/logout') body={};
    else { state.workspaceReads++; body=url.pathname.includes('/profiles') ? {role:'viewer',display_name:'Invited person'} : []; }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.route('https://api.lattice.test/**', async route => { state.workspaceReads++; await route.fulfill({contentType:'application/json',body:JSON.stringify({source:'supabase',data:[],staff:[],incidents:[],anchors:[],badges:[]})}); });
  const page=await context.newPage();
  const link = type => `${base}/#access_token=${otp}&refresh_token=fixture-refresh&expires_in=3600&token_type=bearer&type=${type}`;
  return {context,page,state,link};
}
async function pending(f) {
  await f.page.getByRole('heading',{name:'Set up your workspace access'}).waitFor();
  await f.page.waitForTimeout(150);
  assert.equal(f.state.workspaceReads,0,'Pending setup must not mount the app or read workspace/profile data');
}
async function fill(f,a='FixtureNewPass123!',b=a) {
  await f.page.locator('#login-password').fill(a);
  await f.page.locator('#login-confirm-password').fill(b);
}
async function dashboard(f) { await f.page.locator('.operations-hub').waitFor({timeout:10000}); }
async function run(name, fn) { await fn(); console.log('PASS',name); }
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  await run('1-4: invite, no password, viewport changes, clean-URL reload and new tab stay pending',async()=>{
    const f=await fixture();await f.page.goto(f.link('invite'));await pending(f);
    await f.page.setViewportSize({width:390,height:844});await pending(f);
    await f.page.setViewportSize({width:1920,height:1080});await pending(f);
    await f.page.goto(base);await pending(f);await f.page.reload();await pending(f);
    const second=await f.context.newPage();await second.goto(base);await pending({...f,page:second});
    assert.equal(f.state.updates,0);await f.context.close();
  });
  await run('5-7: mismatch, short password, failed update remain pending; success alone opens dashboard',async()=>{
    const f=await fixture();await f.page.goto(f.link('invite'));await pending(f);
    await fill(f,'FixtureNewPass123!','Mismatch123!');await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();await f.page.getByRole('alert').filter({hasText:'do not match'}).waitFor();assert.equal(f.state.updates,0);
    await fill(f,'short');await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();assert.equal(f.state.updates,0);await pending(f);
    f.state.failUpdate=true;await fill(f);await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();await f.page.getByRole('alert').filter({hasText:'Password rejected'}).waitFor();await pending(f);
    f.state.failUpdate=false;await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();await dashboard(f);assert.deepEqual(f.state.order,['update','update','password-sign-in']);
    assert.equal(new URL(f.page.url()).searchParams.has('setup'),false);await f.page.reload();await dashboard(f);await f.context.close();
  });
  await run('8: existing password login and logout work normally',async()=>{
    const f=await fixture();await f.page.goto(base);await f.page.locator('#login-email').fill(user.email);await f.page.locator('#login-password').fill('ExistingPass123!');await f.page.getByRole('button',{name:'Sign in',exact:true}).click();await dashboard(f);assert.equal(f.state.updates,0);await f.page.getByRole('button',{name:'Sign out',exact:true}).click();await f.page.getByRole('heading',{name:'Welcome to Lattice'}).waitFor();await f.context.close();
  });
  await run('9: expired callback cannot fall back to an existing password session',async()=>{
    const f=await fixture();await f.page.goto(base);await f.page.evaluate(s=>localStorage.setItem('sb-auth-auth-token',JSON.stringify(s)),session(passwordToken));await f.page.goto(`${base}/#error=access_denied&error_code=otp_expired&type=invite`);await pending(f);assert.equal(await f.page.getByRole('button',{name:'Set password & continue',exact:true}).isDisabled(),true);await f.context.close();
  });
  await run('10: logout then revisit invitation never bypasses setup',async()=>{
    const f=await fixture();await f.page.goto(base);await f.page.locator('#login-email').fill(user.email);await f.page.locator('#login-password').fill('ExistingPass123!');await f.page.getByRole('button',{name:'Sign in',exact:true}).click();await dashboard(f);await f.page.getByRole('button',{name:'Sign out',exact:true}).click();await f.page.getByRole('heading',{name:'Welcome to Lattice'}).waitFor();f.state.workspaceReads=0;await f.page.goto(f.link('invite'));await pending(f);await f.context.close();
  });
  await run('recovery, forged metadata, lost URL and rejected session stay gated',async()=>{
    const f=await fixture();await f.page.goto(f.link('recovery'));await pending(f);await f.page.goto(base);await pending(f);await f.context.close();
    const g=await fixture();g.state.rejectToken=true;await g.page.goto(g.link('invite'));await pending(g);assert.equal(await g.page.getByRole('button',{name:'Set password & continue',exact:true}).isDisabled(),true);await g.context.close();
    const h=await fixture();await h.page.goto(base);await h.page.evaluate(s=>localStorage.setItem('sb-auth-auth-token',JSON.stringify(s)),{...session(otp),user:{...user,user_metadata:{password_setup_complete:true}}});await h.page.reload();await pending(h);await h.context.close();
  });
  await run('password saved but sign-in fails: remain gated, retry without another password update',async()=>{
    const f=await fixture();f.state.failSignIn=true;await f.page.goto(f.link('recovery'));await pending(f);await fill(f);await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();await f.page.getByRole('alert').waitFor();await pending(f);assert.equal(f.state.updates,1);
    f.state.failSignIn=false;await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();await dashboard(f);assert.equal(f.state.updates,1);await f.context.close();
  });
  await run('logout during password update cancels setup completion',async()=>{
    const f=await fixture();f.state.holdUpdate=true;const started=new Promise(resolve=>{f.state.updateStarted=resolve;});await f.page.goto(f.link('invite'));await pending(f);await fill(f);await f.page.getByRole('button',{name:'Set password & continue',exact:true}).click();await started;
    await f.page.evaluate(()=>{const channel=new BroadcastChannel('sb-auth-auth-token');channel.postMessage({event:'SIGNED_OUT',session:null});setTimeout(()=>channel.close(),100);});
    await f.page.waitForTimeout(200);f.state.releaseUpdate();await f.page.getByRole('alert').filter({hasText:'interrupted'}).waitFor();await pending(f);assert.deepEqual(f.state.order,['update']);await f.context.close();
  });
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
