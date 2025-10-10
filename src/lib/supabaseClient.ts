// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

function resolveSupabaseUrl(raw?: string) {
  const val = raw || '/api/supabase';
  const isAbsolute = /^https?:\/\//i.test(val);
  if (isAbsolute) return val;

  // Garante absoluta no browser (produção/vercel)
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : ''; // em SSR não será usado
  const path = val.startsWith('/') ? val : `/${val}`;
  return `${origin}${path}`;
}

const url  = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-proxy';

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
