import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, MapPin, Navigation, RefreshCw, Route, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type Worker = { id: string; name: string; role: string; tagId: string };
type Point = { map_id: string | null; x: number; y: number; xPercent: number | null; yPercent: number | null; observed_at: string; source?: string; confidence?: number | null };
type MapVersion = { id: string; name: string; version: number; previewUrl: string };
type Props = { session: Session | null; maps: MapVersion[] };

function localDateTime(value: Date) {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}
function displayTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function TrackHistoryPage({ session, maps }: Props) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState('');
  const [from, setFrom] = useState(() => localDateTime(new Date(Date.now() - 8 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => localDateTime(new Date()));
  const [points, setPoints] = useState<Point[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [error, setError] = useState('');

  const headers = session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
  useEffect(() => {
    let active = true;
    setLoadingWorkers(true);
    fetch(`${API}/api/v1/workers`, { headers })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Could not load workers'); return result; })
      .then(result => { if (active) { const rows = result.data ?? []; setWorkers(rows); setWorkerId(current => current || rows[0]?.id || ''); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load workers'); })
      .finally(() => { if (active) setLoadingWorkers(false); });
    return () => { active = false; };
  }, [session?.access_token]);

  async function loadPoints(event?: FormEvent) {
    event?.preventDefault();
    if (!workerId) { setPoints([]); return; }
    const start = new Date(from), end = new Date(to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) { setError('Choose a valid start and end time.'); return; }
    setLoadingPoints(true); setError('');
    try {
      const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
      const response = await fetch(`${API}/api/v1/workers/${encodeURIComponent(workerId)}/positions?${query}`, { headers });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load position history');
      setPoints(result.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load position history'); }
    finally { setLoadingPoints(false); }
  }

  useEffect(() => { if (workerId) void loadPoints(); }, [workerId, session?.access_token]);
  const mapId = points[points.length - 1]?.map_id;
  const plotted = points.filter(point => point.map_id === mapId && point.xPercent !== null && point.yPercent !== null && Number.isFinite(point.xPercent) && Number.isFinite(point.yPercent));
  const selectedMap = maps.find(map => map.id === mapId);
  const simulatedCount = points.filter(point => point.source === 'simulated').length;
  const path = useMemo(() => plotted.map(point => `${Math.max(0, Math.min(100, point.xPercent!))},${Math.max(0, Math.min(100, point.yPercent!))}`).join(' '), [plotted]);
  const selectedWorker = workers.find(worker => worker.id === workerId);

  return <section className="track-history-page">
    <div className="directory-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> POSITION REPLAY</span><h2>Track history</h2><p>Review recorded worker paths against the map version attached to each position.</p></div><button className="button button-secondary" onClick={() => void loadPoints()} disabled={loadingPoints || !workerId}><RefreshCw size={14}/> Refresh</button></div>
    <div className="map-safety-note"><Navigation size={17}/><span><b>Position replay only.</b> Simulated points are labelled in the results. Accurate physical paths require a surveyed map and calibrated BLE AoA coordinate frame.</span></div>
    {error && <div className="map-error" role="alert">{error}</div>}
    <form className="history-filter" onSubmit={loadPoints}>
      <label><span>Worker</span><select value={workerId} onChange={event => setWorkerId(event.target.value)} disabled={loadingWorkers}><option value="">{loadingWorkers ? 'Loading workers…' : 'Select worker'}</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name} · {worker.tagId || 'Unassigned'}</option>)}</select></label>
      <label><span>From</span><input type="datetime-local" value={from} onChange={event => setFrom(event.target.value)}/></label>
      <label><span>To</span><input type="datetime-local" value={to} onChange={event => setTo(event.target.value)}/></label>
      <button className="button button-primary" type="submit" disabled={loadingPoints || !workerId}><Clock3 size={14}/>{loadingPoints ? 'Loading…' : 'Show history'}</button>
    </form>
    <div className="history-stats"><div><span>Worker</span><b>{selectedWorker?.name ?? '—'}</b></div><div><span>Recorded points</span><b>{points.length}</b></div><div><span>Period</span><b>{points.length ? `${displayTime(points[0].observed_at)} → ${displayTime(points[points.length - 1].observed_at)}` : 'No recorded movement'}</b></div><div><span>Data source</span><b>{points.length === 0 ? '—' : simulatedCount === points.length ? 'DEMO · simulated' : simulatedCount ? 'Mixed · live and demo' : 'RTLS feed'}</b></div></div>
    <section className="history-map-card"><div className="directory-card-head"><div><h3>{selectedMap ? `${selectedMap.name} · v${selectedMap.version}` : 'Recorded path'}</h3><p>{selectedMap ? 'Map version linked to the most recent point' : 'No mapped position points in this time range'}</p></div><span className="history-point-count"><Route size={14}/>{plotted.length} mapped points</span></div>
      {selectedMap?.previewUrl && plotted.length ? <><div className="history-map"><img src={selectedMap.previewUrl} alt={`${selectedMap.name} floor plan`}/><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Recorded route for ${selectedWorker?.name ?? 'worker'}`}><polyline points={path}/>{plotted.map((point, index) => <circle key={`${point.observed_at}-${index}`} cx={Math.max(0, Math.min(100, point.xPercent!))} cy={Math.max(0, Math.min(100, point.yPercent!))} r={index === plotted.length - 1 ? 1.5 : 0.65} className={index === plotted.length - 1 ? 'history-point latest' : 'history-point'}/>)}</svg>{plotted.length > 1 && <><span className="history-marker start" style={{left:`${Math.max(0, Math.min(100, plotted[0].xPercent!))}%`,top:`${Math.max(0, Math.min(100, plotted[0].yPercent!))}%`}}>START</span><span className="history-marker end" style={{left:`${Math.max(0, Math.min(100, plotted[plotted.length - 1].xPercent!))}%`,top:`${Math.max(0, Math.min(100, plotted[plotted.length - 1].yPercent!))}%`}}>LATEST</span></>}</div><div className="history-map-legend"><span><i className="history-legend-dot"/> Recorded route</span><span><i className="history-legend-start"/> Start</span><span><i className="history-legend-end"/> Latest position</span></div></> : <div className="history-empty"><MapPin size={24}/><b>{points.length ? 'No positions map to a published map version' : loadingPoints ? 'Loading recorded positions…' : 'No position data for this worker and time range'}</b><span>{points.length ? 'Publish the matching map version to display this route.' : 'Start the development demo feed or configure RTLS position ingestion to record positions.'}</span></div>}
    </section>
    {points.length > 0 && <section className="directory-card"><div className="directory-card-head"><div><h3>Position samples</h3><p>Raw coordinates and timestamps from the selected range</p></div></div><div className="directory-table"><div className="history-table-head"><span>TIME</span><span>X (m)</span><span>Y (m)</span><span>CONFIDENCE</span><span>SOURCE</span></div>{points.slice(-100).reverse().map((point, index) => <div className="history-table-row" key={`${point.observed_at}-${index}`}><span>{displayTime(point.observed_at)}</span><span>{point.x.toFixed(2)}</span><span>{point.y.toFixed(2)}</span><span>{point.confidence == null ? '—' : `${Math.round(point.confidence * 100)}%`}</span><span>{point.source === 'simulated' ? 'DEMO' : point.source ?? 'RTLS'}</span></div>)}</div>{points.length > 100 && <p className="history-truncated">Showing the latest 100 of {points.length} samples.</p>}</section>}
  </section>;
}
