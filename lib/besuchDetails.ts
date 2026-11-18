import { liesJson, speicher } from './ablage';
import { tagVon } from './besuche';
import type { Geraet } from './geraet';

/*
 * Woher die Besucher kommen - nur als Summen je Tag (Betreiber, 18.11.2026: "woher - Laender, und mehr wenn moeglich").
 *
 * Neben besuche.json (Aufrufe, Besucher, neu) steht hier dieselbe Zaehlung aufgeschluesselt: Land, Geraet, System, Browser,
 * Quelle (woher jemand auf die Seite kam), Seiten und die meistbesuchten Spielerprofile. Gespeichert werden ausschliesslich
 * Zaehler - keine IP, keine Kennung, nichts, was einen einzelnen Besuch wieder zusammensetzt. "Besucher" je Land/Geraet zaehlt
 * genau den Aufruf, bei dem besuche.json den Browser zum ersten Mal an diesem Tag sieht (dasselbe Cookie), damit beide Zahlen
 * zusammenpassen.
 *
 * Eigene Datei statt besuche.json zu erweitern: die Morgenberichte und der Discord-Zaehler (scripts/morgenbericht.mjs,
 * admin-zahlen-discord.mjs) lesen besuche.json als { Tag: {aufrufe, besucher, neu} } - das bleibt so unberuehrt.
 * Geschrieben wird wie dort gesammelt (alle paar Sekunden im Speicher, im GitHub-Archiv alle zwei Minuten - lib/ablageGitDaten
 * GESAMMELT), behalten werden 90 Tage, und jede lange Liste ist auf ihre groessten Eintraege gekappt.
 */

const NAME = 'besuche-details.json';
const SAMMELZEIT_MS = 3_000;
const TAGE_BEHALTEN = 90;

/** Hoechstzahl je Liste und Tag (gekappt beim Schreiben, die kleinsten fallen weg). */
const KAPPE = { seiten: 120, spieler: 250, hosts: 40, utm: 30, orte: 150 } as const;

/** [Besucher, Aufrufe] */
export type Paar = [number, number];

export interface TagDetails {
  laender?: Record<string, Paar>;
  art?: Record<string, Paar>;
  system?: Record<string, Paar>;
  browser?: Record<string, Paar>;
  /** Sitzungen je Quelle (erster Aufruf einer Sitzung im Browser). */
  quellen?: Record<string, number>;
  /** Sitzungen je Host bei "Andere" - damit man sieht, was dahinter steckt. */
  hosts?: Record<string, number>;
  /** Sitzungen je ?utm_source= */
  utm?: Record<string, number>;
  /** Aufrufe je Seite, Kennungen herausgenommen (/events/[id]). */
  seiten?: Record<string, number>;
  /** Aufrufe je Spielerprofil (Epic-Id). */
  spieler?: Record<string, number>;
  /** [Besucher, Aufrufe] je Stadt - nur, wenn Cloudflare cf-ipcity mitschickt. */
  orte?: Record<string, Paar>;
  /**
   * Welche Ortskoepfe von Cloudflare ueberhaupt ankamen (Anzahl Aufrufe mit dem Kopf) und wie viele Aufrufe es insgesamt
   * waren - der Beleg, ob eine Stadt verfuegbar ist, statt einer Vermutung.
   */
  koepfe?: Record<string, number>;
}

type Stand = Record<string, TagDetails>;

let stand: Stand | null = null;
let laedt: Promise<Stand> | null = null;
let geplant: NodeJS.Timeout | null = null;

async function lies(): Promise<Stand> {
  if (stand) return stand;
  laedt ??= liesJson<Stand>(NAME, {}).then((roh) => {
    stand = roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
    return stand;
  }).finally(() => { laedt = null; });
  return laedt;
}

/** Nur die groessten n Eintraege behalten. */
function kappe<T extends number | Paar>(m: Record<string, T> | undefined, n: number): Record<string, T> | undefined {
  if (!m) return m;
  const e = Object.entries(m);
  if (e.length <= n) return m;
  const wert = (v: T): number => (Array.isArray(v) ? (v as Paar)[1] + (v as Paar)[0] * 1000 : (v as number));
  return Object.fromEntries(e.sort((a, b) => wert(b[1]) - wert(a[1])).slice(0, n));
}

function aufraeumen(z: Stand): void {
  const grenze = new Date();
  grenze.setDate(grenze.getDate() - TAGE_BEHALTEN);
  const alt = tagVon(grenze);
  for (const tag of Object.keys(z)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || tag < alt) { delete z[tag]; continue; }
    const d = z[tag];
    d.seiten = kappe(d.seiten, KAPPE.seiten);
    d.spieler = kappe(d.spieler, KAPPE.spieler);
    d.hosts = kappe(d.hosts, KAPPE.hosts);
    d.utm = kappe(d.utm, KAPPE.utm);
    d.orte = kappe(d.orte, KAPPE.orte);
  }
}

function planeSchreiben(): void {
  if (geplant) return;
  geplant = setTimeout(() => {
    geplant = null;
    void (async () => {
      if (!stand) return;
      try {
        aufraeumen(stand);
        // Ohne Einrueckung: die Datei hat viele kleine Paare, eingerueckt waere sie ein Vielfaches so gross.
        await speicher.schreib(NAME, Buffer.from(JSON.stringify(stand), 'utf8'));
      } catch { /* eine verlorene Zahl ist kein Grund, eine Seite scheitern zu lassen */ }
    })();
  }, SAMMELZEIT_MS);
  geplant.unref?.();
}

/* ------------------------------------------------------------ Seiten */

/** Pfade mit Kennungen darin: erster Abschnitt -> Namen der folgenden Abschnitte. */
const DYNAMISCH: Record<string, string[]> = {
  player: ['[id]'], events: ['[id]'], team: ['[org]'], posts: ['[datum]'], media: ['[datei]'],
  replays: ['[tag]', '[nr]'], match: ['[tag]', '[nr]'], 'live-replays': ['[cup]'], fehler: ['[code]'],
  awards: ['[kategorie]'], bilder: ['[datei]'],
};

/** Aus "/events/abc123?x=1" wird "/events/[id]". Unbrauchbares -> null. */
export function seiteAus(roh: unknown): string | null {
  if (typeof roh !== 'string' || !roh.startsWith('/') || roh.length > 300) return null;
  const pfad = roh.split(/[?#]/)[0];
  const teile = pfad.split('/').filter(Boolean).slice(0, 4);
  const muster = DYNAMISCH[teile[0]?.toLowerCase() ?? ''];
  const aus = teile.map((t, i) => {
    if (i === 0) return t.toLowerCase();
    if (muster) return muster[Math.min(i - 1, muster.length - 1)];
    // Sonst alles, was nach Kennung aussieht.
    return /\d{3,}|^[0-9a-f-]{12,}$/i.test(t) || t.length > 40 ? '[id]' : t.toLowerCase();
  });
  const fertig = '/' + aus.join('/');
  return /^[/a-z0-9\-_.[\]]{1,120}$/.test(fertig) ? fertig : null;
}

/* ------------------------------------------------------------ Quellen */

export const QUELLEN = ['Direkt', 'X / Twitter', 'Twitch', 'YouTube', 'Discord', 'Google', 'Bing', 'Andere Suche',
  'TikTok', 'Reddit', 'Instagram', 'Intern', 'Andere'] as const;
export type Quelle = typeof QUELLEN[number];

/** Ein Host oder ein utm_source-Wort einer Gruppe zuordnen - null, wenn keine passt. */
function gruppeVon(h: string): Quelle | null {
  const s = h.toLowerCase();
  if (/(^|\.)(x\.com|twitter\.com|t\.co)$|^(x|twitter|tweet|com\.twitter\.android)$/.test(s)) return 'X / Twitter';
  if (/(^|\.)twitch\.tv$|^twitch$|tv\.twitch/.test(s)) return 'Twitch';
  if (/(^|\.)(youtube\.com|youtu\.be)$|^(youtube|yt)$|android\.youtube/.test(s)) return 'YouTube';
  if (/(^|\.)(discord\.com|discordapp\.com|discord\.gg|discordapp\.net)$|^discord$|com\.discord/.test(s)) return 'Discord';
  if (/(^|\.)google\.[a-z.]+$|^google$|googlequicksearchbox|android\.gm$/.test(s)) return 'Google';
  if (/(^|\.)bing\.com$|^bing$/.test(s)) return 'Bing';
  if (/(^|\.)(duckduckgo\.com|yahoo\.com|ecosia\.org|yandex\.[a-z]+|baidu\.com|search\.brave\.com|startpage\.com|qwant\.com)$/.test(s)) return 'Andere Suche';
  if (/(^|\.)tiktok\.com$|^tiktok$|musically|zhiliaoapp/.test(s)) return 'TikTok';
  if (/(^|\.)(reddit\.com|redd\.it)$|^reddit$/.test(s)) return 'Reddit';
  if (/(^|\.)instagram\.com$|^(instagram|ig)$|^l\.instagram/.test(s)) return 'Instagram';
  return null;
}

/** Den Host aus document.referrer; bei android-app://paket das Paket. */
function hostAus(referrer: string): string {
  try {
    const u = new URL(referrer);
    if (u.protocol === 'android-app:') return u.hostname || u.pathname.replace(/^\/+/, '').split('/')[0];
    return u.hostname.replace(/^(www|m|mobile)\./, '');
  } catch { return ''; }
}

const EIGEN = /(^|\.)(thecomphub\.com|netlify\.app)$|^localhost$|^127\.0\.0\.1$/;

export function quelleAus(referrer: unknown, utm: unknown): { quelle: Quelle; host?: string; utm?: string } {
  const u = typeof utm === 'string' ? utm.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) : '';
  const host = typeof referrer === 'string' && referrer ? hostAus(referrer.slice(0, 500)).toLowerCase().slice(0, 80) : '';
  if (u) {
    const g = gruppeVon(u) ?? (host ? gruppeVon(host) : null);
    return { quelle: g ?? 'Andere', utm: u, ...(g ? {} : { host: host && !EIGEN.test(host) ? host : `utm:${u}` }) };
  }
  if (!host) return { quelle: 'Direkt' };
  if (EIGEN.test(host)) return { quelle: 'Intern' };
  const g = gruppeVon(host);
  return g ? { quelle: g } : { quelle: 'Andere', host };
}

/* ------------------------------------------------------------ Zaehlen */

const ART: Record<Geraet['art'], string> = { Handy: 'Handy', Tablet: 'Tablet', Computer: 'Computer' };
const ORTSKOEPFE = ['cf-ipcity', 'cf-region', 'cf-region-code', 'cf-ipcontinent', 'cf-timezone', 'cf-postal-code'];

function plus(m: Record<string, Paar>, k: string, besucher: boolean) {
  const p = (m[k] ??= [0, 0]);
  if (besucher) p[0] += 1;
  p[1] += 1;
}

export interface Aufruf {
  headers: Headers;
  geraet: Geraet | null;
  /** Der Pfad wie im Browser, z. B. "/events/abc". */
  pfad?: unknown;
  /** Bei /statistics?spieler= die Epic-Id. */
  spieler?: unknown;
  /** Nur beim ersten Aufruf einer Sitzung gesetzt (auch leer = direkt). */
  sitzung?: { referrer?: unknown; utm?: unknown } | null;
  /** Hat besuche.json diesen Browser gerade zum ersten Mal heute gezaehlt? */
  besucher: boolean;
}

/** Einen Aufruf in die Summen des Tages legen - im Speicher, geschrieben wird gesammelt. */
export async function zaehleDetails(a: Aufruf): Promise<void> {
  const z = await lies();
  const d = (z[tagVon()] ??= {});
  const b = a.besucher;

  const land = a.geraet?.land ?? '??';
  plus((d.laender ??= {}), land, b);
  if (a.geraet) {
    plus((d.art ??= {}), ART[a.geraet.art] ?? 'Computer', b);
    plus((d.system ??= {}), a.geraet.system.replace(/ \d+$/, ''), b);
    plus((d.browser ??= {}), a.geraet.browser, b);
  }

  const kopf = (n: string) => (a.headers.get(n) ?? '').replace(/^"|"$/g, '').trim();
  const k = (d.koepfe ??= {});
  k.aufrufe = (k.aufrufe ?? 0) + 1;
  for (const n of ORTSKOEPFE) if (kopf(n)) k[n] = (k[n] ?? 0) + 1;
  const stadt = kopf('cf-ipcity');
  if (stadt) {
    // Cloudflare schickt Nicht-ASCII-Namen teils als Latin-1-Bytes - so zurueckgewandelt, wie es ankommt, sonst unveraendert.
    let name = stadt;
    try { if (/[\u0080-ÿ]/.test(name)) name = Buffer.from(name, 'latin1').toString('utf8'); } catch { /* lassen */ }
    plus((d.orte ??= {}), `${land} · ${name.slice(0, 50)}`, b);
  }

  const seite = (() => {
    const s = seiteAus(a.pfad);
    if (s === '/statistics' && typeof a.spieler === 'string' && a.spieler) return '/statistics?spieler=[id]';
    return s;
  })();
  if (seite) {
    const s = (d.seiten ??= {});
    s[seite] = (s[seite] ?? 0) + 1;
  }
  const id = typeof a.spieler === 'string' ? a.spieler.trim().toLowerCase().replace(/-/g, '') : '';
  const pfadId = typeof a.pfad === 'string' ? /^\/player\/([^/?#]+)/.exec(a.pfad)?.[1]?.toLowerCase().replace(/-/g, '') ?? '' : '';
  const sid = /^[0-9a-f]{32}$/.test(id) ? id : /^[0-9a-f]{32}$/.test(pfadId) ? pfadId : '';
  if (sid) {
    const s = (d.spieler ??= {});
    s[sid] = (s[sid] ?? 0) + 1;
  }

  if (a.sitzung) {
    const q = quelleAus(a.sitzung.referrer, a.sitzung.utm);
    const qs = (d.quellen ??= {});
    qs[q.quelle] = (qs[q.quelle] ?? 0) + 1;
    if (q.host) { const h = (d.hosts ??= {}); h[q.host] = (h[q.host] ?? 0) + 1; }
    if (q.utm) { const u = (d.utm ??= {}); u[q.utm] = (u[q.utm] ?? 0) + 1; }
  }

  planeSchreiben();
}

/* ------------------------------------------------------------ Auswerten */

export interface Zusammen {
  tage: string[];
  laender: Array<{ code: string; besucher: number; aufrufe: number }>;
  art: Array<{ name: string; besucher: number; aufrufe: number }>;
  system: Array<{ name: string; besucher: number; aufrufe: number }>;
  browser: Array<{ name: string; besucher: number; aufrufe: number }>;
  quellen: Array<{ name: string; sitzungen: number }>;
  hosts: Array<{ name: string; sitzungen: number }>;
  utm: Array<{ name: string; sitzungen: number }>;
  seiten: Array<{ pfad: string; aufrufe: number }>;
  spieler: Array<{ id: string; aufrufe: number }>;
  orte: Array<{ name: string; besucher: number; aufrufe: number }>;
  koepfe: Record<string, number>;
  seit: string | null;
}

/** Die Summen ueber die angegebenen Tage. */
export async function detailsUeber(tage: string[]): Promise<Zusammen> {
  const z = await lies();
  const paare = (feld: 'laender' | 'art' | 'system' | 'browser' | 'orte') => {
    const m = new Map<string, Paar>();
    for (const t of tage) for (const [k, v] of Object.entries(z[t]?.[feld] ?? {})) {
      const p = m.get(k) ?? [0, 0];
      p[0] += Number(v?.[0]) || 0; p[1] += Number(v?.[1]) || 0;
      m.set(k, p);
    }
    return [...m].map(([name, [besucher, aufrufe]]) => ({ name, besucher, aufrufe }))
      .sort((a, b) => b.besucher - a.besucher || b.aufrufe - a.aufrufe);
  };
  const zahlen = (feld: 'quellen' | 'hosts' | 'utm' | 'seiten' | 'spieler' | 'koepfe') => {
    const m = new Map<string, number>();
    for (const t of tage) for (const [k, v] of Object.entries(z[t]?.[feld] ?? {})) m.set(k, (m.get(k) ?? 0) + (Number(v) || 0));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const seit = Object.keys(z).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)).sort()[0] ?? null;
  return {
    tage,
    laender: paare('laender').map(({ name, ...r }) => ({ code: name, ...r })),
    art: paare('art'),
    system: paare('system').slice(0, 10),
    browser: paare('browser').slice(0, 10),
    quellen: zahlen('quellen').map(([name, sitzungen]) => ({ name, sitzungen })),
    hosts: zahlen('hosts').slice(0, 15).map(([name, sitzungen]) => ({ name, sitzungen })),
    utm: zahlen('utm').slice(0, 15).map(([name, sitzungen]) => ({ name, sitzungen })),
    seiten: zahlen('seiten').slice(0, 25).map(([pfad, aufrufe]) => ({ pfad, aufrufe })),
    spieler: zahlen('spieler').slice(0, 15).map(([id, aufrufe]) => ({ id, aufrufe })),
    orte: paare('orte').slice(0, 25),
    koepfe: Object.fromEntries(zahlen('koepfe')),
    seit,
  };
}
