import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Check, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type AuditEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: { email?: string | null; display_name?: string | null } | null;
};

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function displayValue(value: unknown) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export default function AuditLogPage({ session }: { session: Session | null }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/v1/audit-log`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load audit history');
      setEntries(result.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load audit history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session?.access_token]);

  const filtered = useMemo(() => entries.filter(entry => {
    const details = Object.entries(entry.details ?? {}).map(([key, value]) => `${key} ${displayValue(value)}`).join(' ');
    const actor = entry.profiles?.display_name || entry.profiles?.email || entry.details?.actor_name_snapshot || entry.details?.actor_email_snapshot || '';
    return `${entry.action} ${entry.entity_type} ${entry.entity_id ?? ''} ${actor} ${details}`.toLowerCase().includes(query.toLowerCase());
  }), [entries, query]);

  return <section className="audit-page">
    <div className="directory-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> ADMINISTRATION</span><h2>Audit log</h2><p>Review operator and administrator actions recorded in this workspace.</p></div><button className="button button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    <div className="audit-note"><ShieldCheck size={16}/><span><b>Admin-only activity history.</b> Entries are written by the backend and are not editable from this page.</span></div>
    {error && <div className="map-error" role="alert">{error}</div>}
    <div className="audit-toolbar"><div className="audit-count"><Activity size={16}/><span><b>{entries.length}</b> recent actions</span></div><label className="search-box"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search action, actor, or record…"/></label></div>
    {loading ? <div className="maps-loading">Loading audit history…</div> : filtered.length === 0 ? <div className="incident-empty"><div><Activity size={22}/></div><b>{entries.length ? 'No matching activity' : 'No recorded activity yet'}</b><span>{entries.length ? 'Try a different search.' : 'Actions such as incident responses, tag assignments, and record creation will appear here.'}</span></div> : <div className="audit-list">{filtered.map(entry => {
      const actorSnapshot = entry.details?.actor_name_snapshot ?? entry.details?.actor_email_snapshot;
      const actor = entry.profiles?.display_name || entry.profiles?.email || (typeof actorSnapshot === 'string' ? actorSnapshot : entry.actor_id ? 'Workspace administrator' : 'System');
      const details = Object.entries(entry.details ?? {}).filter(([key]) => !key.startsWith('actor_'));
      const Icon = entry.action.includes('incident_resolved') ? Check : entry.action.includes('incident_acknowledged') ? ShieldCheck : entry.action.includes('worker') ? Users : entry.action.includes('sos') ? AlertTriangle : Activity;
      return <article className="audit-entry" key={entry.id}>
        <span className="audit-entry-icon"><Icon size={15}/></span>
        <div className="audit-entry-main"><div className="audit-entry-title"><b>{label(entry.action)}</b><span>{label(entry.entity_type)}{entry.entity_id ? ` · ${entry.entity_id}` : ''}</span></div><div className="audit-entry-meta"><span>{actor}</span><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></div>{details.length > 0 && <div className="audit-entry-details">{details.map(([key, value]) => <span key={key}><b>{label(key)}:</b> {displayValue(value)}</span>)}</div>}</div>
      </article>;
    })}</div>}
  </section>;
}
