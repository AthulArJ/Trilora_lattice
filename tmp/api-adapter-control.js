// Isolated diagnostic, not an application entrypoint or deployment candidate.
import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { createClient } from '@supabase/supabase-js';

let handler;
export default {
  fetch(request, env, ctx) {
    if (!handler) {
      const server = createServer(async (req, res) => {
        try {
          let result;
          if (req.url === '/health') {
            result = { ok: true, adapter: 'cloudflare:node', production: process.env.NODE_ENV === 'production' };
          } else if (req.url === '/read-only-supabase-check') {
            const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
            const [users, profiles] = await Promise.all([
              db.auth.admin.listUsers({page: 1, perPage: 1}),
              db.from('profiles').select('id', {head: true}).limit(1),
            ]);
            result = {authAdminRead: !users.error, profilesRead: !profiles.error, profilesStatus: profiles.status};
            if (users.error || profiles.error) res.statusCode = 502;
          } else { res.statusCode = 404; result = {error: 'Not found'}; }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({error: error.name}));
        }
      });
      const port = Number(process.env.PORT ?? 4000);
      server.listen(port);
      handler = httpServerHandler({port});
    }
    return handler.fetch(request, env, ctx);
  },
};
