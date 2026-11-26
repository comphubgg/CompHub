import { useEffect, useMemo, useState } from 'react';
import { nobleAnzeige, type Pt } from './formVereinfachen';

/*
 * Gemeinsame Bausteine der Zeichenwerkzeuge im Hub (Turnierkarte und Globals-Prognose) - dieselben Regeln wie auf main
 * (lib/prognoseKarte, app/lib/kartenStil, app/lib/kartenZoom, lib/inseln, lib/rundenName, lib/homoglyph, lib/kartenQuelle).
 */

export interface Punkt { x: number; y: number }
export type Form = 'rechteck' | 'polygon';
export interface Spot {
  id: string; form: Form | string; punkte: Punkt[]; name?: string; teams: string[];
  farbe?: string; quelle?: 'noble' | 'vital';
}

export const ZOOM_MAX = 8;
export const SCHLIESS_NAEHE = 2.2;
export const FARBEN = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#f472b6', '#84cc16'];

export function rechteckPunkte(a: Punkt, b: Punkt): Punkt[] {
  return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
}
export function rahmen(p: Punkt[]) {
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  const links = Math.min(...xs), oben = Math.min(...ys);
  return { links, oben, breite: Math.max(...xs) - links, hoehe: Math.max(...ys) - oben };
}
export function imPolygon(p: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}
function randAbstand(p: Punkt, ecken: Punkt[]): number {
  let min = Infinity;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[j], b = ecken[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    min = Math.min(min, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return min;
}
export function istRechteck(punkte: Punkt[]): boolean {
  return punkte.length === 4 && new Set(punkte.map((q) => q.x)).size === 2 && new Set(punkte.map((q) => q.y)).size === 2;
}
/** Wo die Namen einer Form stehen: Rechteck -> Mitte, sonst der Punkt mit dem meisten Platz zum Rand (wie lib/prognoseKarte). */
export function anker(punkte: Punkt[]): Punkt {
  if (!punkte.length) return { x: 50, y: 50 };
  const r = rahmen(punkte);
  if (istRechteck(punkte) || r.breite <= 0 || r.hoehe <= 0) return { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 };
  const N = 64;
  const punkteD: Array<{ p: Punkt; d: number }> = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = { x: r.links + (r.breite * i) / N, y: r.oben + (r.hoehe * j) / N };
    if (imPolygon(p, punkte)) punkteD.push({ p, d: randAbstand(p, punkte) });
  }
  const bestD = Math.max(-1, ...punkteD.map((q) => q.d));
  let best: Punkt | null = null;
  if (bestD > 0) {
    const nah = punkteD.filter((q) => q.d >= 0.92 * bestD);
    const m = { x: nah.reduce((s, q) => s + q.p.x, 0) / nah.length, y: nah.reduce((s, q) => s + q.p.y, 0) / nah.length };
    best = imPolygon(m, punkte) && randAbstand(m, punkte) >= 0.85 * bestD ? m
      : nah.reduce((x, q) => (Math.hypot(q.p.x - m.x, q.p.y - m.y) < Math.hypot(x.p.x - m.x, x.p.y - m.y) ? q : x)).p;
  }
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const p = punkte[j], q = punkte[i], k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  const schwer = Math.abs(a) > 1e-9 ? { x: cx / (3 * a), y: cy / (3 * a) } : null;
  if (!best) return schwer ?? { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 };
  if (schwer && imPolygon(schwer, punkte) && randAbstand(schwer, punkte) >= 0.7 * bestD) return schwer;
  return best;
}
/** Schrift, damit die Zeile in die Form passt (Prozent der Kartenbreite). */
export function schriftgroesse(breite: number, hoehe: number, zeichen: number) {
  return Math.max(0.6, Math.min(hoehe * 0.7, (breite * 0.96) / Math.max(zeichen * 0.62, 1), 3.2));
}
/** Eine Schriftgroesse fuer die ganze Karte (das untere Drittel der passenden Groessen, 1,1 bis 2,0). */
export function einheitsGroesse(saetze: Array<{ punkte: Punkt[]; anzahl: number; texte: string[] }>): number {
  const werte: number[] = [];
  for (const s of saetze) {
    if (!s.texte.length) continue;
    const r = rahmen(s.punkte);
    const laengste = Math.max(...s.texte.map((t) => t.length), 1);
    werte.push(schriftgroesse(r.breite, r.hoehe / Math.max(1, s.anzahl) / s.texte.length, laengste));
  }
  if (!werte.length) return 1.2;
  werte.sort((a, b) => a - b);
  return Math.max(1.1, Math.min(werte[Math.floor(werte.length / 3)], 2.0));
}

/** Farbe einer Form: eigene Farbe, sonst Rot ab zwei Teams, Schwarz bei einem, blass ohne. */
export function formFarbe(belegt: number, eigene?: string | null) {
  if (eigene && /^#[0-9a-f]{6}$/i.test(eigene)) {
    const n = parseInt(eigene.slice(1), 16);
    return { fuellung: `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.4)`, rand: eigene, rot: false };
  }
  if (belegt >= 2) return { fuellung: 'rgba(255,0,0,0.4)', rand: '#d32f2f', rot: true };
  if (belegt === 1) return { fuellung: 'rgba(0,0,0,0.4)', rand: '#000', rot: false };
  return { fuellung: 'rgba(0,0,0,0.14)', rand: 'rgba(0,0,0,0.7)', rot: false };
}

/* ---------------------------------------------------------------- Zoom */

const ANTEIL = 0.72;
const STUFEN = 4;
/** Doppelklick: auf eine Form in Stufen hinein, sonst um 1,8 zum Punkt (wie app/lib/kartenZoom). */
export function doppelKlickZiel(form: { links: number; oben: number; breite: number; hoehe: number } | null, punkt: Punkt, aktuell: number) {
  if (!form) return { zoom: Math.min(ZOOM_MAX, Math.max(1.8, aktuell * 1.8)), mitte: punkt };
  const mitte = { x: form.links + form.breite / 2, y: form.oben + form.hoehe / 2 };
  const ziel = Math.min(ZOOM_MAX, Math.max(3, (ANTEIL * 100) / Math.max(form.breite, form.hoehe, 3)));
  for (let n = 1; n <= STUFEN; n++) {
    const z = ziel ** (n / STUFEN);
    if (z > aktuell * 1.06) return { zoom: z, mitte };
  }
  return { zoom: Math.max(ziel, aktuell), mitte };
}
export function begrenze(z: number, m: Punkt): Punkt {
  if (z <= 1) return { x: 50, y: 50 };
  const s = 100 / z;
  return { x: Math.min(100 - s / 2, Math.max(s / 2, m.x)), y: Math.min(100 - s / 2, Math.max(s / 2, m.y)) };
}

/* ---------------------------------------------------------------- Namen */

const ZWILLINGE: Record<string, string> = {
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ѵ': 'v', 'ԛ': 'q', 'ղ': 'n', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S', 'Ԛ': 'Q', 'Ԁ': 'D', 'Г': 'r', 'Ф': 'o',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ν': 'v', 'Α': 'A', 'Β': 'B', 'Ε': 'E',
  'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'ǃ': '!', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'Ø': 'O', '０': '0',
};
const vergleichbar = (t: string) => [...t.normalize('NFKC')].map((z) => ZWILLINGE[z] ?? z).join('').toLowerCase();
function kernname(name: string): string {
  let teile = name.trim().split(/\s+/).filter((t) => !/^\[.*\]$/.test(t)).filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  if (!teile.length) return name.trim();
  if (teile.length > 1 && /^[A-Z0-9]{2,6}[.!]?$/.test(teile[0])) teile = teile.slice(1);
  return teile.join(' ');
}
/** Vergleichsschluessel eines Namens (ohne Orgtag, Startnummer, Zierzeichen, Doppelgaenger-Buchstaben). */
export const namensSchluessel = (name: string) => vergleichbar(kernname(String(name ?? ''))).replace(/[^a-z0-9]/g, '');
const ZIFFERN: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
export const gefaltet = (s: string) => s.replace(/[013457]/g, (z) => ZIFFERN[z] ?? z);
/** Wie ein Name auf der Karte steht: ohne Marke, Startnummer und Zierzeichen, gross, hoechstens 16 Zeichen. */
export function kartenName(name: string): string {
  let s = kernname(String(name ?? ''));
  while (s.length && !/[\p{L}\p{N}]/u.test(s[s.length - 1])) s = s.slice(0, -1);
  return (s.trimEnd() || String(name ?? '')).slice(0, 16).toUpperCase();
}

/** Die echten Anzeigenamen zu Epic-Konten (/api/echte-namen), wie useEchteNamen auf main. */
export function useEchteNamen(ids: Array<string | null | undefined>, event?: string | null) {
  const schluessel = useMemo(() => [...new Set(ids.filter((x): x is string => !!x && /^[0-9a-f]{32}$/.test(x)))].sort().join(','), [ids]);
  const [namen, setNamen] = useState<{ fuer: string; werte: Record<string, string> }>({ fuer: '', werte: {} });
  useEffect(() => {
    if (!schluessel) return undefined;
    let weg = false;
    fetch('/api/echte-namen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: schluessel.split(','), event: event ?? undefined }) })
      .then((r) => r.json()).then((j) => { if (!weg) setNamen({ fuer: `${schluessel}|${event ?? ''}`, werte: j?.namen ?? {} }); }).catch(() => { /* Epic-Namen */ });
    return () => { weg = true; };
  }, [schluessel, event]);
  return namen.fuer === `${schluessel}|${event ?? ''}` ? namen.werte : {};
}

/* ---------------------------------------------------------------- Teams */

/** Stabiler Schluessel aus den Epic-Konten (sortiert) - nie die Platzierung. */
export function kontoSchluessel(ids?: Array<string | undefined>): string | null {
  const echte = (ids ?? []).filter((x): x is string => Boolean(x));
  return echte.length ? `k:${[...echte].sort().join('_')}` : null;
}

/* ---------------------------------------------------------------- Kartenbilder, Inseln, Rundennamen */

export const fortniteKarte = () => '/bilder/karte-leer.png';
export const eigeneKarte = (id: string) => `/bilder/karten/${encodeURIComponent(id)}.png`;

const REGEL = /^Playlist_ShowdownTournament_(?:RE_)?([A-Z][a-z]+[A-Z][a-z]+)(?:NoBuild)?(?:Solo|Duo|Trio|Squad|Octet)/;
export function inselAusPlaylist(playlist?: string | null): { art: 'reload' | 'br' | 'unbekannt'; schluessel: string | null } {
  if (!playlist) return { art: 'unbekannt', schluessel: null };
  const m = playlist.match(REGEL);
  if (m) return { art: 'reload', schluessel: m[1] };
  if (/^Playlist_Showdown/i.test(playlist) || /Athena|BattleRoyale|_Solo|_Duo|_Trio|_Squad/i.test(playlist)) return { art: 'br', schluessel: 'BR' };
  return { art: 'unbekannt', schluessel: null };
}
export function brBildFuer(inseln: Record<string, string>, kennung?: string | null): string {
  const m = /(?:^|_)S(\d{2,3})_/i.exec(kennung ?? '');
  return (m ? inseln[`BR:S${Number(m[1])}`] : undefined) ?? inseln.BR ?? '';
}
export function rundenName(windowId: string, istFinale: boolean): string {
  const w = windowId ?? ''; const teile: string[] = [];
  const hol = (r: RegExp) => w.match(r)?.[1];
  const woche = hol(/Week(\d+)/i); if (woche) teile.push(`Week ${woche}`);
  const quali = hol(/Qual(\d+)/i); if (quali) teile.push(`Quali ${quali}`);
  const ev = hol(/Event(\d+)/i); if (ev) teile.push(`Event ${ev}`);
  const heat = hol(/Heats?(\d+)/i); if (heat) teile.push(`Heat ${heat}`);
  if (/Fast_?Tracks?/i.test(w)) teile.push('Fast Track');
  const runde = hol(/Round(\d+)/i); if (runde) teile.push(`Round ${runde}`);
  const tag = hol(/Day(\d+)/i); if (tag) teile.push(`Day ${tag}`);
  if (istFinale || /Final/i.test(w)) teile.push('Final');
  return teile.join(' · ');
}
export function kartenTitel(cupTitel: string | undefined, f: { windowId: string; istFinale: boolean } | null | undefined): string {
  return [(cupTitel ?? '').split('·')[0].trim(), f ? rundenName(f.windowId, f.istFinale) : ''].filter(Boolean).join(' · ');
}
export function istGrossesTurnier(name: string): boolean {
  const n = (name ?? '').toLowerCase();
  if (/division\s*[2-9]/.test(n)) return false;
  return /performance/.test(n) || /division\s*1/.test(n) || /ewc|esports world cup/.test(n) || (/fncs/.test(n) && /(grand|major|global|final)/.test(n));
}

/* ---------------------------------------------------------------- Noble */

/** Noble-Formen werden fuer die Anzeige leicht vereinfacht (Wunsch von Noble Practice) - gespeichert bleiben die Originale. */
export function nobleSpotsAnzeige<S extends { punkte: Pt[] }>(spots: S[], istNoble: (s: S) => boolean): S[] {
  if (!spots.some(istNoble)) return spots;
  const neu = nobleAnzeige(spots, (i) => istNoble(spots[i]));
  return spots.map((s, i) => (neu[i] === s.punkte ? s : { ...s, punkte: neu[i] }));
}

/* ---------------------------------------------------------------- Bild speichern */

/** Eine Leinwand in die Zwischenablage kopieren, sonst als PNG herunterladen (wie app/lib/bildSpeichern). */
export async function speichereLeinwand(c: HTMLCanvasElement, datei: string): Promise<'kopiert' | 'gespeichert'> {
  const blob = await new Promise<Blob | null>((fertig) => c.toBlob(fertig, 'image/png'));
  if (!blob) throw new Error('The image could not be created.');
  try {
    if (navigator.clipboard && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'kopiert';
    }
  } catch { /* dann herunterladen */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = datei; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'gespeichert';
}

/** Das wiederholte Wasserzeichen und Logo unten rechts - wie das Bild der Seite. */
export async function zeichneMarke(g: CanvasRenderingContext2D, x: number, y: number, G: number) {
  g.save();
  g.beginPath(); g.rect(x, y, G, G); g.clip();
  g.globalAlpha = 0.075; g.fillStyle = '#fff';
  const wz = Math.round(G * 0.055);
  g.font = `800 ${wz}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.translate(x + G / 2, y + G / 2); g.rotate(-Math.PI / 9);
  const bw = g.measureText('thecomphub.com').width; const sx = bw * 1.5, sy = wz * 5.5;
  for (let yy = -G; yy < G; yy += sy) {
    const v = (Math.round(yy / sy) % 2) * (sx / 2);
    for (let xx = -G - sx; xx < G + sx; xx += sx) g.fillText('thecomphub.com', xx + v, yy);
  }
  g.restore();
  const logo = await new Promise<HTMLImageElement | null>((fertig) => { const b = new Image(); b.onload = () => fertig(b); b.onerror = () => fertig(null); b.src = '/logos/CompHub-Logo-frei.png'; });
  const rand = Math.round(G * 0.022);
  if (logo?.naturalWidth) {
    const b = Math.round(G * 0.155), h = Math.round(b * (logo.naturalHeight / logo.naturalWidth));
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 12; g.globalAlpha = 0.95;
    g.drawImage(logo, x + G - rand - b, y + G - rand - h, b, h); g.restore();
  }
  g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8; g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `600 ${Math.round(G * 0.019)}px Inter, system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.fillText('thecomphub.com', x + G - rand, y + G - Math.round(rand * 0.35)); g.restore();
}
