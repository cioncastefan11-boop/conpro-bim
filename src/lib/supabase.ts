import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurat = Boolean(url && key && !url.includes('xxxxxxxx'));

// Clientul folosește doar cheia publică. Securitatea vine din regulile
// de acces din baza de date (vezi supabase/migrations).
export const supabase = createClient(url ?? 'http://localhost', key ?? 'lipsa', {
  auth: { persistSession: true, autoRefreshToken: true },
});
