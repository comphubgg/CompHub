import { liesJson } from '@/lib/ablage';
import { istFinaleTag } from '@/lib/turnierArt';

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
