import { NextResponse } from 'next/server';
import { saisonName } from '@/lib/szeneStats';
import { spielerKontext } from '@/lib/globalsSolos';
import { CDN_FRIST } from '@/lib/antwortSpeicher';
import { fncsEreignisse, type FncsRekorde, type RekordZeile } from '@/lib/fncsEreignisse';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { vglElims, nameVgl, vglLeaderboard, vglRekord } from '@/lib/fncsReihenfolge';
import { liesJson } from '@/lib/ablage';
import { liesLanKonten } from '@/lib/lanKonten';
import { landVonName } from '@/lib/fncsListe';
import { FNCS_FAKTEN } from '@/lib/fncsFakten';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { antwortMitAktuellenFotos } from '@/lib/aktuelleFotos';

/*
 * Die FNCS-Seite: Eliminierungen in den Grand Finals der FNCS-Majors, Spieler gegen Major.
 *
 * Der Betreiber (13.10.2026): alle Endspiele und eine Aufstellung, wie viele Eliminierungen jeder in den Grand Finals hatte,
 * je Major. Seit dem 17.11.2026 aus data/fncs-endspiele.json: Epics eigene Bestenlisten der europaeischen Grand Finals und der
 * Global Championships, je Endspiel beide Tage zusammen (scripts/fncs-endspiele-holen.mjs, Ablauf fncs-endspiele.yml). Epic fuehrt
 * Eliminierungen nur je Team - jeder Spieler traegt die seines Teams (bei Solo-Finals sind es seine eigenen). Gelesen wird die Datei
 * erst beim ersten Aufruf, nie beim Start. Was Epic nicht mehr herausgibt, steht nicht da; die Seite sagt, welche Endspiele zaehlen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/*
 * Ueber lib/ueberdauernd (29.10.2026): die letzte gute Antwort kommt sofort, auch nach einem Neustart und auf der Ausweichseite ohne den PC daheim
 * (dort lief die Rechnung in Netlifys Frist). Neu gerechnet wird nach dreissig Minuten im Hintergrund. Der Schluessel v3 (17.11.2026): die Antworten
 * davor kamen aus dem alten Spieltage-Verzeichnis und werden nicht mehr ausgeliefert.
 */
async function holeGET() {
  try {
    const antwort = await ueberdauernd('fncs-alltime-v3', 30 * 60_000, 7 * 864e5, rechnenRoh);
    if (!antwort) throw new Error('Keine FNCS-Endspiele im Archiv');
    return NextResponse.json(antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Was scripts/fncs-endspiele-holen.mjs ablegt. */
interface EndspielTeam { rang: number; punkte: number; siege: number; elims: number; spiele: number; spieler: string[] }
interface Endspiel {
  key: string; saison: string; art: 'gf' | 'gc'; region: string; titel: string; nr?: number; jahr?: number;
  eventId: string; fenster: string[]; datum: number | null; teams: EndspielTeam[];
}
interface EndspielDatei { stand?: string; endspiele?: Endspiel[]; fehlend?: Array<{ key: string; saison: string; titel: string; grund: string }>; namen?: Record<string, string>; laender?: Record<string, string> }

/** Ein Name ohne Turniermarke und Orgtag ("[FNCS24] EXD Peterbot" -> "Peterbot"), wie auf den Endspiel-Karten. */
const rein = (n: string) => ohneZierrat(kernname(n)).trim() || n;
const NUR_ID = /^[0-9a-f]{8,32}$/i;
const kurz = (saison: string) => saisonName(saison).replace(/Chapter\s*(\d+)\s*Season\s*(\S+)/i, 'CH$1 S$2');

async function rechnenRoh() {
  const daten = await liesJson<EndspielDatei | null>('fncs-endspiele.json', null).catch(() => null);
  const alle = (daten?.endspiele ?? []).filter((e) => e.teams?.length).sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0) || Number(a.saison.slice(1)) - Number(b.saison.slice(1)));
  if (!alle.length) throw new Error('Keine FNCS-Endspiele in der Ablage (fncs-endspiele.json)');
  const [kontext, landName, lan] = await Promise.all([spielerKontext(), landVonName(), liesLanKonten()]);
  const namen = daten?.namen ?? {};
  const epicLand = daten?.laender ?? {};
  // Turnierkonten der LANs ("[FNCSGC26] BIG Vico") zaehlen fuer das echte Konto (scripts/lan-konten-zuordnen.mjs).
  const echt = (id: string) => lan[id]?.echt ?? id;
  /** Name und Land eines Kontos: unser Profil, sonst Epics Name ohne Orgtag; Flagge aus Profil, Fortnite-Flagge, Name. */
  const person = (rohId: string) => {
    const id = echt(rohId);
    const k = kontext(id, namen[id] ?? namen[rohId] ?? lan[rohId]?.name ?? '');
    const anzeige = k.anzeige && !NUR_ID.test(k.anzeige) ? rein(k.anzeige) : '';
    const land = k.land ?? (epicLand[id] || epicLand[rohId] || null) ?? (anzeige ? landName(anzeige) : null);
    return { id, name: anzeige, land, bild: k.bild };
  };

  // 1. Eliminierungen je Spieler und Grand Finals (Europa): die seines Teams, beide Tage zusammen.
  const gfs = alle.filter((e) => e.art === 'gf' && e.region === 'EU');
  const events = gfs.map((e) => ({
    key: e.key, titel: e.titel, saison: e.saison, saisonKurz: kurz(e.saison), saisonName: saisonName(e.saison), tage: e.fenster,
  }));
  const je = new Map<string, { id: string; name: string; land: string | null; bild: string | null; je: Record<string, number>; gesamt: number }>();
  for (const e of gfs) {
    for (const t of e.teams) {
      for (const roh of t.spieler) {
        const p = person(roh);
        if (!p.name) continue;
        const x = je.get(p.id) ?? { ...p, je: {}, gesamt: 0 };
        x.je[e.key] = (x.je[e.key] ?? 0) + t.elims;
        x.gesamt += t.elims;
        je.set(p.id, x);
      }
    }
  }
  const spieler = [...je.values()].sort(vglElims).slice(0, 150)
    .map((x) => ({ id: x.id, name: x.name, land: x.land, bild: x.bild, gesamt: x.gesamt, je: x.je }));

  // 2. Die Titel (FNCS-Sieger) und nach Land - aus der Liste der FNCS-Seite, wie bisher.
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
  const staerke = new Map(spieler.map((x, i) => [x.name.toLowerCase(), i] as const));
  const titel = [...siegerJe.values()].sort((a, b) => b.titel - a.titel || (staerke.get(a.name.toLowerCase()) ?? 1e6) - (staerke.get(b.name.toLowerCase()) ?? 1e6) || nameVgl(a.name, b.name)).map((t) => ({ id: t.name, ...t }));
  // Laender: mehr Titel, dann mehr verschiedene Titelgewinner, dann Laendercode.
  const nachLand = new Map<string, { titel: number; koepfe: number }>();
  for (const t of titel) if (t.land) { const a = nachLand.get(t.land) ?? { titel: 0, koepfe: 0 }; a.titel += t.titel; a.koepfe += 1; nachLand.set(t.land, a); }
  const laender = [...nachLand.entries()].sort(([ca, a], [cb, b]) => b.titel - a.titel || b.koepfe - a.koepfe || nameVgl(ca, cb)).map(([land, a]) => ({ land, titel: a.titel }));

  // 3. Punkte, Siege, Eliminierungen und Rekorde - alle Endspiele der Datei (Grand Finals Europa und Global Championships).
  const rekorde = rekordeAus(alle, person, landName);
  return { ok: true, events, spieler, ab: events[0]?.saisonName ?? '', titel, laender, rekorde };
}

/** Die All-Time-Bestenliste (Punkte, Siege, Eliminierungen je Spieler ueber alle Endspiele) und die Rekorde einzelner Endspiele. */
function rekordeAus(
  alle: Endspiel[],
  person: (id: string) => { id: string; name: string; land: string | null },
  landName: (n: string) => string | null,
): FncsRekorde {
  const je = new Map<string, { name: string; land: string | null; punkte: number; siege: number; elims: number; finals: number }>();
  const alleTeams: Array<{ event: string; punkte: number; siege: number; elims: number; spieler: Array<{ name: string; land: string | null }> }> = [];
  const finals: string[] = [];
  for (const e of alle) {
    const label = e.art === 'gc' ? `${e.jahr ?? ''} Global Championship`.trim() : `${kurz(e.saison)} Grand Finals`;
    finals.push(label);
    const fakt = FNCS_FAKTEN[e.key];
    for (const t of e.teams) {
      let leute = t.spieler.map((roh) => person(roh));
      // Epic nennt zu alten oder geloeschten Konten keinen Namen - fuer diese Plaetze gelten, wo es sie gibt, die Namen der Eckdaten.
      if (leute.some((p) => !p.name)) {
        const f = fakt?.top.find((x) => x.rang === t.rang);
        if (f) leute = f.spieler.map((n) => ({ id: `fakt:${n.toLowerCase()}`, name: n, land: landName(n) }));
      }
      const sichtbar = leute.filter((p) => p.name);
      alleTeams.push({ event: label, punkte: t.punkte, siege: t.siege, elims: t.elims, spieler: sichtbar.map((p) => ({ name: p.name, land: p.land })) });
      for (const p of sichtbar) {
        const a = je.get(p.id) ?? { name: p.name, land: p.land, punkte: 0, siege: 0, elims: 0, finals: 0 };
        a.punkte += t.punkte; a.siege += t.siege; a.elims += t.elims; a.finals += 1; a.land = a.land ?? p.land;
        je.set(p.id, a);
      }
    }
  }
  const top = (haupt: 'punkte' | 'siege' | 'elims'): RekordZeile[] => [...alleTeams].sort(vglRekord(haupt)).slice(0, 8)
    .map((t) => ({ event: t.event, wert: t[haupt], spieler: t.spieler }));
  return {
    ab: saisonName(alle[0].saison),
    spieler: [...je.values()].sort(vglLeaderboard).slice(0, 100),
    punkte: top('punkte'), siege: top('siege'), elims: top('elims'),
    finals,
  };
}

/** Jede Antwort mit den Spielerfotos von jetzt, nicht von der Rechnung (lib/aktuelleFotos). */
export async function GET() {
  return antwortMitAktuellenFotos(await holeGET());
}
