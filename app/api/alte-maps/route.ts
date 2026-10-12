import { NextResponse } from 'next/server';
import { werSchreibt, darfKarteAendern } from '@/lib/werSchreibt';
import { mapsVerzeichnis, vergissVerzeichnis, versteckteKarten } from '@/lib/mapsVerzeichnis';
import { typVon } from '@/lib/mapsTyp';
import { SAISON_NAMEN } from '@/lib/szeneStats';
import { ALT, aendereAltStore, alteBearbeitung, type AltEreignis, type AltForm, type AltTeam } from '@/lib/alteMaps';

/*
 * Die alten Karten bearbeiten - nur Admin (lib/alteMaps).
 *
 *   GET  ?t=<Turnier>&w=<Fenster>   Teams, gespeicherte Formen und ob die Teams von Hand kommen
 *   POST { aktion: 'speichern', w, formen, teams? }
 *   POST { aktion: 'neu', cup, fenster, saison, datum?, lan? }      ein eigenes Event anlegen
 *   POST { aktion: 'verstecken', w, versteckt }                      eine Karte aus der Liste nehmen oder zurueckholen
 *   POST { aktion: 'loeschen', w }                                   ein selbst angelegtes Event loeschen
 *
 * Gespeichert wird in alte-maps.json. Beim Speichern zaehlt nur, was hier geprueft wurde: Formen liegen in Prozent des
 * Kartenbildes, Namen sind kurz, die Mengen sind begrenzt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NEIN = { 'Cache-Control': 'no-store' };

async function nurAdmin() {
  if (darfKarteAendern(await werSchreibt())) return null;
  return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403, headers: NEIN });
}

const text = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const prozent = (x: unknown) => Math.round(Math.min(100, Math.max(0, Number(x) || 0)) * 100) / 100;

function pruefeFormen(x: unknown): AltForm[] | null {
  if (!Array.isArray(x) || x.length > 400) return null;
  const raus: AltForm[] = [];
  for (const f of x as Array<{ id?: unknown; punkte?: unknown; teamIds?: unknown }>) {
    if (!Array.isArray(f?.punkte) || f.punkte.length < 3 || f.punkte.length > 60) return null;
    raus.push({
      id: text(f.id, 40) || `f${raus.length}`,
      punkte: (f.punkte as Array<{ x?: unknown; y?: unknown }>).map((p) => ({ x: prozent(p?.x), y: prozent(p?.y) })),
      teamIds: Array.isArray(f.teamIds) ? (f.teamIds as unknown[]).map((i) => text(i, 120)).filter(Boolean).slice(0, 20) : [],
    });
  }
  return raus;
}

function pruefeTeams(x: unknown): AltTeam[] | null {
  if (!Array.isArray(x) || x.length > 400) return null;
  const raus: AltTeam[] = [];
  for (const t of x as Array<{ id?: unknown; spieler?: unknown; rang?: unknown; punkte?: unknown }>) {
    const spieler = Array.isArray(t?.spieler)
      ? (t.spieler as Array<{ name?: unknown; epicId?: unknown; land?: unknown }>).slice(0, 4)
        .map((p) => ({
          name: text(p?.name, 60),
          ...(text(p?.epicId, 40) ? { epicId: text(p?.epicId, 40) } : {}),
          ...(/^[A-Za-z]{2}$/.test(String(p?.land ?? '')) ? { land: String(p?.land).toUpperCase() } : {}),
        })).filter((p) => p.name)
      : [];
    if (!spieler.length) continue;
    const zahl = (v: unknown) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    raus.push({ id: text(t.id, 60) || `hand-${raus.length}`, spieler, rang: zahl(t.rang), punkte: zahl(t.punkte) });
  }
  return raus;
}

export async function GET(request: Request) {
  const nein = await nurAdmin();
  if (nein) return nein;
  const p = new URL(request.url).searchParams;
  if (p.get('versteckte') === '1') {
    const liste = await versteckteKarten();
    return NextResponse.json({ ok: true, versteckte: liste.map((e) => ({ windowId: e.windowId, titel: e.titel, saisonKurz: e.saison })) }, { headers: NEIN });
  }
  const [t, w] = [p.get('t') ?? '', p.get('w') ?? ''];
  const e = (await mapsVerzeichnis()).find((x) => x.turnierId === t && x.windowId === w);
  if (!e || !e.alt) return NextResponse.json({ ok: false, error: 'Diese Karte gibt es nicht oder sie ist nicht von Hand zu bearbeiten.' }, { status: 404, headers: NEIN });
  return NextResponse.json({ ok: true, ...await alteBearbeitung(e) }, { headers: NEIN });
}

export async function POST(request: Request) {
  const nein = await nurAdmin();
  if (nein) return nein;
  const k = await request.json().catch(() => ({})) as Record<string, unknown>;
  const aktion = String(k.aktion ?? '');
  const w = text(k.w, 160);

  if (aktion === 'speichern') {
    const formen = pruefeFormen(k.formen);
    if (!w || !formen) return NextResponse.json({ ok: false, error: 'Die Formen sind nicht lesbar.' }, { status: 400, headers: NEIN });
    const teams = k.teams === undefined ? undefined : pruefeTeams(k.teams);
    if (teams === null) return NextResponse.json({ ok: false, error: 'Die Teams sind nicht lesbar.' }, { status: 400, headers: NEIN });
    const e = (await mapsVerzeichnis()).find((x) => x.windowId === w && x.alt);
    if (!e) return NextResponse.json({ ok: false, error: 'Diese Karte gibt es nicht.' }, { status: 404, headers: NEIN });
    const r = await aendereAltStore((s) => {
      const alt = s.fenster[w] ?? {};
      s.fenster[w] = { ...alt, formen, ...(teams && !e.eventId ? { teams } : {}) };
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.grund }, { status: 503, headers: NEIN });
    vergissVerzeichnis();
    return NextResponse.json({ ok: true }, { headers: NEIN });
  }

  if (aktion === 'neu') {
    const cup = text(k.cup, 80); const fenster = text(k.fenster, 80);
    const saison = text(k.saison, 8);
    if (!cup || !fenster || !SAISON_NAMEN[saison]) return NextResponse.json({ ok: false, error: 'Cup, Spieltag und Saison werden gebraucht.' }, { status: 400, headers: NEIN });
    const datum = k.datum ? Date.parse(String(k.datum)) : NaN;
    const nr = /(\d+)/.exec(fenster);
    const id = `alt_admin_${Date.now().toString(36)}`;
    const ereignis: AltEreignis = {
      windowId: id, turnierId: `${ALT}${saison}-${cup.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      cup, fenster, saison, typ: typVon(`${cup} ${fenster}`), datum: Number.isFinite(datum) ? datum : null, ende: null,
      eventId: null, bild: null, lan: !!k.lan, reihe: nr ? Number(nr[1]) : 1, quelle: 'admin',
    };
    const r = await aendereAltStore((s) => { s.ereignisse.push(ereignis); });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.grund }, { status: 503, headers: NEIN });
    vergissVerzeichnis();
    return NextResponse.json({ ok: true, ereignis }, { headers: NEIN });
  }

  if (aktion === 'verstecken') {
    if (!w) return NextResponse.json({ ok: false, error: 'Fenster fehlt.' }, { status: 400, headers: NEIN });
    const r = await aendereAltStore((s) => { s.fenster[w] = { ...(s.fenster[w] ?? {}), versteckt: !!k.versteckt }; });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.grund }, { status: 503, headers: NEIN });
    vergissVerzeichnis();
    return NextResponse.json({ ok: true }, { headers: NEIN });
  }

  if (aktion === 'loeschen') {
    let gefunden = false;
    const r = await aendereAltStore((s) => {
      const vorher = s.ereignisse.length;
      s.ereignisse = s.ereignisse.filter((e) => e.windowId !== w);
      gefunden = s.ereignisse.length < vorher;
      if (gefunden) delete s.fenster[w];
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.grund }, { status: 503, headers: NEIN });
    if (!gefunden) return NextResponse.json({ ok: false, error: 'Nur selbst angelegte Events lassen sich löschen - andere kannst du verstecken.' }, { status: 400, headers: NEIN });
    vergissVerzeichnis();
    return NextResponse.json({ ok: true }, { headers: NEIN });
  }

  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400, headers: NEIN });
}
