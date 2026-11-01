import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Farben und Bildausschnitt je Spieler. Dadurch sieht im Rotator nicht
// jeder Banner gleich aus. Ohne Eintrag liest das Overlay die Farben
// automatisch aus dem Spielerbild.

const DATEI = path.join(DATEN_ORT, 'cup-player-config.json');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);

type Cfg = Record<string, Record<string, string>>;

// Nur eine fehlende Datei heisst "noch nichts eingestellt". Jeder andere Lesefehler (Ablage nicht erreichbar) wirft - sonst sähe er aus wie "leer", und ein Speichern würde alle Einstellungen überschreiben.
async function lies(): Promise<Cfg> {
  try { return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Cfg; }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

export async function GET() {
  // 424 statt 500 (der Lastverteiler macht aus 5xx eine Fehlerseite); das Overlay wertet "nicht ok" als Ausfall und nimmt die Farben aus dem Spielerbild.
  try {
    return NextResponse.json(await lies());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 424 });
  }
}

export async function POST(request: Request) {
  // Serverseitige Pruefung (31.10.2026): vorher kam jede von Hand geschickte Anfrage durch, die Knoepfe waren nur im Browser versteckt.
  if (!await istAdminAnfrage()) return NextResponse.json({ ok: false, success: false, error: 'Nur für den Admin.' }, { status: 403 });
  // Auf Vercel ist das Dateisystem schreibgeschuetzt - dort muessten die
  // Einstellungen in Supabase liegen. Lokal reicht die Datei.
  if (IS_VERCEL) {
    return NextResponse.json(
      { error: 'Im Deployment schreibgeschuetzt - lokal einstellen und mit ausrollen.' },
      { status: 424 },
    );
  }

  let body: { name?: string; cfg?: Record<string, string> | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ungueltiges JSON' }, { status: 400 }); }

  const name = String(body.name ?? '').trim().toLowerCase();
  if (!name) return NextResponse.json({ error: 'name fehlt' }, { status: 400 });

  try {
    const alle = await lies();
    if (body.cfg === null) delete alle[name];
    else alle[name] = body.cfg ?? {};

    await fs.mkdir(path.dirname(DATEI), { recursive: true });
    await fs.writeFile(DATEI, JSON.stringify(alle, null, 2));
    return NextResponse.json({ ok: true, anzahl: Object.keys(alle).length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 424 });
  }
}
