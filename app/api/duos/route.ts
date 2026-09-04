import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getSupabaseServerClient, hasSupabaseConfig, isSupabaseFallbackError } from '@/lib/supabaseServer';
import { DATEN_ORT } from '@/lib/datenOrt';

/* Auf Vercel gibt es keine beschreibbare Platte - nur dort ist der
 * Rueckfall auf die Datei wirklich unmoeglich. */
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);

const DUOS_FILE = path.join(DATEN_ORT, 'duos.json');

async function readDuosFile(): Promise<string[][]> {
  try {
    const raw = await fs.readFile(DUOS_FILE, 'utf-8');
    const json = JSON.parse(raw || '{}');
    return json.duos || [];
  } catch {
    return [];
  }
}

async function writeDuosFile(duos: string[][]): Promise<void> {
  await fs.mkdir(path.dirname(DUOS_FILE), { recursive: true });
  await fs.writeFile(DUOS_FILE, JSON.stringify({ duos }, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      const duoRows = await readDuosFile();
      return NextResponse.json({ success: true, duos: duoRows, extracted_at: new Date().toISOString() });
    }

    const { data, error } = await supabase.from('duos').select('*');
    if (error) {
      if (isSupabaseFallbackError(error)) {
        console.warn('Supabase duos table unavailable, falling back to local duos data');
        const duoRows = await readDuosFile();
        return NextResponse.json({ success: true, duos: duoRows, extracted_at: new Date().toISOString() });
      }

      console.error('Supabase error fetching duos', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const duoRows = (data || []).map((duo: any) => [duo.player1, duo.player2]);
    return NextResponse.json({ success: true, duos: duoRows, extracted_at: new Date().toISOString() });
  } catch (err: any) {
    console.error('Error reading duos:', err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.duos)) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const duos = body.duos
      .filter((d: any) => Array.isArray(d) && d.length >= 2)
      .map((d: any) => ({ player1: String(d[0]), player2: String(d[1]) }));

    // Nur auf Vercel aufgeben - dort gibt es keine Platte. Auf dem
    // eigenen Rechner liegt die Datei daneben und wird gelesen.
    if (!supabase && IS_VERCEL && !hasSupabaseConfig()) {
      return NextResponse.json({ success: false, error: 'Online database not configured' }, { status: 500 });
    }

    if (!supabase) {
      const duoRows = duos.map((duo: { player1: string; player2: string }) => [duo.player1, duo.player2]);
      await writeDuosFile(duoRows);
      return NextResponse.json({ success: true, count: duoRows.length });
    }

    const { error } = await supabase.from('duos').insert(duos);
    if (error) {
      if (isSupabaseFallbackError(error)) {
        await writeDuosFile(duos.map((duo: { player1: string; player2: string }) => [duo.player1, duo.player2]));
        return NextResponse.json({ success: true, count: duos.length });
      }

      console.error('Supabase error saving duos', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: duos.length });
  } catch (err: any) {
    console.error('Error writing duos:', err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    let duos: Array<[string, string]> = [];

    if (Array.isArray(body.duos)) {
      duos = body.duos.filter((d: any) => Array.isArray(d) && d.length >= 2).map((d: any) => [String(d[0]), String(d[1])]);
    } else if (Array.isArray(body.name) && body.name.length >= 2 && body.type === 'duo') {
      duos = [[String(body.name[0]), String(body.name[1])]];
    }

    if (duos.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    // Nur auf Vercel aufgeben - dort gibt es keine Platte. Auf dem
    // eigenen Rechner liegt die Datei daneben und wird gelesen.
    if (!supabase && IS_VERCEL && !hasSupabaseConfig()) {
      return NextResponse.json({ success: false, error: 'Online database not configured' }, { status: 500 });
    }

    if (!supabase) {
      const existingDuos = await readDuosFile();
      const filtered = existingDuos.filter((saved) => {
        return !duos.some(([p1, p2]) => {
          return (saved[0] === p1 && saved[1] === p2) || (saved[0] === p2 && saved[1] === p1);
        });
      });
      await writeDuosFile(filtered);
      return NextResponse.json({ success: true, count: filtered.length });
    }

    for (const [player1, player2] of duos) {
      const { error } = await supabase.from('duos').delete().match({ player1, player2 });
      if (error) {
        const reverseResult = await supabase.from('duos').delete().match({ player1: player2, player2: player1 });
        if (reverseResult.error) {
          if (isSupabaseFallbackError(error) || isSupabaseFallbackError(reverseResult.error)) {
            const existingDuos = await readDuosFile();
            const filtered = existingDuos.filter((saved) => {
              return !duos.some(([p1, p2]) => {
                return (saved[0] === p1 && saved[1] === p2) || (saved[0] === p2 && saved[1] === p1);
              });
            });
            await writeDuosFile(filtered);
            return NextResponse.json({ success: true, count: filtered.length });
          }
          console.error('Supabase error deleting duo', error, reverseResult.error);
          return NextResponse.json({ success: false, error: error.message || reverseResult.error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, count: duos.length });
  } catch (err: any) {
    console.error('Error deleting duos:', err);
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}
