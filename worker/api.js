import { httpServerHandler } from 'cloudflare:node';

let serverReady;
function getServer() {
  // Initialize inside a request so Supabase and platform bindings are available.
  return serverReady ??= (async () => {
    const api = await import('../apps/api/src/index.ts');
    await api.app.ready();
    const port = Number(process.env.PORT ?? 4000);
    api.app.server.listen(port);
    return { handler: httpServerHandler({ port }), drain: api.drainTelemetryQueue };
  })();
}

export default {
  async fetch(request, env, ctx) {
    return (await getServer()).handler.fetch(request, env, ctx);
  },
  async scheduled() {
    await (await getServer()).drain();
  },
};
