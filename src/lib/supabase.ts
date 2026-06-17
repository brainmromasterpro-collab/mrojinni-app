import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://occlmazeyrxwszgjlrfb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jY2xtYXpleXJ4d3N6Z2pscmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTQwODUsImV4cCI6MjA5MzA3MDA4NX0.FYWHw9xNCy5kQnelGOPB_zdAvYDd5B1nZEWN4CNP9DM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
