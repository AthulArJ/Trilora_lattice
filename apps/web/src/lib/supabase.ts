import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __LATTICE_RUNTIME_CONFIG__?: {
      supabaseUrl?: string;
      supabasePublishableKey?: string;
    };
  }
}

const url = (window.__LATTICE_RUNTIME_CONFIG__?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL)?.trim();
const anonKey = (window.__LATTICE_RUNTIME_CONFIG__?.supabasePublishableKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = supabaseConfigured ? createClient(url!, anonKey!) : null;
