import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL || '/api/supabase'; // sempre via proxy
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-proxy'; // placeholder

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});