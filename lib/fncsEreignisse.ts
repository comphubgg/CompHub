import { mapsVerzeichnis, type MapEintrag } from '@/lib/mapsVerzeichnis';
import { liesAltStore } from '@/lib/alteMaps';
import { spielerKontext } from '@/lib/globalsSolos';
import { GET as bestenliste } from '@/app/api/cup-leaderboard/route';
import { GET as globalsEndstand } from '@/app/api/globals-endstand/route';
import { globalsTeams } from '@/lib/globalsTeams';
import { GLOBALS_TAGE } from '@/lib/globalsCup';
import { liesJson } from '@/lib/ablage';
import { kernname, namensSchluessel, ohneZierrat } from '@/lib/homoglyph';
import { endspielArt, schluesselVon, landVonName, plaetze, type Art } from '@/lib/fncsListe';
import { FNCS_FAKTEN, faktDatum, type FncsFakt } from '@/lib/fncsFakten';

/*
 * Die Endspiele der FNCS fuer die FNCS-Seite: jede Grand Finals, jede Global Championship, das Invitational und die Summit -
 * ein Eintrag je Event, auch wenn es an zwei Tagen gespielt wurde (Day 1 und Day 2 sind ein Event, die Platzierung ist die
 * Summe beider Tage).
 *
 * Der Betreiber (13.10.2026): die FNCS-Seite soll wie beim Vorbild aussehen - Vorschaubild oben, Flaggen bei den Platzierungen,
 * saubere Namen, die Teamzahl, bei den Globals "Global" statt Europa, und bei jedem Event ein Leaderboard. Woher die Platzierungen
 * kommen, in dieser Reihenfolge:
 *   1. was der Admin fuer das Event von Hand eingetragen hat (alte Maps),
 *   2. Epics Bestenliste - bei zwei Tagen beide zusammengerechnet,
 *   3. bei der Global Championship 2026 der Endstand der Globals-Seite,
 *   4. die Eckdaten in lib/fncsFakten (die ersten fuenf Plaetze samt Preisgeld) - fuer alles, wozu Epic nichts mehr fuehrt.
 * Das Preisgeld je Platz kommt immer aus den Eckdaten, wo sie das Event kennen.
 */

export interface FncsSpitze { rang: number; punkte: number | null; preis?: string; spieler: Array<{ name: string; land: string | null }> }

export interface FncsEreignis {
  key: string;
  saison: string; saisonKurz: string; saisonTitel: string | null;
  /** Grosse Kopfzeile oben auf der Karte: "CH7 S2", "2025", "MAJOR 1". */
  kopf1: string;
  /** Darunter: "GRAND FINALS", "GLOBAL CHAMPIONSHIP", "SUMMIT" ... */
  kopf2: string;
  titel: string;
  datum: number | null;
  lan: boolean;
  ort: string | null;
  /** "Europe" oder "Global" - Globals, Invitational und Summit sind weltweit. */
  region: string;
  preisgeld: string | null;
  bild: string | null;
  /** Die Cup-Seite dieses Events - leer bei Events, zu denen die Maps keine Karte fuehren (vor Chapter 2 Season 4). */
  turnierId: string; windowId: string; kartenRegion: string;
  teams: number | null;
  spitze: FncsSpitze[];
}

/** Ein Name ohne Turniermarke, Orgtag und Fremdalphabet-Zwillinge - wie auf den Kacheln der Tierlist ("[FNCS24] EXD Peterbot" wird "peterbot"). */
const rein = (n: string) => ohneZierrat(kernname(n)).trim() || n;

interface Kandidat { e: MapEintrag; art: Art; jahr?: string }

function kandidaten(liste: MapEintrag[]): Kandidat[] {
  const raus: Kandidat[] = [];
  for (const e of liste) { const a = endspielArt(e); if (a) raus.push({ e, ...a }); }
  return raus;
}

const KOPF2: Record<Art, string> = {
  gf: 'GRAND FINALS', gc: 'GLOBAL CHAMPIONSHIP', invitational: 'INVITATIONAL', summit: 'SUMMIT', royale: 'GRAND ROYALE', allstar: 'ALL-STAR SOLO',
};
const REGION: Record<Art, string> = { gf: 'Europe', gc: 'Global', invitational: 'Global', summit: 'Global', royale: 'Europe', allstar: 'Europe' };

/* ------------------------------------------------------------------ Platzierungen */

interface Zeile { rank: number; points: number; wins?: number; elims?: number; players: Array<{ id: string; name?: string; displayName?: string }> }
interface ArchivEintrag { windowId?: string; eventId?: string }

async function ausBestenliste(url: string): Promise<Zeile[]> {
  const r = await bestenliste(new Request(url));
  const j = await r.json() as { entries?: Zeile[] };
  if (!r.ok || !Array.isArray(j.entries)) throw new Error('Epic liefert die Bestenliste gerade nicht.');
  return j.entries;
}

const preisVon = (f: FncsFakt | undefined, rang: number) => f?.top.find((t) => t.rang === rang)?.preis;

/** "$592K", "$1.2M" - wie auf den Karten. */
const geld = (n: number) => (n >= 1_000_000 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

interface Stufe { bis: number; betrag: number }
let tabellenMerker: { bis: number; liste: Array<{ fenster: string; stufen?: Stufe[] }> } | null = null;

/**
 * Preisgeld aus Epics Auszahlungstabelle des Fensters (data/preisgeld-tabellen.json), wo die Eckdaten das Event nicht kennen:
 * das Preisgeld des ganzen Events ist die Summe aller Plaetze ("Price Pool - das kannst du dir ja zusammenrechnen", Betreiber,
 * 13.10.2026), je Platz der Betrag der Stufe. Bei zwei Tagen gilt die Tabelle des zweiten Tages (die Summe beider).
 */
async function ausTabelle(fensterId: string): Promise<{ pool: number; proRang: (rang: number) => number | null } | null> {
  if (!tabellenMerker || tabellenMerker.bis < Date.now()) {
    const roh = await liesJson<{ eintraege?: Array<{ fenster: string; stufen?: Stufe[] }> }>('preisgeld-tabellen.json', {}).catch(() => ({} as { eintraege?: Array<{ fenster: string; stufen?: Stufe[] }> }));
    tabellenMerker = { bis: Date.now() + 30 * 60_000, liste: roh.eintraege ?? [] };
  }
  const e = tabellenMerker.liste.find((x) => x.fenster === fensterId);
  const stufen = [...(e?.stufen ?? [])].sort((a, b) => a.bis - b.bis);
  if (!stufen.length) return null;
  const proRang = (rang: number) => stufen.find((s) => rang <= s.bis)?.betrag ?? null;
  let pool = 0;
  for (let r = 1; r <= stufen[stufen.length - 1].bis; r += 1) pool += proRang(r) ?? 0;
  return pool > 0 ? { pool, proRang } : null;
}

/** Die ersten Plaetze aus den Eckdaten, mit Flaggen. */
async function ausFakten(f: FncsFakt): Promise<FncsSpitze[]> {
  const land = await landVonName();
  return f.top.map((t) => ({ rang: t.rang, punkte: null, preis: t.preis, spieler: t.spieler.map((n) => ({ name: n, land: land(n) })) }));
}

/** Der Endstand der Global Championship 2026 (Globals-Seite): bis zu zehn Teams. */
async function ausGlobals(): Promise<FncsSpitze[]> {
  const r = await globalsEndstand();
  const j = await r.json() as { ok?: boolean; teams?: Array<{ rang: number; punkte: number; spieler: Array<{ anzeige: string; land: string | null }> }> };
  if (!j.ok || !j.teams?.length) return [];
  return j.teams.map((t) => ({ rang: t.rang, punkte: t.punkte, spieler: t.spieler.map((s) => ({ name: rein(s.anzeige), land: s.land })) }));
}

async function spitzeFuer(k: Kandidat, fakt: FncsFakt | undefined, archiv: Map<string, ArchivEintrag>): Promise<{ teams: number | null; spitze: FncsSpitze[] }> {
  const [kontext, landName] = await Promise.all([spielerKontext(), landVonName()]);
  // Das Land: erst das Profil, dann die Spielerliste der Szene-Quelle, dann der Name (LAN-Konten wie "[FNCS24] EXD Peterbot" kennt nur der Name).
  const spieler = (ps: Array<{ id: string; name?: string; displayName?: string }>) => ps.map((p) => {
    const x = kontext(p.id, p.displayName || p.name || '');
    const name = rein(x.anzeige);
    return { name, land: x.land ?? landName(name) };
  });
  const mitPreis = (s: FncsSpitze[]) => s.map((p) => ({ ...p, preis: p.preis ?? preisVon(fakt, p.rang) }));

  // 1. Von Hand eingetragen (alte Maps).
  const store = await liesAltStore();
  const eigene = store.fenster?.[k.e.windowId]?.teams ?? [];
  const hand = eigene.filter((t) => t.rang != null).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  if (hand.length) {
    return {
      teams: eigene.length,
      spitze: mitPreis(hand.slice(0, 5).map((t) => ({ rang: t.rang as number, punkte: t.punkte ?? null, spieler: t.spieler.map((s) => ({ name: s.name, land: s.land ?? null })) }))),
    };
  }

  // 3. Die Global Championship 2026: der Endstand der Globals-Seite.
  if (/Global_Championship_2026$/.test(k.e.windowId)) {
    let teams: number | null = null;
    try { teams = (await globalsTeams(GLOBALS_TAGE[0].windowId)).teams.length || null; } catch { /* ohne Teamzahl */ }
    return { teams, spitze: mitPreis((await ausGlobals()).slice(0, 5)) };
  }

  // 2. Epics Bestenliste - bei zwei Tagen zusammengerechnet.
  const tage = k.e.tage ?? [];
  const fenster = tage.length > 1 ? tage.map((t) => t.windowId) : [k.e.windowId];
  const eventId = k.e.eventId ?? archiv.get(fenster[0])?.eventId ?? null;
  if (eventId) {
    try {
      const ziel = fenster.length > 1 ? `windows=${fenster.map(encodeURIComponent).join(',')}` : `window=${encodeURIComponent(fenster[0])}`;
      const zeilen = await ausBestenliste(`http://localhost/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&${ziel}&limit=100`);
      if (zeilen.length) {
        return {
          teams: zeilen.length,
          spitze: mitPreis(zeilen.slice(0, 5).map((z) => ({ rang: z.rank, punkte: z.points, spieler: spieler(z.players) }))),
        };
      }
    } catch { /* dann gelten die Eckdaten */ }
  }

  // 4. Die Spielerliste der Szene-Quelle (ganze Platzierungsliste), dann die Eckdaten.
  const liste = await plaetze(schluesselVon(k.e.saison, k.art));
  if (liste.length) {
    return {
      teams: fakt?.teams ?? liste.length,
      spitze: mitPreis(liste.slice(0, 5).map((t) => ({ rang: t.rang, punkte: null, spieler: t.spieler.map((s) => ({ name: s.name, land: s.land })) }))),
    };
  }
  return { teams: fakt?.teams ?? null, spitze: fakt ? await ausFakten(fakt) : [] };
}

/**
 * Die Platzierungen eines Events fuer die Cup-Seite, wo sonst keine Bestenliste steht: Global Championship 2026 (Globals-Seite)
 * oder die Eckdaten. Leer, wenn die Karte kein FNCS-Endspiel ist oder nichts bekannt ist.
 */
export async function fncsPlatzierungen(e: MapEintrag): Promise<FncsSpitze[]> {
  // Die EWC (Reload Elite Series Championship): Epic fuehrt je Tag eine Bestenliste (Escargo_Day1 bis 4) - Gruppe A, Gruppe B,
  // Survival Stage und Finals sind die vier Tage; die beiden Karten (Slurp Rush, Elite Stronghold) spielen am selben Tag.
  const ewc = /^EWC_(Group_A|Group_B|Survival|Finals)_/.exec(e.windowId);
  if (ewc) {
    const tag = { Group_A: 1, Group_B: 2, Survival: 3, Finals: 4 }[ewc[1] as 'Group_A'];
    try { return await ewcTag(tag); } catch { return []; }
  }
  const a = endspielArt(e);
  if (!a) return [];
  const key = schluesselVon(e.saison, a.art);
  const fakt = FNCS_FAKTEN[key];
  if (/Global_Championship_2026$/.test(e.windowId)) {
    try { const g = await ausGlobals(); if (g.length) return g.map((p) => ({ ...p, preis: p.preis ?? preisVon(fakt, p.rang) })); } catch { /* dann die Eckdaten */ }
  }
  // Die ganze Platzierungsliste aus der Spielerliste der Szene-Quelle (Chapter 1 Season X bis Global Championship 2025).
  const liste = await plaetze(key);
  if (liste.length) return liste.map((t) => ({ rang: t.rang, punkte: null, preis: preisVon(fakt, t.rang), spieler: t.spieler.map((s) => ({ name: s.name, land: s.land })) }));
  return fakt ? ausFakten(fakt) : [];
}

/** Ein Tag der EWC aus Epics Bestenliste: Teams mit sauberen Namen und Flaggen (die Turnierkonten tragen "[EWC2026] BIG vic0"). */
async function ewcTag(tag: number): Promise<FncsSpitze[]> {
  const [zeilen, land] = await Promise.all([
    ausBestenliste(`http://localhost/api/cup-leaderboard?event=epicgames_Escargo_Official&window=Escargo_Day${tag}&limit=100`),
    landVonName(),
  ]);
  return zeilen.map((z) => ({
    rang: z.rank, punkte: z.points,
    spieler: z.players.map((p) => { const name = rein(p.displayName || p.name || ''); return { name, land: land(name) }; }),
  }));
}

/* ------------------------------------------------------------------ Die Liste */

let merker: { bis: number; liste: FncsEreignis[] } | null = null;

export async function fncsEreignisse(): Promise<FncsEreignis[]> {
  if (merker && merker.bis > Date.now()) return merker.liste;
  const [liste, archivListe] = await Promise.all([
    mapsVerzeichnis(),
    liesJson<ArchivEintrag[]>('cup-archiv.json', []).catch(() => [] as ArchivEintrag[]),
  ]);
  const archiv = new Map<string, ArchivEintrag>();
  for (const a of archivListe) if (a.windowId) archiv.set(a.windowId, a);

  let fehler = false;
  const raus: FncsEreignis[] = [];
  const gesehen = new Set<string>();

  // Alle Events gleichzeitig - jedes fragt Epic einzeln, nacheinander dauerte der erste Aufruf eine halbe Minute.
  const aus = await Promise.all(kandidaten(liste).map(async (k): Promise<FncsEreignis> => {
    const schluessel = schluesselVon(k.e.saison, k.art);
    const fakt = FNCS_FAKTEN[schluessel];
    let teams: number | null = null; let spitze: FncsSpitze[] = [];
    try { ({ teams, spitze } = await spitzeFuer(k, fakt, archiv)); } catch { fehler = true; }
    let preisgeld = fakt?.preisgeld ?? null;
    if (!fakt) {
      const wid = (k.e.tage ?? []).length ? (k.e.tage ?? [])[(k.e.tage ?? []).length - 1].windowId : k.e.windowId;
      const t = await ausTabelle(wid).catch(() => null);
      if (t) {
        // Seit Chapter 7 (Duos) nennt die Tabelle den Betrag je Spieler: Major 1 (S40) stimmt mit der Tabelle mal zwei auf den Dollar
        // mit dem veroeffentlichten Preisgeld ueberein (592.000 gegen 295.750 x 2). Bei den Trios davor gilt sie je Team.
        const faktor = Number(k.e.saison.slice(1)) >= 39 ? 2 : 1;
        preisgeld = geld(t.pool * faktor);
        spitze = spitze.map((p) => ({ ...p, preis: p.preis ?? (t.proRang(p.rang) != null ? geld((t.proRang(p.rang) as number) * faktor) : undefined) }));
      }
    }
    const kopf1 = k.art === 'gc' || k.art === 'invitational' ? (k.jahr ?? k.e.saisonKurz) : k.art === 'summit' ? 'MAJOR 1' : k.e.saisonKurz;
    const titel = k.art === 'gc' ? `Global Championship ${k.jahr}` : k.art === 'invitational' ? `Invitational ${k.jahr}`
      : k.art === 'summit' ? 'Major 1 Summit' : (k.e.saisonTitel ? `${k.e.saisonKurz} · ${k.e.saisonTitel}` : k.e.saisonKurz);
    return {
      key: schluessel, saison: k.e.saison, saisonKurz: k.e.saisonKurz, saisonTitel: k.e.saisonTitel ?? null,
      kopf1, kopf2: KOPF2[k.art], titel, datum: k.e.datum ?? (fakt ? faktDatum(fakt.datum) : null),
      lan: !!k.e.lan || !!fakt?.lan || k.art === 'summit' || k.art === 'gc', ort: fakt?.ort ?? null,
      region: REGION[k.art], preisgeld, bild: k.e.bild,
      turnierId: k.e.turnierId, windowId: k.e.windowId, kartenRegion: k.e.region, teams, spitze,
    };
  }));
  for (const e of aus) { gesehen.add(e.key); raus.push(e); }

  // Endspiele, zu denen die Maps keine Karte fuehren (vor Chapter 2 Season 4): nur aus den Eckdaten.
  for (const [schluessel, f] of Object.entries(FNCS_FAKTEN)) {
    if (gesehen.has(schluessel)) continue;
    const [saison, art] = schluessel.split('|') as [string, Art];
    raus.push({
      key: schluessel, saison, saisonKurz: f.kopf1, saisonTitel: null,
      kopf1: f.kopf1, kopf2: f.kopf2, titel: f.titel, datum: faktDatum(f.datum), lan: !!f.lan, ort: f.ort ?? null,
      region: REGION[art], preisgeld: f.preisgeld, bild: '/cups/fncs-major.webp',
      turnierId: '', windowId: '', kartenRegion: 'EU', teams: f.teams, spitze: await ausFakten(f),
    });
  }

  raus.sort((a, b) => (a.datum ?? 0) - (b.datum ?? 0));
  merker = { bis: Date.now() + (fehler ? 60_000 : 15 * 60_000), liste: raus };
  return raus;
}

/* ------------------------------------------------------------------ All-Time Stats */

export interface RekordZeile { event: string; wert: number; spieler: Array<{ name: string; land: string | null }> }
export interface FncsRekorde {
  /** Ab welcher Saison die Zahlen zaehlen - was Epics Bestenliste noch fuehrt. */
  ab: string;
  spieler: Array<{ name: string; land: string | null; punkte: number; siege: number; elims: number; finals: number }>;
  punkte: RekordZeile[]; siege: RekordZeile[]; elims: RekordZeile[];
}

let rekordMerker: { bis: number; daten: FncsRekorde } | null = null;

/**
 * Die Zahlen der Grand Finals, die Epics Bestenliste noch fuehrt (Chapter 5 Season 3 bis heute): je Spieler Punkte, Siege und
 * Eliminierungen seines Teams, summiert ueber alle Endspiele - und die besten einzelnen Teamwerte (Punkte, Siege, Eliminierungen
 * in einem Grand Finals). Aelteres steht nicht da; die Seite sagt es.
 */
export async function fncsRekorde(): Promise<FncsRekorde> {
  if (rekordMerker && rekordMerker.bis > Date.now()) return rekordMerker.daten;
  const [liste, kontext, land] = await Promise.all([mapsVerzeichnis(), spielerKontext(), landVonName()]);
  const mitEpic = kandidaten(liste).filter((k) => (k.e.tage ?? []).length > 1 || k.e.eventId);
  const je = new Map<string, { name: string; land: string | null; punkte: number; siege: number; elims: number; finals: number }>();
  const alleTeams: Array<{ event: string; punkte: number; siege: number; elims: number; spieler: Array<{ name: string; land: string | null }> }> = [];
  await Promise.all(mitEpic.map(async (k) => {
    const tage = k.e.tage ?? [];
    const fenster = tage.length > 1 ? tage.map((t) => t.windowId) : [k.e.windowId];
    const eventId = k.e.eventId;
    if (!eventId) return;
    try {
      const ziel = fenster.length > 1 ? `windows=${fenster.map(encodeURIComponent).join(',')}` : `window=${encodeURIComponent(fenster[0])}`;
      const zeilen = await ausBestenliste(`http://localhost/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&${ziel}&limit=100`);
      const label = k.art === 'gc' ? `${k.jahr} Global Championship` : `${k.e.saisonKurz} Grand Finals`;
      for (const z of zeilen) {
        const spieler = z.players.map((p) => {
          const x = kontext(p.id, p.displayName || p.name || '');
          const name = rein(x.anzeige);
          return { name, land: x.land ?? land(name) };
        });
        const punkte = z.points ?? 0; const siege = z.wins ?? 0; const elims = z.elims ?? 0;
        alleTeams.push({ event: label, punkte, siege, elims, spieler });
        for (const s of spieler) {
          const schluessel = namensSchluessel(s.name);
          const a = je.get(schluessel) ?? { name: s.name, land: s.land, punkte: 0, siege: 0, elims: 0, finals: 0 };
          a.punkte += punkte; a.siege += siege; a.elims += elims; a.finals += 1; a.land = a.land ?? s.land;
          je.set(schluessel, a);
        }
      }
    } catch { /* dieses Endspiel fehlt dann in der Summe */ }
  }));
  const top = (f: (t: (typeof alleTeams)[number]) => number): RekordZeile[] => [...alleTeams].sort((a, b) => f(b) - f(a)).slice(0, 10)
    .map((t) => ({ event: t.event, wert: f(t), spieler: t.spieler }));
  const daten: FncsRekorde = {
    ab: 'Chapter 5 Season 3',
    spieler: [...je.values()].sort((a, b) => b.punkte - a.punkte).slice(0, 100),
    punkte: top((t) => t.punkte), siege: top((t) => t.siege), elims: top((t) => t.elims),
  };
  rekordMerker = { bis: Date.now() + 30 * 60_000, daten };
  return daten;
}
