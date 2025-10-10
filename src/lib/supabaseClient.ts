// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const urlEnv = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!urlEnv || !anon) {
  throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

// Se vier relativo (ex.: "/api/supabase"), monta absoluto com o origin atual
const url = urlEnv.startsWith('http') ? urlEnv : `${window.location.origin}${urlEnv}`;

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
