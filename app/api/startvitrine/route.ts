import { NextResponse } from 'next/server';
import { abgelegteAntwort, ohneDateien, CDN_FRIST } from '@/lib/antwortSpeicher';
import { cupNameAusKennung, rundenName } from '@/lib/rundenName';
import { mapsVerzeichnis, type MapEintrag, type MapTyp } from '@/lib/mapsVerzeichnis';
import { gecacht, holeTop } from '@/lib/epicCups';
import { spielerKontext } from '@/lib/globalsSolos';
import { liesJson } from '@/lib/ablage';
import { saisonName } from '@/lib/szeneStats';
import { GET as prLesen } from '../power-rankings/route';
import { ueberdauernd } from '@/lib/ueberdauernd';
import fs from 'node:fs';
import path from 'node:path';

let letzteCups: VCup[] | null = null;
/** Die Cups der zuletzt abgelegten Antwort (data/.zuletzt, siehe lib/ueberdauernd) - nach einem Neustart der einzige Vorrat. */
function vorigeCups(): VCup[] {
  try {
    const roh = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', '.zuletzt', 'startvitrine.json'), 'utf8')) as { wert?: { cups?: VCup[] } };
    return roh.wert?.cups ?? [];
  } catch { return []; }
}

/*
 * Die Schaukaesten der Startseite - ein paar Kilobyte statt der ganzen Startansicht.
 *
 * Der Betreiber (12.10.2026): auf der Startseite drei Spalten, "Statistics, Maps, More", mit Karten, die von allein
 * rotieren: Spieler, Turniere, Global. Die Zahlen dafuer stehen schon in der vorgerechneten Startansicht der
 * Statistik (eine gute Million Zeichen); hier werden nur die Stuecke herausgenommen, die die Startseite braucht.
 * Nichts wird neu gerechnet, nichts erfunden: fehlt die Startansicht, ist die Antwort leer und die Startseite
 * zeigt die Karten einfach nicht.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Zeile {
  epicId: string; anzeige?: string; name: string; land?: string | null; heimat?: string;
  bild?: string | null; elims?: number; damage?: number; quote?: number; matches?: number;
}
interface Kachel {
  turnier: { region: string; name: string; windowId?: string; datum: number | null; spieler: number; matches: number; bild: string | null };
  spitze?: Zeile | null;
}
interface Start {
  saison?: string;
  profile?: Array<{ region: string; spieler: Zeile[] }>;
  kacheln?: Kachel[];
  grundlage?: { spieltage?: unknown[] };
}

async function startHolen(request: Request): Promise<Start | null> {
  try {
    const fertig = await abgelegteAntwort<Start>('szene|ansicht=start');
    if (fertig) return fertig;
  } catch { /* Ablage nicht erreichbar - unten ggf. selbst holen */ }
  // Mit eigenen Dateien (Entwicklung) gibt es die abgelegte Antwort nicht - dann die Route selbst fragen.
  if (!ohneDateien()) {
    try {
      const r = await fetch(new URL('/api/szene-stats?ansicht=start', request.url), { signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json() as Start;
    } catch { /* leer */ }
  }
  return null;
}

const schlank = (z: Zeile) => ({
  id: z.epicId, name: z.anzeige || z.name, land: z.land ?? null, region: z.heimat ?? '', bild: z.bild ?? null,
  elims: z.elims ?? 0, schaden: z.damage ?? 0, quote: z.quote ?? 0, matches: z.matches ?? 0,
});

const ENGLISCH: Record<string, string> = { Runde: 'Round', Tag: 'Day', Finale: 'Finals' };

/** "S42_PerformanceEvaluation_Event1Round2_EU" -> "Performance Evaluation · Event 1 · Round 2" (Epics eigene Worte). */
function kachelName(k: Kachel): string {
  const w = k.turnier.windowId ?? '';
  const cup = w ? cupNameAusKennung(w) : '';
  const runde = w ? rundenName(w, false, (x) => ENGLISCH[x] ?? x) : '';
  return [cup || k.turnier.name, runde].filter(Boolean).join(' · ');
}

interface CupZeile { rang: number; punkte: number; siege: number; elims: number; spieler: Array<{ name: string; land: string | null }> }
interface VCup { titel: string; cup: string; typ: MapTyp; bild: string | null; datum: number | null; region: string; saisonKurz: string; zeilen: CupZeile[] }

/**
 * Vier verschiedene Cups mit den ersten Plaetzen ihrer Bestenliste - fuer die "Turniere"-Karte der Startseite.
 *
 * Der Betreiber (12.10.2026): nicht immer derselbe Cup, "mehrere verschiedene Cups, mehrere verschiedene Thumbnails",
 * und die Liste mit dem ganzen Team: Flaggen, Punkte, Siege (VR), Eliminierungen, Platz. Je Art (Performance, Division,
 * FNCS, Reload) der neueste beendete Spieltag, dessen Ereignis Epic kennt.
 */
async function cupsHolen(): Promise<VCup[]> {
  const liste = await mapsVerzeichnis();
  const jetzt = Date.now();
  const fertig = liste.filter((e) => e.eventId && e.datum && (e.ende ?? (e.datum as number) + 4 * 3600_000) < jetzt);
  /*
   * Nur, was frisch ist (28.10.2026): die Karte zeigte als Division den 19.9. - die Divisions waren seit fuenf Wochen vorbei. Eine Art
   * ohne Cup in den letzten drei Wochen faellt weg; fehlen dann Karten, kommen die naechstneuen Cups anderer Arten dazu.
   */
  const FRISCH = 21 * 864e5;
  const neueste = [...fertig].sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  const frisch = neueste.filter((x) => jetzt - (x.datum ?? 0) < FRISCH);
  /*
   * Je Art eine Liste von Kandidaten: Europa zuerst, wenn dieselbe Art dort am selben Wochenende lief (die Seite ist vor allem fuer EU), dann die anderen Regionen nach
   * Datum - hat einer keine Bestenliste (der EU-Performance-Cup vom 22.10. kam leer), springt der naechste ein. Fehlen Arten, fuellen andere frische Cups auf; jeder
   * Cup nur einmal (nicht dasselbe Finale aus zwei Regionen).
   */
  const gruppen: MapEintrag[][] = [];
  for (const typ of ['performance', 'division', 'fncs', 'reload'] as MapTyp[]) {
    const art = frisch.filter((x) => x.typ === typ);
    if (!art.length) continue;
    const eu = art.filter((x) => x.region === 'EU' && (art[0].datum ?? 0) - (x.datum ?? 0) < 2 * 864e5);
    gruppen.push([...eu, ...art.filter((x) => !eu.includes(x))].slice(0, 4));
  }
  for (const e of frisch) {
    if (gruppen.length >= 4) break;
    if (!gruppen.some((g) => g.some((w) => w.titel === e.titel || w.typ === e.typ))) gruppen.push([e]);
  }
  const profile = await liesJson<Record<string, { anzeige?: string; name?: string; land?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { anzeige?: string; name?: string; land?: string }>));
  // Der echte Name zu jedem Konto (Betreiber, 19.10.2026: Namen aus Zahlen "stimmen nicht - das musst du herausfinden"): Profil, Szene-Liste, sonst Epics Name ohne Orgtag.
  const kontext = await spielerKontext();
  const raus: VCup[] = [];
  await Promise.all(gruppen.map(async (gruppe) => {
   for (const e of gruppe) {
    try {
      /*
       * Mehrtaegige Finals (FNCS Solos) fuehrt das Kartenverzeichnis unter einer Kennung ohne Tag ("S42_FNCSSolo_Final_NAW") - eine
       * Bestenliste gibt es nur je Tag. Dann gilt der letzte Tag, den Epic kennt.
       */
      const kandidaten = [e.windowId, ...['Day3', 'Day2', 'Day1'].map((t) => e.windowId.replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/, `_${t}_$1`))]
        .filter((w, i, a) => a.indexOf(w) === i);
      let top: unknown = null;
      for (const w of kandidaten) {
        try {
          const t = await gecacht(`vitrine|top|${w}`, 15 * 60_000, () => holeTop(e.eventId as string, w, 8, false));
          if (((t as { entries?: unknown[] }).entries ?? []).length) { top = t; break; }
        } catch { /* naechster Tag */ }
      }
      if (!top) continue;
      const zeilen: CupZeile[] = ((top as { entries?: Array<{ rank: number; points: number; wins: number; elims: number; players: Array<{ id: string; name?: string }> }> }).entries ?? [])
        .slice(0, 6).map((z) => ({
          rang: z.rank, punkte: z.points, siege: z.wins, elims: z.elims,
          spieler: z.players.map((p) => {
            const k = kontext(p.id, p.name && p.name !== p.id ? p.name : '');
            return { name: k.anzeige && !/^[0-9a-f]{8,32}$/i.test(k.anzeige) ? k.anzeige : (p.name && !/^[0-9a-f]{8,32}$/i.test(p.name) ? p.name : '—'), land: (profile[p.id]?.land ?? k.land ?? '').toUpperCase() || null };
          }),
        }));
      if (zeilen.length) { raus.push({ titel: e.titel, cup: e.cup, typ: e.typ, bild: e.bild, datum: e.datum, region: e.region, saisonKurz: e.saisonKurz, zeilen }); return; }
    } catch { /* ohne Bestenliste der naechste Kandidat */ }
   }
  }));
  const reihenfolge = ['performance', 'division', 'fncs', 'reload'];
  return raus.sort((a, b) => reihenfolge.indexOf(a.typ) - reihenfolge.indexOf(b.typ));
}

async function rechnen(request: Request) {
  const start = await startHolen(request);
  if (!start) return null;

  const alle = (start.profile ?? []).flatMap((p) => p.spieler);
  /*
   * Jeden Tag andere Spieler (Betreiber, 30.10.2026: "pass die Seite so an, dass taeglich was neu ist - z. B. die Spieler-Ansicht in der Tierlist, die Spieler,
   * von denen du Stats nimmst"): aus den 150 mit den meisten Eliminierungen (mit Foto zuerst) 30 nach dem Datum gemischt - am selben Tag dieselben, morgen andere.
   */
  const tag = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  let saat = [...tag].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  const zufall = () => { saat = (Math.imul(saat ^ (saat >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return saat / 4294967296; };
  const nachElims = [...alle].sort((a, b) => (b.elims ?? 0) - (a.elims ?? 0));
  const topf = [...nachElims.filter((z) => z.bild), ...nachElims.filter((z) => !z.bild)].slice(0, 150);
  for (let i = topf.length - 1; i > 0; i--) { const j = Math.floor(zufall() * (i + 1)); [topf[i], topf[j]] = [topf[j], topf[i]]; }
  const spieler = topf.slice(0, 30).map(schlank);

  // Je Region der Beste nach Eliminierungen - die Balken der "Global"-Karte. Der Betreiber (12.10.2026): "die Liste an
  // Most Eliminations nur fuer diese Season" - also die Eliminierungen der laufenden Saison in dieser Region, nicht die
  // Gesamtwerte der Profile. Fehlt die Saisonliste, bleibt es bei den Profilen.
  let regionen = (start.profile ?? [])
    .map((p) => ({ region: p.region, bester: [...p.spieler].sort((a, b) => (b.elims ?? 0) - (a.elims ?? 0))[0] }))
    .filter((r) => r.bester && (r.bester.elims ?? 0) > 0)
    .map((r) => ({ region: r.region, name: r.bester.anzeige || r.bester.name, land: r.bester.land ?? null, elims: r.bester.elims ?? 0 }))
    .sort((a, b) => b.elims - a.elims);
  if (start.saison) {
    try {
      // Dieselbe Liste wie "Meiste Eliminierungen" in der Leiste der Statistikseite - mit denselben Zahlen und derselben
      // Region (Heimatregion): der Betreiber sah dort 152 und hier 141 und wollte, dass es dasselbe ist.
      const sa = await abgelegteAntwort<{ listen?: Array<{ feld: string; plaetze?: Array<Zeile & { regionen?: string[] }> }> }>(
        `szene|ansicht=start&saison=${start.saison}`);
      const je = new Map<string, { region: string; name: string; land: string | null; elims: number }>();
      for (const z of sa?.listen?.find((l) => l.feld === 'elims')?.plaetze ?? []) {
        const r = z.heimat || z.regionen?.[0] || '';
        const n = z.elims ?? 0;
        if (r && n > (je.get(r)?.elims ?? 0)) je.set(r, { region: r, name: z.anzeige || z.name, land: z.land ?? null, elims: n });
      }
      const saisonweit = [...je.values()].sort((a, b) => b.elims - a.elims);
      if (saisonweit.length >= 3) regionen = saisonweit;
    } catch { /* ohne Saisonliste bleiben die Profilwerte */ }
  }

  let cups: VCup[] = [];
  try { cups = await cupsHolen(); } catch { /* ohne Cups bleibt die Karte leer */ }
  /*
   * Kommen keine Cups (Epic-Anmeldung ungueltig, Epic antwortet nicht), bleiben die zuletzt guten stehen - am 31.10.2026 rechnete die Vitrine waehrend
   * eines widerrufenen Epic-Zugangs "0 Cups", legte das ab, und die Startseite zeigte bei "Tournaments" einen Tag lang "Not reachable right now".
   */
  if (cups.length) letzteCups = cups;
  else cups = letzteCups ?? (letzteCups = vorigeCups());
  // Die ersten fuenf der Power Rankings - mit dem Namen aus den Profilen statt Epics Anzeigenamen samt Teamkuerzel.
  let rangliste: Array<{ rang: number; name: string; land: string | null; wertung: number; delta: number }> = [];
  try {
    const profile = await liesJson<Record<string, { anzeige?: string; name?: string; land?: string }>>('spieler-profile.json', {});
    const j = await (await prLesen(new Request('http://localhost/api/power-rankings?page=1'))).json() as {
      players?: Array<{ rank: number; id: string; name: string; land?: string; wertung: number; deltaPlatz?: number }>;
    };
    rangliste = (j.players ?? []).slice(0, 5).map((x) => ({
      rang: x.rank, name: profile[x.id]?.anzeige || profile[x.id]?.name || x.name,
      land: (profile[x.id]?.land || x.land || '').toUpperCase() || null, wertung: x.wertung, delta: x.deltaPlatz ?? 0,
    }));
  } catch { /* ohne Rangliste bleibt die Karte leer */ }
  let maps = 0;
  try { maps = (await mapsVerzeichnis()).length; } catch { /* ohne Zahl */ }

  const antwort = {
    ok: true, saison: start.saison ?? null, saisonName: start.saison ? saisonName(start.saison) : null, spieltage: start.grundlage?.spieltage?.length ?? null,
    spieler, cups, maps, regionen, rangliste,
  };
  return antwort;
}

/*
 * Nach jedem Neustart brauchte die erste Antwort bis zu 40 Sekunden (Cloudflare gab 502/504, die Karten der Startseite standen auf "nicht erreichbar", 26.10.2026). Die letzte gute
 * Antwort liegt jetzt auch auf der Platte: sie kommt sofort, frisch gerechnet wird im Hintergrund (lib/ueberdauernd).
 */
export async function GET(request: Request) {
  const antwort = await ueberdauernd('startvitrine', 10 * 60_000, 24 * 3600_000, () => rechnen(request));
  if (!antwort) return NextResponse.json({ ok: false, spieler: [], cups: [], regionen: [], maps: 0 }, { status: 200 });
  return NextResponse.json(antwort, { headers: { 'Cache-Control': CDN_FRIST } });
}
