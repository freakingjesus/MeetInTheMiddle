import { createClient } from '@supabase/supabase-js';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY.'
  );
}

export const createBrowserClient = (token?: string) =>
  createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

// Lazily create the admin client so the service-role key is only accessed server-side
export const createAdminClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variable SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
};
