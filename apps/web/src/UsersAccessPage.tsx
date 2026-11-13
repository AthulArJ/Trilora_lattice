import { useEffect, useState, type FormEvent } from 'react';
import { Check, KeyRound, MailPlus, RefreshCw, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type WorkspaceUser = { id: string; email: string; display_name: string; role: 'admin' | 'viewer'; status: 'active' | 'invited' | 'suspended'; created_at: string; last_sign_in_at: string | null };

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Never';
}

export default function UsersAccessPage({ session }: { session: Session | null }) {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<string, 'admin' | 'viewer'>>({});
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/v1/admin/users`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load workspace users');
      setUsers(result.data ?? []);
      setPendingRoles({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load workspace users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session?.access_token]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('invite'); setError(''); setNotice('');
    try {
      const response = await fetch(`${API}/api/v1/admin/users/invite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ email: email.trim(), display_name: displayName.trim(), role: inviteRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not send invitation');
      setEmail(''); setDisplayName(''); setInviteRole('viewer');
      setNotice(`Invitation sent to ${result.data.email}. Pending invitations appear in the list below.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send invitation');
    } finally {
      setBusy('');
    }
  }

  async function saveRole(user: WorkspaceUser) {
    const role = pendingRoles[user.id];
    if (!role || role === user.role) return;
    setBusy(user.id); setError(''); setNotice('');
    try {
      const response = await fetch(`${API}/api/v1/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not update user role');
      setUsers(current => current.map(item => item.id === user.id ? { ...item, role: result.data.role } : item));
      setPendingRoles(current => { const next = { ...current }; delete next[user.id]; return next; });
      setNotice(`${user.email} now has ${role} access.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update user role');
    } finally {
      setBusy('');
    }
  }

  async function manageUser(user: WorkspaceUser, action: 'resend' | 'password-reset' | 'delete') {
    const isDelete = action === 'delete';
    if (isDelete && !window.confirm(`Permanently remove ${user.email} from this workspace? Their login will be deleted. Historical audit entries will remain with their email recorded.`)) return;
    setBusy(user.id); setError(''); setNotice('');
    try {
      const response = await fetch(`${API}/api/v1/admin/users/${encodeURIComponent(user.id)}${action === 'resend' ? '/resend' : action === 'password-reset' ? '/password-reset' : ''}`, {
        method: isDelete ? 'DELETE' : 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not complete the account action');
      if (isDelete) {
        setUsers(current => current.filter(item => item.id !== user.id));
        setNotice(`${user.email} was removed from the workspace.`);
      } else {
        setNotice(action === 'resend' ? `A fresh invitation was sent to ${user.email}.` : `Password setup email sent to ${user.email}.`);
        if (action === 'resend') await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the account action');
    } finally {
      setBusy('');
    }
  }

  return <section className="user-access-page">
    <div className="directory-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> ADMINISTRATION</span><h2>Users & access</h2><p>Invite trusted operators and manage workspace permissions.</p></div><button className="button button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    <div className="audit-note"><ShieldCheck size={16}/><span><b>Invitation-only access.</b> New accounts receive an email invitation; public self-registration stays disabled.</span></div>
    {error && <div className="map-error" role="alert">{error}</div>}
    {notice && <div className="user-access-notice" role="status"><Check size={15}/>{notice}</div>}
    <form className="user-invite-form" onSubmit={event => void invite(event)}>
      <div className="user-invite-heading"><span><MailPlus size={16}/></span><div><b>Invite a teammate</b><small>Supabase email delivery must be configured for invitations to arrive.</small></div></div>
      <div className="user-invite-fields"><label>Name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Optional display name" autoComplete="name"/></label><label>Email address<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email"/></label><label>Role<select value={inviteRole} onChange={event => setInviteRole(event.target.value as 'admin' | 'viewer')}><option value="viewer">Viewer · read only</option><option value="admin">Administrator</option></select></label><button className="button button-primary" disabled={busy === 'invite'}><MailPlus size={14}/>{busy === 'invite' ? 'Sending…' : 'Send invitation'}</button></div>
    </form>
    <div className="user-list-heading"><div><h3>Workspace accounts</h3><p>{users.length} {users.length === 1 ? 'account' : 'accounts'} · role changes are recorded in the audit log</p></div><Users size={17}/></div>
    {loading ? <div className="maps-loading">Loading workspace users…</div> : users.length === 0 ? <div className="incident-empty"><div><UserRound size={22}/></div><b>No accounts found</b><span>Workspace accounts and pending invitations appear here.</span></div> : <div className="user-list">{users.map(user => {
      const role = pendingRoles[user.id] ?? user.role;
      const changed = role !== user.role;
      const isSelf = user.id === session?.user.id;
      const isBusy = busy === user.id;
      return <article className="user-row" key={user.id}>
        <div className="user-row-icon"><UserRound size={16}/></div><div className="user-row-identity"><b>{user.display_name || user.email}{isSelf ? ' · You' : ''}</b><span>{user.email}</span></div><span className={`user-status user-status-${user.status}`}>{user.status === 'active' ? 'Active' : user.status === 'suspended' ? 'Suspended' : 'Invitation pending'}</span><div className="user-row-last-seen"><small>Last sign in</small><span>{date(user.last_sign_in_at)}</span></div><div className="user-row-controls"><div className="user-role-editor"><select aria-label={`Role for ${user.email}`} value={role} disabled={isSelf} onChange={event => setPendingRoles(current => ({ ...current, [user.id]: event.target.value as 'admin' | 'viewer' }))}><option value="viewer">Viewer</option><option value="admin">Administrator</option></select><button className="button button-secondary" disabled={!changed || isBusy || isSelf} onClick={() => void saveRole(user)}>{isBusy && changed ? 'Saving…' : 'Save'}</button></div><div className="user-row-actions">{user.status === 'invited' ? <button className="button button-secondary user-action-button" aria-label={`Resend invitation to ${user.email}`} title="Resend invitation" disabled={isBusy} onClick={() => void manageUser(user, 'resend')}><MailPlus size={13}/><span>Resend</span></button> : user.status === 'active' ? <button className="button button-secondary user-action-button" aria-label={`Send password setup email to ${user.email}`} title="Send password setup email" disabled={isBusy || isSelf} onClick={() => void manageUser(user, 'password-reset')}><KeyRound size={13}/><span>Password email</span></button> : null}{!isSelf && <button className="button button-secondary user-action-button user-action-danger" aria-label={`Remove ${user.email}`} title="Permanently remove account" disabled={isBusy} onClick={() => void manageUser(user, 'delete')}><Trash2 size={13}/><span>Remove</span></button>}</div></div>
      </article>;
    })}</div>}
  </section>;
}
