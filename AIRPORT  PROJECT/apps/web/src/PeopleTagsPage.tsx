import { useEffect, useState, type FormEvent } from 'react';
import { Battery, Link2, Plus, Radio, RefreshCw, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const demoControlsEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_CONTROLS === 'true';

type Worker = { id: string; name: string; role: string; workforceCategory?: string; employerName?: string | null; tagId?: string; status?: string; battery?: number | null; lastSeen?: string };
type Tag = { id: string; provider?: string; device_type?: string; provider_device_id?: string | null; model?: string | null; sos_capable?: boolean; label: string; sewio_feed_id?: string | null; hardware_address?: string | null; battery_percent?: number | null; device_state?: string; last_seen_at?: string | null };
const workforceCategories = [ ['airport_staff','Airport staff'], ['contractor','Contractor'], ['airline_crew','Airline / cabin crew'], ['security','Security'], ['ground_handling','Ground handling'], ['facilities','Facilities'], ['airport_official','Airport official'], ['emergency_response','Emergency response'], ['other','Other'], ['unclassified','Unclassified'] ];
type Props = { isAdmin: boolean; session: Session | null; notify: (message: string) => void; onUpdated: () => void; demoModeActive: boolean; demoRunning: boolean; demoWorkers: Worker[]; demoBadges: Array<{ id: string; label: string; battery: number | null; status: string; lastSeen: string | null; worker: string | null }>; onToggleDemo: () => void; onTriggerDemoSos: () => void; onExitDemo: () => void };

export default function PeopleTagsPage({ isAdmin, session, notify, onUpdated, demoModeActive, demoRunning, demoWorkers, demoBadges, onToggleDemo, onTriggerDemoSos, onExitDemo }: Props) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [team, setTeam] = useState('');
  const [workerCategory, setWorkerCategory] = useState('unclassified');
  const [employerName, setEmployerName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [tagLabel, setTagLabel] = useState('');
  const [providerDeviceId, setProviderDeviceId] = useState('');
  const [model, setModel] = useState('BT1000-g');
  const [sosCapable, setSosCapable] = useState(true);
  const [hardwareAddress, setHardwareAddress] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [tagId, setTagId] = useState('');

  async function load(silent = false) {
    if (demoModeActive) { setLoading(false); setError(''); return; }
    if (!silent) setLoading(true);
    setError('');
    const headers = session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
    try {
      const [workerResponse, tagResponse] = await Promise.all([
        fetch(`${API}/api/v1/workers`, { headers }),
        fetch(`${API}/api/v1/tags`, { headers }),
      ]);
      const [workerBody, tagBody] = await Promise.all([workerResponse.json(), tagResponse.json()]);
      if (!workerResponse.ok) throw new Error(workerBody.error ?? 'Could not load workers');
      if (!tagResponse.ok) throw new Error(tagBody.error ?? 'Could not load tags');
      setWorkers(workerBody.data ?? []); setTags(tagBody.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load directory data');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [session?.access_token, demoModeActive]);

  async function send(path: string, body: Record<string, string>, method = 'POST') {
    const response = await fetch(`${API}/api/v1/${path}`, {
      method, headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Request failed');
    return result;
  }
  async function submit(event: FormEvent, action: () => Promise<void>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await action(); await load(); onUpdated(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  const shownWorkers = demoModeActive ? demoWorkers : workers;
  const shownTags: Tag[] = demoModeActive ? demoBadges.map(badge => ({ id: badge.id, label: badge.label, model: 'BT1000-g', provider: 'local demo', sos_capable: true, battery_percent: badge.battery, device_state: badge.status, last_seen_at: badge.lastSeen })) : tags;
  const activeTags = new Map(shownWorkers.filter(worker => worker.tagId && worker.tagId !== 'Unassigned').map(worker => [worker.tagId, worker.name]));
  return <section className="directory-page">
    <div className="directory-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> WORKFORCE & DEVICE REGISTRY</span><h2>People & badges</h2><p>{demoModeActive ? 'Local demo directory · changes are not saved.' : 'Manage airport workers, smart badges, and auditable assignments.'}</p></div><button className="button button-secondary" onClick={() => void load()} disabled={loading || demoModeActive}><RefreshCw size={14}/>{demoModeActive ? 'Local demo' : 'Refresh'}</button></div>
    <div className="map-safety-note"><Radio size={17}/><span><b>BLE AoA pilot.</b> Badge and anchor inventory can be configured now; live locations and SOS events remain unavailable until RTLS telemetry and event ingestion are configured.</span></div>
    {isAdmin && demoControlsEnabled && <section className="simulator-panel"><div><span className="simulator-badge">{demoModeActive ? 'LOCAL DEMO · NOT SAVED' : 'FRONTEND DEMO'}</span><h3>Test tracking and SOS</h3><p>Creates sample movement and SOS alerts in this browser only. Acknowledge and resolve alerts to preview the response flow. Demo changes are cleared when you exit or reload.</p></div><div className="simulator-actions"><button className={`button ${demoRunning ? 'button-secondary' : 'button-primary'}`} onClick={onToggleDemo}>{demoRunning ? 'Pause demo movement' : 'Start demo movement'}</button><button className="button button-secondary" onClick={onTriggerDemoSos}>Trigger demo SOS</button>{demoModeActive && <button className="button button-secondary" onClick={onExitDemo}>Exit demo</button>}</div></section>}
    {error && <div className="map-error" role="alert">{error}</div>}
    {isAdmin && demoModeActive && <div className="map-safety-note"><Radio size={17}/><span><b>Local demo is active.</b> Worker, badge, and assignment changes are paused so this presentation cannot write to Supabase.</span></div>}
    {isAdmin && !demoModeActive && <div className="directory-forms">
      <form className="directory-form" onSubmit={event => void submit(event, async () => { await send('workers', { display_name: workerName, employee_code: employeeCode, team, workforce_category: workerCategory, employer_name: employerName }); setWorkerName(''); setEmployeeCode(''); setTeam(''); setWorkerCategory('unclassified'); setEmployerName(''); notify('Worker added'); })}>
        <div className="directory-form-title"><Users size={16}/><span><b>Add worker</b><small>Creates an active workforce record.</small></span></div>
        <label>Full name<input required value={workerName} onChange={event => setWorkerName(event.target.value)} placeholder="e.g. Alex Thomas"/></label>
        <div className="directory-form-row"><label>Team / role<input value={team} onChange={event => setTeam(event.target.value)} placeholder="Facilities"/></label><label>Employee code<input value={employeeCode} onChange={event => setEmployeeCode(event.target.value)} placeholder="Optional"/></label></div>
        <div className="directory-form-row"><label>Workforce category<select value={workerCategory} onChange={event => setWorkerCategory(event.target.value)}>{workforceCategories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Employer / contractor<input value={employerName} onChange={event => setEmployerName(event.target.value)} placeholder="Optional"/></label></div>
        <button className="button button-primary" disabled={busy}><Plus size={14}/> Add worker</button>
      </form>
      <form className="directory-form" onSubmit={event => void submit(event, async () => { await send('tags', { label: tagLabel, provider: 'blueiot', device_type: 'badge', provider_device_id: providerDeviceId, model, sos_capable: String(sosCapable), hardware_address: hardwareAddress }); setTagLabel(''); setProviderDeviceId(''); setHardwareAddress(''); notify('Blueiot badge registered'); })}>
        <div className="directory-form-title"><Radio size={16}/><span><b>Register smart badge</b><small>Inventory only until Blueiot positioning and SOS events are connected.</small></span></div>
        <label>Badge label<input required value={tagLabel} onChange={event => setTagLabel(event.target.value)} placeholder="e.g. VV-BADGE-001"/></label>
        <div className="directory-form-row"><label>Blueiot device ID<input value={providerDeviceId} onChange={event => setProviderDeviceId(event.target.value)} placeholder="Device ID from Blueiot"/></label><label>Badge model<input value={model} onChange={event => setModel(event.target.value)} placeholder="BT1000-g"/></label></div>
        <div className="directory-form-row"><label>Hardware address<input value={hardwareAddress} onChange={event => setHardwareAddress(event.target.value)} placeholder="Optional MAC address"/></label><label className="checkbox-label"><input type="checkbox" checked={sosCapable} onChange={event => setSosCapable(event.target.checked)}/> SOS button available</label></div>
        <button className="button button-primary" disabled={busy}><Plus size={14}/> Register badge</button>
      </form>
      <form className="directory-form assignment-form" onSubmit={event => void submit(event, async () => { await send('assignments', { worker_id: workerId, tag_id: tagId, note: 'Pilot assignment' }); setWorkerId(''); setTagId(''); notify('Badge assigned to worker'); })}>
        <div className="directory-form-title"><Link2 size={16}/><span><b>Assign a badge</b><small>Reassignment closes the previous active assignment automatically.</small></span></div>
        <label>Worker<select required value={workerId} onChange={event => setWorkerId(event.target.value)}><option value="">Select a worker</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name}{worker.tagId && worker.tagId !== 'Unassigned' ? ` · currently ${worker.tagId}` : ''}</option>)}</select></label>
        <label>Badge<select required value={tagId} onChange={event => setTagId(event.target.value)}><option value="">Select a badge</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.label}{activeTags.has(tag.label) ? ` · currently assigned to ${activeTags.get(tag.label)}` : ''}</option>)}</select></label>
        <button className="button button-primary" disabled={busy || !workers.length || !tags.length}><Link2 size={14}/> Assign badge</button>
      </form>
    </div>}
    <section className="directory-card"><div className="directory-card-head"><div><h3>Workers</h3><p>{shownWorkers.length} workforce records{demoModeActive ? ' · demo' : ''} · categories power the CIAL headcount breakdown</p></div></div>
      {loading && !demoModeActive ? <div className="maps-loading">Loading workers…</div> : shownWorkers.length === 0 ? <div className="maps-empty"><Users size={22}/><b>No workers registered</b><span>Add a worker above to start configuring badge assignments.</span></div> : <div className="directory-table directory-workforce-table"><div className="directory-table-head"><span>WORKER</span><span>TEAM</span><span>WORKFORCE CATEGORY</span><span>EMPLOYER</span><span>ASSIGNED BADGE</span><span>BADGE STATUS</span></div>{shownWorkers.map(worker => <div className="directory-row" key={worker.id}><b>{worker.name}</b><span>{worker.role || '—'}</span>{demoModeActive ? <span>{workforceCategories.find(([value]) => value === worker.workforceCategory)?.[1] ?? 'Sample · unclassified'}</span> : <select aria-label={`Workforce category for ${worker.name}`} value={worker.workforceCategory ?? 'unclassified'} disabled={!isAdmin || busy} onChange={event => void submit(new Event('submit') as any, async () => { await send(`workers/${worker.id}/classification`, { workforce_category: event.target.value, employer_name: worker.employerName ?? '' }, 'PUT'); notify(`${worker.name} category updated`); })}>{workforceCategories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}<span>{worker.employerName || '—'}</span><span>{worker.tagId || 'Unassigned'}</span><span>{worker.status === 'unknown' ? 'Waiting for telemetry' : worker.status && worker.status !== 'offline' ? worker.status : worker.tagId === 'Unassigned' || !worker.tagId ? 'Not connected' : 'Offline'}{worker.battery == null ? '' : ` · ${worker.battery}%`}</span></div>)}</div>}
    </section>
    <section className="directory-card"><div className="directory-card-head"><div><h3>Badge inventory</h3><p>{shownTags.length} badges registered{demoModeActive ? ' · demo' : ''}</p></div></div>
      {loading && !demoModeActive ? <div className="maps-loading">Loading badges…</div> : shownTags.length === 0 ? <div className="maps-empty"><Radio size={22}/><b>No badges registered</b><span>Register smart badges when you have the device IDs.</span></div> : <div className="directory-table"><div className="directory-table-head tag-inventory-head"><span>DEVICE</span><span>MODEL · PROVIDER ID</span><span>HARDWARE ADDRESS</span><span>CAPABILITIES · HEALTH</span></div>{shownTags.map(tag => <div className="directory-row tag-inventory-row" key={tag.id}><b><Radio size={14}/>{tag.label}</b><span>{tag.provider === 'sewio_uwb' ? `Sewio legacy · ${tag.sewio_feed_id || 'ID unavailable'}` : `${tag.model || 'Model pending'}${tag.provider_device_id ? ` · ${tag.provider_device_id}` : ''}`}</span><span>{tag.hardware_address || 'Not configured'}</span><span>{tag.sos_capable ? 'SOS' : 'No SOS'} · {tag.battery_percent == null ? 'No telemetry' : `${tag.battery_percent}% · ${tag.device_state ?? 'unknown'}`}</span></div>)}</div>}
    </section>
    {!isAdmin && <div className="map-safety-note"><Users size={16}/><span>You have read-only access. An administrator manages workers and badge assignments.</span></div>}
  </section>;
}
