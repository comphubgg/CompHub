import { useEffect, useState } from 'react';

/* Gemeinsame Bausteine der Events-Seiten: Typen des Katalogs (/api/cup-catalog), Regionen, Stand eines Cups, Modus, Stufen-Namen, Uhr. */

export interface Fenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string;
  runde?: number; rundenTyp?: string; istFinale: boolean; matchCap?: number;
  playlist?: string; plattformen?: string[];
  /** Wie viele weiterkommen (Epics Rangschwelle). */
  qualifiziert?: number;
  marken?: Array<{ token: string; bis: number }>;
}
export interface Cup {
  id: string; titel: string; untertitel?: string; beschreibung?: string;
  bild?: string; farbe?: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
  naechsterStart: number | null; letzterStart: number | null;
  live: boolean; vorbei: boolean;
}

export const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
export const REGION_NAME: Record<string, string> = {
  EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania', GLOBAL: 'Global',
};
/** Eine Farbe je Region - fuer die kleinen Marken. */
export const REGION_FARBE: Record<string, string> = {
  EU: '#38bdf8', NAC: '#a78bfa', NAW: '#f472b6', BR: '#34d399', ASIA: '#fbbf24', ME: '#fb923c', OCE: '#2dd4bf', GLOBAL: '#e2e8f0',
};

export const ART_NAME: Record<string, string> = {
  championship: 'Championship', finals: 'Finals', ranked: 'Ranked Cup', skin: 'Skin Cup', mobile: 'Mobile Cup',
  cash: 'Cash Cup', victory: 'Victory Cup', reload: 'Reload', division: 'FNCS Division', sonstige: 'Event',
};

/** Laeuft dieses Fenster gerade? (aus Beginn/Ende - der Katalog kommt zwischengespeichert) */
export function laeuft(f: Fenster, jetzt: number): boolean {
  if (!f.begin || f.begin > jetzt) return false;
  if (f.end) return jetzt < f.end;
  return f.status === 'live' && jetzt - f.begin < 4 * 3_600_000;
}
export function vorbei(f: Fenster, jetzt: number): boolean {
  return !!f.begin && f.begin <= jetzt && !laeuft(f, jetzt);
}

export function fensterIn(c: Cup, region: string): Fenster[] {
  if (region === 'alle' || c.global) return Object.values(c.regionen).flat();
  return c.regionen[region] ?? [];
}

export interface Lage { status: 'live' | 'kommt' | 'vorbei'; fenster: Fenster | null; wo: string[]; naechster: number | null; letzter: number | null }

/** Wo ein Cup in dieser Region gerade steht - hier gerechnet, nicht vom Server uebernommen. */
export function lageVon(c: Cup, region: string, jetzt: number): Lage {
  const f = fensterIn(c, region);
  const live = f.filter((w) => laeuft(w, jetzt)).sort((a, b) => (a.end ?? 0) - (b.end ?? 0));
  const kommend = f.filter((w) => w.begin > jetzt).sort((a, b) => a.begin - b.begin);
  const gewesen = f.filter((w) => w.begin && w.begin <= jetzt).sort((a, b) => b.begin - a.begin);
  const wo = (l: Fenster[]) => [...new Set(l.map((w) => w.region))];
  if (live.length) return { status: 'live', fenster: live[0], wo: wo(live), naechster: kommend[0]?.begin ?? null, letzter: live[0].begin };
  if (kommend.length) return { status: 'kommt', fenster: kommend[0], wo: wo(kommend.filter((w) => w.begin === kommend[0].begin)), naechster: kommend[0].begin, letzter: gewesen[0]?.begin ?? null };
  return { status: 'vorbei', fenster: gewesen[0] ?? null, wo: [], naechster: null, letzter: gewesen[0]?.begin ?? null };
}

/* ---------------------------------------------------------------- Modus */
export type Modus = 'br' | 'zb' | 'reload';
export const MODUS_NAME: Record<Modus, string> = { br: 'Battle Royale', zb: 'Zero Build', reload: 'Reload' };

/** Welche Spielarten ein Cup hat - aus Epics Benennung (Titel, Kennungen, Playlist). */
export function modiVon(c: Cup): Set<Modus> {
  const alle = Object.values(c.regionen).flat();
  const text = `${c.id} ${c.titel} ${c.untertitel ?? ''} ${alle.slice(0, 3).map((f) => `${f.eventId} ${f.windowId} ${f.playlist ?? ''}`).join(' ')}`;
  const m = new Set<Modus>();
  const zb = /zero\s*build|zerobuild|(^|[_\s])zb($|[_\s])|_ZB_|NoBuild/i.test(text);
  const reload = /reload/i.test(text);
  if (zb) m.add('zb');
  if (reload) m.add('reload');
  if (!zb && !reload) m.add('br');
  return m;
}
export const istRanked = (c: Cup) => c.art === 'ranked' || /\branked\b/i.test(`${c.titel} ${c.untertitel ?? ''}`);

/** Das Bild eines Cups als Deko - nie Ranked- oder Skin-Cup-Artwork (Betreiber), dann gibt es den Farbverlauf. */
export const dekoBild = (c: Cup): string | undefined => (c.art === 'skin' || istRanked(c) ? undefined : c.bild);

/* ---------------------------------------------------------------- Stufen */
/** Der Name eines Spieltags aus Epics Kennung: "S43_..._Event4Round2_EU" -> "Event 4 · Round 2". */
export function stufeName(f: Pick<Fenster, 'windowId' | 'istFinale' | 'rundenTyp'>): string {
  const w = f.windowId.replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i, '');
  const teile: string[] = [];
  const nimm = (re: RegExp, name: string) => { const m = re.exec(w); if (m) teile.push(m[1] ? `${name} ${Number(m[1])}` : name); };
  nimm(/Week_?(\d+)/i, 'Week');
  nimm(/Event_?(\d+)/i, 'Event');
  nimm(/Qual(?:ifier)?_?(\d+)/i, 'Qualifier');
  nimm(/Heat_?(\d+)/i, 'Heat');
  nimm(/Contender_?(\d+)/i, 'Contender');
  if (/LastChance|LCQ/i.test(w)) teile.push('Last Chance Qualifier');
  if (/Semi/i.test(w)) teile.push('Semi-Final');
  else if (/GrandFinal/i.test(w)) teile.push('Grand Final');
  else if (/Final/i.test(w) || f.istFinale) teile.push('Final');
  nimm(/Round_?(\d+)/i, 'Round');
  nimm(/Day_?(\d+)/i, 'Day');
  nimm(/Division_?(\d+)/i, 'Division');
  const raus = [...new Set(teile)];
  return raus.length ? raus.join(' · ') : (f.rundenTyp || 'Session');
}

/* ---------------------------------------------------------------- Zeit */
export function useJetzt(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
/** "2d 04h", "3h 12m", "12m 05s" */
export function dauer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  const z = (n: number) => String(n).padStart(2, '0');
  if (d) return `${d}d ${h}h ${z(m)}m`;
  if (h) return `${h}h ${z(m)}m`;
  return `${m}m ${z(sek)}s`;
}
export const datum = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const tagKurz = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
export const zahl = (n: number | null | undefined, stellen = 0) => (typeof n === 'number' && Number.isFinite(n)
  ? n.toLocaleString('en', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) : '—');

/** Die Adresse eines Cups im Hub - mit Region und Spieltag, wenn bekannt. */
export function cupLink(c: Cup, f: Fenster | null): string {
  return `/competitive/events/${encodeURIComponent(c.id)}${f ? `?region=${f.region}&fenster=${encodeURIComponent(f.windowId)}` : ''}`;
}
