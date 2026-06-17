import { createClient } from '@supabase/supabase-js';

const w = window as unknown as { __SUPABASE_URL__?: string; __SUPABASE_ANON_KEY__?: string };
const supabaseUrl = w.__SUPABASE_URL__ ?? import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = w.__SUPABASE_ANON_KEY__ ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
