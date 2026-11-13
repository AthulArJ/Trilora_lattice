import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Battery, Check, ClipboardCheck, Copy, Download, Radio, Siren, Users } from 'lucide-react';
import './shift-handover.css';

type HandoverWorker = { id: string; name: string; role: string; tagId: string; status: string; battery: number | null };
type HandoverIncident = { id: string; worker: string; tagId: string; status: string; area: string; createdAt: string; simulated?: boolean };
type HandoverAnchor = { id: string; label: string; state: string; mapId: string | null; xPercent: number | null; yPercent: number | null };
type FollowUp = { key: string; level: 'urgent' | 'attention' | 'info'; title: string; detail: string; action: string; onClick: () => void };

export default function ShiftHandoverPage({ workers, incidents, anchors, actions, apiState, demoModeActive, latestPositionTime, positionStreamStale, onNotify }: {
  workers: HandoverWorker[]; incidents: HandoverIncident[]; anchors: HandoverAnchor[]; actions: FollowUp[];
  apiState: string; demoModeActive: boolean; latestPositionTime: string; positionStreamStale: boolean; onNotify: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const openIncidents = incidents.filter(incident => incident.status !== 'resolved');
  const assigned = workers.filter(worker => worker.tagId).length;
  const reporting = workers.filter(worker => worker.status === 'online').length;
  const lowBattery = workers.filter(worker => worker.battery !== null && worker.battery < 20);
  const anchorsNeedingAttention = anchors.filter(anchor => anchor.state !== 'online' || !anchor.mapId || anchor.xPercent === null || anchor.yPercent === null);
  const handoverText = useMemo(() => {
    const lines = [
      'LATTICE · SHIFT HANDOVER',
      `Generated: ${new Date().toLocaleString()}`,
      demoModeActive ? 'DATA MODE: LOCAL SIMULATION · DEMO ONLY' : `DATA MODE: ${apiState}`,
      '',
      'SAFETY',
      `Open incidents: ${openIncidents.length}`,
      ...openIncidents.map(item => `- ${item.status === 'active' ? 'UNACKNOWLEDGED' : 'ACKNOWLEDGED'} · ${item.worker} · ${item.area} · ${new Date(item.createdAt).toLocaleString()}${item.simulated ? ' · SIMULATED' : ''}`),
      '',
      'WORKFORCE & BADGES',
      `Workers: ${workers.length} · Badges assigned: ${assigned}/${workers.length} · Reporting: ${reporting}/${workers.length}`,
      `Low battery (<20%): ${lowBattery.length}${lowBattery.length ? ` · ${lowBattery.map(worker => `${worker.name} (${worker.battery}%)`).join(', ')}` : ''}`,
      '',
      'DEVICE & POSITIONING READINESS',
      `Positioning: ${demoModeActive ? 'Local simulation only' : !latestPositionTime ? 'No position events received' : positionStreamStale ? 'Position events delayed' : 'Position events current'}`,
      `Anchors needing attention or placement: ${anchorsNeedingAttention.length}`,
      ...anchorsNeedingAttention.map(anchor => `- ${anchor.label} · ${anchor.state}${!anchor.mapId || anchor.xPercent === null || anchor.yPercent === null ? ' · placement pending' : ''}`),
      '',
      'OPEN FOLLOW-UP',
      ...(actions.length ? actions.map(item => `- ${item.level.toUpperCase()} · ${item.title} — ${item.detail}`) : ['- No unresolved follow-up items reported.']),
      '',
      'Review live system status before using demo or sample data for operational decisions.',
    ];
    return lines.join('\n');
  }, [actions, anchorsNeedingAttention, apiState, assigned, demoModeActive, latestPositionTime, lowBattery, openIncidents, positionStreamStale, reporting, workers]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(handoverText);
      setCopied(true); onNotify('Handover summary copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch { onNotify('Clipboard access is unavailable. Use Download summary instead.'); }
  }
  function downloadSummary() {
    const blob = new Blob([handoverText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `lattice-handover-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click(); URL.revokeObjectURL(url);
    onNotify('Handover summary downloaded');
  }

  return <div className="handover-page">
    <section className={`handover-banner ${demoModeActive ? 'handover-demo' : ''}`}>
      <span className="handover-banner-icon"><ClipboardCheck size={20}/></span>
      <div><b>{demoModeActive ? 'Demo handover · simulated data' : 'Shift handover snapshot'}</b><small>{demoModeActive ? 'This summary reflects local demo state. It is not stored or sent to the server.' : 'A point-in-time summary from the data currently available in this workspace.'}</small></div>
      <div className="handover-actions"><button className="button button-secondary" onClick={() => void copySummary()}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy summary'}</button><button className="button button-primary" onClick={downloadSummary}><Download size={14}/> Download .txt</button></div>
    </section>
    <div className="handover-metrics">
      <article><span className="handover-metric-icon handover-red"><Siren size={17}/></span><small>OPEN INCIDENTS</small><b>{openIncidents.length}</b><span>{openIncidents.filter(item => item.status === 'active').length} awaiting acknowledgement</span></article>
      <article><span className="handover-metric-icon handover-blue"><Users size={17}/></span><small>WORKFORCE COVERAGE</small><b>{assigned}<i> / {workers.length}</i></b><span>badges assigned · {reporting} reporting</span></article>
      <article><span className="handover-metric-icon handover-amber"><Battery size={17}/></span><small>BADGE HEALTH</small><b>{lowBattery.length}</b><span>badges below 20% battery</span></article>
      <article><span className="handover-metric-icon handover-green"><Radio size={17}/></span><small>POSITIONING</small><b>{demoModeActive ? 'Demo' : !latestPositionTime ? 'Waiting' : positionStreamStale ? 'Delayed' : 'Current'}</b><span>{anchorsNeedingAttention.length} anchors need attention or placement</span></article>
    </div>
    <div className="handover-columns">
      <section className="panel handover-panel"><div className="panel-heading"><div><h2>Safety items to hand over</h2><p>Incidents still requiring operator follow-up</p></div><span className={`handover-count ${openIncidents.length ? 'has-incidents' : ''}`}>{openIncidents.length}</span></div>
        {openIncidents.length ? <div className="handover-list">{openIncidents.map(item => <article className="handover-incident" key={item.id}><span><Siren size={15}/></span><div><b>{item.worker}</b><small>{item.area} · {item.tagId}</small><em>{item.status === 'active' ? 'Awaiting acknowledgement' : 'Acknowledged · resolution pending'}{item.simulated ? ' · SIMULATED' : ''}</em></div><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div> : <div className="handover-empty"><Check size={18}/><b>No open incidents</b><small>No active incident is present in the current data snapshot.</small></div>}
      </section>
      <section className="panel handover-panel"><div className="panel-heading"><div><h2>Unresolved follow-up</h2><p>Operational checks to pass to the next shift</p></div><span className="handover-count">{actions.length}</span></div>
        {actions.length ? <div className="handover-list">{actions.slice(0, 8).map(item => <article className="handover-followup" key={item.key}><span className={`followup-level followup-${item.level}`}><AlertTriangle size={14}/></span><div><b>{item.title}</b><small>{item.detail}</small></div><button className="handover-open" onClick={item.onClick}>{item.action}<ArrowUpRight size={12}/></button></article>)}</div> : <div className="handover-empty"><Check size={18}/><b>All current checks clear</b><small>No unresolved actions were reported in this snapshot.</small></div>}
      </section>
    </div>
    <div className="handover-footnote">Snapshot generated {new Date().toLocaleString()} · {demoModeActive ? 'Local demo state only' : `Connection: ${apiState}`} · Recheck live status at shift start.</div>
  </div>;
}
