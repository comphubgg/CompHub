import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { istVip, kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { rechteVon, zugangNach } from '@/lib/vipZugaenge';
import { wirksameRechte } from '@/lib/rechte';

/*
 * Die eigene Prognose zur Global Championship - je Konto.
 *
 * Der Betreiber (#admin-todo, 23.9.2026): "Unter der Globals-Seite unter
 * Predictions ist gemeint, dass man als VIP seine eigene Prediction machen
 * kann, nicht die vom Admin zu sehen ist - das einzige, was nur der Admin
 * machen muss, ist die Map."
 *
 * Jeder mit dem VIP-Bereich "globals" (und der Admin) hat hier genau einen
 * Platz, als eigene Datei: meine-prognosen/<wer>.json. Eine eigene Datei je
 * Person, damit zwei, die gleichzeitig speichern, sich nicht gegenseitig
 * ueberschreiben - und niemand die Prognose eines anderen zu sehen bekommt.
 *
 *   GET   -> { prognosen: [die eigene] } oder { prognosen: [] }
 *   POST  -> die eigene ersetzen
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';
const ORDNER = path.join(DATEN_ORT, 'meine-prognosen');
/** Feld, Karte mit Formen und Plaetze - grosszuegig, aber nicht grenzenlos. */
const HOECHSTENS = 600_000;

/** Wer fragt - und darf er? */
async function wer(): Promise<string | null> {
  const laden = await cookies();

  const kontoId = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (kontoId) {
    const k = await nachId(kontoId);
    if (k && !k.gesperrt) {
      const rechte = wirksameRechte(k.rolle, k.rechte, istVip(k));
      if (k.rolle === 'admin' || rechte.includes('globals')) return `konto-${k.id}`;
    }
  }

  const roh = laden.get(VIP_COOKIE)?.value;
  const vipName = vipAus(roh);
  if (vipName) {
    const name = vipName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (istBetreiber(roh)) return `vip-${name}`;
    const darf = rechteVon(await zugangNach(vipName));
    if (darf.gueltig && (darf.rolle === 'admin' || darf.rechte.includes('globals'))) {
      return `vip-${name}`;
    }
  }
  return null;
}

const datei = (kennung: string) => path.join(ORDNER, `${kennung}.json`);

export async function GET() {
  try {
    const kennung = await wer();
    if (!kennung) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
    try {
      const p = JSON.parse(await fs.readFile(datei(kennung), 'utf8'));
      return NextResponse.json({ prognosen: [p] }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      // Noch keine gespeichert - das ist leer. Alles andere ist ein Ausfall
      // und darf nicht wie "leer" aussehen (sonst finge die Seite neu an).
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ prognosen: [] }, { headers: { 'Cache-Control': 'no-store' } });
      }
      throw e;
    }
  } catch {
    return NextResponse.json({ fehler: 'Die Ablage antwortet gerade nicht.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  try {
    const kennung = await wer();
    if (!kennung) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
    const text = await request.text();
    if (text.length > HOECHSTENS) {
      return NextResponse.json({ fehler: 'zu gross' }, { status: 413 });
    }
    const p = JSON.parse(text);
    if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.id !== 'string'
        || typeof p.cupId !== 'string' || !Array.isArray(p.plaetze)) {
      return NextResponse.json({ fehler: 'unbrauchbar' }, { status: 400 });
    }
    await fs.mkdir(ORDNER, { recursive: true });
    await fs.writeFile(datei(kennung), JSON.stringify({ ...p, geaendert: Date.now() }), 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ fehler: 'Die Ablage antwortet gerade nicht.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
