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
import { orgBild } from '@/lib/bildAdressen';

export const ORGS_DATEI = 'orgs.json';
/** Das Jahr, dessen Preisgeld gezaehlt wird. */
export const ORGS_JAHR = 2026;

/**
 * Die Rolle in der Org. Der Betreiber (26./28.9.2026): Pro Roster, darunter
 * Academy Roster, darunter Content Creator - Academy-Spieler "werden nicht
 * gleich behandelt wie die Pro-Spieler" (sie zaehlen nicht zum Preisgeld der
 * Org), Creator zeigen ihre Kanaele.
 */
export type OrgRolle = 'pro' | 'academy' | 'creator';

export interface OrgSpieler {
  /** Epic-Konto; null, solange der Spieler keinem Konto zugeordnet ist. */
  epicId: string | null;
  /** Der Name, wie ihn die Org fuehrt - Anzeige, solange kein Konto da ist. */
  name: string;
  /** Seit wann bei der Org, "JJJJ-MM-TT" - oder null, wenn unbekannt. */
  seit: string | null;
  /** Pro (Standard), Academy oder Content Creator. */
  rolle: OrgRolle;
  /** Kanaele - bei Pros und Academy nur X, bei Creatorn TikTok, Twitch, X, YouTube. */
  x: string | null;
  twitch: string | null;
  tiktok: string | null;
  youtube: string | null;
  /**
   * Ein vom Admin hochgeladenes Foto fuer einen Spieler ohne Konto (Content
   * Creator, weniger bekannte Pros) - "/spielerbilder/<datei>". Mit Konto
   * gilt das Foto am Konto; dieses hier bleibt der Rueckfall.
   */
  bild?: string | null;
  /** Die Liquipedia-Spielerseite - fuer Teamverlauf und Zuordnung ueber X. */
  liquipedia?: string | null;
}

/** Ein ehemaliger Spieler der Org, wie Liquipedia ihn fuehrt. */
export interface OrgEhemaliger {
  name: string;
  liquipedia: string | null;
  seit: string | null;
  bis: string | null;
  /** Nur ueber dieselbe Liquipedia-Seite oder das X-Konto zugeordnet - nie ueber den Namen. */
  epicId?: string | null;
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
  /** Das breite Bild hinter dem Logo auf der Org-Seite (meist das X-Banner der Org). */
  banner: string | null;
  website: string | null;
  /** X-Konto ohne @ */
  x: string | null;
  /** Weitere Kanaele - Konto oder Adresse, wie der Betreiber sie eintraegt. */
  youtube: string | null;
  twitch: string | null;
  instagram: string | null;
  tiktok: string | null;
  /** Herkunftsland der Organisation, zweistelliger ISO-Code ("DE"). */
  land: string | null;
  region: string | null;
  spieler: OrgSpieler[];
  extras: OrgExtra[];
  /**
   * Namen, die der Admin aus dieser Org entfernt hat. Der taegliche Abgleich
   * mit Liquipedia (scripts/org-kader-pruefen.mjs) traegt sie nie wieder ein -
   * Liquipedia ist nicht immer aktuell (FOKUS, 30.9.2026: "zwei von den
   * Spielern sind nicht mehr da drin").
   */
  ausgeschlossen?: string[];
  /** Ehemalige Spieler laut Liquipedia (scripts/org-kader-pruefen.mjs). */
  ehemalige?: OrgEhemaliger[];
  /** Die Liquipedia-Teamseite der Org. */
  liquipedia?: string | null;
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

/** Alte Adressen hochgeladener Bilder (/api/orgs/logo?datei=...) auf die, die Cloudflare zwischenspeichert. */
function bildAdresse(url: string): string {
  const m = /^\/api\/orgs\/logo\?datei=(.+)$/.exec(url);
  return m ? orgBild(decodeURIComponent(m[1])) : url;
}
const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Nur, was hineingehoert - auch fuer das, was vom Admin-Werkzeug kommt. */
export function saeubere(o: Partial<Org>): Org {
  const text = (x: unknown, max = 120) => String(x ?? '').trim().slice(0, max);
  const web = text(o.website, 300);
  // Ein Kanal als blosses Konto - "@XSET" oder die ganze Adresse werden zu "XSET".
  const konto = (x: unknown) => {
    const t = text(x, 200).replace(/^https?:\/\/(www\.)?[^/]+\/(@|c\/|channel\/|user\/)?/i, '').replace(/^@/, '').split(/[/?#]/)[0];
    return t ? t.slice(0, 60) : null;
  };
  return {
    id: text(o.id, 60).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'org',
    name: text(o.name) || 'Unnamed',
    logo: o.logo ? bildAdresse(text(o.logo, 400)) : null,
    banner: o.banner ? bildAdresse(text(o.banner, 400)) : null,
    website: /^https?:\/\/[^\s]+\.[^\s]+/.test(web) ? web : null,
    x: konto(o.x),
    youtube: konto(o.youtube),
    twitch: konto(o.twitch),
    instagram: konto(o.instagram),
    tiktok: konto(o.tiktok),
    land: /^[A-Za-z]{2}$/.test(String(o.land ?? '')) ? String(o.land).toUpperCase() : null,
    region: o.region ? text(o.region, 8).toUpperCase() : null,
    spieler: (Array.isArray(o.spieler) ? o.spieler : []).map((s) => {
      const rolle: OrgRolle = s?.rolle === 'academy' || s?.rolle === 'creator' ? s.rolle : 'pro';
      return {
        epicId: s && KONTO.test(String(s.epicId ?? '').toLowerCase()) ? String(s.epicId).toLowerCase() : null,
        name: text(s?.name, 40),
        seit: s && TAG.test(String(s.seit ?? '')) ? String(s.seit) : null,
        rolle,
        x: konto(s?.x),
        // Twitch, TikTok und YouTube nur bei Creatorn - der Betreiber will bei
        // Pros und Academy allein das X-Konto.
        twitch: rolle === 'creator' ? konto(s?.twitch) : null,
        tiktok: rolle === 'creator' ? konto(s?.tiktok) : null,
        youtube: rolle === 'creator' ? konto(s?.youtube) : null,
        bild: /^\/spielerbilder\/[A-Za-z0-9%._-]+$/.test(String(s?.bild ?? '')) ? String(s.bild) : null,
        liquipedia: s?.liquipedia ? text(s.liquipedia, 120) : null,
      };
    }).filter((s) => s.name || s.epicId),
    liquipedia: o.liquipedia ? text(o.liquipedia, 120) : null,
    ehemalige: (Array.isArray(o.ehemalige) ? o.ehemalige : []).map((e) => ({
      name: text(e?.name, 40),
      liquipedia: e?.liquipedia ? text(e.liquipedia, 120) : null,
      seit: e && TAG.test(String(e.seit ?? '')) ? String(e.seit) : null,
      bis: e && TAG.test(String(e.bis ?? '')) ? String(e.bis) : null,
      epicId: e && KONTO.test(String(e.epicId ?? '').toLowerCase()) ? String(e.epicId).toLowerCase() : null,
    })).filter((e) => e.name).slice(0, 300),
    ausgeschlossen: [...new Set((Array.isArray(o.ausgeschlossen) ? o.ausgeschlossen : [])
      .map((n) => text(n, 40)).filter(Boolean))].slice(0, 300),
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
 *
 * "Das Jahr" ist das Wettkampfjahr des Werkzeugs (lib/saisonJahre): 2026
 * beginnt mit Chapter 7 Season 1 im Dezember 2025. Die Posten kommen schon so
 * gefiltert an - ein zusaetzlicher Schnitt am 1. Januar liesse die Finals vom
 * Dezember fehlen, die das Spielerprofil unter 2026 fuehrt.
 */
export function fuerDieOrg(posten: Posten[], seit: string | null, bis: string | null = null): { betrag: number; anzahl: number } {
  const ab = seit ? Date.parse(`${seit}T00:00:00Z`) : 0;
  // Bei Ehemaligen: nur bis zum Austrittstag (einschliesslich).
  const ende = bis ? Date.parse(`${bis}T23:59:59Z`) : Infinity;
  let betrag = 0; let anzahl = 0;
  for (const p of posten) {
    if (p.datum === null ? (!!seit || !!bis) : (p.datum < ab || p.datum > ende)) continue;
    betrag += p.betrag; anzahl += 1;
  }
  return { betrag, anzahl };
}
