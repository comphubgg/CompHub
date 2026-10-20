import { NextResponse } from 'next/server';
import { werSchreibt } from '@/lib/werSchreibt';
import { alleVips, bereinige, leererPro, liesPros, schreibePros, standardBild } from '@/lib/pov';
import { orgKonten, orgPovStand } from '@/lib/orgPov';

/*
 * Die POVs der eigenen Org (Betreiber, 20.10.2026) - siehe lib/orgPov.
 *
 *   GET  ?org=<Kennung>            die Pro-Konten des Kaders mit Stand (live?, Zuschauer) und Einstellungen, dazu die VIPs zur Auswahl (der Admin darf ?org= jeder Org)
 *   POST { org?, ident, teil }     erlaubt | qualitaet | hud eines dieser POVs aendern - mehr darf die Org nicht (Bild, Discord, Server bleiben beim Spieler)
 *
 * Fehler gehen mit Status unter 500 hinaus: der Lastverteiler vor der Seite haelt 5xx fuer einen Ausfall und liefert dann eine Fehlerseite.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

async function wessen(orgParam: string | null): Promise<{ id: string } | { fehler: Response }> {
  const w = await werSchreibt();
  const id = (w.org || (w.rolle === 'admin' ? orgParam ?? '' : '')).toLowerCase();
  if (!id) return { fehler: NextResponse.json({ ok: false, error: 'Dieses Konto verwaltet keine Organisation.' }, { status: 403, headers: nie }) };
  return { id };
}

export async function GET(request: Request) {
  const w = await wessen(new URL(request.url).searchParams.get('org'));
  if ('fehler' in w) return w.fehler;
  try {
    const stand = await orgPovStand(w.id);
    const vips = await alleVips();
    return NextResponse.json({ ok: true, ...stand, vips }, { headers: nie });
  } catch { return NextResponse.json({ ok: false, error: 'Die Ablage antwortet gerade nicht.' }, { headers: nie }); }
}

export async function POST(request: Request) {
  let k: { org?: string; ident?: string; teil?: Record<string, unknown> } = {};
  try { k = await request.json(); } catch { /* leerer Rumpf */ }
  const w = await wessen(k.org ?? null);
  if ('fehler' in w) return w.fehler;
  try {
    const { konten } = await orgKonten(w.id);
    const ziel = konten.find((x) => `k:${x.id}` === k.ident);
    if (!ziel || !k.ident) return NextResponse.json({ ok: false, error: 'Dieses POV gehört nicht zu deiner Organisation.' }, { status: 403, headers: nie });
    // Nur diese drei Felder - alles andere am POV bleibt beim Spieler.
    const t = k.teil ?? {};
    const teil: Record<string, unknown> = {};
    if ('erlaubt' in t) teil.erlaubt = t.erlaubt;
    if ('qualitaet' in t) teil.qualitaet = t.qualitaet;
    if ('hud' in t) teil.hud = t.hud;
    const alle = await liesPros();
    const alt = alle[k.ident] ?? leererPro(k.ident, ziel.name, await standardBild(k.ident));
    const vips = new Set((await alleVips()).flatMap((v) => v.auch));
    alle[k.ident] = { ...bereinige(alt, teil, vips), name: alt.name || ziel.name };
    await schreibePros(alle);
    return NextResponse.json({ ok: true, ...(await orgPovStand(w.id)) }, { headers: nie });
  } catch { return NextResponse.json({ ok: false, error: 'Die Ablage antwortet gerade nicht.' }, { headers: nie }); }
}
