import { liesJson } from '@/lib/ablage';
import { istFinaleTag } from '@/lib/turnierArt';
import { holeKatalog } from '@/lib/cupWertung';

/*
 * Was ein Platz oder eine Punktzahl an Preisgeld bedeutet.
 *
 * Der Betreiber: "Bei einem Performance Cup Final sind die Points eigentlich
 * Earnings - mach Points und daneben Earnings. Genauso bei den Victory
 * Cups: da bekommt jeder Earnings."
 *
 * Grundlage ist ausschliesslich data/preisgelder.json - die von Hand
 * gepflegte Tabelle, die auch die Cup-Seite zeigt. Epic liefert fuer diese
 * Cups keine Auszahlungstabelle. Die Datei kennt zwei Arten:
 *
 *   platz  - Stufen "ab: 7, betrag: 250" heisst: bis Platz 7 gibt es 250,
 *            die vorige Stufe endet davor (siehe app/api/cup-preise).
 *   punkte - je "jePunkte" Punkte (100 = ein Sieg) gibt es "betrag".
 *
 * Gilt nur, wenn Turnier UND Region in der Datei stehen. Der Betreiber war
 * ausdruecklich: seine Zahlen gelten fuer Europa, andere Regionen zahlen
 * weniger. Wo keine Regel steht, gibt es keinen Betrag - keinen geschaetzten.
 * Was hier herauskommt, ist abgeleitet (Platz mal Tabelle) und wird auf der
 * Seite auch so genannt.
 */

interface Stufe { ab: number; betrag: number }
interface Regel {
  turnier: string; region: string; nurFinale?: boolean;
  waehrung?: string; art: 'platz' | 'punkte';
  stufen?: Stufe[]; jePunkte?: number; betrag?: number;
}

let regeln: { liste: Regel[]; bis: number } | null = null;

async function liesRegeln(): Promise<Regel[]> {
  if (regeln && Date.now() < regeln.bis) return regeln.liste;
  const roh = await liesJson<{ eintraege?: Regel[] } | null>('preisgelder.json', null);
  const liste = Array.isArray(roh?.eintraege) ? roh.eintraege : [];
  regeln = { liste, bis: Date.now() + 10 * 60_000 };
  return liste;
}

/** Die Turnierkennung ohne Saison und Region - wie in app/api/cup-preise. */
export function turnierKern(kennung: string): string {
  return (kennung ?? '')
    .replace(/^epicgames_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/^(CH\d+S\d+|S\d+)_?/i, '')
    .toLowerCase();
}

export interface Verdienst { betrag: number; waehrung: string }

/*
 * ------------------------------------------------------------ LAN-Events
 *
 * Reload Elite Series Championship, FNCS Summit: dort gibt es Epics
 * Bestenliste nur mit Turnierkonten, die nicht zu den Spielern gehoeren, und
 * die Szene-Quelle fuehrt keine Platzierung. Das Preisgeld steht deshalb je
 * Konto in data/lan-preisgelder.json - aus veroeffentlichten Tabellen
 * (Esports Charts, Esports Earnings), per Namen den Konten des LAN-Spieltags
 * im Archiv zugeordnet; die Datei nennt die Quelle. Der Betreiber: "du musst
 * bei Most Earnings auch LAN-Events hinzufuegen, sonst waere jemand anders
 * erster Platz."
 */
export interface LanEintrag {
  kennung: string; name: string; season: string; fenster: string;
  /** Wo die LAN stattfand - fuer die Marke in den Turnierlisten. */
  ort?: string;
  quelle?: string; waehrung?: string;
  spieler: Array<{ epicId: string; name?: string; platz: number; betrag: number }>;
}

let lan: { liste: LanEintrag[]; bis: number } | null = null;

export async function lanEintraege(): Promise<LanEintrag[]> {
  if (lan && Date.now() < lan.bis) return lan.liste;
  const roh = await liesJson<{ eintraege?: LanEintrag[] } | null>('lan-preisgelder.json', null);
  const liste = Array.isArray(roh?.eintraege) ? roh.eintraege : [];
  lan = { liste, bis: Date.now() + 10 * 60_000 };
  return liste;
}

/** Das LAN-Preisgeld eines Kontos an einem Spieltag - oder null. */
export async function lanVerdienst(windowId: string, epicId: string): Promise<Verdienst | null> {
  for (const e of await lanEintraege()) {
    if (e.fenster !== windowId) continue;
    const s = e.spieler.find((x) => x.epicId === epicId);
    if (s) return { betrag: s.betrag, waehrung: e.waehrung ?? 'USD' };
  }
  return null;
}

/** Alle LAN-Betraege je Konto fuer die genannten Saisons - fuer die Jahresliste. */
export async function lanSummen(saisons: string[]): Promise<Map<string, number>> {
  const summe = new Map<string, number>();
  for (const e of await lanEintraege()) {
    if (!saisons.includes(e.season)) continue;
    for (const s of e.spieler) summe.set(s.epicId, (summe.get(s.epicId) ?? 0) + s.betrag);
  }
  return summe;
}

/*
 * ------------------------------------------------------------ Tabellen
 *
 * Epics eigene Auszahlungstabelle je Spieltag - je Person und Platz, wie
 * sie Epic zu jedem Turnierfenster veroeffentlicht (nachgelesen ueber
 * fortnitetracker.com, das sie je Fenster aufhebt; Epics eigene Schnittstelle
 * kennt nur die laufende Saison). Geholt von scripts/preisgeld-tabellen.mjs
 * in data/preisgeld-tabellen.json: FNCS-Major-Finals je Region, Reload Elite
 * Series, Solo Series, Division-1-Finals, Performance Cups, Duos Cash Cups,
 * Victory Cups. Angewendet nach Platz auf Epics Bestenliste - kein Name.
 *
 * Der Betreiber: "ich weiss, wie viel der #1 hat, und es sind mehr als
 * 271k, viel mehr." Die Grand Finals fehlten - 60.000 Dollar je Person fuer
 * Platz eins in Europa standen nirgends.
 */
export interface Tabelle {
  fenster: string; season: string; region: string;
  /** Regulaerer Ausdruck auf die Fensterkennung - eine Tabelle je Familie. */
  muster: string;
  name?: string | null; beginn?: string | null;
  tage: 'einzeln' | 'summe' | 'letzter';
  /** platz: Betrag je Platzspanne ("bis"). punkte: Betrag ab Punktzahl. */
  art: 'platz' | 'punkte' | string;
  waehrung?: string;
  stufen: Array<{ bis?: number; abPunkte?: number; schwelle?: number; betrag: number }>;
}

let tabellen: { liste: Array<Tabelle & { re: RegExp }>; bis: number } | null = null;

async function liesTabellen() {
  if (tabellen && Date.now() < tabellen.bis) return tabellen.liste;
  const roh = await liesJson<{ eintraege?: Tabelle[] } | null>('preisgeld-tabellen.json', null);
  const liste = (Array.isArray(roh?.eintraege) ? roh.eintraege : [])
    .filter((t) => t.muster && Array.isArray(t.stufen))
    .map((t) => ({ ...t, re: new RegExp(t.muster, 'i') }));
  tabellen = { liste, bis: Date.now() + 10 * 60_000 };
  tabelleJeFenster.clear();
  return liste;
}

/** Je Fenster gemerkt - die Jahresliste fragt hunderttausendmal. */
const tabelleJeFenster = new Map<string, Tabelle | null>();

/**
 * Die Tabelle der laufenden Saison direkt aus Epics Turnierkatalog.
 *
 * Epic liefert zu jedem laufenden Turnierfenster seine Auszahlungstabelle
 * mit - dieselbe, die die gespeicherte Datei fuer aeltere Saisons haelt.
 * So zaehlt ein Cup von heute Abend schon mit, ohne dass jemand eine
 * Tabelle nachtraegt: die Daten erneuern sich selbst. Ohne Epic-Anmeldung
 * (oder fuer alte Fenster) kommt hier nichts, und die Datei entscheidet.
 */
const katalogGescheitert = new Map<string, number>();

async function ausEpicKatalog(windowId: string, region: string): Promise<Tabelle | null> {
  // Ein gescheiterter Abruf wird zehn Minuten nicht wiederholt - die
  // Jahresliste fragt sonst tausendmal gegen eine Wand.
  if ((katalogGescheitert.get(region) ?? 0) > Date.now()) return null;
  let katalog;
  try { katalog = await holeKatalog(region); } catch {
    katalogGescheitert.set(region, Date.now() + 10 * 60_000);
    return null;
  }
  const alle = katalog.payoutTables ?? {};
  const gruppen = alle[windowId]
    ?? Object.entries(alle).find(([k]) => k.includes(windowId))?.[1];
  if (!gruppen?.length) return null;
  const season = (windowId.match(/^(S\d+)_/)?.[1]) ?? '';
  for (const g of gruppen) {
    const stufen: Tabelle['stufen'] = [];
    for (const r of g.ranks ?? []) {
      if (typeof r.threshold !== 'number') continue;
      const betrag = (r.payouts ?? [])
        .filter((z) => z.rewardType === 'ecomm' && typeof z.quantity === 'number')
        .reduce((summe, z) => summe + (z.quantity ?? 0), 0);
      if (g.scoringType === 'value') {
        if (betrag > 0) stufen.push({ abPunkte: r.threshold, betrag });
      } else if (g.scoringType === 'rank') {
        /*
         * Auch die Stufen ohne Geld: sie begrenzen die Spanne darunter.
         * "bis 16: nur Aufstieg, bis 33: 200 $" heisst Platz 1 bis 16
         * bekommt nichts - ohne die Nullstufe hielte die Rechnung sie fuer
         * die Spanne bis 33 und zahlte ihnen 200 $.
         */
        stufen.push({ bis: r.threshold, betrag });
      }
    }
    if (!stufen.some((s) => s.betrag > 0)) continue;
    return {
      fenster: windowId, season, region: region.toUpperCase(), muster: '',
      tage: 'einzeln', art: g.scoringType === 'value' ? 'punkte' : 'platz',
      waehrung: 'USD', stufen,
    };
  }
  return null;
}

/** Die Tabelle zu einem Spieltag - oder null. */
export async function tabelleFuer(windowId: string, region?: string): Promise<Tabelle | null> {
  const liste = await liesTabellen();
  const schluessel = `${windowId}|${region ?? ''}`;
  const gemerkt = tabelleJeFenster.get(schluessel);
  if (gemerkt !== undefined) return gemerkt;
  let gefunden: Tabelle | null = null;
  // Erst die Tabelle genau dieses Fensters, dann die der Familie.
  for (const t of liste) {
    if (region && t.region !== region.toUpperCase()) continue;
    if (t.fenster === windowId) { gefunden = t; break; }
    if (!gefunden && t.re.test(windowId)) gefunden = t;
  }
  // Nichts in der Datei: die laufende Saison kennt Epic selbst.
  if (!gefunden && region && /^S\d+_/.test(windowId)) gefunden = await ausEpicKatalog(windowId, region);
  tabelleJeFenster.set(schluessel, gefunden);
  return gefunden;
}

/** Der Betrag je Person aus einer Tabelle. */
function ausTabelle(t: Tabelle, platz: number | null, punkte: number | null): Verdienst | null {
  const waehrung = t.waehrung ?? 'USD';
  if (t.art === 'platz') {
    if (!platz || platz < 1) return null;
    // "bis" ist der letzte Platz einer Spanne: bis 5 = 450, bis 7 = 375
    // heisst Platz 6 und 7 bekommen 375.
    const stufen = t.stufen.filter((s) => typeof s.bis === 'number').sort((a, b) => a.bis! - b.bis!);
    const stufe = stufen.find((s) => platz <= s.bis!);
    return { betrag: stufe ? stufe.betrag : 0, waehrung };
  }
  if (t.art === 'punkte') {
    if (punkte === null || punkte < 0) return null;
    const stufen = t.stufen.filter((s) => typeof s.abPunkte === 'number').sort((a, b) => b.abPunkte! - a.abPunkte!);
    const stufe = stufen.find((s) => punkte >= s.abPunkte!);
    return { betrag: stufe ? stufe.betrag : 0, waehrung };
  }
  return null;
}

/**
 * Der Betrag zu einem Platz oder einer Punktzahl - oder null, wenn dazu
 * keine Regel gepflegt ist.
 */
export async function verdienst(angaben: {
  windowId: string; eventId?: string; region: string; name?: string;
  platz: number | null; punkte: number | null; istFinale?: boolean;
  /** Fuer LAN-Events: dort haengt der Betrag am Konto, nicht am Platz. */
  epicId?: string;
}): Promise<Verdienst | null> {
  if (angaben.epicId) {
    const lanGeld = await lanVerdienst(angaben.windowId, angaben.epicId);
    if (lanGeld) return lanGeld;
  }
  // Erst die Tabellen aus Liquipedia, dann die von Hand gepflegte Regel.
  const tabelle = await tabelleFuer(angaben.windowId, angaben.region);
  if (tabelle) return ausTabelle(tabelle, angaben.platz, angaben.punkte);
  const kern = turnierKern(angaben.eventId || angaben.windowId);
  if (!kern) return null;
  // Ohne Epics Kennzeichen sagt es der Name - oder die Fensterkennung:
  // "…Week2Final_EU", und bei Victory- und Performance-Cups ist die zweite
  // Runde das Finale ("…Round2_EU").
  // Epics Kennzeichen zaehlt, wo es gesetzt ist - beim Performance Cup
  // steht es faelschlich auf false (siehe istFinaleTag), darum zusaetzlich
  // Name und Kennung.
  const finale = Boolean(angaben.istFinale)
    || istFinaleTag(angaben.name ?? '', undefined, angaben.windowId)
    || /final/i.test(angaben.windowId)
    || (/victory|performance/i.test(angaben.windowId) && /round2/i.test(angaben.windowId));
  const regel = (await liesRegeln()).find((r) =>
    kern.startsWith(r.turnier.toLowerCase())
    && r.region.toUpperCase() === angaben.region.toUpperCase()
    && (!r.nurFinale || finale));
  if (!regel) return null;
  const waehrung = regel.waehrung ?? 'USD';

  if (regel.art === 'platz') {
    if (!angaben.platz || angaben.platz < 1) return null;
    const stufen = [...(regel.stufen ?? [])].sort((a, b) => a.ab - b.ab);
    const stufe = stufen.find((s) => angaben.platz! <= s.ab);
    return stufe ? { betrag: stufe.betrag, waehrung } : { betrag: 0, waehrung };
  }
  if (regel.art === 'punkte') {
    if (angaben.punkte === null || angaben.punkte < 0) return null;
    const je = regel.jePunkte ?? 100;
    return { betrag: Math.floor(angaben.punkte / je) * (regel.betrag ?? 0), waehrung };
  }
  return null;
}
