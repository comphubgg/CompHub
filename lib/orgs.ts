/*
 * Die E-Sports-Organisationen - welche Spieler seit wann fuer wen spielen.
 *
 * Der Betreiber (26.9.2026): im Werkzeug ein Bereich mit den Organisationen,
 * "dass man die Spieler clean sieht", ein Klick auf einen Spieler fuehrt in
 * sein Profil, und je Spieler, was er fuer die Org gewonnen hat - "nur dieses
 * Jahr am besten", und erst ab dem Tag, an dem er dazukam ("Part of ... since
 * ..."). Dazu von Hand notierte Betraege der Org selbst (EWC Club Bonus).
 *
 * Gepflegt wird das im Admin-Werkzeug (/admin/orgs); die Liste liegt in der
 * Ablage (orgs.json), die Logos als Dateien unter public/orgs oder, vom
 * Betreiber hochgeladen, im Objektspeicher (org-logos/).
 *
 * Spieler haengen an der Epic-Konto-Id - nie am Namen. Wo die Startliste
 * keine eindeutige Id fand, steht der Spieler ohne Konto da, bis der
 * Betreiber ihn zuweist.
 */

import { speicher, schreibJson } from '@/lib/ablage';

export const ORGS_DATEI = 'orgs.json';
/** Das Jahr, dessen Preisgeld gezaehlt wird. */
export const ORGS_JAHR = 2026;

export interface OrgSpieler {
  /** Epic-Konto; null, solange der Spieler keinem Konto zugeordnet ist. */
  epicId: string | null;
  /** Der Name, wie ihn die Org fuehrt - Anzeige, solange kein Konto da ist. */
  name: string;
  /** Seit wann bei der Org, "JJJJ-MM-TT" - oder null, wenn unbekannt. */
  seit: string | null;
}

export interface OrgExtra {
  /** "EWC Club Championship" */
  titel: string;
  /** US-Dollar */
  betrag: number;
  /** "JJJJ-MM-TT" */
  datum: string | null;
}

export interface Org {
  id: string;
  name: string;
  /** Pfad unter public ("/orgs/big.webp") oder die Adresse eines hochgeladenen Logos. */
  logo: string | null;
  website: string | null;
  /** X-Konto ohne @ */
  x: string | null;
  region: string | null;
  spieler: OrgSpieler[];
  extras: OrgExtra[];
}

interface Datei { stand?: string; orgs?: Org[] }

/**
 * Die Organisationen - oder ein Fehler, wenn die Ablage nicht antwortet.
 *
 * Bewusst kein leeres Ergebnis bei einem Ausfall: der Betreiber liest aus
 * "keine Organisationen" sonst, seine Arbeit sei weg.
 */
export async function liesOrgs(): Promise<Org[]> {
  const roh = await speicher.lies(ORGS_DATEI);
  if (!roh) return [];
  const d = JSON.parse(roh.toString('utf8')) as Datei;
  return (d.orgs ?? []).map(saeubere);
}

export async function schreibOrgs(orgs: Org[]): Promise<void> {
  await schreibJson(ORGS_DATEI, { stand: new Date().toISOString(), orgs: orgs.map(saeubere) });
}

const KONTO = /^[0-9a-f]{32}$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Nur, was hineingehoert - auch fuer das, was vom Admin-Werkzeug kommt. */
export function saeubere(o: Partial<Org>): Org {
  const text = (x: unknown, max = 120) => String(x ?? '').trim().slice(0, max);
  const web = text(o.website, 300);
  return {
    id: text(o.id, 60).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'org',
    name: text(o.name) || 'Unnamed',
    logo: o.logo ? text(o.logo, 400) : null,
    website: /^https?:\/\/[^\s]+\.[^\s]+/.test(web) ? web : null,
    x: o.x ? text(o.x, 40).replace(/^@/, '') || null : null,
    region: o.region ? text(o.region, 8).toUpperCase() : null,
    spieler: (Array.isArray(o.spieler) ? o.spieler : []).map((s) => ({
      epicId: s && KONTO.test(String(s.epicId ?? '').toLowerCase()) ? String(s.epicId).toLowerCase() : null,
      name: text(s?.name, 40),
      seit: s && TAG.test(String(s.seit ?? '')) ? String(s.seit) : null,
    })).filter((s) => s.name || s.epicId),
    extras: (Array.isArray(o.extras) ? o.extras : []).map((e) => ({
      titel: text(e?.titel, 80),
      betrag: Math.max(0, Math.round(Number(e?.betrag) || 0)),
      datum: e && TAG.test(String(e.datum ?? '')) ? String(e.datum) : null,
    })).filter((e) => e.titel && e.betrag > 0),
  };
}

/** Eine Kennung aus dem Namen - "Team Falcons" -> "team-falcons". */
export function orgKennung(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'org';
}

/** Ein Posten Preisgeld mit Tag - aus lib/szeneStats (verdienstPosten). */
export interface Posten { datum: number | null; betrag: number; titel: string; windowId: string }

/**
 * Was ein Spieler fuer die Org gewonnen hat: das Preisgeld des Jahres ab dem
 * Tag seines Beitritts. Ohne bekanntes Beitrittsdatum zaehlt das ganze Jahr -
 * die Anzeige sagt dann "since" nicht dazu. Posten ohne Tag zaehlen nur,
 * wenn kein Beitrittsdatum bekannt ist (sonst liesse sich nicht sagen, ob er
 * schon dabei war).
 */
export function fuerDieOrg(posten: Posten[], seit: string | null, jahr = ORGS_JAHR): { betrag: number; anzahl: number } {
  const ab = Math.max(Date.UTC(jahr, 0, 1), seit ? Date.parse(`${seit}T00:00:00Z`) : 0);
  let betrag = 0; let anzahl = 0;
  for (const p of posten) {
    if (p.datum === null ? !!seit : p.datum < ab) continue;
    betrag += p.betrag; anzahl += 1;
  }
  return { betrag, anzahl };
}
