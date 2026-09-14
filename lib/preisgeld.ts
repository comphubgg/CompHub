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

/**
 * Der Betrag zu einem Platz oder einer Punktzahl - oder null, wenn dazu
 * keine Regel gepflegt ist.
 */
export async function verdienst(angaben: {
  windowId: string; eventId?: string; region: string; name?: string;
  platz: number | null; punkte: number | null; istFinale?: boolean;
}): Promise<Verdienst | null> {
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
