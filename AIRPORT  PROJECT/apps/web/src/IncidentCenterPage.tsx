import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock3, MapPin, RefreshCw, Search, ShieldCheck, Siren } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import './incident-sla.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type Incident = { id: string; incidentCode?: string; workerId: string; worker: string; tagId: string; status: string; createdAt: string; acknowledgedAt?: string | null; acknowledgedBy?: string | null; assignedAt?: string | null; assignedBy?: string | null; resolvedAt?: string | null; resolvedBy?: string | null; resolutionNote?: string | null; assignedTo?: string | null; area: string; simulated?: boolean };
type DemoResponder = { id: string; name: string; role: string; status: string };
type Props = { isAdmin: boolean; session: Session | null; onUpdated: () => void; notify: (message: string) => void; demoModeActive: boolean; demoIncidents: Incident[]; demoResponders: DemoResponder[]; onDemoAction: (item: Incident, action: 'acknowledge' | 'resolve' | 'assign', note?: string) => void };

function time(value?: string | null) { return value ? new Date(value).toLocaleString() : '—'; }
function duration(start?: string | null, end: number | string = Date.now()) {
  if (!start) return '—';
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export default function IncidentCenterPage({ isAdmin, session, onUpdated, notify, demoModeActive, demoIncidents, demoResponders, onDemoAction }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'open' | 'all' | 'resolved'>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [responderChoice, setResponderChoice] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const loadInProgress = useRef(false);

  async function load(quiet = false) {
    if (loadInProgress.current) return;
    loadInProgress.current = true;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/v1/incidents`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load incidents');
      setIncidents(result.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load incidents'); }
    finally { loadInProgress.current = false; if (!quiet) setLoading(false); }
  }
  useEffect(() => {
    if (demoModeActive) { setError(''); setLoading(false); return; }
    void load();
    const refreshTimer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [session?.access_token, demoModeActive]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);

  async function action(item: Incident, next: 'acknowledge' | 'resolve') {
    const note = notes[item.id]?.trim() ?? '';
    if (next === 'resolve' && !note) { setError('Add a short resolution note before closing this incident.'); return; }
    if (note.length > 500) { setError('Resolution notes must be 500 characters or fewer.'); return; }
    if (demoModeActive && item.simulated) {
      setBusyId(item.id); setError('');
      onDemoAction(item, next, note);
      if (next === 'resolve') setNotes(current => ({ ...current, [item.id]: '' }));
      notify(next === 'acknowledge' ? `${item.incidentCode ?? item.id} acknowledged · local demo only` : `${item.incidentCode ?? item.id} resolved · local demo only`);
      setBusyId('');
      return;
    }
    setBusyId(item.id); setError('');
    try {
      const response = await fetch(`${API}/api/v1/incidents/${encodeURIComponent(item.id)}/action`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ action: next, ...(next === 'resolve' ? { note } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not update incident');
      await load(); void onUpdated();
      if (next === 'resolve') setNotes(current => ({ ...current, [item.id]: '' }));
      notify(next === 'acknowledge' ? `${item.incidentCode} acknowledged · you own this response` : `${item.incidentCode} resolved and logged`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update incident'); }
    finally { setBusyId(''); }
  }

  function assignDemoResponder(item: Incident) {
    const responder = responderChoice[item.id];
    if (!responder) { setError('Choose a responder before assigning this incident.'); return; }
    setBusyId(item.id); setError('');
    onDemoAction({ ...item, assignedTo: responder }, 'assign', responder);
    notify(`${responder} assigned · local demo only`);
    setBusyId('');
  }

  const shownIncidents = demoModeActive ? demoIncidents : incidents;
  const openCount = shownIncidents.filter(item => item.status !== 'resolved').length;
  const awaitingCount = shownIncidents.filter(item => item.status === 'active').length;
  const acknowledgedCount = shownIncidents.filter(item => item.status === 'acknowledged').length;
  const resolvedCount = shownIncidents.filter(item => item.status === 'resolved').length;
  const oldestOpen = shownIncidents.filter(item => item.status !== 'resolved').reduce<string | null>((oldest, item) => !oldest || new Date(item.createdAt).getTime() < new Date(oldest).getTime() ? item.createdAt : oldest, null);
  const visible = shownIncidents.filter(item => {
    const matchesFilter = filter === 'all' || (filter === 'open' ? item.status !== 'resolved' : item.status === 'resolved');
    return matchesFilter && `${item.incidentCode ?? item.id} ${item.worker} ${item.tagId} ${item.area} ${item.acknowledgedBy ?? ''} ${item.resolvedBy ?? ''}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => {
    if (filter === 'resolved') return new Date(b.resolvedAt ?? b.createdAt).getTime() - new Date(a.resolvedAt ?? a.createdAt).getTime();
    if (a.status !== b.status) return a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return <section className="incident-center-page">
    <div className="directory-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> SAFETY RESPONSE</span><h2>Incident center</h2><p>{demoModeActive ? 'Local presentation · demo alerts are not written to the database.' : 'Triage SOS alerts, take ownership, and record how each response was handled.'}</p></div><button className="button button-secondary" onClick={() => void load()} disabled={loading || demoModeActive}><RefreshCw size={14}/>{demoModeActive ? 'Local demo' : 'Refresh'}</button></div>
    <div className="incident-kpis"><div><span>Open incidents</span><b className={openCount ? 'incident-kpi-alert' : ''}><Siren size={16}/>{openCount}</b></div><div><span>Awaiting acknowledgement</span><b className={awaitingCount ? 'incident-kpi-alert' : ''}><AlertTriangle size={16}/>{awaitingCount}</b></div><div><span>Being handled</span><b><ShieldCheck size={16}/>{acknowledgedCount}</b></div><div><span>Oldest open</span><b><Clock3 size={16}/>{oldestOpen ? duration(oldestOpen, now) : '—'}</b><small>{oldestOpen ? 'Elapsed since the SOS was received' : 'No open alerts'}</small></div></div>
    {error && <div className="map-error" role="alert">{error}</div>}
    <div className="incident-toolbar"><div className="incident-filters">{(['open', 'all', 'resolved'] as const).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value === 'open' ? `Open (${openCount})` : value === 'all' ? `All (${shownIncidents.length})` : `Resolved (${resolvedCount})`}</button>)}</div><label className="search-box"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search incident, worker, tag, responder…"/></label></div>
    {loading ? <div className="maps-loading">Loading incident records…</div> : visible.length === 0 ? <div className="incident-empty"><div><ShieldCheck size={23}/></div><b>{filter === 'open' ? 'No open incidents' : 'No matching incidents'}</b><span>{demoModeActive ? 'Trigger a demo SOS from People & badges to preview the response workflow.' : filter === 'open' ? 'The response queue is clear.' : 'Try another filter or search.'}</span></div> : <div className="incident-list">{visible.map(item => {
      const age = duration(item.createdAt, item.status === 'resolved' ? item.resolvedAt ?? now : now);
      const responseTime = item.acknowledgedAt ? duration(item.createdAt, item.acknowledgedAt) : 'Awaiting acknowledgement';
      const demoSlaOverdue = demoModeActive && item.simulated && item.status === 'active' && now - new Date(item.createdAt).getTime() >= 2 * 60 * 1000;
      return <article className={`incident-record incident-record-${item.status}`} key={item.id}>
        <div className="incident-record-head"><span className={`incident-record-icon ${item.status}`}><Siren size={17}/></span><div className="incident-record-title"><div><h3>{item.incidentCode ?? item.id}</h3>{item.simulated && <span className="simulated-pill">DEMO · SIMULATED</span>}</div><p>{item.status === 'resolved' ? 'SOS incident resolved' : item.status === 'acknowledged' ? 'Response in progress' : demoSlaOverdue ? 'SOS received · demo acknowledgement target exceeded' : 'SOS received · awaiting operator'}</p></div>{item.status !== 'resolved' && <span className="incident-age-badge"><Clock3 size={12}/>{item.status === 'active' ? `Waiting ${age}` : `Open ${age}`}</span>}{item.simulated && item.status !== 'resolved' && <span className={`incident-sla-pill ${demoSlaOverdue ? 'incident-sla-overdue' : ''}`} title="Illustrative demo response target: 2 minutes">{demoSlaOverdue ? 'TARGET EXCEEDED' : 'DEMO TARGET · 2M'}</span>}<span className={`status-pill ${item.status}`}>{item.status}</span></div>
        <div className="incident-record-details"><div><span>Worker / tag</span><b>{item.worker} · {item.tagId}</b></div><div><span>Area</span><b><MapPin size={13}/>{item.area}</b></div><div><span>First response</span><b>{responseTime}</b></div><div><span>{item.assignedTo ? 'Responder' : item.status === 'resolved' ? 'Total duration' : 'Incident age'}</span><b>{item.assignedTo ?? age}</b></div></div>
        <div className="incident-timeline" aria-label={`Response timeline for ${item.incidentCode}`}>
          <div className="incident-timeline-step complete"><i/><div><b>SOS received</b><span>{time(item.createdAt)}</span></div></div>
          <div className={`incident-timeline-step ${item.acknowledgedAt ? 'complete' : 'pending'}`}><i/><div><b>{item.acknowledgedAt ? 'Acknowledged' : 'Awaiting acknowledgement'}</b><span>{item.acknowledgedAt ? `${time(item.acknowledgedAt)}${item.acknowledgedBy ? ` · ${item.acknowledgedBy}` : ''}` : 'No operator has taken ownership yet'}</span></div></div>
          <div className={`incident-timeline-step ${item.assignedTo ? 'complete' : 'pending'}`}><i/><div><b>{item.assignedTo ? 'Responder assigned' : 'Awaiting responder'}</b><span>{item.assignedTo ? `${item.assignedTo}${item.assignedAt ? ` · ${time(item.assignedAt)}` : ''}${item.assignedBy ? ` · ${item.assignedBy}` : ''}` : 'Assign a team member after taking ownership'}</span></div></div>
          <div className={`incident-timeline-step ${item.resolvedAt ? 'complete' : 'pending'}`}><i/><div><b>{item.resolvedAt ? 'Resolved' : item.acknowledgedAt ? 'In progress' : 'Not resolved'}</b><span>{item.resolvedAt ? `${time(item.resolvedAt)}${item.resolvedBy ? ` · ${item.resolvedBy}` : ''}` : item.acknowledgedAt ? 'Add a resolution note when closing' : 'Resolution will be recorded after acknowledgement'}</span></div></div>
        </div>
        {item.status === 'resolved' && <div className="resolution-summary"><b>Resolution note</b><span>{item.resolutionNote || 'No note recorded'}</span></div>}
        {isAdmin && item.status === 'active' && <div className="incident-record-actions"><button className="button button-primary" disabled={busyId === item.id} onClick={() => void action(item, 'acknowledge')}><Check size={14}/>{busyId === item.id ? 'Saving…' : 'Acknowledge & take ownership'}</button></div>}
        {isAdmin && demoModeActive && item.simulated && item.status === 'acknowledged' && <div className="demo-responder-assignment"><div><b>{item.assignedTo ? 'Responder assigned' : 'Assign a responder'}</b><small>{item.assignedTo ? `${item.assignedTo} owns the next response step.` : 'Choose a demo team member to show dispatch handoff.'}</small></div><select aria-label={`Responder for ${item.incidentCode ?? item.id}`} value={responderChoice[item.id] ?? item.assignedTo ?? ''} onChange={event => setResponderChoice(current => ({ ...current, [item.id]: event.target.value }))}><option value="">Select responder</option>{demoResponders.filter(responder => responder.id !== item.workerId && responder.status === 'online').map(responder => <option key={responder.id} value={responder.name}>{responder.name} · {responder.role}</option>)}</select><button className="button button-secondary" disabled={busyId === item.id || !(responderChoice[item.id] ?? item.assignedTo)} onClick={() => assignDemoResponder(item)}>{item.assignedTo ? 'Reassign' : 'Assign responder'}</button></div>}
        {isAdmin && item.status === 'acknowledged' && <div className="incident-record-actions resolve-actions"><label>Resolution note<textarea rows={2} maxLength={500} value={notes[item.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} placeholder="What action was taken?"/><small>{(notes[item.id] ?? '').length}/500 · required to resolve</small></label><button className="button button-primary" disabled={busyId === item.id || !notes[item.id]?.trim()} onClick={() => void action(item, 'resolve')}><ShieldCheck size={14}/>{busyId === item.id ? 'Saving…' : 'Resolve incident'}</button></div>}
        {!isAdmin && item.status !== 'resolved' && <div className="incident-viewer-note"><AlertTriangle size={14}/> Read-only account · an administrator must acknowledge or resolve this incident.</div>}
      </article>;
    })}</div>}
  </section>;
}
