const assert = require('node:assert/strict');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const userId='11111111-1111-4111-8111-111111111111';
const tables=['profiles','workers','tags','anchors','tag_assignments','area_maps','map_zones','positions','incidents','audit_log','shift_rosters','worker_shift_assignments','operation_tickets'];
function token(method) { return `e30.${Buffer.from(JSON.stringify({sub:userId,amr:[{method}]})).toString('base64url')}.fixture`; }

(async()=>{
  const pg=new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema public, auth, storage to authenticated, service_role;
      create table storage.objects(bucket_id text); alter table storage.objects enable row level security;
      insert into storage.objects values ('area-maps');
      grant all on storage.objects to authenticated, service_role;
      create policy original_storage_read on storage.objects for select to authenticated using(true);`);
    for (const table of tables) await pg.exec(`create table public.${table}(id uuid, role text);
      insert into public.${table} values ('${userId}','admin');
      alter table public.${table} enable row level security;
      grant all on public.${table} to authenticated, service_role;
      create policy original_read on public.${table} for select to authenticated using(true);`);
    await pg.exec(`create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;
      create policy original_admin_write on public.workers for all to authenticated using(public.is_admin()) with check(public.is_admin());
      create function public.publish_area_map(uuid) returns void language plpgsql security definer as $$ begin if not public.is_admin() then raise exception 'Administrator access required'; end if; update public.area_maps set role='published' where id=$1; end $$;`);
    const migration=fs.readFileSync('supabase/migrations/20261116120000_require_password_workspace_session.sql','utf8');
    await pg.exec(migration);
    await pg.exec(migration); // safe to reapply
    for (const method of ['otp','recovery','invite','password']) {
      await pg.exec(`set role authenticated; select set_config('request.jwt.claims','${JSON.stringify({sub:userId,amr:[{method}]})}',false);`);
      for (const table of tables) assert.equal((await pg.query(`select * from public.${table}`)).rows.length,method==='password'?1:0,`${method} reads ${table}`);
      assert.equal((await pg.query('select * from storage.objects')).rows.length,method==='password'?1:0);
      if (method!=='password') {
        await assert.rejects(pg.query(`insert into workers values ('${userId}','viewer')`),/row-level security/);
        await assert.rejects(pg.query(`select public.publish_area_map('${userId}')`),/Administrator access required/);
      } else {
        await pg.query(`select public.publish_area_map('${userId}')`);
        assert.equal((await pg.query('select public.is_admin() as allowed')).rows[0].allowed,true);
      }
      await pg.exec('reset role');
    }
    // Viewer and service role privileges remain as before.
    await pg.exec(`update profiles set role='viewer'; set role authenticated; select set_config('request.jwt.claims','${JSON.stringify({sub:userId,amr:[{method:'password'}]})}',false);`);
    assert.equal((await pg.query('select public.is_admin() as allowed')).rows[0].allowed,false);
    assert.equal((await pg.query('select * from workers')).rows.length,1);
    await assert.rejects(pg.query(`insert into workers values ('${userId}','viewer')`),/row-level security/);
    await pg.exec('reset role; set role service_role');
    assert.equal((await pg.query('select * from workers')).rows.length,1);
    console.log('PASS RLS: 13 workspace tables, private map assets, admin RPC, viewer/admin roles, service role, and idempotent migration');
  } finally { await pg.close(); }

  process.env.CLOUDFLARE_WORKER='true';
  let profileReads=0, role='viewer';
  const originalFetch=global.fetch;
  global.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);
    if (url.pathname==='/auth/v1/user') {
      const authorization=new Headers(init?.headers || input.headers).get('authorization');
      if (authorization==='Bearer forged') return new Response(JSON.stringify({msg:'invalid signature'}),{status:401,headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({id:userId,email:'fixture@example.test',app_metadata:{},user_metadata:{}}),{headers:{'content-type':'application/json'}});
    }
    if (url.pathname==='/rest/v1/profiles') { profileReads++; return new Response(JSON.stringify({role}),{headers:{'content-type':'application/json'}}); }
    throw Error('Unexpected external request: '+url.pathname);
  };
  const {app,configureApiEnvironment}=await import(pathToFileURL(path.resolve('apps/api/dist/index.js')));
  configureApiEnvironment({SUPABASE_URL:'https://auth.lattice.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',WEB_ORIGIN:'https://lattice.test'});
  try {
    for (const method of ['otp','invite','recovery']) for (const route of ['/api/v1/overview','/api/v1/workers','/api/v1/tags','/api/v1/anchors','/api/v1/incidents','/api/v1/operations/summary','/api/v1/admin/users']) {
      const result=await app.inject({url:route,headers:{authorization:`Bearer ${token(method)}`}});
      assert.equal(result.statusCode,403);
    }
    assert.equal(profileReads,0);
    assert.equal((await app.inject({url:'/api/v1/workers'})).statusCode,401);
    assert.equal((await app.inject({url:'/api/v1/workers',headers:{authorization:'Bearer forged'}})).statusCode,401);
    assert.equal((await app.inject({url:'/api/v1/admin/users',headers:{authorization:`Bearer ${token('password')}`}})).statusCode,403);
    assert.equal((await app.inject({url:'/api/v1/probe',headers:{authorization:`Bearer ${token('password')}`}})).statusCode,404);
    assert.ok(profileReads>=2);
    console.log('PASS API: link-only sessions rejected before profile/data access, invalid tokens 401, password sessions admitted, viewer admin guard preserved');
  } finally { await app.close();global.fetch=originalFetch; }
})().catch(error=>{console.error(error);process.exitCode=1;});
