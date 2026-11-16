import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { initialSetupPending, passwordAuthenticated, persistSetupPending, setupCallback, setupWasPending } from './passwordSetup';

type Role = 'admin' | 'viewer';
type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  setupSession: Session | null;
  setupPending: boolean;
  authError: string | null;
  displayName: string;
  role: Role;
  signIn: (email: string, password: string) => Promise<string | null>;
  setPassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [setupPending, setSetupPending] = useState(initialSetupPending);
  const [authError, setAuthError] = useState<string | null>(null);
  const pendingRef = useRef(initialSetupPending);
  const revision = useRef(0);
  const passwordSavedFor = useRef<string | null>(null);
  const callbackAccepted = useRef(false);
  const setupAttempt = useRef(0);
  const session = !setupPending && passwordAuthenticated(authSession) ? authSession : null;
  const [role, setRole] = useState<Role>('viewer');
  const [profileName, setProfileName] = useState<{ userId: string; name: string } | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    function requireSetup() {
      pendingRef.current = true;
      persistSetupPending(true);
      setSetupPending(true);
    }
    async function accept(candidate: Session | null, recovery = false) {
      const request = ++revision.current;
      setLoading(true);
      if (recovery || (candidate && !passwordAuthenticated(candidate))) requireSetup();
      if (pendingRef.current) persistSetupPending(true);
      try {
        if (setupCallback.invalid || (!callbackAccepted.current && setupCallback.token && candidate?.access_token !== setupCallback.token)) {
          throw new Error('This invitation or recovery link is invalid or expired. Request a fresh link.');
        }
        if (candidate) {
          const { data, error } = await supabase!.auth.getUser(candidate.access_token);
          if (error || data.user?.id !== candidate.user.id) throw new Error('This session is invalid or expired. Request a fresh link or sign in again.');
          callbackAccepted.current = true;
        }
        if (!alive || request !== revision.current) return;
        setAuthSession(candidate);
        setAuthError(candidate || !pendingRef.current ? null : 'This invitation or recovery link is invalid or expired. Request a fresh link.');
      } catch (error) {
        if (!alive || request !== revision.current) return;
        setAuthSession(null);
        setAuthError(error instanceof Error ? error.message : 'Could not validate your session.');
      } finally {
        if (alive && request === revision.current) setLoading(false);
      }
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT') { ++setupAttempt.current; passwordSavedFor.current = null; }
      // No Supabase calls inside its auth callback: validation runs after its lock is released.
      if (event === 'PASSWORD_RECOVERY') requireSetup();
      queueMicrotask(() => { if (alive) void accept(nextSession, event === 'PASSWORD_RECOVERY'); });
    });
    const initialRequest = revision.current;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (alive && revision.current === initialRequest) {
        if (error) { setAuthError(error.message); setLoading(false); }
        else void accept(data.session);
      }
    });
    const storageChanged = () => { if (setupWasPending()) requireSetup(); };
    const callbackChanged = () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.has('access_token') || hash.has('error') || ['invite', 'recovery'].includes(hash.get('type') || '')) {
        requireSetup();
        // Supabase consumes callbacks only during client initialization. A link
        // opened on this already-mounted page must initialize and validate again.
        window.location.reload();
      }
    };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('hashchange', callbackChanged);
    return () => { alive = false; ++setupAttempt.current; listener.subscription.unsubscribe(); window.removeEventListener('storage', storageChanged); window.removeEventListener('hashchange', callbackChanged); };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadRole() {
      if (!supabase || !session?.user) { setRole(supabaseConfigured ? 'viewer' : 'admin'); setProfileName(null); return; }
      const { data } = await supabase.from('profiles').select('role,display_name').eq('id', session.user.id).maybeSingle();
      if (alive) {
        setRole(data?.role === 'admin' ? 'admin' : 'viewer');
        setProfileName(data?.display_name?.trim() ? { userId: session.user.id, name: data.display_name.trim() } : null);
      }
    }
    void loadRole();
    return () => { alive = false; };
  }, [session]);

  const value = useMemo<AuthState>(() => ({
    configured: supabaseConfigured,
    loading,
    session,
    setupSession: setupPending ? authSession : null,
    setupPending,
    authError,
    displayName: (profileName && profileName.userId === session?.user.id ? profileName.name : null)
      || (typeof session?.user.user_metadata?.display_name === 'string' && session.user.user_metadata.display_name.trim())
      || (typeof session?.user.user_metadata?.full_name === 'string' && session.user.user_metadata.full_name.trim())
      || (typeof session?.user.user_metadata?.name === 'string' && session.user.user_metadata.name.trim())
      || session?.user.email?.split('@')[0]
      || 'Workspace Admin',
    role,
    signIn: async (email, password) => {
      if (!supabase) return 'Supabase is not configured yet.';
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    },
    setPassword: async password => {
      if (!supabase) return 'Supabase is not configured yet.';
      if (!setupPending || !authSession?.user.email) return 'A valid invitation or recovery session is required.';
      if (password.length < 8) return 'Use a password with at least 8 characters.';
      const attempt = ++setupAttempt.current;
      const email = authSession.user.email;
      const userId = authSession.user.id;
      if (passwordSavedFor.current !== userId) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return error.message;
        if (attempt !== setupAttempt.current) return 'Password setup was interrupted. Reopen your invitation or recovery link.';
        passwordSavedFor.current = userId;
      }
      // Link-created OTP sessions never authorize workspace access. Obtain a password session
      // only after updateUser succeeds; neither USER_UPDATED nor SIGNED_IN completes setup.
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (attempt !== setupAttempt.current) return 'Password setup was interrupted. Reopen your invitation or recovery link.';
      if (error || data.user?.id !== userId || !passwordAuthenticated(data.session)) return error?.message || 'Password saved, but sign-in could not be completed. Retry with the password you just set.';
      ++revision.current;
      passwordSavedFor.current = null;
      pendingRef.current = false;
      persistSetupPending(false);
      setSetupPending(false);
      setAuthSession(data.session);
      setAuthError(null);
      setLoading(false);
      return null;
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
  }), [loading, session, role, profileName, setupPending, authSession, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
