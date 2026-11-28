/*
 * Titel, Vorschaubild und Ersteller zu Fortnite-Insel-Codes und zu Epics eigenen Modi (27.11.2026, fuer den Community-Bereich des neuen Hubs).
 *
 * Quelle ist Epics Links-Dienst - dort schlaegt auch das Spiel nach, wenn jemand einen Code eingibt. Ein "Link" ist dabei alles, was sich im Spiel
 * starten laesst: eine Insel (1234-5678-9012), eine einzelne Spielliste (playlist_defaultsquad) oder ein ganzer Modus (set_br_playlists).
 *
 * Abgelegt wird je Code im Arbeitsspeicher, zwoelf Stunden (ein Code, den es nicht gibt: eine Stunde - eine Insel kann noch veroeffentlicht werden).
 * Nicht in der Ablage: jede Datei dort ist ein Commit im Daten-Archiv (lib/ablageGitDaten), und ein Titel laesst sich nach einem Neustart in einer
 * einzigen Sammelabfrage neu holen.
 */

import { epicAbruf, epicFehler, gemerkt, merke } from '@/lib/fnEpic';

const LINKS = 'https://links-public-service-live.ol.epicgames.com/links/api/fn/mnemonic';

export const INSEL_FRIST_MS = 12 * 60 * 60_000;
const FEHLT_FRIST_MS = 60 * 60_000;
/** So viele Codes nimmt eine Sammelabfrage. */
const JE_ABFRAGE = 100;

/** Was die Schnittstelle je Code herausgibt. */
export interface Insel {
  titel: string;
  /** Das Vorschaubild in Kachelgroesse (640x360, wo Epic eines hat) - sonst das grosse. */
  bild: string | null;
  /** Dasselbe Bild in voller Groesse (meist 1920x1080). */
  bildGross: string | null;
  creator: string | null;
  tagline: string | null;
  /** Epics Art des Links: "valkyrie:application" (UEFN-Insel), "Creative:Island", "BR:Playlist", "ModeSet" ... */
  typ: string | null;
}

/** Was intern zusaetzlich gebraucht wird (lib/fnEntdecken): wem der Link gehoert und wozu er zaehlt. */
export interface InselIntern extends Insel {
  code: string;
  epic: boolean;
  /** Der Modus, zu dem eine Spielliste gehoert (metadata.parent_experience, aelter: parent_set). */
  eltern: string | null;
  /** Die Spiellisten eines Modus (metadata.sub_link_codes). */
  unter: string[];
}

interface RohLink {
  mnemonic?: string;
  accountId?: string;
  creatorName?: string;
  linkType?: string;
  metadata?: {
    title?: string;
    tagline?: string;
    introduction?: string;
    image_url?: string;
    image_urls?: { url?: string; url_m?: string; url_s?: string; url_xs?: string };
    parent_set?: string;
    parent_experience?: string;
    sub_link_codes?: string[];
  };
}

const text = (w: unknown): string | null => (typeof w === 'string' && w.trim() ? w.trim() : null);

function forme(r: RohLink, code: string): InselIntern {
  const m = r.metadata ?? {};
  const b = m.image_urls ?? {};
  const gross = text(m.image_url) ?? text(b.url);
  return {
    code,
    titel: text(m.title) ?? code,
    bild: text(b.url_m) ?? text(b.url_s) ?? gross ?? text(b.url_xs),
    bildGross: gross ?? text(b.url_m) ?? text(b.url_s),
    creator: text(r.creatorName),
    tagline: text(m.tagline),
    typ: text(r.linkType),
    epic: r.accountId === 'epic',
    eltern: text(m.parent_experience) ?? text(m.parent_set),
    unter: Array.isArray(m.sub_link_codes) ? m.sub_link_codes.filter((c): c is string => typeof c === 'string') : [],
  };
}

/**
 * Ein Code, wie Epic ihn kennt: zwoelf Ziffern in drei Gruppen oder ein Name aus Buchstaben, Ziffern, Unterstrich, Punkt, Bindestrich.
 * Eine angehaengte Fassung ("1234-5678-9012?v=7") faellt weg - gefragt wird immer nach der aktuellen.
 */
export function inselCode(roh: string): string | null {
  const c = roh.trim().replace(/\?v=\d+$/i, '');
  return /^(\d{4}-\d{4}-\d{4}|[A-Za-z][A-Za-z0-9_.-]{1,79})$/.test(c) ? c : null;
}

const fach = (code: string) => `insel|${code.toLowerCase()}`;

/**
 * Die Links zu einer Reihe von Codes. null = Epic kennt den Code nicht. Fehlt ein Code im Ergebnis ganz, hat Epic gerade nicht geantwortet
 * (dann steht in `fehler`, warum) - er wird nicht als "gibt es nicht" abgelegt.
 */
export async function holeInseln(codes: string[]): Promise<{ inseln: Map<string, InselIntern | null>; fehler: string | null }> {
  const inseln = new Map<string, InselIntern | null>();
  const offen: string[] = [];
  for (const code of new Set(codes)) {
    const da = gemerkt<InselIntern | null>(fach(code));
    if (da !== undefined) inseln.set(code, da); else offen.push(code);
  }

  let fehler: string | null = null;
  const ablegen = (code: string, r: RohLink | undefined) => {
    const wert = r ? forme(r, code) : null;
    merke(fach(code), wert, wert ? INSEL_FRIST_MS : FEHLT_FRIST_MS);
    inseln.set(code, wert);
  };
  for (let i = 0; i < offen.length; i += JE_ABFRAGE) {
    const teil = offen.slice(i, i + JE_ABFRAGE);
    try {
      // ignoreFailures: ohne das beantwortet Epic die ganze Sammelabfrage mit einem Fehler, sobald ein einziger Code unbekannt ist.
      const a = await epicAbruf<RohLink[]>(`${LINKS}?ignoreFailures=true`, {
        body: teil.map((mnemonic) => ({ mnemonic, type: '', filter: false, v: '' })),
      });
      if (a.status === 200 && Array.isArray(a.daten)) {
        const nach = new Map<string, RohLink>();
        for (const r of a.daten) if (r?.mnemonic) nach.set(r.mnemonic.toLowerCase(), r);
        for (const code of teil) ablegen(code, nach.get(code.toLowerCase()));
        continue;
      }
      fehler = epicFehler(a);
      // Lehnt Epic die Form der Sammelabfrage ab (nicht den Zugang), einzeln fragen - langsamer, aber dieselbe Auskunft.
      if (![400, 404, 405, 413, 415].includes(a.status)) continue;
      let ok = true;
      for (let j = 0; j < teil.length && ok; j += 8) {
        await Promise.all(teil.slice(j, j + 8).map(async (code) => {
          const e = await epicAbruf<RohLink>(`${LINKS}/${encodeURIComponent(code)}`);
          if (e.status === 200 && e.daten?.mnemonic) ablegen(code, e.daten);
          else if (e.status === 404) ablegen(code, undefined);
          else { ok = false; fehler = epicFehler(e); }
        }));
      }
      if (ok) fehler = null;
    } catch (e) {
      fehler = (e as Error).message || 'Epic nicht erreichbar';
    }
  }
  return { inseln, fehler };
}

/** Nur das, was hinausgeht. */
export function oeffentlich(i: InselIntern | null | undefined): Insel | null {
  if (!i) return null;
  return { titel: i.titel, bild: i.bild, bildGross: i.bildGross, creator: i.creator, tagline: i.tagline, typ: i.typ };
}
