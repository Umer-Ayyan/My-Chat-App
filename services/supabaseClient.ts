// src/services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

/**
 * persistSession: true -> ensures session is saved in localStorage so refresh keeps you signed-in.
 * detectSessionInUrl: false -> avoids SPA sign-in URL handling issues.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: false,
  },
});
