import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const createBrowserClient = (token?: string) =>
  createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

// Lazily create the admin client so that this module can be imported in the
// browser without trying to access the service role key, which should remain
// server-side only.
export const createAdminClient = () =>
  createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
