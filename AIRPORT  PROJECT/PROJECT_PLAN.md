# LATTICE RTLS: implementation roadmap

## Current project hold point

**The deployment/commissioning phase has not started. Keep the major live-system items below pending; do not present them as completed or operational. Resume them when the project starts and the physical devices, server/gateway, and Blueiot integration details are available.** The current demo and provider-neutral code foundation may remain available for presentation and preparation.

## Current status

### Implemented

- Premium operations console with overview, map, people/badges, devices, incident, history, shift handover, and insight surfaces.
- Frontend-only demo movement and manual SOS workflow, including local acknowledgement/resolution behavior; demo records are not sent to the operational API.
- Supabase authentication and role-based administration, worker/badge/anchor inventory, assignments, incident actions, map versioning, and private map storage.
- Persistent map-zone definitions tied to a specific map version. Zones store metric rectangles, type, entry/exit rules, and optional capacity. Definitions are configuration only until zone evaluation is commissioned.
- Provider-neutral secured telemetry endpoint (`/ingest/v1/events`), token authentication, payload validation, event-id deduplication, Supabase event queue, and telemetry health endpoint.
- Transactional processor for canonical position, SOS, battery, and device-status events. It updates registered tag state, writes position history against a unique published map reference, and creates incidents from SOS events. Unknown device/map references and invalid coordinates fail closed.

### Built, but not active without live input

- The canonical event endpoint and processor are ready for normalized gateway events. `RTLS_INGEST_TOKEN` is intentionally not configured until a trusted gateway is available.
- Real location and SOS behavior requires the Blueiot integration contract, registered device IDs, a secure gateway path, and verified published map bounds/reference.
- The current demo remains a presentation-only workflow. It does not prove that a physical badge, anchor, or SOS feed is working.

## Remaining stages, in order

1. **Blueiot integration contract and gateway** — obtain Blueiot's supported API/SDK/transport, authentication, event samples, event IDs, SOS semantics, floor/map identifiers, units, confidence, battery, and device-state definitions. Implement a backend adapter that translates those messages to the canonical event format. Provision the ingestion token only in the secured gateway and API.
2. **Map and device commissioning** — register actual badge and anchor provider IDs; confirm the map's surveyed origin, scale, coordinate frame, external map reference, floor, and bounds; verify anchor placement and test known points before treating positions as operational.
3. **Zone event evaluation** — evaluate real positions against saved zone geometry, with entry/exit hysteresis, dwell timing, duplicate suppression, occupancy rules, and audit history. Keep zone alerts disabled until commissioning is approved.
4. **Live operations UI** — deliver real positions, freshness/confidence, SOS alerts, and zone events to the web app with clear stale/offline/unknown states and a map-linked response workflow.
5. **SOS response readiness** — configure ownership, acknowledgement and resolution roles, escalation timing, operator notifications/sound, duplicate-press behavior, delivery monitoring, and service-level targets. Validate with approved commissioning tests.
6. **History, reports, and retention** — agree sampling rate and retention, replay tracks against the map version active at the time, export operational reports, and audit sensitive reads/exports.
7. **Operational hardening** — expose failed-event diagnostics and safe retry controls, monitor gateway/API/database availability, define backup/recovery and incident response, and conduct field acceptance before relying on the system for safety operations.

## Decisions needed before field operation

- Blueiot gateway topology, supported event transport, credentials, event schema, and network access model.
- Authoritative surveyed map, coordinate origin/frame, floor references, and who approves calibration.
- Which users may acknowledge/resolve SOS and receive escalation notifications.
- Position stale/offline/confidence thresholds and zone dwell/occupancy rules.
- Data retention, privacy/access policy, and operational availability/SLA targets.

## Provider direction

Blueiot BLE AoA anchors and SOS-capable badges are the primary planned positioning system. Preserve legacy Sewio records as historical provider data; do not treat the existing Sewio notes or schemas as the active integration contract. Teltonika vehicle telemetry is a separate future adapter and is outside the current badge-positioning rollout.
