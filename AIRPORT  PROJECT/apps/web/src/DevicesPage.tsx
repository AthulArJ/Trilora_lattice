import { useEffect, useState, type FormEvent } from 'react';
import { Battery, CheckCircle2, CircleHelp, Plus, Radio, RefreshCw, Search, Signal, TriangleAlert, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type Badge = { id: string; label: string; provider?: string; provider_device_id?: string | null; sewio_feed_id?: string | null; model?: string | null; sos_capable?: boolean; hardware_address?: string | null; battery_percent?: number | null; device_state?: string | null; last_seen_at?: string | null };
type Anchor = { id: string; label: string; provider_device_id?: string | null; model: string; hardware_address?: string | null; device_state: string; last_seen_at?: string | null; map_id?: string | null; x?: number | null; y?: number | null; installation_height_m?: number | null };
type PublishedMap = { id: string; name: string; version: number; coordinate_system?: { xMin?: number; xMax?: number; yMin?: number; yMax?: number } };
type Worker = { name: string; tagId?: string };

function seen(value?: string | null) {
  if (!value) return 'No telemetry received';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No telemetry received';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
}

export default function DevicesPage({ session, isAdmin }: { session: Session | null; isAdmin: boolean }) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [maps, setMaps] = useState<PublishedMap[]>([]);
  const [placementDrafts, setPlacementDrafts] = useState<Record<string, { map_id: string; x: string; y: string; installation_height_m: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [anchorLabel, setAnchorLabel] = useState('');
  const [anchorId, setAnchorId] = useState('');
  const [anchorModel, setAnchorModel] = useState('BA3000-t');
  const [anchorMac, setAnchorMac] = useState('');

  async function load() {
    setLoading(true); setError('');
    const headers = session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
    try {
      const [badgeResponse, anchorResponse, workerResponse, mapResponse] = await Promise.all([
        fetch(`${API}/api/v1/tags`, { headers }), fetch(`${API}/api/v1/anchors`, { headers }), fetch(`${API}/api/v1/workers`, { headers }), fetch(`${API}/api/v1/maps`, { headers }),
      ]);
      const [badgeBody, anchorBody, workerBody, mapBody] = await Promise.all([badgeResponse.json(), anchorResponse.json(), workerResponse.json(), mapResponse.json()]);
      if (!badgeResponse.ok) throw new Error(badgeBody.error ?? 'Could not load badge inventory');
      if (!anchorResponse.ok) throw new Error(anchorBody.error ?? 'Could not load anchor inventory');
      if (!workerResponse.ok) throw new Error(workerBody.error ?? 'Could not load assignments');
      if (!mapResponse.ok) throw new Error(mapBody.error ?? 'Could not load published maps');
      setBadges(badgeBody.data ?? []); setAnchors(anchorBody.data ?? []); setWorkers(workerBody.data ?? []); setMaps(mapBody.data ?? []);
      setPlacementDrafts(Object.fromEntries((anchorBody.data ?? []).map((anchor: Anchor) => [anchor.id, { map_id: anchor.map_id ?? '', x: anchor.x == null ? '' : String(anchor.x), y: anchor.y == null ? '' : String(anchor.y), installation_height_m: anchor.installation_height_m == null ? '' : String(anchor.installation_height_m) }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load device inventory'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [session?.access_token]);

  async function registerAnchor(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`${API}/api/v1/anchors`, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ label: anchorLabel, provider_device_id: anchorId, model: anchorModel, hardware_address: anchorMac }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not register anchor');
      setAnchorLabel(''); setAnchorId(''); setAnchorMac(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not register anchor'); }
    finally { setBusy(false); }
  }

  async function saveAnchorPlacement(event: FormEvent, anchorId: string) {
    event.preventDefault(); setBusy(true); setError('');
    const draft = placementDrafts[anchorId];
    try {
      const response = await fetch(`${API}/api/v1/anchors/${encodeURIComponent(anchorId)}/placement`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save anchor placement');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save anchor placement'); }
    finally { setBusy(false); }
  }

  const visibleBadges = badges.filter(item => `${item.label} ${item.provider_device_id ?? ''} ${item.model ?? ''} ${item.hardware_address ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const visibleAnchors = anchors.filter(item => `${item.label} ${item.provider_device_id ?? ''} ${item.model} ${item.hardware_address ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const onlineBadges = badges.filter(item => item.last_seen_at && Date.now() - new Date(item.last_seen_at).getTime() < 30000).length;
  const assignedBadges = badges.filter(item => workers.some(worker => worker.tagId === item.label)).length;
  const awaiting = badges.filter(item => !item.last_seen_at && item.battery_percent == null).length + anchors.filter(item => !item.last_seen_at).length;

  return <section className="devices-page">
    <div className="directory-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> BLUEIOT DEVICE OPERATIONS</span><h2>Anchors & badges</h2><p>Register the BLE AoA infrastructure and assign SOS smart badges.</p></div><button className="button button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    <div className="map-safety-note"><Radio size={17}/><span><b>Inventory setup · RTLS telemetry unavailable.</b> Registered hardware remains “awaiting telemetry” until BLE AoA position updates and SOS events are ingested.</span></div>
    {error && <div className="map-error" role="alert">{error}</div>}
    {isAdmin && <form className="device-anchor-form" onSubmit={event => void registerAnchor(event)}>
      <div className="directory-form-title"><Signal size={16}/><span><b>Register an indoor anchor</b><small>Add the Blueiot anchor to the inventory. Placement and calibration are configured after a measured map is ready.</small></span></div>
      <label>Anchor label<input required value={anchorLabel} onChange={event => setAnchorLabel(event.target.value)} placeholder="e.g. VV-ANCHOR-001"/></label>
      <label>Blueiot device ID<input value={anchorId} onChange={event => setAnchorId(event.target.value)} placeholder="Device ID from Blueiot"/></label>
      <label>Model<select value={anchorModel} onChange={event => setAnchorModel(event.target.value)}><option value="BA3000-t">BA3000-t · Standard</option><option value="BA3000-p">BA3000-p · Enhanced</option></select></label>
      <label>Hardware address<input value={anchorMac} onChange={event => setAnchorMac(event.target.value)} placeholder="Optional MAC address"/></label>
      <button className="button button-primary" disabled={busy}><Plus size={14}/> Register anchor</button>
    </form>}
    <div className="device-kpis"><div><span>BLE AoA anchors</span><b><Signal size={17}/>{anchors.length}</b></div><div><span>Smart badges</span><b><Radio size={17}/>{badges.length}</b></div><div><span>Assigned badges</span><b><Users size={17}/>{assignedBadges}</b></div><div><span>Badges recently seen</span><b><CheckCircle2 size={17}/>{onlineBadges}</b></div><div><span>Awaiting first telemetry</span><b><CircleHelp size={17}/>{awaiting}</b></div></div>
    <div className="device-toolbar"><label className="search-box"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search anchors, badges, model, or ID…"/></label><button className="button button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={13}/> Refresh inventory</button></div>
    <section className="directory-card"><div className="directory-card-head"><div><h3>Indoor BLE AoA anchors</h3><p>{anchors.length} registered · place each anchor on its surveyed map</p></div></div>
      {loading ? <div className="maps-loading">Loading anchors…</div> : visibleAnchors.length === 0 ? <div className="maps-empty"><Signal size={22}/><b>{anchors.length ? 'No matching anchors' : 'No anchors registered'}</b><span>{anchors.length ? 'Try another search.' : 'Register the BA3000-t or BA3000-p anchors as the kit arrives.'}</span></div> : <div className="device-list">{visibleAnchors.map(anchor => { const draft = placementDrafts[anchor.id] ?? { map_id: '', x: '', y: '', installation_height_m: '' }; return <article className="device-card" key={anchor.id}><div className="device-card-head"><span className="device-icon"><Signal size={17}/></span><div className="device-card-title"><h3>{anchor.label}</h3><span>Blueiot · {anchor.model}{anchor.provider_device_id ? ` · ${anchor.provider_device_id}` : ''}</span></div><span className="device-state device-state-unknown">{anchor.device_state === 'uncommissioned' ? 'Uncommissioned' : anchor.device_state}</span></div><div className="device-details"><div><span>Hardware address</span><b>{anchor.hardware_address || 'Not configured'}</b></div><div><span>Placement</span><b>{anchor.map_id && anchor.x != null && anchor.y != null ? `Map position · ${anchor.x}, ${anchor.y}` : 'Pending surveyed placement'}</b></div><div><span>Install height</span><b>{anchor.installation_height_m == null ? 'Not configured' : `${anchor.installation_height_m} m`}</b></div><div><span>Last seen</span><b>{seen(anchor.last_seen_at)}</b></div></div>{isAdmin && <form className="anchor-placement-form" onSubmit={event => void saveAnchorPlacement(event, anchor.id)}><label>Published map<select required value={draft.map_id} disabled={!maps.length || busy} onChange={event => setPlacementDrafts(current => ({ ...current, [anchor.id]: { ...draft, map_id: event.target.value } }))}><option value="">Select map</option>{maps.map(map => <option key={map.id} value={map.id}>{map.name} · v{map.version}</option>)}</select></label><label>X coordinate<input required type="number" step="any" value={draft.x} onChange={event => setPlacementDrafts(current => ({ ...current, [anchor.id]: { ...draft, x: event.target.value } }))}/></label><label>Y coordinate<input required type="number" step="any" value={draft.y} onChange={event => setPlacementDrafts(current => ({ ...current, [anchor.id]: { ...draft, y: event.target.value } }))}/></label><label>Height (m)<input type="number" min="0.1" step="any" value={draft.installation_height_m} onChange={event => setPlacementDrafts(current => ({ ...current, [anchor.id]: { ...draft, installation_height_m: event.target.value } }))}/></label><button className="button button-secondary" disabled={!maps.length || busy}><CheckCircle2 size={13}/> Save placement</button>{!maps.length && <small>Publish a map with measured coordinate bounds before placing anchors.</small>}</form>}<div className="device-card-foot"><span><CircleHelp size={13}/> Anchor state follows received RTLS heartbeats</span><small>Position is inventory metadata until telemetry integration is active</small></div></article>; })}</div>}
    </section>
    <section className="directory-card"><div className="directory-card-head"><div><h3>LE smart badges</h3><p>{badges.length} registered · SOS capability recorded per badge</p></div></div>
      {loading ? <div className="maps-loading">Loading badges…</div> : visibleBadges.length === 0 ? <div className="maps-empty"><Radio size={22}/><b>{badges.length ? 'No matching badges' : 'No badges registered'}</b><span>{badges.length ? 'Try another search.' : 'Register Blueiot badges from People & badges.'}</span></div> : <div className="device-list">{visibleBadges.map(badge => { const worker = workers.find(item => item.tagId === badge.label)?.name ?? 'Unassigned'; const providerLabel = badge.provider === 'sewio_uwb' ? `Legacy Sewio · ${badge.sewio_feed_id || 'ID unavailable'}` : badge.provider === 'unknown' ? 'Provider not identified' : `Blueiot · ${badge.model || 'Model pending'}${badge.provider_device_id ? ` · ${badge.provider_device_id}` : ''}`; return <article className="device-card" key={badge.id}><div className="device-card-head"><span className="device-icon"><Radio size={17}/></span><div className="device-card-title"><h3>{badge.label}</h3><span>{providerLabel}</span></div><span className="device-state device-state-unknown">{badge.device_state ?? 'awaiting telemetry'}</span></div><div className="device-details"><div><span>Assigned worker</span><b>{worker}</b></div><div><span>Emergency control</span><b>{badge.sos_capable ? 'SOS button recorded' : 'No SOS button recorded'}</b></div><div><span>Battery</span><b className={badge.battery_percent != null && badge.battery_percent < 20 ? 'device-attention' : ''}><Battery size={14}/>{badge.battery_percent == null ? 'No telemetry' : `${badge.battery_percent}%`}</b></div><div><span>Last seen</span><b>{seen(badge.last_seen_at)}</b></div></div><div className="device-card-foot"><span><TriangleAlert size={13}/> SOS capability is inventory metadata, not a connected alert</span><small>{badge.hardware_address || 'Hardware address not configured'}</small></div></article>; })}</div>}
    </section>
  </section>;
}
