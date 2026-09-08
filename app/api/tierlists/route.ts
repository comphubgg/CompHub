import { NextRequest, NextResponse } from 'next/server';
import { werFragt, kennungFuerAblage } from '@/lib/werFragt';
import { createClient } from '@supabase/supabase-js';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Wo die Tierlist eines Kontos liegt.
 *
 * Frueher stand hier eine einzige Datei fuer alle: "tierlists.json". Wer die
 * Seite aufrief - angemeldet oder nicht -, sah denselben Stand und konnte ihn
 * ueberschreiben. Beim Umzug fiel auf, dass daraus acht Eintraege
 * verschwunden waren, weil jemand beim Ausprobieren geraeumt hatte.
 *
 * Der Betreiber hat die Regel danach klar gezogen: Tierlist-Eintraege sollen
 * "nie" gespeichert werden, "wenn dann nur auf deren Accounts, aber NIE fuer
 * jeden - egal ob Admin oder nicht Admin". Also je Konto eine eigene, und ohne
 * Konto wird nichts abgelegt.
 *
 * Die alte gemeinsame Datei bleibt liegen. Sie ist der Stand des Betreibers
 * und wird beim ersten Lesen einmalig in seine eigene uebernommen - geloescht
 * wird sie nicht, sie ist die Sicherung dieses Uebergangs.
 */
const TIERLISTS_FILE = path.join(DATEN_ORT, 'tierlists.json');

function tierlistDatei(wer: string): string {
  return path.join(DATEN_ORT, 'tierlisten', `${kennungFuerAblage(wer)}.json`);
}
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
/*
 * Ob die Datei auf der Platte benutzt werden darf.
 *
 * Frueher hing das zusaetzlich an NODE_ENV - und damit fiel der Zugriff weg,
 * sobald die fertige Fassung lief, auch auf dem eigenen Rechner. Massgeblich
 * ist allein, ob eine beschreibbare Platte da ist; auf Vercel ist sie es
 * nicht.
 */
/* Wie in app/api/players/route.ts: der Rueckweg ueber die Ablage gilt
   ueberall, auch bei Vercel - dort liest sie aus Supabase. */
const USE_DISK_FALLBACK = true;

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

async function leseDatei(datei: string) {
  try {
    const raw = await fs.readFile(datei, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return {
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      currentListId: parsed.currentListId ?? null,
    };
  } catch {
    return { lists: [], currentListId: null };
  }
}

/**
 * Die Tierlist dieses Kontos.
 *
 * Hat es noch keine, wird beim Betreiber einmalig der alte gemeinsame Stand
 * uebernommen - das ist seine Arbeit aus tausend Eintraegen, und sie soll
 * beim Umstellen nicht verschwinden. Alle anderen fangen leer an; die alte
 * Liste war nie ihre.
 */
async function readTierlistsFile(wer: string) {
  const eigen = await leseDatei(tierlistDatei(wer));
  if (eigen.lists.length) return eigen;

  if (wer === 'betreiber') {
    const alt = await leseDatei(TIERLISTS_FILE);
    if (alt.lists.length) return alt;
  }
  return { lists: [], currentListId: null };
}

async function writeTierlistsFile(
  wer: string, lists: any[], currentListId: string | null,
) {
  const datei = tierlistDatei(wer);
  await fs.mkdir(path.dirname(datei), { recursive: true });
  await fs.writeFile(datei, JSON.stringify({ lists, currentListId }, null, 2), 'utf-8');
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

async function getTierlistsFromSupabase(wer: string) {
  const client = getSupabaseClient();
  if (!client) {
    if (USE_DISK_FALLBACK) {
      const diskData = await readTierlistsFile(wer);
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
        const diskData = await readTierlistsFile(wer);
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
        await writeTierlistsFile(wer, result.lists, result.currentListId);
      }
      memoryCache = result;
      return result;
    }

    if (USE_DISK_FALLBACK) {
      const diskData = await readTierlistsFile(wer);
      return diskData.lists.length > 0 ? diskData : memoryCache;
    }

    return memoryCache;
  } catch (error) {
    console.error('Error reading from Supabase:', error);
    if (USE_DISK_FALLBACK) {
      const diskData = await readTierlistsFile(wer);
      return diskData.lists.length > 0 ? diskData : memoryCache;
    }
    throw error;
  }
}

async function saveTierlistsToSupabase(
  wer: string, lists: any[], currentListId: string | null,
) {
  const client = getSupabaseClient();
  if (!client) {
    if (USE_DISK_FALLBACK) {
      memoryCache = { lists, currentListId };
      await writeTierlistsFile(wer, lists, currentListId);
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
        await writeTierlistsFile(wer, lists, currentListId);
      }
      throw error;
    }

    if (USE_DISK_FALLBACK) {
      await writeTierlistsFile(wer, lists, currentListId);
    }
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    if (USE_DISK_FALLBACK) {
      await writeTierlistsFile(wer, lists, currentListId);
    }
    throw error;
  }

  memoryCache = { lists, currentListId };
}

/*
 * Die Tierlist des Anfragenden - und nur seine.
 *
 * Wer nicht angemeldet ist, bekommt eine leere Liste. Nicht die eines
 * anderen, und schon gar nicht eine gemeinsame: eine Tierlist ist die
 * Einschaetzung eines Menschen, kein Bestand der Seite.
 */
export async function GET() {
  try {
    const wer = await werFragt();
    if (!wer) {
      return NextResponse.json({ success: true, lists: [], currentListId: null });
    }
    const data = await getTierlistsFromSupabase(wer);
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

/*
 * Gespeichert wird nur auf ein Konto.
 *
 * Vorher schrieb dieser Weg eine gemeinsame Datei, und zwar ohne jede
 * Anmeldung: jeder Aufruf konnte den Stand aller ueberschreiben. Genau so
 * sind acht Eintraege verschwunden. Der Betreiber hat die Regel danach klar
 * gezogen - "nie fuer jeden, egal ob Admin oder nicht Admin".
 *
 * Ohne Konto wird deshalb nichts abgelegt, und zwar mit einer klaren Absage
 * statt eines stillen Nichtstuns: wer speichert, soll erfahren, dass es nicht
 * gespeichert wurde.
 */
export async function POST(request: NextRequest) {
  try {
    const wer = await werFragt();
    if (!wer) {
      return NextResponse.json(
        { success: false, error: 'Sign in to save your tier list.' },
        { status: 401 });
    }
    const body = await request.json();
    const lists = Array.isArray(body?.lists) ? body.lists : [];
    const currentListId = body?.currentListId ?? null;

    const bisher = await getTierlistsFromSupabase(wer);
    const einwand = wirktWieVersehen(lists, (bisher as any)?.lists ?? []);
    if (einwand) {
      console.warn('tierlists POST abgelehnt:', einwand);
      return NextResponse.json({ success: false, error: einwand }, { status: 409 });
    }

    await saveTierlistsToSupabase(wer, lists, currentListId);

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
