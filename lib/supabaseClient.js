import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const urlLooksValid = Boolean(
  supabaseUrl && /^https:\/\/[a-z0-9-]+\.supabase\.co(?:\/)??$/i.test(supabaseUrl)
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && urlLooksValid);

export const supabaseConfigError = !isSupabaseConfigured
  ? new Error(
      'Supabase belum dikonfigurasi dengan benar. Pastikan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY berisi project Supabase yang benar di .env.local dan Vercel environment.'
    )
  : null;

if (!isSupabaseConfigured) {
  console.warn(supabaseConfigError?.message);
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
