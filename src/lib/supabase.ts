import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'PLACEHOLDER_SUPABASE_URL';
const supabaseAnonKey = 'PLACEHOLDER_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
