import { NextResponse } from 'next/server';
import { findeSpieler, holeSeite, getToken, loeseNamenAuf, type CupEintrag } from '@/lib/epicCups';
import { szeneFenster } from '@/lib/szeneStats';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Die Werte eines einzelnen Spielers in einem Cup - fuer die Ansicht "Player Stats" auf der Cup-Seite (wie bei Osirion).
 *
 *   GET ?event=&window=&q=NAME         -> Treffer in der Bestenliste (bis zu zehn), zum Auswaehlen
 *   GET ?event=&window=&id=EPIC-ID     -> alles zu diesem Spieler
 *
 * Quellen, jede mit dem, was sie wirklich hat:
 *   - Epics Bestenliste (jeder Cup): Platz, Punkte - getrennt nach Platzierung und Eliminierungen -, je Spiel Platz, Eliminierungen,
 *     Ueberlebenszeit; bei manchen Cups auch Schaden, Kopftreffer, Heilung, Strecke.
 *   - Die Szene-Quelle (die Spieltage, die sie fuehrt, vor allem Finals): Schaden, Treffer, Schuesse, Heilung, Material, Sturm, Strecke ...
 *     Je Spieltag zusammen, nicht je Spiel.
 * Was keine der beiden Quellen kennt (Edit-Werte, Surge-Treffer, Reboots einzeln), liefert diese Schnittstelle nicht - die Ansicht sagt es.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const normId = (s: string) => s.replace(/-/g, '').toLowerCase();

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = p.get('event') ?? '';
  const fenster = p.get('window') ?? '';
  const id = normId(p.get('id') ?? '');
  const q = (p.get('q') ?? '').trim();
  if (!event || !fenster || (!id && q.length < 2)) {
    return NextResponse.json({ ok: false, error: 'Cup und Spieler fehlen.' }, { status: 400 });
  }
  try {
    if (!id) {
      const r = await findeSpieler(event, fenster, [q], [], 40);
      const treffer = r.entries.flatMap((e) => e.players
        .filter((pl) => pl.name.toLowerCase().includes(q.toLowerCase()))
        .map((pl) => ({ id: pl.id, name: pl.name, rank: e.rank, points: e.points })))
        .slice(0, 10);
      return NextResponse.json({ ok: true, treffer, gesucht: r.scannedPages, seiten: r.totalPages }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const r = await findeSpieler(event, fenster, [], [id], 60);
    const eintrag: CupEintrag | undefined = r.entries[0];

    // Der Name: aus der Bestenliste, sonst frisch bei Epic (wer den Cup nicht gespielt hat, steht dort nicht).
    let name = eintrag?.players.find((x) => normId(x.id) === id)?.name ?? '';
    if (!name) {
      try {
        const { token } = await getToken();
        name = (await loeseNamenAuf([id], token))[id] ?? '';
      } catch { /* ohne Namen bleibt die Id */ }
    }

    // Wie viele Teilnehmer der Cup hat - fuer "Top x %".
    let gesamt = 0; let aktualisiert: string | null = null;
    try {
      const erste = await holeSeite(event, fenster, 0, true);
      aktualisiert = erste.updated ?? null;
      const proSeite = erste.entries.length;
      if (erste.totalPages > 1 && proSeite) {
        const letzte = await holeSeite(event, fenster, erste.totalPages - 1, true);
        gesamt = (erste.totalPages - 1) * proSeite + letzte.entries.length;
      } else gesamt = proSeite;
    } catch { /* ohne Gesamtzahl keine Prozentangabe */ }

    // Die Szene-Quelle, wo sie diesen Spieltag fuehrt.
    let szene: Record<string, number> | null = null; let szeneStand: string | null = null; let szeneMatches = 0;
    try {
      const sz = await szeneFenster([fenster]);
      const s = sz?.spieler.find((x) => normId(x.epicId) === id);
      if (s) {
        const werte: Record<string, number> = {};
        for (const [k, v] of Object.entries(s)) if (typeof v === 'number') werte[k] = v;
        szene = werte; szeneStand = sz?.aktualisiert ?? null; szeneMatches = sz?.matches ?? 0;
      }
    } catch { /* ohne Szene-Quelle bleibt es bei Epics Werten */ }

    const antwort = {
      ok: true, id, name, dabei: !!eintrag,
      rank: eintrag?.rank ?? null, gesamt,
      top: eintrag && gesamt ? +((eintrag.rank / gesamt) * 100).toFixed(1) : null,
      eintrag: eintrag ?? null,
      aktualisiert, szene, szeneStand, szeneMatches,
    };
    return zwischenspeichern(NextResponse.json(antwort, { headers: { 'Cache-Control': 'no-store' } }), 60);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Epic liefert gerade nichts.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
