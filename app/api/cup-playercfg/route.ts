import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';

// Farben und Bildausschnitt je Spieler. Dadurch sieht im Rotator nicht
// jeder Banner gleich aus. Ohne Eintrag liest das Overlay die Farben
// automatisch aus dem Spielerbild.

const DATEI = path.join(DATEN_ORT, 'cup-player-config.json');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);

type Cfg = Record<string, Record<string, string>>;

async function lies(): Promise<Cfg> {
  try { return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Cfg; }
  catch { return {}; }
}

export async function GET() {
  return NextResponse.json(await lies());
}

export async function POST(request: Request) {
  // Auf Vercel ist das Dateisystem schreibgeschuetzt - dort muessten die
  // Einstellungen in Supabase liegen. Lokal reicht die Datei.
  if (IS_VERCEL) {
    return NextResponse.json(
      { error: 'Im Deployment schreibgeschuetzt - lokal einstellen und mit ausrollen.' },
      { status: 501 },
    );
  }

  let body: { name?: string; cfg?: Record<string, string> | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ungueltiges JSON' }, { status: 400 }); }

  const name = String(body.name ?? '').trim().toLowerCase();
  if (!name) return NextResponse.json({ error: 'name fehlt' }, { status: 400 });

  const alle = await lies();
  if (body.cfg === null) delete alle[name];
  else alle[name] = body.cfg ?? {};

  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(alle, null, 2));

  return NextResponse.json({ ok: true, anzahl: Object.keys(alle).length });
}
