import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { istAdminAnfrage } from '@/lib/adminPruefung';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// Spieltage, zu denen bewusst keine Karte angeboten wird.
//
// Zu jedem Finale steht sonst von selbst eine leere Karte bereit. Das ist
// bei fuenfzig Duos richtig und bei dreihundert unsinnig: eine Karte mit
// dreihundert Namen liest niemand mehr. Der Betreiber: "sodass wir dem
// Finale keine Map geben, weil das sind dreihundert Leute".
//
// Gespeichert wird nur die Fenster-Kennung - die Karte selbst gibt es ja
// noch gar nicht. Wer den Eintrag wieder entfernt, bekommt das Angebot
// zurueck; verloren geht dabei nichts.
//
//   GET                       -> die ausgeblendeten Spieltage
//   POST { windowId, aus }    -> ausblenden (true) oder zurueckholen (false)

const DATEI = path.join(DATEN_ORT, 'karten-ausgeblendet.json');

async function lies(): Promise<string[]> {
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8'));
    return Array.isArray(roh) ? roh.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export async function GET() {
  return NextResponse.json({ fenster: await lies() });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) {
    return NextResponse.json({ error: 'Nur fuer Admins' }, { status: 403 });
  }
  const { windowId, aus } = await request.json() as
    { windowId?: string; aus?: boolean };
  if (!windowId) {
    return NextResponse.json({ error: 'windowId fehlt' }, { status: 400 });
  }

  const liste = new Set(await lies());
  if (aus === false) liste.delete(windowId); else liste.add(windowId);

  try {
    await fs.mkdir(path.dirname(DATEI), { recursive: true });
    await fs.writeFile(DATEI, JSON.stringify([...liste], null, 2), 'utf8');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 424 });
  }
  return NextResponse.json({ ok: true, fenster: [...liste] });
}
