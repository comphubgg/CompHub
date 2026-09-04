import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TIERLISTS_FILE = path.join(DATEN_ORT, 'tierlists.json');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
/*
 * Ob die Datei auf der Platte benutzt werden darf.
 *
 * Frueher hing das zusaetzlich an NODE_ENV - und damit fiel der Zugriff weg,
 * sobald die fertige Fassung lief, auch auf dem eigenen Rechner. Massgeblich
 * ist allein, ob eine beschreibbare Platte da ist; auf Vercel ist sie es
 * nicht.
 */
const USE_DISK_FALLBACK = !IS_VERCEL;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.STORAGE_SUPABASE_URL || process.env.STORAGE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.STORAGE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (USE_DISK_FALLBACK) {
      console.warn('Supabase credentials not configured, using disk file cache');
    } else {
      console.warn('Supabase credentials not configured and disk fallback disabled in this environment');
    }
    return null;
  }

  // Eine unbrauchbare Adresse darf nicht die ganze Abfrage sprengen.
  //
  // createClient wirft bei einer ungueltigen URL sofort. Weil dieser Wurf
  // ausserhalb des Fallback-Zweigs lag, endete jede Abfrage mit einem 500er
  // und die Datei auf der Platte wurde nie gelesen - die Tierlist lebte
  // dadurch nur noch im Browser des jeweiligen Besuchers.
  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (fehler) {
    console.warn('Supabase-Adresse unbrauchbar, es gilt die Datei auf der Platte:',
      (fehler as Error).message);
    return null;
  }
}

async function ensureDataDir() {
  try {
    await fs.access(path.dirname(TIERLISTS_FILE));
  } catch {
    if (!USE_DISK_FALLBACK) return;
    await fs.mkdir(path.dirname(TIERLISTS_FILE), { recursive: true });
  }
}

async function readTierlistsFile() {
  if (!USE_DISK_FALLBACK) {
    return { lists: [], currentListId: null };
  }

  try {
    await ensureDataDir();
    const raw = await fs.readFile(TIERLISTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return {
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      currentListId: parsed.currentListId ?? null,
    };
  } catch {
    return { lists: [], currentListId: null };
  }
}

async function writeTierlistsFile(lists: any[], currentListId: string | null) {
  if (!USE_DISK_FALLBACK) return;
  await ensureDataDir();
  await fs.writeFile(TIERLISTS_FILE, JSON.stringify({ lists, currentListId }, null, 2), 'utf-8');
}

function isSupabaseMissingCurrentListIdColumn(error: any) {
  const messageParts = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean);
  const message = messageParts.join(' ').toLowerCase();
  return (
    message.includes('currentlistid') ||
    message.includes('could not find the "currentlistid" column') ||
    message.includes('schema cache')
  );
}

async function queryTierlistsRow(client: any, includeCurrentListId = true) {
  const selectFields = includeCurrentListId
    ? 'key,lists,currentListId,updated_at'
    : 'key,lists,updated_at';

  const { data, error } = await client
    .from('tierlists')
    .select(selectFields)
    .eq('key', 'shared')
    .maybeSingle();

  if (error) {
    if (includeCurrentListId && isSupabaseMissingCurrentListIdColumn(error)) {
      return queryTierlistsRow(client, false);
    }
    throw error;
  }

  return data;
}

// Fallback cache when Supabase is not available
let memoryCache: { lists: any[]; currentListId: string | null } = {
  lists: [],
  currentListId: null,
};

async function getTierlistsFromSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    if (USE_DISK_FALLBACK) {
      const diskData = await readTierlistsFile();
      return diskData.lists.length > 0 ? diskData : memoryCache;
    }

    throw new Error('Supabase storage is not configured in this environment');
  }

  try {
    const { data, error } = await client
      .from('tierlists')
      .select('*')
      .eq('key', 'shared')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase error reading tierlists:', error);
      if (USE_DISK_FALLBACK) {
        const diskData = await readTierlistsFile();
        return diskData.lists.length > 0 ? diskData : memoryCache;
      }
      throw error;
    }

    if (data) {
      const result = {
        lists: data.lists || [],
        currentListId: data.currentListId || null,
      };
      if (USE_DISK_FALLBACK) {
        await writeTierlistsFile(result.lists, result.currentListId);
      }
      memoryCache = result;
      return result;
    }

    if (USE_DISK_FALLBACK) {
      const diskData = await readTierlistsFile();
      return diskData.lists.length > 0 ? diskData : memoryCache;
    }

    return memoryCache;
  } catch (error) {
    console.error('Error reading from Supabase:', error);
    if (USE_DISK_FALLBACK) {
      const diskData = await readTierlistsFile();
      return diskData.lists.length > 0 ? diskData : memoryCache;
    }
    throw error;
  }
}

async function saveTierlistsToSupabase(lists: any[], currentListId: string | null) {
  const client = getSupabaseClient();
  if (!client) {
    if (USE_DISK_FALLBACK) {
      memoryCache = { lists, currentListId };
      await writeTierlistsFile(lists, currentListId);
      return;
    }
    throw new Error('Supabase storage is not configured in this environment');
  }

  const payload: any = {
    key: 'shared',
    lists,
    updated_at: new Date().toISOString(),
  };

  if (currentListId) {
    payload.currentListId = currentListId;
  }

  try {
    let { error } = await client.from('tierlists').upsert(payload, { onConflict: 'key' });

    if (error && currentListId && isSupabaseMissingCurrentListIdColumn(error)) {
      delete payload.currentListId;
      const retry = await client.from('tierlists').upsert(payload, { onConflict: 'key' });
      error = retry.error;
    }

    if (error) {
      console.error('Supabase error saving tierlists:', error);
      if (USE_DISK_FALLBACK) {
        await writeTierlistsFile(lists, currentListId);
      }
      throw error;
    }

    if (USE_DISK_FALLBACK) {
      await writeTierlistsFile(lists, currentListId);
    }
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    if (USE_DISK_FALLBACK) {
      await writeTierlistsFile(lists, currentListId);
    }
    throw error;
  }

  memoryCache = { lists, currentListId };
}

export async function GET() {
  try {
    const data = await getTierlistsFromSupabase();
    return NextResponse.json({
      success: true,
      lists: data.lists || [],
      currentListId: data.currentListId || null,
    });
  } catch (error: any) {
    console.error('tierlists GET error', error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}

/** Wie viele Eintraege, und wie viele davon eingestuft sind. */
function umfang(lists: any[]): { eintraege: number; gesetzt: number } {
  let eintraege = 0;
  let gesetzt = 0;
  for (const l of lists ?? []) {
    for (const e of (Array.isArray(l?.entries) ? l.entries : [])) {
      eintraege += 1;
      if (e?.tier) gesetzt += 1;
    }
  }
  return { eintraege, gesetzt };
}

/**
 * Sieht dieser Schreibvorgang nach einem Versehen aus?
 *
 * Anlass: ein Browser mit leerem Zwischenspeicher hat den gepflegten Stand
 * ueberschrieben - alle Einstufungen waren fort, die Eintraege noch da. Der
 * Schutz in der Seite greift nur bei einer voellig leeren Liste und half
 * deshalb nicht. Hier steht er dort, wo ihn kein Browser umgehen kann.
 *
 * Die Regel ist eng gefasst, damit sie normale Arbeit nicht behindert:
 * abgelehnt wird nur, wenn gleichzeitig Eintraege verschwinden UND keine
 * einzige Einstufung uebrig bleibt, obwohl vorher welche da waren. Ein
 * ausdrueckliches "Reset" laesst die Eintraege stehen und geht damit durch;
 * ein einzeln geloeschter Eintrag ebenso, weil dabei die Stufen bleiben.
 */
function wirktWieVersehen(neu: any[], alt: any[]): string | null {
  const a = umfang(alt);
  const n = umfang(neu);
  if (!a.eintraege) return null;

  if (a.gesetzt > 0 && n.gesetzt === 0 && n.eintraege < a.eintraege) {
    return `Der Stand haette ${a.gesetzt} Einstufungen verloren und dabei `
      + `${a.eintraege - n.eintraege} Eintraege - das sieht nach einem `
      + 'ueberschriebenen Zwischenspeicher aus und wurde nicht gespeichert.';
  }
  // Mehr als die Haelfte auf einmal fort: dasselbe Muster, andere Groesse.
  if (n.eintraege * 2 < a.eintraege) {
    return `Der Stand haette ${a.eintraege - n.eintraege} von ${a.eintraege} `
      + 'Eintraegen verloren und wurde nicht gespeichert.';
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lists = Array.isArray(body?.lists) ? body.lists : [];
    const currentListId = body?.currentListId ?? null;

    const bisher = await getTierlistsFromSupabase();
    const einwand = wirktWieVersehen(lists, (bisher as any)?.lists ?? []);
    if (einwand) {
      console.warn('tierlists POST abgelehnt:', einwand);
      return NextResponse.json({ success: false, error: einwand }, { status: 409 });
    }

    await saveTierlistsToSupabase(lists, currentListId);

    return NextResponse.json({
      success: true,
      lists,
      currentListId,
    });
  } catch (error: any) {
    console.error('tierlists POST error', error);
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
