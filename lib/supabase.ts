import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const createBrowserClient = (token?: string) =>
  createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

export const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
