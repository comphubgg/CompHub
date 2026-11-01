import { NextResponse } from 'next/server';
import { liesVerzeichnis, summen, saisonName } from '@/lib/szeneStats';
import { spielerKontext } from '@/lib/globalsSolos';
import { CDN_FRIST } from '@/lib/antwortSpeicher';
import { fncsRekorde, fncsEreignisse } from '@/lib/fncsEreignisse';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { elimsAuswahl, vglElims, nameVgl } from '@/lib/fncsReihenfolge';

/*
 * Die FNCS-Seite: Eliminierungen in den Grand Finals der FNCS-Majors, Spieler gegen Major.
 *
 * Der Betreiber (13.10.2026): eine FNCS-Seite wie beim Vorbild - alle Endspiele und eine Aufstellung, wie viele Eliminierungen
 * jeder in den Grand Finals hatte, je Major. Gerechnet wird aus dem eigenen Archiv (data/szene-stats): die europaeischen
 * Endspieltage der Majors, die das Archiv fuehrt - jeder Major mit seinen zwei Tagen. Was das Archiv nicht hat (aeltere
 * Majors, die LANs), steht hier nicht; die Seite sagt, ab wann sie zaehlt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ENDSPIEL = /FNCS_?Major(\d)_(?:GrandFinal|Final)_?Day(\d)/i;

/*
 * Ueber lib/ueberdauernd (29.10.2026): die letzte gute Antwort kommt sofort, auch nach einem Neustart und auf der Ausweichseite ohne den PC daheim
 * (dort lief die Rechnung in Netlifys Frist). Neu gerechnet wird nach dreissig Minuten im Hintergrund.
 */
export async function GET() {
  try {
    // Eine Antwort mit fehlenden Endspielen gilt nur kurz als frisch - dann wird bald neu gefragt.
    const antwort = await ueberdauernd('fncs-alltime', letzteUnvollstaendig ? 2 * 60_000 : 30 * 60_000, 7 * 864e5, rechnen);
    if (!antwort) throw new Error('Keine FNCS-Endspiele im Archiv');
    return NextResponse.json(antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}

/*
 * Fehlende Endspiele (rekorde.fehlend > 0): Die Summen waeren zu klein. Gibt es eine aeltere Antwort mit vollstaendigen Rekorden (hoechstens einen Tag alt),
 * kommt die stattdessen; sonst die unvollstaendige (ein Endspiel, das Epic dauerhaft nicht mehr fuehrt, soll die Seite nicht lahmlegen).
 * Die vollstaendigen Antworten liegen zusaetzlich unter eigenem Schluessel; "gerechnetAm" sagt, wie alt sie sind.
 */
const VOLL_MAX_ALTER = 864e5;
let letzteUnvollstaendig = false;

async function rechnen() {
  const neu = await rechnenRoh();
  const unvollstaendig = Boolean(neu.rekorde && (neu.rekorde.fehlend ?? 0) > 0);
  letzteUnvollstaendig = unvollstaendig;
  if (!unvollstaendig) {
    // Vollstaendig: als letzte vollstaendige Antwort ablegen.
    if (neu.rekorde) {
      const stempel = { ...neu, gerechnetAm: Date.now() };
      await ueberdauernd('fncs-alltime-voll', 0, 7 * 864e5, async () => stempel).catch(() => null);
    }
    return neu;
  }
  // Nur lesen: nichts rechnen, nichts ueberschreiben (null).
  const alt = await ueberdauernd<typeof neu & { gerechnetAm?: number }>('fncs-alltime-voll', Number.MAX_SAFE_INTEGER, 7 * 864e5, async () => null).catch(() => null);
  if (alt && typeof alt.gerechnetAm === 'number' && Date.now() - alt.gerechnetAm < VOLL_MAX_ALTER && alt.rekorde && !((alt.rekorde.fehlend ?? 0) > 0)) {
    const { gerechnetAm: _g, ...rest } = alt;
    void _g;
    return rest;
  }
  return neu;
}

async function rechnenRoh() {
  {
    const verz = (await liesVerzeichnis()).filter((e) => e.region === 'EU');
    // Je Major (Saison + Nummer) die beiden Endspieltage.
    const gruppen = new Map<string, { saison: string; nr: number; tage: string[] }>();
    for (const e of verz) {
      const m = ENDSPIEL.exec(e.windowId);
      if (!m) continue;
      const k = `${e.season}-M${m[1]}`;
      const g = gruppen.get(k) ?? { saison: e.season, nr: Number(m[1]), tage: [] };
      if (!g.tage.includes(e.windowId)) g.tage.push(e.windowId);
      gruppen.set(k, g);
    }
    const events = [...gruppen.entries()]
      .map(([key, g]) => ({ key, titel: `FNCS Major ${g.nr}`, saison: g.saison, saisonKurz: saisonName(g.saison).replace(/Chapter\s*(\d+)\s*Season\s*(\S+)/i, 'CH$1 S$2'), saisonName: saisonName(g.saison), tage: g.tage }))
      .sort((a, b) => Number(a.saison.slice(1)) - Number(b.saison.slice(1)) || a.titel.localeCompare(b.titel));
    if (!events.length) throw new Error('Keine FNCS-Endspiele im Archiv');

    const kontext = await spielerKontext();
    const je = new Map<string, { id: string; name: string; je: Record<string, number>; gesamt: number }>();
    for (const ev of events) {
      const s = await summen({ events: ev.tage, region: 'EU' });
      for (const sp of s.spieler) {
        if (!(sp.elims > 0) && !(sp.matches > 0)) continue;
        const x = je.get(sp.epicId) ?? { id: sp.epicId, name: sp.name, je: {}, gesamt: 0 };
        x.je[ev.key] = (x.je[ev.key] ?? 0) + sp.elims;
        x.gesamt += sp.elims;
        x.name = sp.name;
        je.set(sp.epicId, x);
      }
    }
    // Mit dem angezeigten Namen sortieren und erst dann auf 80 kuerzen: die Seite sortiert nach dem Anzeigenamen (vglElims), und bei
    // gleich vielen Eliminierungen entschied hier sonst der rohe Epic-Name - die Reihenfolge und wer an Platz 80 noch dabei ist, wichen ab.
    const alle = [...je.values()].map((x) => {
      const k = kontext(x.id, x.name);
      return { id: x.id, name: k.anzeige, land: k.land, bild: k.bild, gesamt: x.gesamt, je: x.je };
    });
    // Die Tabelle laesst sich nach Total und nach jedem Major sortieren - jede Sortierung zeigt ihre 80 Besten. Damit keine Liste
    // unvollstaendig ist, liefert die Antwort die Vereinigung: die 80 nach Total plus die 80 je Major (ohne Doppelte).
    const top = elimsAuswahl(alle, 'gesamt');
    const dabei = new Set(top.map((x) => x.id));
    for (const ev of events) for (const x of elimsAuswahl(alle, ev.key)) dabei.add(x.id);
    const spieler = alle.filter((x) => dabei.has(x.id)).sort(vglElims);
    // Die Titel (FNCS-Sieger) seit Chapter 1 - aus der Spielerliste der Szene-Quelle - und nach Land.
    // Titel = erste Plaetze in den Endspielen der FNCS-Seite (Grand Finals, Globals, Invitational, Summit) - je Spieler des Siegerteams.
    const siegerJe = new Map<string, { name: string; land: string | null; titel: number }>();
    for (const e of await fncsEreignisse()) {
      // Die Titel zaehlen die europaeischen Grand Finals, die Globals, das Invitational und die Summit - nicht die Majors der anderen Regionen.
      if (e.regionCode !== 'EU' && e.regionCode !== 'GLOBAL') continue;
      for (const sp of e.spitze.find((x) => x.rang === 1)?.spieler ?? []) {
        const k = sp.name.toLowerCase();
        const a = siegerJe.get(k) ?? { name: sp.name, land: sp.land, titel: 0 };
        a.titel += 1; a.land = a.land ?? sp.land; siegerJe.set(k, a);
      }
    }
    // Bei gleich vielen Titeln entscheidet die Staerke (Platz in der Eliminierungs-Aufstellung der Grand Finals) - nie das Alphabet (Betreiber).
    const staerke = new Map(top.map((x, i) => [x.name.toLowerCase(), i] as const));
    const titel = [...siegerJe.values()].sort((a, b) => b.titel - a.titel || (staerke.get(a.name.toLowerCase()) ?? 1e6) - (staerke.get(b.name.toLowerCase()) ?? 1e6) || nameVgl(a.name, b.name)).map((t) => ({ id: t.name, ...t }));
    // Laender: mehr Titel, dann mehr verschiedene Titelgewinner, dann Laendercode.
    const nachLand = new Map<string, { titel: number; koepfe: number }>();
    for (const t of titel) if (t.land) { const a = nachLand.get(t.land) ?? { titel: 0, koepfe: 0 }; a.titel += t.titel; a.koepfe += 1; nachLand.set(t.land, a); }
    const laender = [...nachLand.entries()].sort(([ca, a], [cb, b]) => b.titel - a.titel || b.koepfe - a.koepfe || nameVgl(ca, cb)).map(([land, a]) => ({ land, titel: a.titel }));
    // Punkte, Siege, Eliminierungen und Rekorde der Grand Finals, die Epic noch fuehrt.
    const rekorde = await fncsRekorde().catch(() => null);
    return { ok: true, events, spieler, ab: events[0]?.saisonName ?? '', titel, laender, rekorde };
  }
}
