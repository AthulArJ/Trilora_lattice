import { useState, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowRight, Box, Eye, EyeOff, Layers3, LockKeyhole, Mail, MapPin, ShieldCheck, X } from 'lucide-react';
import { useAuth } from './AuthProvider';
import BrandLogo from '../components/BrandLogo';

const capabilities = [
  { icon: MapPin, label: 'People' },
  { icon: Box, label: 'Assets' },
  { icon: Layers3, label: 'Zones' },
  { icon: Activity, label: 'Operations' },
];

export function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, session, signIn, setPassword: updatePassword } = useAuth();
  const [inviteFlow, setInviteFlow] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return hash.get('type') === 'invite' || query.get('type') === 'invite' || hash.has('access_token');
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupInfo, setShowSignupInfo] = useState(false);

  if (!configured && import.meta.env.DEV) return <>{children}</>;
  if (configured && session && !loading && !inviteFlow) return <>{children}</>;
  if (loading) return <div className="auth-loading"><div className="auth-spinner"/><span>Checking your session…</span></div>;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (inviteFlow) {
        if (!session) { setError('This invitation link is invalid or expired. Ask your administrator to send a new invitation.'); return; }
        if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
        if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
        const message = await updatePassword(password);
        if (message) { setError(message); return; }
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        setInviteFlow(false);
        setPassword(''); setConfirmPassword('');
      } else {
        const message = await signIn(email.trim(), password);
        if (message) setError(message);
      }
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return <main className="login-shell login-isometric">
    <section className="login-overview" aria-labelledby="login-story-title">
      <header className="login-brand"><BrandLogo/></header>
      <div className="login-story">
        <span className="login-eyebrow">CONNECTED OPERATIONS</span>
        <h1 id="login-story-title">One connected view of <em>your operations</em></h1>
        <p>People, assets, zones and events in one workspace.</p>
      </div>
      <figure className="login-campus"><img src="/brand/login-architectural-campus.png" alt="Architectural 3D isometric industrial campus with glass offices, manufacturing and warehouse interiors, a utility plant and landscaped courtyards"/></figure>
      <ul className="login-capabilities" aria-label="Connected workspace capabilities">
        {capabilities.map(({ icon: Icon, label }) => <li key={label}><Icon size={18} strokeWidth={1.7}/><span>{label}</span></li>)}
      </ul>
      <p className="login-overview-note">Clarity across your workspace. Confidence in every decision.</p>
    </section>
    <section className="login-access login-access-plum" data-theme="dark" aria-labelledby="login-title">
      <div className="login-access-brand"><BrandLogo/></div>
      <div className="login-access-art"><div className="login-art-visual" aria-hidden="true"><div className="login-art-aura"/><div className="login-sculpture"><div className="login-slab login-slab-back"/><div className="login-slab login-slab-middle"/><div className="login-slab login-slab-front"/><div className="login-sculpture-cap"/></div></div></div>
      <div className="login-card">
        <div className="login-card-heading"><span className="login-card-kicker">WORKSPACE ACCESS</span></div>
        <h2 id="login-title">{inviteFlow ? 'Set up your workspace access' : 'Welcome to Lattice'}</h2>
        <p className="login-introduction">{inviteFlow ? <>Create a password to activate <strong>{session?.user.email ?? 'your invited account'}</strong>.</> : 'Your operations, in focus.'}</p>
        <form onSubmit={submit} className="login-form" aria-busy={busy}>
          {!configured && <div className="login-error" role="alert">Workspace sign-in is unavailable because authentication is not configured. Contact your administrator.</div>}
          {!inviteFlow && <label htmlFor="login-email"><span>Email address</span><div className="login-input-field"><Mail size={18} aria-hidden="true"/><input id="login-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="you@company.com" value={email} onChange={event => setEmail(event.target.value)}/></div></label>}
          <label htmlFor="login-password"><span>{inviteFlow ? 'New password' : 'Password'}</span><div className="login-input-field password-field"><LockKeyhole size={18} aria-hidden="true"/><input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete={inviteFlow ? 'new-password' : 'current-password'} minLength={inviteFlow ? 8 : undefined} required placeholder={inviteFlow ? 'Create a password (8+ characters)' : 'Enter your password'} value={password} onChange={event => setPassword(event.target.value)}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>
          {inviteFlow && <label htmlFor="login-confirm-password"><span>Confirm password</span><div className="login-input-field"><LockKeyhole size={18} aria-hidden="true"/><input id="login-confirm-password" type="password" autoComplete="new-password" minLength={8} required placeholder="Re-enter your password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></div></label>}
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit" type="submit" disabled={busy || !configured}><span>{!configured ? 'Sign-in unavailable' : busy ? inviteFlow ? 'Setting password…' : 'Signing in…' : inviteFlow ? 'Set password & continue' : 'Sign in'}</span><span className="login-submit-arrow" aria-hidden="true"><ArrowRight size={19}/></span></button>
        </form>
        <div className="login-security"><ShieldCheck size={17} aria-hidden="true"/><span>Secure, invitation only workspace access</span></div>
        {!inviteFlow && <div className="login-signup-area"><p>Need access to Lattice?</p><button className="login-signup-trigger" type="button" onClick={() => setShowSignupInfo(true)}><span>Sign up</span><ArrowRight size={14} aria-hidden="true"/></button></div>}
      </div>
      <footer className="login-access-footer"><span>Powered by</span><img src="/brand/trilora-login-lockup.png" alt="TRILORA — Integrated Intelligence"/></footer>
      {showSignupInfo && <div className="signup-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowSignupInfo(false); }}>
        <section className="signup-dialog" role="dialog" aria-modal="true" aria-labelledby="signup-dialog-title" aria-describedby="signup-dialog-description">
          <button className="signup-dialog-close" type="button" aria-label="Close sign-up information" onClick={() => setShowSignupInfo(false)}><X size={18}/></button>
          <span className="signup-dialog-kicker">LATTICE WORKSPACE</span>
          <h3 id="signup-dialog-title">Request workspace access</h3>
          <p id="signup-dialog-description">Lattice is an invitation only workspace. Need an account? Get in touch with our team and we’ll help you get started.</p>
          <div className="signup-contact-row"><span>Developer / system admin</span><strong>Athul.Trilora@protonmail.com</strong></div>
          <a className="signup-contact-row signup-support-link" href="mailto:support@trilora.net"><span>Support</span><strong><Mail size={15}/> support@trilora.net</strong><ArrowRight size={16}/></a>
        </section>
      </div>}
    </section>
  </main>;
}
