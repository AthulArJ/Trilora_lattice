import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });
const allowedWebOrigins = new Set([process.env.WEB_ORIGIN].filter((origin): origin is string => Boolean(origin)));
if (process.env.NODE_ENV !== 'production') {
  allowedWebOrigins.add('http://localhost:5173');
  allowedWebOrigins.add('http://127.0.0.1:5173');
}
await app.register(cors, {
  origin(origin, callback) {
    const isPrivateDevOrigin = process.env.NODE_ENV !== 'production' && Boolean(origin && /^http:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):5173$/.test(origin));
    callback(null, !origin || allowedWebOrigins.has(origin) || isPrivateDevOrigin);
  },
});

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authEnabled = Boolean(supabaseUrl && serviceRoleKey);
if (Boolean(supabaseUrl) !== Boolean(serviceRoleKey)) throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave both empty for local sample mode.');
if (process.env.NODE_ENV === 'production' && !authEnabled) throw new Error('Production API startup requires Supabase authentication configuration.');
const db = authEnabled ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
type AuthContext = { userId?: string; userRole?: string };

app.addHook('preHandler', async (request, reply) => {
  if (!request.url.startsWith('/api/')) return;
  if (!authEnabled || !db) return; // Local sample mode only; production requires Supabase variables.
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply.code(401).send({ error: 'Sign in required' });
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) return reply.code(401).send({ error: 'Session is invalid or expired' });
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
  if (profileError || !profile) return reply.code(403).send({ error: 'Account profile is not provisioned' });
  const context = request as typeof request & AuthContext;
  context.userId = authData.user.id;
  context.userRole = profile.role;
});

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (authEnabled && (request as FastifyRequest & AuthContext).userRole !== 'admin') return reply.code(403).send({ error: 'Administrator access required' });
}

const sampleWorkers = [
  { id: 'w-101', name: 'Amara Patel', role: 'Airside Operations', workforceCategory: 'airport_staff', tagId: 'TAG-2041', status: 'online', battery: 86, lastSeen: new Date().toISOString(), x: 31, y: 47 },
  { id: 'w-102', name: 'Ravi Menon', role: 'Facilities', workforceCategory: 'facilities', tagId: 'TAG-2048', status: 'online', battery: 62, lastSeen: new Date(Date.now() - 12_000).toISOString(), x: 68, y: 35 },
  { id: 'w-103', name: 'Leah Thomas', role: 'Security', workforceCategory: 'security', tagId: 'TAG-2052', status: 'stale', battery: 19, lastSeen: new Date(Date.now() - 95_000).toISOString(), x: 52, y: 69 },
];
const sampleIncidents: Array<{ id: string; incidentCode: string; workerId: string; worker: string; tagId: string; status: string; createdAt: string; area: string; acknowledgedAt: string | null; acknowledgedBy: string | null; resolvedAt: string | null; resolvedBy: string | null; resolutionNote: string | null; simulated: boolean }> = [{ id: 'INC-0001', incidentCode: 'INC-0001', workerId: 'w-101', worker: 'Amara Patel', tagId: 'TAG-2041', status: 'active', createdAt: new Date(Date.now() - 4 * 60_000).toISOString(), area: 'Terminal · Checkpoint A', acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null, resolutionNote: null, simulated: true }];

function fail(reply: FastifyReply, error: { message: string; code?: string }) {
  app.log.error({ err: error }, 'Database request failed');
  return reply.code(error.code === '23505' ? 409 : 500).send({ error: error.code === '23505' ? 'That record already exists' : 'Database request failed' });
}

async function writeAudit(actorId: string | undefined, action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  if (!db || !actorId) return;
  const { error } = await db.from('audit_log').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, details });
  if (error) app.log.error({ err: error, action, entityType, entityId }, 'Could not write audit entry');
}

function webRedirectUrl() {
  return process.env.WEB_ORIGIN?.trim().replace(/\/+$/, '') || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173');
}

async function detachUserReferences(userId: string, email: string, displayName: string) {
  if (!db) throw new Error('User management requires Supabase configuration');
  // Preserve who performed historical actions before clearing profile foreign keys.
  // The profile itself is removed by Supabase Auth's user deletion cascade.
  for (;;) {
    const { data: entries, error } = await db.from('audit_log').select('id,details').eq('actor_id', userId).limit(100);
    if (error) throw error;
    if (!entries?.length) break;
    const results = await Promise.all(entries.map((entry: any) => db!.from('audit_log').update({
      actor_id: null,
      details: { ...(entry.details ?? {}), actor_email_snapshot: email, ...(displayName ? { actor_name_snapshot: displayName } : {}) },
    }).eq('id', entry.id)));
    const failed = results.find(result => result.error);
    if (failed?.error) throw failed.error;
  }
  const referenceUpdates = await Promise.all([
    db.from('tag_assignments').update({ assigned_by: null }).eq('assigned_by', userId),
    db.from('area_maps').update({ created_by: null }).eq('created_by', userId),
    db.from('incidents').update({ acknowledged_by: null }).eq('acknowledged_by', userId),
    db.from('incidents').update({ resolved_by: null }).eq('resolved_by', userId),
  ]);
  const failed = referenceUpdates.find(result => result.error);
  if (failed?.error) throw failed.error;
}

async function loadWorkers() {
  if (!db) return sampleWorkers;
  let [workerResult, assignmentResult, positionResult, mapResult] = await Promise.all([
    db.from('workers').select('id,display_name,team,active,workforce_category,employer_name').eq('active', true).order('display_name'),
    db.from('tag_assignments').select('worker_id,tag_id,tags(id,label,battery_percent,last_seen_at,device_state)').is('unassigned_at', null),
    db.from('latest_positions').select('tag_id,map_id,x,y,observed_at,confidence,anchors_used,source'),
    db.from('area_maps').select('id,name,version,coordinate_system').eq('status', 'published'),
  ]);
  // Keep existing workspace pages usable while the optional Operations Hub migration is pending.
  if (workerResult.error && /workforce_category|employer_name/i.test(workerResult.error.message)) {
    workerResult = await db.from('workers').select('id,display_name,team,active').eq('active', true).order('display_name') as any;
  }
  const error = workerResult.error ?? assignmentResult.error ?? positionResult.error ?? mapResult.error;
  if (error) throw error;
  const assignments = assignmentResult.data ?? [];
  const positions = new Map<string, any>();
  for (const row of positionResult.data ?? []) if (!positions.has(row.tag_id)) positions.set(row.tag_id, row);
  const maps = new Map((mapResult.data ?? []).map((map: any) => [map.id, map]));
  return (workerResult.data ?? []).map((worker: any) => {
    const assignment = assignments.find((item: any) => item.worker_id === worker.id) as any;
    const tag = assignment?.tags;
    const position = tag ? positions.get(tag.id) : undefined;
    const coordinates = position ? (maps.get(position.map_id) as any)?.coordinate_system ?? {} : {};
    const xSpan = Number(coordinates.xMax) - Number(coordinates.xMin);
    const ySpan = Number(coordinates.yMax) - Number(coordinates.yMin);
    const x = position && Number.isFinite(xSpan) && xSpan > 0 ? ((position.x - Number(coordinates.xMin)) / xSpan) * 100 : null;
    const y = position && Number.isFinite(ySpan) && ySpan > 0 ? ((position.y - Number(coordinates.yMin)) / ySpan) * 100 : null;
    const lastSeen = tag?.last_seen_at ?? position?.observed_at ?? null;
    const ageSeconds = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 1000 : Infinity;
    const positionAgeSeconds = position?.observed_at ? (Date.now() - new Date(position.observed_at).getTime()) / 1000 : Infinity;
    const positionStatus = !position ? 'unknown' : positionAgeSeconds <= 30 ? 'online' : positionAgeSeconds <= 90 ? 'stale' : 'offline';
    const status = !tag ? 'offline' : !lastSeen && tag.device_state === 'unknown' ? 'unknown' : ageSeconds > 90 ? 'offline' : ageSeconds > 30 ? 'stale' : tag.device_state === 'offline' ? 'offline' : tag.device_state === 'stale' ? 'stale' : 'online';
    return { id: worker.id, name: worker.display_name, role: worker.team ?? 'Worker', workforceCategory: worker.workforce_category ?? 'unclassified', employerName: worker.employer_name ?? null, tagId: tag?.label ?? 'Unassigned', status, battery: tag?.battery_percent ?? null, lastSeen: lastSeen ?? '', positionLastSeen: position?.observed_at ?? null, positionStatus, positionConfidence: position?.confidence ?? null, anchorsUsed: position?.anchors_used ?? null, positionSource: position?.source ?? null, positionMapId: position?.map_id ?? null, x: x === null ? null : Math.max(0, Math.min(100, x)), y: y === null ? null : Math.max(0, Math.min(100, y)) };
  });
}

async function loadAnchorSummary() {
  if (!db) return [];
  const [anchorResult, mapResult] = await Promise.all([
    db.from('anchors').select('id,label,model,map_id,x,y,device_state,last_seen_at').order('label'),
    db.from('area_maps').select('id,coordinate_system').eq('status', 'published'),
  ]);
  const error = anchorResult.error ?? mapResult.error;
  if (error) throw error;
  const maps = new Map((mapResult.data ?? []).map((map: any) => [map.id, map.coordinate_system ?? {}]));
  return (anchorResult.data ?? []).map((anchor: any) => {
    const coordinates = maps.get(anchor.map_id) as any;
    const xMin = Number(coordinates?.xMin), xMax = Number(coordinates?.xMax);
    const yMin = Number(coordinates?.yMin), yMax = Number(coordinates?.yMax);
    const xPercent = anchor.x != null && Number.isFinite(xMin) && Number.isFinite(xMax) && xMax > xMin ? Math.max(0, Math.min(100, ((anchor.x - xMin) / (xMax - xMin)) * 100)) : null;
    const yPercent = anchor.y != null && Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin ? Math.max(0, Math.min(100, ((anchor.y - yMin) / (yMax - yMin)) * 100)) : null;
    const ageSeconds = anchor.last_seen_at ? (Date.now() - new Date(anchor.last_seen_at).getTime()) / 1000 : Infinity;
    const state = anchor.device_state === 'uncommissioned' ? 'uncommissioned' : !anchor.last_seen_at ? 'unknown' : ageSeconds > 90 ? 'offline' : ageSeconds > 30 ? 'stale' : anchor.device_state === 'offline' ? 'offline' : 'online';
    return { id: anchor.id, label: anchor.label, model: anchor.model, mapId: anchor.map_id, state, lastSeen: anchor.last_seen_at, xPercent, yPercent };
  });
}

async function loadBadgeSummary() {
  if (!db) return sampleWorkers.map(worker => ({ id: worker.id, label: worker.tagId, battery: worker.battery, status: worker.status, lastSeen: worker.lastSeen, worker: worker.name }));
  const [badgeResult, assignmentResult] = await Promise.all([
    db.from('tags').select('id,label,battery_percent,last_seen_at,device_state').eq('device_type', 'badge').order('label'),
    db.from('tag_assignments').select('tag_id,workers(display_name)').is('unassigned_at', null),
  ]);
  const error = badgeResult.error ?? assignmentResult.error;
  if (error) throw error;
  return (badgeResult.data ?? []).map((badge: any) => {
    const assignment = (assignmentResult.data ?? []).find((item: any) => item.tag_id === badge.id) as any;
    const ageSeconds = badge.last_seen_at ? (Date.now() - new Date(badge.last_seen_at).getTime()) / 1000 : Infinity;
    const status = !badge.last_seen_at && badge.device_state === 'unknown' ? 'unknown' : ageSeconds > 90 ? 'offline' : ageSeconds > 30 ? 'stale' : badge.device_state === 'offline' ? 'offline' : badge.device_state === 'stale' ? 'stale' : 'online';
    return { id: badge.id, label: badge.label, battery: badge.battery_percent, status, lastSeen: badge.last_seen_at, worker: assignment?.workers?.display_name ?? null };
  });
}

async function loadIncidents() {
  if (!db) return sampleIncidents;
  const { data, error } = await db.from('incidents').select('id,incident_code,worker_id,tag_id,status,triggered_at,acknowledged_at,acknowledged_by,resolved_at,resolved_by,resolution_note,source_event,workers(display_name),tags(label),area_maps(name),acknowledged_actor:profiles!incidents_acknowledged_by_fkey(display_name,email),resolved_actor:profiles!incidents_resolved_by_fkey(display_name,email)').order('triggered_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, incidentCode: row.incident_code, workerId: row.worker_id, worker: row.workers?.display_name ?? 'Unknown worker', tagId: row.tags?.label ?? 'Unassigned tag', status: row.status, createdAt: row.triggered_at, acknowledgedAt: row.acknowledged_at, acknowledgedBy: row.acknowledged_actor?.display_name || row.acknowledged_actor?.email || null, resolvedAt: row.resolved_at, resolvedBy: row.resolved_actor?.display_name || row.resolved_actor?.email || null, resolutionNote: row.resolution_note, area: row.area_maps?.name ?? 'Airport area', simulated: row.source_event?.simulator === true }));
}

app.get('/health', async () => ({ ok: true, service: 'airport-rtls-api', mode: authEnabled ? 'supabase' : 'sample' }));
app.get('/health/telemetry', async (_request, reply) => {
  const ingestConfigured = Boolean(process.env.RTLS_INGEST_TOKEN && process.env.RTLS_INGEST_TOKEN.length >= 32 && db);
  if (!db) return { ok: true, ingestConfigured, storageConfigured: false, lastReceivedAt: null, note: 'Supabase persistence is not configured' };
  const [latest, pending, failed] = await Promise.all([
    db.from('rtls_events').select('received_at,event_type,provider,processing_status').order('received_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('rtls_events').select('id', { count: 'exact', head: true }).eq('processing_status', 'pending'),
    db.from('rtls_events').select('id', { count: 'exact', head: true }).eq('processing_status', 'failed'),
  ]);
  const error = latest.error ?? pending.error ?? failed.error;
  if (error) return fail(reply, error);
  return { ok: true, ingestConfigured, storageConfigured: true, lastReceivedAt: latest.data?.received_at ?? null, lastEventType: latest.data?.event_type ?? null, lastProvider: latest.data?.provider ?? null, lastEventStatus: latest.data?.processing_status ?? null, pendingCount: pending.count ?? 0, failedCount: failed.count ?? 0 };
});

type NormalizedTelemetryEvent = {
  provider: 'blueiot' | 'sewio_uwb';
  event_id: string;
  event_type: 'position' | 'sos' | 'battery' | 'device_status';
  device_id: string;
  observed_at: string;
  payload: Record<string, unknown>;
};
function validCoordinate(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000; }
function validateTelemetryEvent(body: any): { event?: NormalizedTelemetryEvent; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send one JSON event object' };
  if (!['blueiot', 'sewio_uwb'].includes(body.provider)) return { error: 'provider must be blueiot or sewio_uwb' };
  if (typeof body.event_id !== 'string' || !body.event_id.trim() || body.event_id.length > 200) return { error: 'event_id must be a non-empty string up to 200 characters' };
  if (!['position', 'sos', 'battery', 'device_status'].includes(body.event_type)) return { error: 'event_type must be position, sos, battery, or device_status' };
  if (typeof body.device_id !== 'string' || !body.device_id.trim() || body.device_id.length > 200) return { error: 'device_id must be a non-empty string up to 200 characters' };
  if (typeof body.observed_at !== 'string' || !Number.isFinite(Date.parse(body.observed_at))) return { error: 'observed_at must be a valid ISO timestamp' };
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return { error: 'payload must be an object' };
  const p = body.payload;
  const supportedPayloadKeys = ['x', 'y', 'z', 'confidence', 'anchors_used', 'battery_percent', 'device_state', 'map_reference'];
  if (Object.keys(p).some(key => !supportedPayloadKeys.includes(key))) return { error: 'payload contains unsupported fields; normalize vendor data before ingestion' };
  if (body.event_type === 'position' && (!validCoordinate(p.x) || !validCoordinate(p.y))) return { error: 'position events require finite x and y coordinates' };
  if (p.z !== undefined && !validCoordinate(p.z)) return { error: 'z must be a finite coordinate' };
  if (p.confidence !== undefined && (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1)) return { error: 'confidence must be between 0 and 1' };
  if (p.anchors_used !== undefined && (!Number.isInteger(p.anchors_used) || p.anchors_used < 0 || p.anchors_used > 1000)) return { error: 'anchors_used must be a whole number from 0 to 1000' };
  if (p.battery_percent !== undefined && (!Number.isInteger(p.battery_percent) || p.battery_percent < 0 || p.battery_percent > 100)) return { error: 'battery_percent must be a whole number from 0 to 100' };
  if (body.event_type === 'battery' && (!Number.isInteger(p.battery_percent) || p.battery_percent < 0 || p.battery_percent > 100)) return { error: 'battery events require battery_percent from 0 to 100' };
  if (body.event_type === 'device_status' && !['online', 'stale', 'offline', 'unknown'].includes(p.device_state)) return { error: 'device_status events require a supported device_state' };
  if (p.map_reference !== undefined && (typeof p.map_reference !== 'string' || p.map_reference.length > 200)) return { error: 'map_reference must be a string up to 200 characters' };
  const payload = Object.fromEntries(Object.entries(p).filter(([, value]) => value !== undefined));
  return { event: { provider: body.provider, event_id: body.event_id.trim(), event_type: body.event_type, device_id: body.device_id.trim(), observed_at: new Date(body.observed_at).toISOString(), payload } };
}

app.post<{ Body: unknown }>('/ingest/v1/events', async (request, reply) => {
  const configuredToken = process.env.RTLS_INGEST_TOKEN;
  if (!configuredToken || configuredToken.length < 32 || !db) return reply.code(503).send({ error: 'Telemetry ingestion is not configured; set Supabase credentials and an RTLS_INGEST_TOKEN of at least 32 characters' });
  const suppliedToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const expected = Buffer.from(configuredToken); const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return reply.code(401).send({ error: 'Invalid ingestion credentials' });
  const { event, error: validationError } = validateTelemetryEvent(request.body);
  if (validationError) return reply.code(400).send({ error: validationError });
  const { data: saved, error: insertError } = await db.from('rtls_events').insert({ provider: event!.provider, event_id: event!.event_id, event_type: event!.event_type, provider_device_id: event!.device_id, observed_at: event!.observed_at, payload: event!.payload }).select('id').maybeSingle();
  let duplicate = false; let eventRowId = saved?.id;
  if (insertError?.code === '23505') {
    duplicate = true;
    const { data: existing, error: lookupError } = await db.from('rtls_events').select('id,processing_status,processing_error').eq('provider', event!.provider).eq('event_id', event!.event_id).maybeSingle();
    if (lookupError) return fail(reply, lookupError);
    if (!existing) return reply.code(409).send({ error: 'Duplicate event was detected but its stored record could not be loaded' });
    if (existing.processing_status === 'processed') return reply.code(200).send({ accepted: true, duplicate: true, processed: true, provider: event!.provider, event_id: event!.event_id });
    if (existing.processing_status === 'failed') return reply.code(200).send({ accepted: true, duplicate: true, processed: false, status: 'failed', reason: existing.processing_error, provider: event!.provider, event_id: event!.event_id });
    eventRowId = existing.id;
  } else if (insertError) return fail(reply, insertError);
  if (!eventRowId) return reply.code(500).send({ error: 'Could not identify stored telemetry event' });
  const { data: processResult, error: processError } = await db.rpc('process_rtls_event', { p_event_id: eventRowId });
  if (processError) {
    app.log.error({ err: processError, eventRowId }, 'Telemetry event was stored but processing did not run');
    return reply.code(202).send({ accepted: true, duplicate, processed: false, status: 'pending', provider: event!.provider, event_id: event!.event_id });
  }
  const result = processResult as { status?: string; error?: string } | null;
  if (result?.status === 'failed') return reply.code(202).send({ accepted: true, duplicate, processed: false, status: 'failed', reason: result.error, provider: event!.provider, event_id: event!.event_id });
  return reply.code(202).send({ accepted: true, duplicate, processed: result?.status === 'processed' || result?.status === 'duplicate', status: result?.status ?? 'pending', provider: event!.provider, event_id: event!.event_id });
});
app.get('/api/v1/overview', async (_request, reply) => {
  try { const [staff, incidents, anchors, badges] = await Promise.all([loadWorkers(), loadIncidents(), loadAnchorSummary(), loadBadgeSummary()]); return { source: authEnabled ? 'supabase' : 'sample', updatedAt: new Date().toISOString(), staff, incidents, anchors, badges }; }
  catch (error: any) { return fail(reply, error); }
});
app.get('/api/v1/operations/summary', async (_request, reply) => {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (!db) return { source: 'sample', updatedAt: now.toISOString(), positionTrend: [], tickets: [], shifts: [], workerCategories: [] };
  try {
    const [positionResult, categoryResult, ticketResult, openTicketCount, rosterResult, zoneResult, latestPositionResult, mapResult] = await Promise.all([
      db.from('positions').select('tag_id,observed_at,confidence,source').gte('observed_at', start).order('observed_at', { ascending: true }).limit(20000),
      db.from('workers').select('workforce_category,team').eq('active', true),
      db.from('operation_tickets').select('id,ticket_code,title,category,priority,status,location_label,assigned_team,created_at,due_at').order('created_at', { ascending: false }).limit(50),
      db.from('operation_tickets').select('id', { count: 'exact', head: true }).in('status', ['open','in_progress','blocked']),
      db.from('shift_rosters').select('id,shift_name,starts_at,ends_at,status,worker_shift_assignments(id,worker_id,status,workers(display_name,workforce_category,team))').eq('shift_date', today).order('starts_at'),
      db.from('map_zones').select('id,map_id,name,zone_type,x_min_m,y_min_m,x_max_m,y_max_m,occupancy_limit,alert_on_entry,alert_on_exit'),
      db.from('latest_positions').select('tag_id,map_id,x,y,observed_at,source').limit(10000),
      db.from('area_maps').select('id,coordinate_system').eq('status','published'),
    ]);
    const error = positionResult.error ?? categoryResult.error ?? ticketResult.error ?? openTicketCount.error ?? rosterResult.error ?? zoneResult.error ?? latestPositionResult.error ?? mapResult.error;
    if (error) return fail(reply, error);
    const hourly = new Map<string, { fixes: number; tags: Set<string> }>();
    for (const row of positionResult.data ?? []) {
      if (row.source === 'simulated') continue;
      const bucket = new Date(row.observed_at); bucket.setMinutes(0, 0, 0);
      const key = bucket.toISOString();
      const item = hourly.get(key) ?? { fixes: 0, tags: new Set<string>() };
      item.fixes += 1; item.tags.add(row.tag_id); hourly.set(key, item);
    }
    const positionTrend = Array.from({ length: 24 }, (_, index) => {
      const bucket = new Date(now.getTime() - (23 - index) * 60 * 60 * 1000); bucket.setMinutes(0, 0, 0);
      const item = hourly.get(bucket.toISOString());
      return { at: bucket.toISOString(), fixes: item?.fixes ?? 0, uniqueBadges: item?.tags.size ?? 0 };
    });
    const categoryCounts = new Map<string, number>();
    for (const row of categoryResult.data ?? []) { const category = row.workforce_category || 'unclassified'; categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1); }
    const mapBounds = new Map((mapResult.data ?? []).map((map: any) => [map.id, map.coordinate_system ?? {}]));
    const latestPositions = new Map<string, any>();
    for (const point of latestPositionResult.data ?? []) if (point.source !== 'simulated' && (!latestPositions.has(point.tag_id) || latestPositions.get(point.tag_id).observed_at < point.observed_at)) latestPositions.set(point.tag_id, point);
    const zoneOccupancy = (zoneResult.data ?? []).map((zone: any) => {
      const bounds = mapBounds.get(zone.map_id) as any ?? {};
      const people = Array.from(latestPositions.values()).filter((point: any) => {
        if (point.map_id !== zone.map_id || Date.now() - new Date(point.observed_at).getTime() > 90_000) return false;
        const unit = bounds.units === 'm' ? 1 : null;
        const x = unit ? point.x : null; const y = unit ? point.y : null;
        return x !== null && y !== null && x >= zone.x_min_m && x <= zone.x_max_m && y >= zone.y_min_m && y <= zone.y_max_m;
      }).length;
      return { id: zone.id, name: zone.name, type: zone.zone_type, people, capacity: zone.occupancy_limit, overCapacity: zone.occupancy_limit != null && people > zone.occupancy_limit };
    });
    return { source: 'supabase', updatedAt: now.toISOString(), positionTrend, workerCategories: Array.from(categoryCounts, ([category, count]) => ({ category, count })), tickets: ticketResult.data ?? [], openTicketCount: openTicketCount.count ?? 0, shifts: rosterResult.data ?? [], zoneOccupancy };
  } catch (error: any) { return fail(reply, error); }
});
app.post<{ Body: { title?: string; description?: string; category?: string; priority?: string; location_label?: string } }>('/api/v1/operations/tickets', async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Saved issue reporting requires Supabase and the Operations Hub migration' });
  const title = request.body?.title?.trim(); const description = request.body?.description?.trim();
  const category = request.body?.category?.trim() || 'other'; const priority = request.body?.priority?.trim() || 'normal';
  const location = request.body?.location_label?.trim() || null;
  if (!title || title.length < 3 || title.length > 160) return reply.code(400).send({ error: 'Title must be 3–160 characters' });
  if (!description || description.length < 3 || description.length > 3000) return reply.code(400).send({ error: 'Description must be 3–3000 characters' });
  if (!['safety','facilities','equipment','security','service','other'].includes(category)) return reply.code(400).send({ error: 'Choose a supported issue category' });
  if (!['low','normal','high','critical'].includes(priority)) return reply.code(400).send({ error: 'Choose a supported priority' });
  if (location && location.length > 160) return reply.code(400).send({ error: 'Location must be 160 characters or fewer' });
  const actorId = (request as FastifyRequest & AuthContext).userId;
  const { data, error } = await db.from('operation_tickets').insert({ title, description, category, priority, location_label: location, raised_by: actorId }).select('id,ticket_code,title,description,category,priority,status,location_label,assigned_team,created_at,due_at').single();
  if (error) return fail(reply, error);
  await writeAudit(actorId, 'operation_ticket_created', 'operation_ticket', data.id, { ticket_code: data.ticket_code, category, priority });
  return reply.code(201).send({ data });
});
app.patch<{ Params: { id: string }; Body: { status?: string; assigned_team?: string | null } }>('/api/v1/operations/tickets/:id', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Ticket updates require Supabase configuration' });
  const update: Record<string, unknown> = {};
  if (request.body?.status !== undefined) {
    if (!['open','in_progress','blocked','resolved','closed'].includes(request.body.status)) return reply.code(400).send({ error: 'Choose a supported ticket status' });
    update.status = request.body.status; update.resolved_at = ['resolved','closed'].includes(request.body.status) ? new Date().toISOString() : null;
  }
  if (request.body?.assigned_team !== undefined) {
    const team = request.body.assigned_team?.trim() || null;
    if (team && team.length > 100) return reply.code(400).send({ error: 'Assigned team must be 100 characters or fewer' });
    update.assigned_team = team;
  }
  if (!Object.keys(update).length) return reply.code(400).send({ error: 'No ticket changes supplied' });
  update.updated_at = new Date().toISOString();
  const { data, error } = await db.from('operation_tickets').update(update).eq('id', request.params.id).select('id,ticket_code,title,category,priority,status,location_label,assigned_team,created_at,due_at').maybeSingle();
  if (error) return fail(reply, error);
  if (!data) return reply.code(404).send({ error: 'Ticket not found' });
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'operation_ticket_updated', 'operation_ticket', data.id, update);
  return { data };
});
app.post<{ Body: { shift_date?: string; shift_name?: string; starts_at?: string; ends_at?: string; worker_ids?: string[] } }>('/api/v1/operations/shifts', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Shift roster setup requires Supabase and the Operations Hub migration' });
  const shiftDate = request.body?.shift_date?.trim(); const shiftName = request.body?.shift_name?.trim();
  const startsAt = request.body?.starts_at; const endsAt = request.body?.ends_at; const workerIds = request.body?.worker_ids ?? [];
  if (!shiftDate || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate) || !Number.isFinite(Date.parse(shiftDate))) return reply.code(400).send({ error: 'Choose a valid shift date' });
  if (!shiftName || shiftName.length > 80) return reply.code(400).send({ error: 'Shift name must be 1–80 characters' });
  if (!startsAt || !endsAt || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) return reply.code(400).send({ error: 'Shift end time must be after the start time' });
  if (!Array.isArray(workerIds) || workerIds.length > 1000 || workerIds.some(id => typeof id !== 'string')) return reply.code(400).send({ error: 'Choose valid worker assignments' });
  const actorId = (request as FastifyRequest & AuthContext).userId;
  const { data: roster, error: rosterError } = await db.from('shift_rosters').insert({ shift_date: shiftDate, shift_name: shiftName, starts_at: startsAt, ends_at: endsAt, status: 'published', created_by: actorId }).select('id,shift_date,shift_name,starts_at,ends_at,status').single();
  if (rosterError) return fail(reply, rosterError);
  if (workerIds.length) {
    const { error } = await db.from('worker_shift_assignments').insert(workerIds.map(workerId => ({ shift_id: roster.id, worker_id: workerId, status: 'scheduled' })));
    if (error) { await db.from('shift_rosters').delete().eq('id', roster.id); return fail(reply, error); }
  }
  await writeAudit(actorId, 'shift_roster_created', 'shift_roster', roster.id, { shift_name: shiftName, shift_date: shiftDate, workers: workerIds.length });
  return reply.code(201).send({ data: roster, assignedWorkers: workerIds.length });
});
app.get('/api/v1/workers', async (_request, reply) => {
  try { return { source: authEnabled ? 'supabase' : 'sample', data: await loadWorkers() }; }
  catch (error: any) { return fail(reply, error); }
});
app.get('/api/v1/incidents', async (_request, reply) => {
  try { return { source: authEnabled ? 'supabase' : 'sample', data: await loadIncidents() }; }
  catch (error: any) { return fail(reply, error); }
});
app.get('/api/v1/audit-log', { preHandler: requireAdmin }, async (_request, reply) => {
  if (!db) return { source: 'sample', data: [] };
  const { data, error } = await db.from('audit_log')
    .select('id,actor_id,action,entity_type,entity_id,details,created_at,profiles(email,display_name)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return fail(reply, error);
  return { source: 'supabase', data };
});
app.get('/api/v1/admin/users', { preHandler: requireAdmin }, async (_request, reply) => {
  if (!db) return reply.code(503).send({ error: 'User management requires Supabase configuration' });
  const [authResult, profileResult] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 500 }),
    db.from('profiles').select('id,email,display_name,role,created_at'),
  ]);
  if (authResult.error) return fail(reply, authResult.error);
  if (profileResult.error) return fail(reply, profileResult.error);
  const profiles = new Map((profileResult.data ?? []).map((profile: any) => [profile.id, profile]));
  const data = authResult.data.users.map((user: any) => {
    const profile = profiles.get(user.id) as any;
    return {
      id: user.id,
      email: user.email ?? profile?.email ?? '',
      display_name: profile?.display_name || user.user_metadata?.display_name || '',
      role: profile?.role ?? 'viewer',
      status: user.banned_until && new Date(user.banned_until).getTime() > Date.now() ? 'suspended' : user.email_confirmed_at ? 'active' : 'invited',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
    };
  }).sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
  return { source: 'supabase', data };
});
app.post<{ Body: { email?: string; display_name?: string; role?: 'admin' | 'viewer' } }>('/api/v1/admin/users/invite', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'User invitations require Supabase configuration' });
  const redirectTo = webRedirectUrl();
  if (!redirectTo) return reply.code(503).send({ error: 'Set WEB_ORIGIN to the deployed web app URL before sending invitations' });
  const email = request.body?.email?.trim().toLowerCase();
  const displayName = request.body?.display_name?.trim() ?? '';
  const role = request.body?.role ?? 'viewer';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: 'Enter a valid email address' });
  if (role !== 'admin' && role !== 'viewer') return reply.code(400).send({ error: 'Role must be admin or viewer' });
  const { data: existingProfile, error: profileLookupError } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profileLookupError) return fail(reply, profileLookupError);
  if (existingProfile) {
    const { data: existingAuth, error } = await db.auth.admin.getUserById(existingProfile.id);
    if (error) return fail(reply, error);
    return reply.code(409).send({ error: existingAuth.user?.email_confirmed_at ? 'This person already has an account. Use “Send password setup” from their row if they cannot sign in.' : 'This person already has a pending invitation. Use “Resend invitation” from their row.' });
  }

  let allowlistInserted = false;
  if (role === 'admin') {
    const { data: allowlisted, error: allowlistLookupError } = await db.from('admin_allowlist').select('email').eq('email', email).maybeSingle();
    if (allowlistLookupError) return fail(reply, allowlistLookupError);
    if (!allowlisted) {
      const { error } = await db.from('admin_allowlist').insert({ email });
      if (error) return fail(reply, error);
      allowlistInserted = true;
    }
  }

  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName }, redirectTo });
  if (error) {
    if (allowlistInserted) await db.from('admin_allowlist').delete().eq('email', email);
    return reply.code(error.message.toLowerCase().includes('already') ? 409 : 502).send({ error: error.message.toLowerCase().includes('already') ? 'An account or invitation already exists for this email' : 'Could not send the invitation. Check Supabase email delivery settings.' });
  }
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'user_invited', 'user', data.user.id, { email, role });
  return reply.code(201).send({ data: { id: data.user.id, email, role, status: 'invited' } });
});
app.post<{ Params: { id: string } }>('/api/v1/admin/users/:id/resend', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'User invitations require Supabase configuration' });
  const redirectTo = webRedirectUrl();
  if (!redirectTo) return reply.code(503).send({ error: 'Set WEB_ORIGIN to the deployed web app URL before sending invitations' });
  const { data: profile, error: profileError } = await db.from('profiles').select('id,email,display_name,role').eq('id', request.params.id).maybeSingle();
  if (profileError) return fail(reply, profileError);
  if (!profile) return reply.code(404).send({ error: 'Workspace user not found' });
  const { data: authResult, error: authError } = await db.auth.admin.getUserById(profile.id);
  if (authError) return fail(reply, authError);
  const target = authResult.user;
  if (target.email_confirmed_at || target.last_sign_in_at) return reply.code(409).send({ error: 'This invitation has already been accepted. Send a password setup email instead.' });
  const email = profile.email.toLowerCase();

  // Supabase does not provide an invite-specific resend endpoint. Replace only the
  // unaccepted auth record, then issue a fresh invitation to the same address.
  try { await detachUserReferences(profile.id, email, profile.display_name ?? ''); }
  catch (error: any) { return fail(reply, error); }
  const { error: deleteError } = await db.auth.admin.deleteUser(profile.id);
  if (deleteError) return fail(reply, deleteError);
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: { display_name: profile.display_name ?? '' }, redirectTo });
  if (error) return reply.code(502).send({ error: 'The old pending invite was cleared, but Supabase could not send a replacement. Invite this email again to retry.' });
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'user_invitation_resent', 'user', data.user.id, { email, role: profile.role });
  return { data: { id: data.user.id, email, status: 'invited' } };
});
app.post<{ Params: { id: string } }>('/api/v1/admin/users/:id/password-reset', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'User email delivery requires Supabase configuration' });
  const redirectTo = webRedirectUrl();
  if (!redirectTo) return reply.code(503).send({ error: 'Set WEB_ORIGIN to the deployed web app URL before sending account emails' });
  const { data: profile, error } = await db.from('profiles').select('id,email').eq('id', request.params.id).maybeSingle();
  if (error) return fail(reply, error);
  if (!profile) return reply.code(404).send({ error: 'Workspace user not found' });
  const { data: target, error: authError } = await db.auth.admin.getUserById(profile.id);
  if (authError) return fail(reply, authError);
  if (!target.user.email_confirmed_at) return reply.code(409).send({ error: 'This person has not accepted the invitation yet. Use “Resend invitation” instead.' });
  const { error: mailError } = await db.auth.resetPasswordForEmail(profile.email, { redirectTo });
  if (mailError) return reply.code(502).send({ error: 'Supabase could not send the password setup email. Check email delivery settings and try again.' });
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'user_password_setup_sent', 'user', profile.id, { email: profile.email });
  return { data: { email: profile.email } };
});
app.delete<{ Params: { id: string } }>('/api/v1/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'User management requires Supabase configuration' });
  const actorId = (request as FastifyRequest & AuthContext).userId;
  if (actorId === request.params.id) return reply.code(409).send({ error: 'You cannot remove your own account' });
  const { data: profile, error: profileError } = await db.from('profiles').select('id,email,display_name,role').eq('id', request.params.id).maybeSingle();
  if (profileError) return fail(reply, profileError);
  if (!profile) return reply.code(404).send({ error: 'Workspace user not found' });
  if (profile.role === 'admin') {
    const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if (error) return fail(reply, error);
    if ((count ?? 0) <= 1) return reply.code(409).send({ error: 'The workspace must keep at least one administrator' });
  }
  try { await detachUserReferences(profile.id, profile.email, profile.display_name ?? ''); }
  catch (error: any) { return fail(reply, error); }
  const { error: deleteError } = await db.auth.admin.deleteUser(profile.id);
  if (deleteError) return fail(reply, deleteError);
  if (profile.role === 'admin') {
    const { error } = await db.from('admin_allowlist').delete().eq('email', profile.email.toLowerCase());
    if (error) app.log.error({ err: error, email: profile.email }, 'Could not remove deleted user from administrator allowlist');
  }
  await writeAudit(actorId, 'user_removed', 'user', profile.id, { email: profile.email, role: profile.role });
  return { data: { id: profile.id, email: profile.email } };
});
app.patch<{ Params: { id: string }; Body: { role?: 'admin' | 'viewer' } }>('/api/v1/admin/users/:id/role', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Role management requires Supabase configuration' });
  const role = request.body?.role;
  if (role !== 'admin' && role !== 'viewer') return reply.code(400).send({ error: 'Role must be admin or viewer' });
  const actorId = (request as FastifyRequest & AuthContext).userId;
  if (actorId === request.params.id) return reply.code(409).send({ error: 'You cannot change your own administrator role' });
  const { data: target, error: lookupError } = await db.from('profiles').select('id,email,role').eq('id', request.params.id).maybeSingle();
  if (lookupError) return fail(reply, lookupError);
  if (!target) return reply.code(404).send({ error: 'Workspace user not found' });
  if (target.role === role) return { data: target };

  if (role === 'admin') {
    const { error } = await db.from('admin_allowlist').upsert({ email: target.email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) return fail(reply, error);
  } else {
    const { count, error: countError } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if (countError) return fail(reply, countError);
    if ((count ?? 0) <= 1) return reply.code(409).send({ error: 'The workspace must keep at least one administrator' });
    const { error } = await db.from('admin_allowlist').delete().eq('email', target.email);
    if (error) return fail(reply, error);
  }
  const { data, error } = await db.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', target.id).select('id,email,display_name,role,created_at').single();
  if (error) return fail(reply, error);
  await writeAudit(actorId, 'user_role_changed', 'user', target.id, { email: target.email, previous_role: target.role, role });
  return { data };
});
app.get('/api/v1/tags', async (_request, reply) => {
  if (!db) return { source: 'sample', data: sampleWorkers.map(({ tagId, battery, lastSeen, status }) => ({ label: tagId, battery_percent: battery, last_seen_at: lastSeen, device_state: status })) };
  const { data, error } = await db.from('tags').select('id,provider,device_type,provider_device_id,model,sos_capable,label,sewio_feed_id,hardware_address,battery_percent,last_seen_at,device_state').order('label');
  if (error) return fail(reply, error);
  return { source: 'supabase', data };
});
app.get('/api/v1/maps', async (_request, reply) => {
  if (!db) return { source: 'sample', data: [] };
  const { data, error } = await db.from('area_maps').select('id,name,version,coordinate_system').eq('status', 'published').order('published_at', { ascending: false });
  if (error) return fail(reply, error);
  return { source: 'supabase', data };
});
app.get('/api/v1/anchors', async (_request, reply) => {
  if (!db) return { source: 'sample', data: [] };
  const { data, error } = await db.from('anchors').select('id,provider,provider_device_id,model,label,hardware_address,map_id,x,y,z,installation_height_m,device_state,last_seen_at').order('label');
  if (error) return fail(reply, error);
  return { source: 'supabase', data };
});
app.get('/api/v1/assignments', async (_request, reply) => {
  if (!db) return { source: 'sample', data: [] };
  const { data, error } = await db.from('tag_assignments').select('id,worker_id,tag_id,assigned_at,unassigned_at,note,workers(display_name),tags(label)').order('assigned_at', { ascending: false }).limit(500);
  if (error) return fail(reply, error);
  return { source: 'supabase', data };
});

app.post<{ Body: { display_name?: string; employee_code?: string; team?: string; workforce_category?: string; employer_name?: string } }>('/api/v1/workers', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Worker persistence requires Supabase configuration' });
  const displayName = request.body?.display_name?.trim();
  if (!displayName) return reply.code(400).send({ error: 'display_name is required' });
  const category = request.body.workforce_category?.trim() || 'unclassified';
  if (!['airport_staff','contractor','airline_crew','security','ground_handling','facilities','airport_official','emergency_response','other','unclassified'].includes(category)) return reply.code(400).send({ error: 'Choose a supported workforce category' });
  const employerName = request.body.employer_name?.trim() || null;
  if (employerName && employerName.length > 160) return reply.code(400).send({ error: 'Employer name must be 160 characters or fewer' });
  const { data, error } = await db.from('workers').insert({ display_name: displayName, employee_code: request.body.employee_code?.trim() || null, team: request.body.team?.trim() || null, workforce_category: category, employer_name: employerName }).select().single();
  if (error) return fail(reply, error);
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'worker_created', 'worker', data.id, { display_name: data.display_name });
  return reply.code(201).send({ data });
});
app.put<{ Params: { id: string }; Body: { workforce_category?: string; employer_name?: string | null } }>('/api/v1/workers/:id/classification', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Workforce classification requires Supabase configuration' });
  const category = request.body?.workforce_category;
  const allowed = ['airport_staff','contractor','airline_crew','security','ground_handling','facilities','airport_official','emergency_response','other','unclassified'];
  if (!category || !allowed.includes(category)) return reply.code(400).send({ error: 'Choose a supported workforce category' });
  const employerName = request.body.employer_name?.trim() || null;
  if (employerName && employerName.length > 160) return reply.code(400).send({ error: 'Employer name must be 160 characters or fewer' });
  const { data, error } = await db.from('workers').update({ workforce_category: category, employer_name: employerName }).eq('id', request.params.id).select('id,display_name,workforce_category,employer_name').maybeSingle();
  if (error) return fail(reply, error);
  if (!data) return reply.code(404).send({ error: 'Worker not found' });
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'worker_classification_updated', 'worker', data.id, { workforce_category: category, employer_name: employerName });
  return { data };
});

app.post<{ Body: { label?: string; provider?: string; device_type?: string; provider_device_id?: string; model?: string; sos_capable?: boolean | string; hardware_address?: string } }>('/api/v1/tags', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Tag persistence requires Supabase configuration' });
  const label = request.body?.label?.trim();
  if (!label) return reply.code(400).send({ error: 'label is required' });
  const provider = request.body.provider?.trim() || 'blueiot';
  const deviceType = request.body.device_type?.trim() || 'badge';
  if (!['blueiot','sewio_uwb','unknown'].includes(provider)) return reply.code(400).send({ error: 'Unsupported device provider' });
  if (!['badge','asset_tag','other'].includes(deviceType)) return reply.code(400).send({ error: 'Unsupported device type' });
  const sosCapable = request.body.sos_capable === true || request.body.sos_capable === 'true';
  const { data, error } = await db.from('tags').insert({ provider, device_type: deviceType, provider_device_id: request.body.provider_device_id?.trim() || null, model: request.body.model?.trim() || null, sos_capable: sosCapable, label, hardware_address: request.body.hardware_address?.trim() || null }).select().single();
  if (error) return fail(reply, error);
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'badge_registered', 'tag', data.id, { label: data.label, provider, model: data.model, sos_capable: data.sos_capable });
  return reply.code(201).send({ data });
});

app.post<{ Body: { label?: string; provider_device_id?: string; model?: string; hardware_address?: string } }>('/api/v1/anchors', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Anchor inventory requires Supabase configuration' });
  const label = request.body?.label?.trim();
  const model = request.body?.model?.trim() || 'BA3000-t';
  if (!label) return reply.code(400).send({ error: 'label is required' });
  if (!['BA3000-t','BA3000-p'].includes(model)) return reply.code(400).send({ error: 'Choose a supported Blueiot anchor model' });
  const { data, error } = await db.from('anchors').insert({ provider: 'blueiot', label, model, provider_device_id: request.body.provider_device_id?.trim() || null, hardware_address: request.body.hardware_address?.trim() || null }).select().single();
  if (error) return fail(reply, error);
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'anchor_registered', 'anchor', data.id, { label, model });
  return reply.code(201).send({ data });
});

app.put<{ Params: { id: string }; Body: { map_id?: string; x?: number | string; y?: number | string; installation_height_m?: number | string } }>('/api/v1/anchors/:id/placement', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Anchor placement requires Supabase configuration' });
  const mapId = request.body?.map_id?.trim();
  if (request.body?.x == null || String(request.body.x).trim() === '' || request.body?.y == null || String(request.body.y).trim() === '') return reply.code(400).send({ error: 'X and Y coordinates are required' });
  const x = Number(request.body?.x), y = Number(request.body?.y);
  const installationHeight = request.body?.installation_height_m == null || request.body.installation_height_m === '' ? null : Number(request.body.installation_height_m);
  if (!mapId || !Number.isFinite(x) || !Number.isFinite(y) || (installationHeight !== null && (!Number.isFinite(installationHeight) || installationHeight <= 0))) return reply.code(400).send({ error: 'Choose a published map and provide valid X/Y coordinates and installation height' });
  const { data: map, error: mapError } = await db.from('area_maps').select('id,coordinate_system').eq('id', mapId).eq('status', 'published').maybeSingle();
  if (mapError) return fail(reply, mapError);
  if (!map) return reply.code(404).send({ error: 'Published map not found' });
  const bounds = map.coordinate_system as any;
  const xMin = Number(bounds?.xMin), xMax = Number(bounds?.xMax), yMin = Number(bounds?.yMin), yMax = Number(bounds?.yMax);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMax <= xMin || yMax <= yMin) return reply.code(409).send({ error: 'The published map has no valid coordinate bounds' });
  if (x < xMin || x > xMax || y < yMin || y > yMax) return reply.code(400).send({ error: `Coordinates must be within map bounds X ${xMin}–${xMax}, Y ${yMin}–${yMax}` });
  const { data, error } = await db.from('anchors').update({ map_id: mapId, x, y, installation_height_m: installationHeight, updated_at: new Date().toISOString() }).eq('id', request.params.id).select('id,label,map_id,x,y,installation_height_m').maybeSingle();
  if (error) return fail(reply, error);
  if (!data) return reply.code(404).send({ error: 'Anchor not found' });
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'anchor_placement_updated', 'anchor', request.params.id, { map_id: mapId, x, y, installation_height_m: installationHeight });
  return { data };
});

app.post<{ Body: { worker_id?: string; tag_id?: string; note?: string } }>('/api/v1/assignments', { preHandler: requireAdmin }, async (request, reply) => {
  if (!db) return reply.code(503).send({ error: 'Tag assignment requires Supabase configuration' });
  const workerId = request.body?.worker_id;
  const tagId = request.body?.tag_id;
  if (!workerId || !tagId) return reply.code(400).send({ error: 'worker_id and tag_id are required' });
  const actorId = (request as FastifyRequest & AuthContext).userId ?? null;
  const { data, error } = await db.rpc('assign_tag_to_worker', { p_worker_id: workerId, p_tag_id: tagId, p_assigned_by: actorId, p_note: request.body.note?.trim() || null });
  if (error) return fail(reply, error);
  await writeAudit(actorId ?? undefined, 'tag_assigned', 'tag_assignment', data.id, { worker_id: workerId, tag_id: tagId });
  return reply.code(201).send({ data });
});

app.post('/api/v1/demo/position', { preHandler: requireAdmin }, async (request, reply) => {
  if (process.env.NODE_ENV === 'production') return reply.code(404).send({ error: 'Demo feed is disabled in production' });
  if (!db) return reply.code(503).send({ error: 'Demo feed requires Supabase persistence' });
  const { data: assignment, error: assignmentError } = await db.from('tag_assignments').select('worker_id,tag_id,tags(label)').is('unassigned_at', null).order('assigned_at', { ascending: false }).limit(1).maybeSingle();
  if (assignmentError) return fail(reply, assignmentError);
  if (!assignment) return reply.code(409).send({ error: 'Assign a tag to a worker before starting the demo feed' });
  const { data: map, error: mapError } = await db.from('area_maps').select('id,coordinate_system').eq('status', 'published').order('published_at', { ascending: false }).limit(1).maybeSingle();
  if (mapError) return fail(reply, mapError);
  if (!map) return reply.code(409).send({ error: 'Publish a test map before starting the demo feed' });
  const bounds = map.coordinate_system as any;
  const xMin = Number(bounds?.xMin), xMax = Number(bounds?.xMax), yMin = Number(bounds?.yMin), yMax = Number(bounds?.yMax);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMax <= xMin || yMax <= yMin) return reply.code(409).send({ error: 'The published map has no valid coordinate bounds' });
  const seconds = Date.now() / 1000;
  const x = xMin + (xMax - xMin) * (0.5 + 0.28 * Math.sin(seconds / 6));
  const y = yMin + (yMax - yMin) * (0.5 + 0.28 * Math.cos(seconds / 8));
  const observedAt = new Date().toISOString();
  const { data: point, error: positionError } = await db.from('positions').insert({ tag_id: assignment.tag_id, map_id: map.id, observed_at: observedAt, x, y, confidence: 0.92, anchors_used: 4, source: 'simulated' }).select('id,tag_id,map_id,observed_at,x,y,confidence,anchors_used,source').single();
  if (positionError) return fail(reply, positionError);
  const { error: tagError } = await db.from('tags').update({ battery_percent: 84, last_seen_at: observedAt, device_state: 'online', telemetry: { source: 'simulator', simulated: true } }).eq('id', assignment.tag_id);
  if (tagError) return fail(reply, tagError);
  return { source: 'simulated', worker_id: assignment.worker_id, tag: assignment.tags, position: point };
});

app.post('/api/v1/demo/sos', { preHandler: requireAdmin }, async (request, reply) => {
  if (process.env.NODE_ENV === 'production') return reply.code(404).send({ error: 'Demo feed is disabled in production' });
  if (!db) return reply.code(503).send({ error: 'Demo feed requires Supabase persistence' });
  const { data: assignment, error: assignmentError } = await db.from('tag_assignments').select('worker_id,tag_id').is('unassigned_at', null).order('assigned_at', { ascending: false }).limit(1).maybeSingle();
  if (assignmentError) return fail(reply, assignmentError);
  if (!assignment) return reply.code(409).send({ error: 'Assign a tag to a worker before testing SOS' });
  const { data: active, error: activeError } = await db.from('incidents').select('id').eq('tag_id', assignment.tag_id).in('status', ['active', 'acknowledged']).limit(1).maybeSingle();
  if (activeError) return fail(reply, activeError);
  if (active) return reply.code(409).send({ error: 'This tag already has an open incident. Resolve it before triggering another demo SOS.' });
  const { data: map } = await db.from('area_maps').select('id').eq('status', 'published').order('published_at', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from('incidents').insert({ worker_id: assignment.worker_id, tag_id: assignment.tag_id, map_id: map?.id ?? null, source_event: { simulator: true, source: 'demo_feed', event: 'sos_pressed' } }).select('id,incident_code,status,triggered_at').single();
  if (error) return fail(reply, error);
  await writeAudit((request as FastifyRequest & AuthContext).userId, 'demo_sos_triggered', 'incident', data.id, { tag_id: assignment.tag_id });
  return reply.code(201).send({ source: 'simulated', data });
});

app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>('/api/v1/workers/:id/positions', async (request, reply) => {
  if (!db) return { source: 'sample', data: [] };
  try {
    const { data: assignments, error: assignmentError } = await db.from('tag_assignments').select('tag_id,assigned_at,unassigned_at').eq('worker_id', request.params.id);
    if (assignmentError) return fail(reply, assignmentError);
    if (!assignments?.length) return { source: 'supabase', data: [] };
    const batches = await Promise.all(assignments.map(async (assignment: any) => {
      let query = db!.from('positions').select('tag_id,map_id,observed_at,x,y,z,confidence,anchors_used,source').eq('tag_id', assignment.tag_id).gte('observed_at', assignment.assigned_at).order('observed_at', { ascending: true }).limit(10000);
      if (assignment.unassigned_at) query = query.lte('observed_at', assignment.unassigned_at);
      if (request.query.from) query = query.gte('observed_at', request.query.from);
      if (request.query.to) query = query.lte('observed_at', request.query.to);
      return query;
    }));
    const failedBatch = batches.find((batch: any) => batch.error);
    if (failedBatch?.error) return fail(reply, failedBatch.error);
    const points = batches.flatMap((batch: any) => batch.data ?? []).sort((a: any, b: any) => a.observed_at.localeCompare(b.observed_at));
    const { data: maps, error: mapError } = await db.from('area_maps').select('id,coordinate_system');
    if (mapError) return fail(reply, mapError);
    const mapById = new Map((maps ?? []).map((map: any) => [map.id, map.coordinate_system ?? {}]));
    const normalized = points.map((point: any) => {
      const coordinates = mapById.get(point.map_id) as any ?? {};
      const xSpan = Number(coordinates.xMax) - Number(coordinates.xMin);
      const ySpan = Number(coordinates.yMax) - Number(coordinates.yMin);
      return { ...point, xPercent: Number.isFinite(xSpan) && xSpan > 0 ? ((point.x - Number(coordinates.xMin)) / xSpan) * 100 : null, yPercent: Number.isFinite(ySpan) && ySpan > 0 ? ((point.y - Number(coordinates.yMin)) / ySpan) * 100 : null };
    });
    return { source: 'supabase', data: normalized };
  } catch (error: any) { return fail(reply, error); }
});

app.post<{ Params: { id: string }; Body: { action: 'acknowledge' | 'resolve'; note?: string } }>('/api/v1/incidents/:id/action', { preHandler: requireAdmin }, async (request, reply) => {
  if (request.body?.action !== 'acknowledge' && request.body?.action !== 'resolve') return reply.code(400).send({ error: 'Choose acknowledge or resolve' });
  const note = request.body.note?.trim() ?? '';
  if (request.body.action === 'resolve' && !note) return reply.code(400).send({ error: 'Add a resolution note before closing this incident' });
  if (note.length > 500) return reply.code(400).send({ error: 'Resolution notes must be 500 characters or fewer' });
  if (!db) {
    const incident = sampleIncidents.find((item) => item.id === request.params.id);
    if (!incident) return reply.code(404).send({ error: 'Incident not found' });
    if (request.body.action === 'acknowledge' && incident.status === 'active') { incident.status = 'acknowledged'; incident.acknowledgedAt = new Date().toISOString(); incident.acknowledgedBy = 'Current operator'; }
    else if (request.body.action === 'resolve' && incident.status === 'acknowledged') { incident.status = 'resolved'; incident.resolvedAt = new Date().toISOString(); incident.resolvedBy = 'Current operator'; incident.resolutionNote = note; }
    else return reply.code(409).send({ error: 'Invalid incident state transition' });
    return { data: incident };
  }
  const actorId = (request as FastifyRequest & AuthContext).userId;
  const { data: incident, error: lookupError } = await db.from('incidents').select('id,status').eq('id', request.params.id).maybeSingle();
  if (lookupError) return fail(reply, lookupError);
  if (!incident) return reply.code(404).send({ error: 'Incident not found' });
  let update: Record<string, unknown>;
  if (request.body.action === 'acknowledge' && incident.status === 'active') update = { status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: actorId };
  else if (request.body.action === 'resolve' && incident.status === 'acknowledged') update = { status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: actorId, resolution_note: note };
  else return reply.code(409).send({ error: 'Incident must be active to acknowledge and acknowledged to resolve' });
  const { data, error } = await db.from('incidents').update(update).eq('id', request.params.id).eq('status', incident.status).select().maybeSingle();
  if (error) return fail(reply, error);
  if (!data) return reply.code(409).send({ error: 'Incident changed; refresh and try again' });
  await writeAudit(actorId, request.body.action === 'acknowledge' ? 'incident_acknowledged' : 'incident_resolved', 'incident', request.params.id, { incident_code: data.incident_code, ...(request.body.action === 'resolve' ? { note } : {}) });
  return { data };
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ host: '0.0.0.0', port });
if (db) {
  let queueDrainActive = false;
  const drainTelemetryQueue = async () => {
    if (queueDrainActive) return;
    queueDrainActive = true;
    try {
      const { data, error } = await db!.rpc('process_pending_rtls_events', { p_limit: 50 });
      if (error) app.log.error({ err: error }, 'Telemetry queue drain failed');
      else {
        const failedEvents = ((data as any)?.events ?? []).filter((event: any) => event.status === 'failed');
        if (failedEvents.length) app.log.warn({ count: failedEvents.length }, 'Telemetry events failed validation or mapping');
      }
    } catch (error) { app.log.error({ err: error }, 'Telemetry queue drain failed'); }
    finally { queueDrainActive = false; }
  };
  void drainTelemetryQueue();
  const queueTimer = setInterval(() => { void drainTelemetryQueue(); }, 15_000);
  queueTimer.unref();
}
