import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, Clock3, RefreshCw, Siren, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import './insights.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type Incident = { id: string; incidentCode?: string; worker: string; tagId: string; status: string; createdAt: string; acknowledgedAt?: string | null; acknowledgedBy?: string | null; resolvedAt?: string | null; area: string; simulated?: boolean };
type Worker = { id: string; status: string; tagId: string };
type Props = { session: Session | null; demoModeActive: boolean; demoIncidents: Incident[]; workers: Worker[]; dataSource: string };

function durationMs(start: string, end: string) {
  const value = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function durationLabel(ms: number | null) {
  if (ms === null) return '—';
  const minutes = Math.round(ms / 60_000);
  return minutes < 1 ? '<1 min' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
function dateLabel(value: Date, compact = false) {
  return value.toLocaleDateString('en-US', compact ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
}

export default function InsightsPage({ session, demoModeActive, demoIncidents, workers, dataSource }: Props) {
  const [apiIncidents, setApiIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<7 | 30>(7);
  const [updatedAt, setUpdatedAt] = useState('');

  const load = useCallback(async () => {
    if (demoModeActive) { setLoading(false); setError(''); setUpdatedAt(new Date().toISOString()); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API}/api/v1/incidents`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load incident history');
      setApiIncidents(result.data ?? []); setUpdatedAt(new Date().toISOString());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load incident history'); }
    finally { setLoading(false); }
  }, [session?.access_token, demoModeActive]);

  useEffect(() => { void load(); }, [load]);

  const incidents = demoModeActive ? demoIncidents : apiIncidents;
  const since = Date.now() - range * 24 * 60 * 60 * 1000;
  const inRange = useMemo(() => incidents.filter(item => {
    const timestamp = new Date(item.createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= since;
  }), [incidents, since]);
  const open = incidents.filter(item => item.status !== 'resolved');
  const acknowledged = inRange.filter(item => item.acknowledgedAt);
  const responseTimes = acknowledged.map(item => durationMs(item.createdAt, item.acknowledgedAt!)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const middleResponseIndex = Math.floor(responseTimes.length / 2);
  const medianResponse = responseTimes.length ? responseTimes.length % 2 ? responseTimes[middleResponseIndex] : (responseTimes[middleResponseIndex - 1] + responseTimes[middleResponseIndex]) / 2 : null;
  const acknowledgementRate = inRange.length ? Math.round(acknowledged.length / inRange.length * 100) : null;
  const assigned = workers.filter(worker => worker.tagId && worker.tagId !== 'Unassigned');
  const reporting = assigned.filter(worker => worker.status === 'online').length;
  const days = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - offset));
    const next = new Date(date); next.setDate(next.getDate() + 1);
    return { date, count: inRange.filter(item => { const time = new Date(item.createdAt).getTime(); return time >= date.getTime() && time < next.getTime(); }).length };
  }), [inRange]);
  const maxDaily = Math.max(1, ...days.map(day => day.count));
  const recent = [...inRange].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

  return <section className="insights-page">
    <div className="insights-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> OPERATIONS INTELLIGENCE</span><h2>Insights & performance</h2><p>Incident response and workforce readiness from the data currently available.</p></div><div className="insights-controls"><div className="range-toggle" aria-label="Incident reporting period">{([7, 30] as const).map(value => <button key={value} className={range === value ? 'selected' : ''} onClick={() => setRange(value)}>{value} days</button>)}</div><button className="button button-secondary" onClick={() => void load()} disabled={loading || demoModeActive}><RefreshCw size={14}/>{demoModeActive ? 'Local demo' : 'Refresh'}</button></div></div>
    <div className={`insights-source ${demoModeActive ? 'insights-source-demo' : ''}`}><span className="insights-source-dot"/><span><b>{demoModeActive ? 'SIMULATED DEMO DATA' : dataSource === 'supabase' ? 'LOADED INCIDENT HISTORY' : 'SAMPLE / UNAVAILABLE DATA'}</b><small>{demoModeActive ? 'Demo activity is temporary and is not saved.' : updatedAt ? `Refreshed ${new Date(updatedAt).toLocaleTimeString()}` : 'Metrics reflect incident records returned by the API.'}</small></span><span className="insights-source-count">{incidents.length} records loaded</span></div>
    {error && <div className="insights-error" role="alert"><AlertTriangle size={16}/><span><b>Incident analytics unavailable</b><small>{error}</small></span><button className="button button-secondary" onClick={() => void load()}>Retry</button></div>}
    <div className="insights-kpis">
      <article className="insight-kpi"><span className="insight-kpi-icon red"><Siren size={17}/></span><div><small>OPEN INCIDENTS</small><b>{loading ? '—' : open.length}</b><span>{open.length ? 'Requires active follow-up' : 'No open incidents'}</span></div><ArrowUpRight size={15} className="insight-kpi-mark"/></article>
      <article className="insight-kpi"><span className="insight-kpi-icon amber"><Clock3 size={17}/></span><div><small>MEDIAN ACKNOWLEDGEMENT</small><b>{loading ? '—' : durationLabel(medianResponse)}</b><span>{responseTimes.length ? `${responseTimes.length} acknowledged in ${range} days` : 'No response samples in range'}</span></div><Activity size={15} className="insight-kpi-mark"/></article>
      <article className="insight-kpi"><span className="insight-kpi-icon blue"><Check size={17}/></span><div><small>ACKNOWLEDGEMENT RATE</small><b>{loading ? '—' : acknowledgementRate === null ? '—' : `${acknowledgementRate}%`}</b><span>{inRange.length ? `${acknowledged.length} of ${inRange.length} incidents acknowledged` : 'No incidents in selected period'}</span></div><ArrowDownRight size={15} className="insight-kpi-mark"/></article>
      <article className="insight-kpi"><span className="insight-kpi-icon green"><Users size={17}/></span><div><small>BADGES REPORTING</small><b>{assigned.length ? `${reporting} / ${assigned.length}` : '—'}</b><span>{assigned.length ? 'Current workforce snapshot' : 'No assigned badges loaded'}</span></div><Activity size={15} className="insight-kpi-mark"/></article>
    </div>
    <div className="insights-layout">
      <article className="panel incidents-chart-panel"><div className="panel-heading"><div><h2>Incident volume</h2><p>Daily SOS alerts · last 7 days</p></div><span className="insights-chart-total">{days.reduce((sum, day) => sum + day.count, 0)} total</span></div><div className="incident-volume-chart" role="img" aria-label={`SOS incident counts over the last seven days: ${days.map(day => `${dateLabel(day.date)} ${day.count}`).join(', ')}`}>
        {days.map(day => <div className="incident-volume-day" key={day.date.toISOString()}><span className="incident-volume-count">{day.count || ''}</span><div className="incident-volume-track"><i style={{ height: `${day.count ? Math.max(8, day.count / maxDaily * 100) : 3}%` }} className={day.count ? 'has-events' : ''}/></div><small>{dateLabel(day.date, true)}</small></div>)}
      </div><div className="chart-footnote">Counts use incident creation timestamps. Empty bars mean no incident record was returned for that date.</div></article>
      <article className="panel workforce-health-panel"><div className="panel-heading"><div><h2>Workforce readiness</h2><p>Current badge status snapshot</p></div><Users size={16}/></div><div className="readiness-meter"><div className="readiness-meter-head"><b>{assigned.length ? Math.round(reporting / assigned.length * 100) : 0}%</b><span>reporting now</span></div><div className="readiness-meter-track"><i style={{ width: `${assigned.length ? reporting / assigned.length * 100 : 0}%` }}/></div></div><div className="readiness-breakdown"><span><i className="ready-dot online"/> Reporting <b>{reporting}</b></span><span><i className="ready-dot stale"/> Needs attention <b>{assigned.length - reporting}</b></span><span><i className="ready-dot neutral"/> Assigned badges <b>{assigned.length}</b></span></div><div className="readiness-caveat">This is a current API snapshot, not a shift roster or confirmed on-duty count.</div></article>
      <article className="panel insight-activity-panel"><div className="panel-heading"><div><h2>Recent incident activity</h2><p>Latest records within the selected period</p></div><span className="insights-chart-total">{inRange.length} records</span></div>{recent.length ? <div className="insight-activity-list">{recent.map(item => <div className="insight-activity-row" key={item.id}><span className={`insight-activity-icon ${item.status}`}><Siren size={14}/></span><span className="insight-activity-copy"><b>{item.worker} <i className={`status-pill ${item.status}`}>{item.status}</i></b><small>{item.area} · {item.incidentCode ?? item.id}</small></span><span className="insight-activity-time">{new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>)}</div> : <div className="insights-empty"><span><Activity size={19}/></span><b>{loading ? 'Loading incident records…' : 'No incidents in this period'}</b><small>{loading ? 'Calculating metrics from the available history.' : demoModeActive ? 'Trigger a simulated SOS to preview these analytics.' : 'Try a wider period or check the incident connection.'}</small></div>}</article>
    </div>
  </section>;
}
