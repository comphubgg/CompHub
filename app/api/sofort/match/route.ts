/*
 * Sofortspur (17.11.2026): ein auf GitHub gelesenes Match direkt an den Server - die vollen Werte (Elims, Damage, Damage Taken, Treffer, Clutch, Mats ...)
 * stehen so wenige Minuten nach Spielende auf der Seite statt nach "Replays schnell" -> "Clutch rechnen" -> "Clutch ablegen" (25 bis 40 Minuten).
 *
 *   POST /api/sofort/match            Authorization: Bearer <SOFORT_SECRET>   Content-Encoding: gzip (wahlweise)
 *   Inhalt: ein Teilstand genau EINES Matches im Format von data/clutch-teil (lib/vollMatch.mjs neuerTeil + einarbeiten, gestempelt wie in
 *           scripts/live-spur.mjs), gelesen von .github/workflows/sofortspur.yml.
 *
 * Hier wird nichts gelesen und nichts gerechnet: der Teil wird geprueft und unveraendert als <SOFORT_EINGANG>/<windowId>/<matchId>.json abgelegt
 * (erst .tmp, dann umbenennen). Zusammengefuehrt wird im Dienst "live" (scripts/live-spur.mjs, LIVE_NUR_BAUEN) mit dem unveraenderten
 * scripts/clutch-zusammen.mjs auf den Stand vom Release - in einem eigenen Prozess, nie in dieser Ereignisschleife. Die Seite liest das Ergebnis wie bisher
 * ueber lib/clutchLive.ts (Live-Stand, solange er mehr Matches kennt als das Release; holt das Release auf, gilt wieder das Release - nichts doppelt).
 *
 * Idempotent je matchId: liegt das Match schon im Eingang oder als Teil/Archiv der Live-Spur mit derselben Schadensregel, bleibt es, wie es ist (200, schonDa).
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { gunzip as gunzipCb } from 'zlib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const gunzip = promisify(gunzipCb);

const EINGANG = () => process.env.SOFORT_EINGANG || '/app/live-eingang';
const LIVE_ORT = () => process.env.COMPHUB_LIVE_ORT || '/app/live';
/** Ein Teil eines kleinen Spieltags mit Rohdaten (Kill-Feed, Figuren) hat ein paar hundert KB; mehr als das ist kein einzelnes Match. */
const GROESSE_MAX = 16 * 1024 * 1024;
const FENSTER_OK = /^[A-Za-z0-9_-]{1,200}$/;
const MATCH_OK = /^[A-Za-z0-9-]{8,64}$/;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const da = async (p: string) => { try { await fs.access(p); return true; } catch { return false; } };

/** Die Schadensregel eines schon abgelegten Teils - ohne die ganze Datei zu parsen (sie steht am Ende: Object.assign in scripts/live-spur.mjs). */
async function fassungVon(p: string): Promise<number | null> {
  try {
    const h = await fs.open(p, 'r');
    try {
      const { size } = await h.stat();
      const laenge = Math.min(size, 4096);
      const b = Buffer.alloc(laenge);
      await h.read(b, 0, laenge, size - laenge);
      const m = /"schadenFassung":(\d+)/.exec(b.toString('utf8'));
      return m ? Number(m[1]) : null;
    } finally { await h.close(); }
  } catch { return null; }
}

export async function POST(request: Request) {
  const beginn = performance.now();
  const soll = (process.env.SOFORT_SECRET ?? '').trim();
  if (!soll) return NextResponse.json({ fehler: 'SOFORT_SECRET ist auf dem Server nicht gesetzt' }, { status: 503 });
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer || !gleich(bearer, soll)) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });

  const angegeben = Number(request.headers.get('content-length') ?? 0);
  if (angegeben > GROESSE_MAX) return NextResponse.json({ fehler: 'zu gross' }, { status: 413 });
  let roh = Buffer.from(await request.arrayBuffer());
  if (roh.length > GROESSE_MAX) return NextResponse.json({ fehler: 'zu gross' }, { status: 413 });
  try {
    // Am Inhalt erkannt, nicht am Kopf: packt ein Netz dazwischen schon aus, bleibt der Kopf womoeglich stehen. gunzip laeuft im Thread-Pool, nicht hier.
    if (roh[0] === 0x1f && roh[1] === 0x8b) roh = await gunzip(roh, { maxOutputLength: GROESSE_MAX });
  } catch { return NextResponse.json({ fehler: 'gzip nicht lesbar' }, { status: 400 }); }

  type Teil = { windowId?: unknown; eventId?: unknown; matches?: { id?: unknown }[]; schadenFassung?: unknown; schaden?: unknown; spiele?: unknown };
  let teil: Teil;
  try { teil = JSON.parse(roh.toString('utf8')) as Teil; } catch { return NextResponse.json({ fehler: 'kein JSON' }, { status: 400 }); }
  const w = typeof teil?.windowId === 'string' ? teil.windowId : '';
  const id = Array.isArray(teil?.matches) && teil.matches.length === 1 && typeof teil.matches[0]?.id === 'string' ? teil.matches[0].id as string : '';
  if (!FENSTER_OK.test(w)) return NextResponse.json({ fehler: 'windowId fehlt oder ungueltig' }, { status: 400 });
  if (!MATCH_OK.test(id)) return NextResponse.json({ fehler: 'genau ein Match mit gueltiger id erwartet' }, { status: 400 });
  if (typeof teil.schadenFassung !== 'number' || typeof teil.eventId !== 'string' || !teil.schaden || typeof teil.schaden !== 'object' || !teil.spiele || typeof teil.spiele !== 'object') {
    return NextResponse.json({ fehler: 'kein Teilstand (schadenFassung, eventId, schaden, spiele)' }, { status: 400 });
  }

  // Schon da (im Eingang oder bei der Live-Spur, mit derselben Schadensregel)? Dann nichts tun.
  const ziel = path.join(EINGANG(), w, `${id}.json`);
  const vorhanden = [ziel, path.join(LIVE_ORT(), 'teil', w, `${id}.json`)];
  for (const p of vorhanden) {
    if (await da(p) && (await fassungVon(p)) === teil.schadenFassung) {
      return NextResponse.json({ ok: true, schonDa: true, windowId: w, matchId: id, ms: +(performance.now() - beginn).toFixed(1) });
    }
  }
  if (await da(path.join(LIVE_ORT(), 'archiv', w, `${id}.json.gz`))) {
    // Schon im Release (die Live-Spur hat den Teil archiviert): das Archiv ist massgeblich.
    return NextResponse.json({ ok: true, schonDa: true, imRelease: true, windowId: w, matchId: id, ms: +(performance.now() - beginn).toFixed(1) });
  }

  try {
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    const tmp = `${ziel}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, roh);
    await fs.rename(tmp, ziel);
  } catch (e) {
    return NextResponse.json({ fehler: `nicht abgelegt: ${(e as Error).message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, angenommen: true, windowId: w, matchId: id, bytes: roh.length, ms: +(performance.now() - beginn).toFixed(1) });
}
