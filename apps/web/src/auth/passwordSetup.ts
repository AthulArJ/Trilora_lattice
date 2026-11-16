import type { Session } from '@supabase/supabase-js';

const pendingKey = 'lattice-password-setup-pending';

// Capture before createClient processes (and removes) the callback fragment.
const callback = new URL(window.location.href);
const fragment = new URLSearchParams(callback.hash.slice(1));
const type = fragment.get('type') || callback.searchParams.get('type');
export const setupCallback = {
  required: type === 'invite' || type === 'recovery' || fragment.has('access_token') || callback.searchParams.has('code'),
  token: fragment.get('access_token'),
  invalid: fragment.has('error') || fragment.has('error_code') || callback.searchParams.has('error') || callback.searchParams.has('error_code'),
};

export function passwordAuthenticated(session: Session | null): boolean {
  if (!session) return false;
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part));
    return Array.isArray(claims.amr) && claims.amr.some((entry: { method?: string }) => entry.method === 'password');
  } catch { return false; }
}

export function setupWasPending(): boolean {
  try { return localStorage.getItem(pendingKey) === 'true'; } catch { return false; }
}

export function persistSetupPending(pending: boolean) {
  try {
    if (pending) localStorage.setItem(pendingKey, 'true');
    else localStorage.removeItem(pendingKey);
  } catch { /* The URL marker and token authentication method still enforce the gate. */ }
  const url = new URL(window.location.href);
  if (pending) url.searchParams.set('setup', 'pending');
  else {
    url.searchParams.delete('setup');
    if (['invite', 'recovery'].includes(url.searchParams.get('type') || '')) url.searchParams.delete('type');
    url.searchParams.delete('code');
    url.hash = '';
  }
  window.history.replaceState(window.history.state, '', url);
}

export const initialSetupPending = setupCallback.required || setupCallback.invalid || callback.searchParams.get('setup') === 'pending' || setupWasPending();
