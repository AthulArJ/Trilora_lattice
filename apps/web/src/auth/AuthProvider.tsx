import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';

type Role = 'admin' | 'viewer';
type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  displayName: string;
  role: Role;
  signIn: (email: string, password: string) => Promise<string | null>;
  setPassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>('viewer');
  const [profileName, setProfileName] = useState<{ userId: string; name: string } | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setLoading(false);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
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
      const { error } = await supabase.auth.updateUser({ password });
      return error?.message ?? null;
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
  }), [loading, session, role, profileName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
