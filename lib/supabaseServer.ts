import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.STORAGE_SUPABASE_URL ||
    process.env.STORAGE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.STORAGE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  // Eine unbrauchbare Adresse darf nicht die ganze Abfrage sprengen.
  //
  // createClient wirft bei einer ungueltigen URL sofort, und weil dieser
  // Wurf ausserhalb der Fallback-Zweige lag, endete jede Abfrage mit einem
  // 500er. Sichtbar wurde das als "Failed to save player online", obwohl auf
  // der Platte alles bereitlag.
  try {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (fehler) {
    console.warn('Supabase-Adresse unbrauchbar, es gilt die Datei auf der Platte:',
      (fehler as Error).message);
    return null;
  }

  return supabaseClient;
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.SUPABASE_URL ||
      process.env.STORAGE_URL ||
      process.env.STORAGE_SUPABASE_URL
  ) &&
    Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.STORAGE_SERVICE_ROLE_KEY ||
        process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY
    );
}

export function isSupabaseFallbackError(error: any): boolean {
  const messageParts = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean);
  const combined = messageParts.join(' ').toLowerCase();

  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    combined.includes('could not find the table') ||
    combined.includes('schema cache') ||
    combined.includes('does not exist') ||
    combined.includes('relation') ||
    combined.includes('permission denied for table')
  );
}
