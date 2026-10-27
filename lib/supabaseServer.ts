import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { promises as dns } from 'node:dns';

let supabaseClient: SupabaseClient | null = null;

/*
 * Ist Supabase nicht erreichbar, gilt sofort die Datei (26./27.10.2026).
 *
 * Das Projekt antwortet nicht mehr (der Name loest sich nicht auf), die Zugangsdaten stehen aber noch in der Umgebung. /api/players und /api/duos - die Spielerliste der
 * Tierlist - warteten deshalb jedes Mal sieben Sekunden auf "fetch failed" und antworteten mit 500. Jetzt prueft ein Namensabruf, ob die Adresse noch aufgeloest wird;
 * wenn nicht, gibt es zehn Minuten lang keinen Client, und die Routen nehmen ihren Weg ueber die Datei. Alle fuenf Minuten wird neu geprueft.
 */
let totBis = 0;
let pruefungBis = 0;
function pruefeAdresse(url: string) {
  if (Date.now() < pruefungBis) return;
  pruefungBis = Date.now() + 5 * 60_000;
  try {
    const host = new URL(url).hostname;
    void dns.lookup(host).then(() => { totBis = 0; }).catch(() => { totBis = Date.now() + 10 * 60_000; });
  } catch { /* unbrauchbare Adresse - unten gefangen */ }
}

/** Antwortet Supabase gerade nicht - dann ist eine Abfrage hoffnungslos und die Datei der richtige Weg. */
export function supabaseNichtErreichbar(): boolean {
  return Date.now() < totBis;
}

export function getSupabaseServerClient(): SupabaseClient | null {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.STORAGE_SUPABASE_URL ||
    process.env.STORAGE_URL;
  if (supabaseUrl) pruefeAdresse(supabaseUrl);
  if (supabaseNichtErreichbar()) return null;

  if (supabaseClient) {
    return supabaseClient;
  }

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
      // Hoechstens vier Sekunden je Abfrage; ein Netzfehler sperrt den Client fuer zehn Minuten.
      global: {
        fetch: async (eingabe, optionen) => {
          try { return await fetch(eingabe, { ...optionen, signal: AbortSignal.timeout(4000) }); } catch (e) { totBis = Date.now() + 10 * 60_000; throw e; }
        },
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
