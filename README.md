# LATTICE — Operations Intelligence

LATTICE operations intelligence platform for workforce visibility and safety, being prepared for Blueiot BLE AoA anchors and SOS smart badges. The current UI supports inventory and Supabase-backed operations data; live Blueiot positioning/SOS ingestion is not connected yet.

## Apps

- `apps/web`: React + TypeScript + Vite operator console.
- `apps/api`: Fastify + TypeScript API skeleton with sample data and health endpoint.
- `supabase/schema.sql`: initial relational schema and row-level security policies.

## Run locally

1. Install Node.js 20+.
2. Run `npm install` at the repository root.
3. Run `npm run dev`.
4. Open the Vite URL shown in the terminal. The API runs on port 4000.

The frontend works in demo mode without credentials. Copy each `.env.example` to `.env` to configure services later. Never put a Blueiot credential or Supabase service-role key in frontend variables. Blueiot device credentials and event ingestion belong in the backend or a secured outbound gateway.

## Supabase auth setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Run `supabase/area_maps_setup.sql` once in SQL Editor to create the private map-file bucket and publish workflow. This is a separate setup script; do not rerun the base schema on an existing project.
3. Add administrator email addresses to `public.admin_allowlist` before inviting those users. The profile trigger assigns `admin`; other invited accounts default to `viewer`.
4. Create/invite user accounts in Supabase Auth. Public self-registration should remain disabled for this pilot.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/web/.env`. Set `SUPABASE_URL`, the backend-only `SUPABASE_SERVICE_ROLE_KEY`, `RTLS_INGEST_TOKEN` (a long random secret for the secured telemetry gateway), and `WEB_ORIGIN=http://localhost:5173` in `apps/api/.env`.
6. In Supabase Auth URL Configuration, use `http://localhost:5173` as the local Site URL and add `http://localhost:5173/**` to the redirect URL allowlist. For deployment, set the Site URL, allowlist, and API `WEB_ORIGIN` to the deployed web app origin.
7. Restart the dev servers. Sign-in is email/password. Admins see edit controls; viewers get a read-only UI. The API validates bearer sessions and blocks admin actions for viewer accounts; database policies enforce role-based table access.

With the environment configured, the API validates sessions and reads workers, assignments, device health, incidents, and positions from Supabase. It also supports admin-protected worker, Blueiot badge, and Blueiot anchor registration, atomic badge reassignment, and incident status actions. Apply `supabase/migrations/20261016_blueiot_ble_aoa_foundation.sql`, `supabase/migrations/20261016120000_map_zone_configuration.sql`, `supabase/migrations/20261016130000_rtls_event_ingestion.sql`, and `supabase/migrations/20261016140000_process_rtls_events.sql` to an existing project before deploying the updated API. Without credentials, the local sample data remains available. The secured `/ingest/v1/events` endpoint accepts canonical `position`, `sos`, `battery`, and `device_status` events using `Authorization: Bearer <RTLS_INGEST_TOKEN>`; `GET /health/telemetry` reports ingestion configuration, last arrival, pending count, and failed count. Incoming events are validated, stored, and deduplicated by provider and event ID. A transactional queue processor updates registered badge state, writes positions against uniquely matched published metre-bound map references, and creates incidents for SOS events. Unmapped devices, unknown/ambiguous maps, or out-of-bounds positions are marked failed and do not appear as operational data. Add the provider adapter only after Blueiot supplies its actual event contract, credentials, and coordinate conventions.

Canonical position event example (send to the API host, not the web app):

```json
{
  "provider": "blueiot",
  "event_id": "gateway-generated-unique-id",
  "event_type": "position",
  "device_id": "vendor-device-id",
  "observed_at": "2026-10-16T12:30:00.000Z",
  "payload": {
    "x": 18.4,
    "y": 6.2,
    "z": 1.1,
    "confidence": 0.93,
    "anchors_used": 4,
    "map_reference": "main-operations-zone"
  }
}
```

The gateway must translate vendor messages into this canonical shape before posting. `map_reference` must exactly match one published area's external map reference, and coordinates must fall within its metre bounds. SOS events create incidents from the registered tag and its assignment/most recent position at event time. The API retries pending records in its background queue; events marked failed need their device/map mapping or payload corrected before they can be re-ingested with a new event ID. Keep `RTLS_INGEST_TOKEN` only in the secured gateway and API environment; never put it in `VITE_*` variables or browser code.

## Map workflow

The built-in sample is an illustrative SVG under `apps/web/public/maps/`, not surveyed or calibrated. The Area maps page can store SVG/PNG/JPG drafts in private Supabase Storage, record coordinate bounds and an optional external map reference, and publish immutable versions. Enter actual measured bounds only after matching them to Blueiot's coordinate frame. Keep older versions for historical track replay; do not overwrite map coordinates for historical positions.

## Deployment direction

### Cloudflare web deployment

This repository is an npm workspace. Vite writes the frontend to **`apps/web/dist`**, not a root-level `dist` folder. The `dist/...` paths in Vite's build log are relative to `apps/web`. Build output is generated locally or in CI and is intentionally ignored by Git.

For Cloudflare Workers connected to GitHub (the workflow that runs `wrangler deploy`), use:

| Setting | Value |
| --- | --- |
| Root directory | Repository root (leave blank or use `/`) |
| Build command | `npm run build:web` |
| Deploy command | `npx wrangler deploy --config wrangler.jsonc` |

The root `wrangler.jsonc` explicitly selects `apps/web/dist` as the static assets directory, so Wrangler does not try to auto-detect an application from the workspace root. It also enables the single-page application fallback. The configured Worker name is `trilora-lattice`; if your existing Cloudflare Worker has a different name, update `name` in `wrangler.jsonc` to match it before deploying.

For a manual build, run these commands from the repository root:

```sh
npm ci
npm run build:web
```

The upload folder is `apps/web/dist` (it contains `index.html`, `assets`, and the public assets). For Cloudflare Pages drag-and-drop, upload that folder. For Pages connected to GitHub, use the repository root, build command `npm run build:web`, and build output directory `apps/web/dist`; Pages does not use the Workers deploy command above.

For a local CLI deployment to Workers after authenticating with Cloudflare, run `npm run deploy:web`. This rebuilds the frontend before uploading it. `npm run build` remains available to build both the API and web app.

Set `VITE_API_URL` to the deployed API's HTTPS origin in the hosting build environment. Cloudflare Worker deployments serve Supabase settings through the Worker `/runtime-config.js` route; Cloudflare Pages deployments use `functions/runtime-config.js` to read the same runtime variables. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`) in the Cloudflare production environment, then redeploy so the Pages Function or Worker is included. Wrangler preserves dashboard-managed variables on Worker deploy. For local development or a manual static build, set the Supabase values in `apps/web/.env` instead. Only the Supabase project URL and a publishable/anon key are exposed to the browser. Never put service-role keys or ingestion tokens in `VITE_*` variables.

### API deployment

Deploy `apps/api` separately to a Node.js host such as Railway. The static Cloudflare deployment only hosts the frontend; it does not run the Fastify API. Set the API's `WEB_ORIGIN` to the deployed frontend origin and configure the Supabase Auth URLs as described above. Use Supabase Auth + Postgres for hosted identity and data. A private positioning engine will need a secure outbound gateway or network link to the cloud API. Keep vendor-specific positioning and future vehicle telemetry behind separate backend adapters.

## Integration notes

- Obtain Blueiot's integration guide and sample payloads for live positions, SOS events, battery, device status, identifiers, authentication, and supported transport before implementing ingestion.
- Validate coordinate units, map/floor identifiers, timestamp conventions, confidence values, duplicate delivery behavior, and device commissioning procedures with Blueiot.
- Preserve any remaining Sewio records as a historical provider; the schema migration does not delete them.
- Configure an explicit administrator email allowlist on the server before enabling production admin access.
- This starter is not production-ready for emergency response. Add delivery monitoring, escalation configuration, audit retention, and operational sign-off before field use.
