import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, LockKeyhole, MapPin, Navigation, Radio, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';

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

  if (!configured || (session && !loading && !inviteFlow)) return <>{children}</>;
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

  return <main className="login-shell"><div className="login-frame"><div className="login-layout">
    <section className="login-story" aria-label="LATTICE airport operations">
      <div className="login-brand"><img src="/brand/lattice-glossy-source.png" alt=""/><div><b>LATTICE</b><small>POWERED BY TRILORA</small></div></div>
      <div className="login-story-copy"><span className="login-pilot-label"><i/> AIRPORT PILOT · TEST ENVIRONMENT</span><h1>One clear view of airport operations.</h1><p>Workforce visibility, tag health and incident response in one protected workspace.</p></div>
      <div className="login-map-visual" aria-hidden="true"><div className="login-map-grid"/><div className="login-map-building building-one"><span/><span/><span/></div><div className="login-map-building building-two"><span/><span/></div><div className="login-map-corridor"/><div className="login-map-path"/><div className="login-map-anchor anchor-one"><Radio size={13}/></div><div className="login-map-anchor anchor-two"><Radio size={13}/></div><div className="login-map-worker"><MapPin size={14}/><span>Workforce visibility</span></div><span className="login-map-caption">ILLUSTRATIVE TEST AREA · NOT LIVE POSITION DATA</span></div>
      <div className="login-story-foot"><ShieldCheck size={15}/><span>Invitation-only access <i/> Managed by your administrator</span></div>
    </section>
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-card-top"><span className="login-lock"><LockKeyhole size={17}/></span><span className="login-secure-label">SECURE WORKSPACE</span></div>
      <div className="login-intro"><h2 id="login-title">{inviteFlow ? 'Set your password' : 'Welcome back'}</h2><p>{inviteFlow ? `Create a password to activate ${session?.user.email ?? 'your invited account'}.` : 'Sign in with your invited account to continue.'}</p></div>
      <form onSubmit={submit} className="login-form">{!inviteFlow && <label>Email address<input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)}/></label>}<label>{inviteFlow ? 'New password' : 'Password'}<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={inviteFlow ? 'new-password' : 'current-password'} minLength={inviteFlow ? 8 : undefined} required placeholder={inviteFlow ? 'Create a password (8+ characters)' : 'Enter your password'} value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>{inviteFlow && <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required placeholder="Re-enter your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></label>}{error && <div className="login-error" role="alert">{error}</div>}<button className="login-submit" disabled={busy}>{busy ? inviteFlow ? 'Setting password…' : 'Signing in…' : inviteFlow ? 'Set password & continue' : 'Sign in'}<Navigation size={15}/></button></form>
      <div className="login-invite-note"><ShieldCheck size={15}/><span><b>Access is invitation-only</b><small>Contact your administrator if you need an account.</small></span></div>
      <div className="login-foot"><span>LATTICE · Powered by Trilora</span><span>Protected pilot</span></div>
    </section>
  </div></div><div className="login-caption">BLE AoA workforce visibility · Airport pilot</div></main>;
}
