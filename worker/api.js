import { httpServerHandler } from 'cloudflare:node';
import { app, configureApiEnvironment, drainTelemetryQueue } from '../apps/api/src/index.ts';

// Compile every route once, during startup where code generation is supported.
await app.ready();
const port = Number(process.env.PORT ?? 4000);
app.server.listen(port);
const handler = httpServerHandler({ port });

export default {
  fetch(request, env, ctx) {
    configureApiEnvironment(env);
    return handler.fetch(request, env, ctx);
  },
  async scheduled(controller, env) {
    configureApiEnvironment(env);
    await drainTelemetryQueue();
  },
};
