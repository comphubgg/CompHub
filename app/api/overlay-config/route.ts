import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from '@/lib/ablageFs';
import path from 'path';
import { randomBytes } from 'crypto';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach } from '@/lib/vipZugaenge';
import { DATEN_ORT } from '@/lib/datenOrt';

// Die Einstellungen eines Overlays - unter einer Adresse, die sich nie aendert.
//
//   GET  ?id=<kennung>      -> Einstellungen und Stand (oeffentlich)
//   GET  ?meine=1           -> die eigenen Overlays (angemeldet)
//   POST { id?, typ, name, config }  -> anlegen oder aendern (Besitzer)
//   POST { id, loeschen: true }      -> entfernen (Besitzer)
//
// Warum das noetig ist: bisher steckte jede Einstellung eines Overlays in
// seiner Adresse. Wer die Farbe aenderte, bekam eine neue Adresse und musste
// sie in OBS austauschen - mitten im Stream. Der Betreiber wollte "immer die
// gleiche URL, aber wenn man das anpasst, soll es in OBS direkt angepasst
// werden".
//
// Genau das geht jetzt, und zwar ohne Kunstgriff: die Adresse traegt nur noch
// eine Kennung, die Einstellungen stehen hier. Das Overlay fragt sie im Takt
// ab und zeichnet neu, sobald sich der "stand" erhoeht. In OBS bleibt die
// Browserquelle unberuehrt.
//
// Der Stand ist eine Zahl, kein Zeitstempel: das Overlay muss nur wissen, ob
// sich etwas geaendert hat, und eine Zahl laesst sich nicht durch eine
// schiefe Uhr verwirren.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'overlays.json');

/** Wie viele Overlays ein Konto anlegen darf - gegen Unfug, nicht gegen ihn. */
const HOECHSTENS = 60;

export interface OverlayEintrag {
  id: string;
  /** "standings", "teamkarte", "qual", "text" - was gezeichnet wird. */
  typ: string;
  /** Konto-Id des Besitzers. Nur er darf aendern. */
  besitzer: string;
  /** Wie es im Dashboard heisst. */
  name: string;
  /** Zaehlt bei jeder Aenderung hoch - daran erkennt das Overlay sie. */
  stand: number;
  geaendert: string;
  config: Record<string, unknown>;
}

async function lies(): Promise<Record<string, OverlayEintrag>> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8'));
  } catch {
    return {};
  }
}

async function schreibe(alles: Record<string, OverlayEintrag>): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(alles, null, 1), 'utf8');
}

/** Wer fragt gerade - oder null. */
async function wer(): Promise<string | null> {
  const laden = await cookies();

  // 1. Das gewoehnliche CompHub-Konto.
  const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  if (id) {
    const konto = await nachId(id);
    if (konto) return id;
  }

  /*
   * 2. Der alte VIP-Weg.
   *
   * Ohne ihn stand der Betreiber vor seinem eigenen Werkzeug: die
   * Overlay-Seite laesst ihn herein, denn die Sperre dort fragt useZugang,
   * und das kennt beide Wege. Diese Schnittstelle kannte nur den einen -
   * also erschien die Seite vollstaendig, und beim Klick auf "Create" kam
   * "nicht angemeldet". Ein Werkzeug, das einen hereinlaesst und dann sagt,
   * man sei nicht angemeldet, ist schlicht kaputt.
   *
   * Die Kennung muss dabei bestaendig sein, sonst gehoerten die gespeicherten
   * Overlays beim naechsten Anmelden niemandem mehr. Der Betreiber bekommt
   * deshalb "betreiber", ein VIP seinen Namen mit Vorsatz.
   */
  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (vipWert) {
    if (istBetreiber(vipWert)) return 'betreiber';
    const name = vipAus(vipWert);
    if (name && await zugangNach(name)) return `vip:${name}`;
  }

  return null;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const alles = await lies();

  const id = p.get('id');
  if (id) {
    const e = alles[id];
    if (!e) {
      return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    }
    /*
     * Oeffentlich, aber ohne den Besitzer.
     *
     * Das Overlay laeuft in OBS ohne Anmeldung - es muss die Einstellungen
     * lesen koennen. Wer es angelegt hat, geht dabei niemanden etwas an, und
     * die Kennung selbst ist lang genug, dass sie niemand errraet.
     */
    return NextResponse.json({
      id: e.id, typ: e.typ, stand: e.stand, config: e.config,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (p.get('meine')) {
    const ich = await wer();
    if (!ich) return NextResponse.json({ overlays: [] });
    return NextResponse.json({
      overlays: Object.values(alles)
        .filter((e) => e.besitzer === ich)
        .sort((a, b) => b.geaendert.localeCompare(a.geaendert))
        .map((e) => ({
          id: e.id, typ: e.typ, name: e.name, stand: e.stand,
          geaendert: e.geaendert, config: e.config,
        })),
    });
  }

  return NextResponse.json({ error: 'id or meine=1 is required' }, { status: 400 });
}

export async function POST(request: Request) {
  const ich = await wer();
  if (!ich) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const koerper = await request.json().catch(() => ({}));
  const alles = await lies();

  // ------------------------------------------------------------ Entfernen
  if (koerper.loeschen && typeof koerper.id === 'string') {
    const e = alles[koerper.id];
    if (!e) return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    if (e.besitzer !== ich) {
      return NextResponse.json({ error: 'Not yours' }, { status: 403 });
    }
    delete alles[koerper.id];
    await schreibe(alles);
    return NextResponse.json({ ok: true });
  }

  const typ = String(koerper.typ ?? '').trim();
  if (!typ) return NextResponse.json({ error: 'A type is required' }, { status: 400 });
  const name = String(koerper.name ?? '').trim().slice(0, 60) || typ;
  const config = (koerper.config && typeof koerper.config === 'object')
    ? koerper.config as Record<string, unknown> : {};

  // ------------------------------------------------------------- Aendern
  if (typeof koerper.id === 'string' && alles[koerper.id]) {
    const e = alles[koerper.id];
    if (e.besitzer !== ich) {
      return NextResponse.json({ error: 'Not yours' }, { status: 403 });
    }
    e.typ = typ;
    e.name = name;
    e.config = config;
    e.stand += 1;
    e.geaendert = new Date().toISOString();
    await schreibe(alles);
    return NextResponse.json({ id: e.id, stand: e.stand });
  }

  // ------------------------------------------------------------- Anlegen
  const meine = Object.values(alles).filter((e) => e.besitzer === ich);
  if (meine.length >= HOECHSTENS) {
    return NextResponse.json({
      error: `No more than ${HOECHSTENS} overlays.`,
    }, { status: 400 });
  }

  // Zwoelf Zeichen aus dem Zufallsgenerator: kurz genug fuer eine Adresse,
  // lang genug, dass niemand fremde Overlays durchprobiert.
  const neu: OverlayEintrag = {
    id: randomBytes(9).toString('base64url'),
    typ,
    besitzer: ich,
    name,
    stand: 1,
    geaendert: new Date().toISOString(),
    config,
  };
  alles[neu.id] = neu;
  await schreibe(alles);
  return NextResponse.json({ id: neu.id, stand: neu.stand });
}
