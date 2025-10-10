import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL || '/api/supabase';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-proxy';

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
