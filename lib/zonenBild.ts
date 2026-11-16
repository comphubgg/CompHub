import sharp from 'sharp';
import { GET as replayAbruf } from '@/app/api/replay/route';
import { teilName, teilKurz, stufenName } from '@/lib/zonenTeile';
import { zonenKarte, rahmenUmZonen, type Rahmen } from '@/lib/zonenKarte';

/*
 * Das Zonen-Bild eines Finales, auf dem Server gezeichnet (Aufgabe 128, Betreiber 19.10.2026: "Zonenbilder fuer Finals" als automatischer Post).
 *
 * Dasselbe Bild wie im Admin-Werkzeug (app/admin/replay/ZonenBild.tsx): je Game die Zone mit Radius 20.000 als schwarzer, Kreis (rgba 8,8,12,0.74) mit
 * "GAME N", darunter in Gelb die Zone mit 10.000, in die sie danach rotierte. Auf der Insel des Cups (Reload oder grosse Karte, geeicht - lib/zonenKarte),
 * die Teile mit ihrem echten Namen (Heat 1, Round 1 · Day 2 - lib/zonenTeile); im gemeinsamen Bild "HEAT 1: GAMES 1–8 · HEAT 2: GAMES 9–16". Die Zonen kommen aus den Server-Replays (tools/replay-voll), ueber
 * dieselbe Schnittstelle wie dort (/api/replay?tag=, ?zonen=). Gezeichnet als SVG ueber der leeren Karte (sharp), damit kein Browser noetig ist.
 */

interface Zone { naechsterRadius?: number; x?: number; y?: number }
interface TagKurz { windowId: string; titel: string; matches: Array<{ id: string; nr: number; beginn?: string }> }

const SEITE = 'https://www.thecomphub.com';
/*
 * Die Zonen, die gezeichnet werden: auf der grossen Karte 20.000 (dunkel) und 10.000 (gelb). Auf einer Reload-Insel eine Phase spaeter, 10.000 und 5.000
 * (Betreiber, 16.11.2026: "du verdeckst mit diesen Kreisen die halbe Map" - die Reload-Inseln sind nur gut zwei Drittel so gross).
 */
const RADIEN = { br: [20_000, 10_000], reload: [10_000, 5_000] } as const;
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ZonenBild { png: Buffer; titel: string; games: number; mitZone: number; tage: Array<{ windowId: string; games: number }> }

/** Die Tage eines Finales (alle Tage derselben Region) mit ihren Games - wie die Replay-Seite sie kennt. */
export async function zonenTage(windowId: string): Promise<TagKurz[]> {
  const r = await replayAbruf(new Request(`${SEITE}/api/replay?tag=${encodeURIComponent(windowId)}`));
  if (!r.ok) return [];
  const j = await r.json() as { zonenTage?: TagKurz[] };
  return j.zonenTage ?? [];
}

/** Das Bild zu einem Spieltag; mit "alleTage" alle Teile seiner Stufe zusammen (Heat 1 + Heat 2, Day 1 + Day 2 - Nummern fortlaufend). */
export async function zonenBild(windowId: string, o: { alleTage?: boolean; ursprung?: string; breite?: number } = {}): Promise<ZonenBild | null> {
  const alle = await zonenTage(windowId);
  const tage = o.alleTage ? alle : alle.filter((t) => t.windowId === windowId);
  if (!tage.length) return null;
  const zonen: Record<string, Zone[]> = {};
  let playlist: string | null = null;
  for (const t of tage) {
    const r = await replayAbruf(new Request(`${SEITE}/api/replay?zonen=${encodeURIComponent(t.windowId)}`));
    if (!r.ok) continue;
    const j = (await r.json()) as { zonen?: Record<string, Zone[]>; playlist?: string | null };
    Object.assign(zonen, j.zonen ?? {});
    playlist = playlist ?? j.playlist ?? null;
  }

  const [GROSS, KLEIN] = RADIEN[zonenKarte(playlist, tage[0].windowId).art];
  let versatz = 0;
  const games: Array<{ gross?: Zone; klein?: Zone; nr: number }> = [];
  const legende: string[] = [];
  tage.forEach((t) => {
    for (const m of t.matches) {
      const z = zonen[m.id] ?? [];
      games.push({ gross: z.find((x) => Math.round(x.naechsterRadius ?? 0) === GROSS), klein: z.find((x) => Math.round(x.naechsterRadius ?? 0) === KLEIN), nr: versatz + m.nr });
    }
    if (t.matches.length) legende.push(`${teilKurz(t.windowId).toUpperCase()}: GAMES ${versatz + 1}–${versatz + t.matches.length}`);
    versatz += t.matches.length;
  });
  const da = (z?: Zone): z is Zone & { x: number; y: number } => typeof z?.x === 'number' && typeof z?.y === 'number';

  // Die Insel: Reload-Insel oder grosse Karte der Saison, mit ihrem geeichten Weltausschnitt. Gezeigt wird der feste Ausschnitt der Insel, sonst das ganze Bild.
  const n = 2048;
  const karte = zonenKarte(playlist, tage[0].windowId);
  let sicht: Rahmen = karte.ausschnitt ?? karte.rahmen;
  let grund: Buffer;
  const roh = karte.bild ? await fetch(`${o.ursprung ?? SEITE}${karte.bild}`, { signal: AbortSignal.timeout(30_000) }).catch(() => null) : null;
  if (roh?.ok) {
    const bild = sharp(Buffer.from(await roh.arrayBuffer()));
    const m = await bild.metadata();
    const w = m.width ?? n; const h = m.height ?? n; const r = karte.rahmen;
    const links = Math.max(0, Math.round(((sicht.x0 - r.x0) / r.spanne) * w)); const oben = Math.max(0, Math.round(((sicht.y0 - r.y0) / r.spanne) * h));
    const seite = Math.min(w - links, h - oben, Math.round((sicht.spanne / r.spanne) * w));
    grund = await bild.extract({ left: links, top: oben, width: seite, height: seite }).resize(n, n).png().toBuffer();
  } else {
    // Ohne geeichtes Bild (oder wenn es nicht kommt): Wasser, die Zonen richtig zueinander.
    sicht = rahmenUmZonen(games.flatMap((x) => [x.gross, x.klein]).filter(da).map((z) => ({ x: z.x, y: z.y, r: GROSS })));
    grund = await sharp({ create: { width: n, height: n, channels: 4, background: '#0b3a66' } }).png().toBuffer();
  }
  const px = (v: number) => ((v - sicht.x0) / sicht.spanne) * n;
  const py = (v: number) => ((v - sicht.y0) / sicht.spanne) * n;
  const pr = (r: number) => (r / sicht.spanne) * n;

  const jahr = (() => { const b = tage[0]?.matches[0]?.beginn; return b ? new Date(b).getUTCFullYear() : null; })();
  const zusatz = tage.length > 1 ? stufenName(tage[0].windowId) : teilName(tage[0].windowId);
  const titel = [tage[0].titel.replace(/^Fortnite\s+/i, '').toUpperCase(), jahr].filter(Boolean).join(' ') + (zusatz ? ` · ${zusatz.toUpperCase()}` : '');
  const rand = n * 0.03;
  const teile: string[] = [];
  // Erst alle gelben, dann die dunklen darueber - wie in der Vorlage; Fuellung wie bisher (Schwarz des ersten Tages), ohne Rand.
  for (const s of games) if (da(s.klein)) teile.push(`<circle cx="${px(s.klein.x)}" cy="${py(s.klein.y)}" r="${pr(KLEIN)}" fill="rgba(250,204,21,0.62)"/>`);
  for (const s of games) if (da(s.gross)) teile.push(`<circle cx="${px(s.gross.x)}" cy="${py(s.gross.y)}" r="${pr(GROSS)}" fill="rgba(8,8,12,0.74)"/>`);
  const schrift = 'font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="700"';
  // Liegen zwei Zonen fast uebereinander, ruecken die Beschriftungen auseinander ("GAMGAME 10" am FNCS-Solos-Finale EU).
  const gesetzt: Array<{ x: number; y: number }> = [];
  const hoehe = n * 0.03; const breite = n * 0.13;
  for (const s of games) {
    if (!da(s.gross)) continue;
    const x = px(s.gross.x); let y = py(s.gross.y);
    for (let i = 0; i < 6 && gesetzt.some((g) => Math.abs(g.x - x) < breite && Math.abs(g.y - y) < hoehe); i += 1) y += hoehe;
    gesetzt.push({ x, y });
    teile.push(`<text x="${x}" y="${y}" ${schrift} font-size="${Math.round(n * 0.024)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="rgba(0,0,0,0.55)" stroke-width="${n * 0.004}" paint-order="stroke">GAME ${s.nr}</text>`);
  }
  // Fusszeile wie bisher; bei mehreren Teilen an der Stelle der frueheren Tageslegende, welche Games zu welchem Teil gehoeren (ohne Farbpunkt).
  teile.push(`<text x="${rand}" y="${n - rand - n * 0.03}" font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="800" font-size="${Math.round(n * 0.05)}" fill="#fff">ZONES</text>`);
  teile.push(`<text x="${rand}" y="${n - rand}" ${schrift} font-size="${Math.round(n * 0.018)}" fill="#38bdf8">${xml(titel)}</text>`);
  teile.push(`<text x="${n - rand}" y="${n - rand}" ${schrift} font-size="${Math.round(n * 0.016)}" text-anchor="end" fill="rgba(255,255,255,0.75)">THECOMPHUB.COM</text>`);
  if (tage.length > 1) {
    legende.forEach((zeile, i) => teile.push(`<text x="${rand}" y="${n - rand - n * 0.105 + i * n * 0.024}" ${schrift} font-size="${Math.round(n * 0.016)}" fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="${n * 0.003}" paint-order="stroke">${xml(zeile)}</text>`));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">${teile.join('')}</svg>`;
  // Erst zeichnen, dann verkleinern - sharp verkleinert sonst vor dem Ueberlagern, und die Zeichnung waere groesser als die Karte.
  const voll = await sharp(grund).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  const png = await sharp(voll).resize(o.breite ?? 1600, o.breite ?? 1600).png().toBuffer();
  return { png, titel, games: games.length, mitZone: games.filter((s) => da(s.gross)).length, tage: tage.map((t) => ({ windowId: t.windowId, games: t.matches.length })) };
}
