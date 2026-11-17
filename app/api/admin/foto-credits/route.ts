import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { CREDIT_FELDER, DATEI_MUSTER, liesCredits, setzeCredits, type CreditEingabe } from '@/lib/fotoCredits';
import { spielerbildGross } from '@/lib/spielerbildKlein';

/*
 * Spielerfotos und ihre Fotografen-Angaben - nur fuer den Admin, die Seite dazu ist /admin/fotos-credits (lib/fotoCredits.ts).
 *
 *   GET  -> { zeilen: [{ epicId, name, datei, foto, bild, events, credit }] }  je Spieler aus spielerbilder.json, mit oder ohne echtes Foto
 *   POST { dateien: [..], felder: { quelle?, fotograf?, link?, lizenz?, bestaetigt?, wahrscheinlich?, notiz? } }
 *        -> setzt die genannten Felder fuer alle Dateien (eine Zeile oder die Mehrfachauswahl); ein Feld, das fehlt, bleibt; "" loescht.
 *
 * Hochgeladen wird ueber /api/spielerbild/hochladen - mit denselben Feldern im Formular.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nein = () => NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });

interface Bild { datei?: string; epicId?: string; name?: string; echtesFoto?: boolean; events?: number; matches?: number }

export async function GET() {
  if (!await istAdminAnfrage()) return nein();
  const [bilder, profile, credits] = await Promise.all([
    liesJson<Bild[]>('spielerbilder.json', []),
    liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
    liesCredits(),
  ]);
  const zeilen = (Array.isArray(bilder) ? bilder : []).filter((b) => b?.epicId || b?.datei).map((b) => {
    const datei = String(b.datei ?? '');
    const foto = Boolean(b.echtesFoto && datei);
    return {
      epicId: String(b.epicId ?? ''),
      name: String(profile[String(b.epicId ?? '')]?.anzeige || b.name || datei.replace(/\.[^.]+$/, '')).trim(),
      datei, foto,
      bild: foto ? spielerbildGross(datei) : null,
      events: Number(b.events ?? 0),
      credit: foto ? credits[datei] ?? null : null,
    };
  });
  return NextResponse.json({ ok: true, zeilen }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  let e: { dateien?: unknown; felder?: Record<string, unknown> };
  try { e = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Kein JSON' }, { status: 400 }); }
  const dateien = (Array.isArray(e.dateien) ? e.dateien : []).map(String).filter((d) => DATEI_MUSTER.test(d)).slice(0, 2000);
  if (!dateien.length) return NextResponse.json({ ok: false, error: 'Keine Fotos gewählt' }, { status: 400 });
  const felder: CreditEingabe = {};
  for (const f of CREDIT_FELDER) if (e.felder?.[f] !== undefined) felder[f] = e.felder[f];
  if (!Object.keys(felder).length) return NextResponse.json({ ok: false, error: 'Keine Felder' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, credits: await setzeCredits(dateien, felder) });
  } catch (f) {
    return NextResponse.json({ ok: false, error: `Speichern gescheitert: ${(f as Error).message}` }, { status: 503 });
  }
}
