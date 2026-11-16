import sharp from 'sharp';
import { GET as replayAbruf } from '@/app/api/replay/route';
import { teilName, teilKurz, stufenName } from '@/lib/zonenTeile';
import { zonenKarte, rahmenUmZonen, type Rahmen } from '@/lib/zonenKarte';

/*
 * Das Zonen-Bild eines Finales, auf dem Server gezeichnet (Aufgabe 128, Betreiber 19.10.2026: "Zonenbilder fuer Finals" als automatischer Post).
 *
 * Dasselbe Bild wie im Admin-Werkzeug (app/admin/replay/ZonenBild.tsx): je Game die Zone mit Radius 20.000 als schwarzer, halb durchsichtiger Kreis mit
 * "GAME N", darunter in Gelb die Zone mit 10.000, in die sie danach rotierte. Auf der Insel des Cups (Reload oder grosse Karte, geeicht - lib/zonenKarte),
 * die Teile mit ihrem echten Namen (Heat 1, Round 1 · Day 2 - lib/zonenTeile); im gemeinsamen Bild "HEAT 1: GAMES 1–8 · HEAT 2: GAMES 9–16". Die Zonen kommen aus den Server-Replays (tools/replay-voll), ueber
 * dieselbe Schnittstelle wie dort (/api/replay?tag=, ?zonen=). Gezeichnet als SVG ueber der leeren Karte (sharp), damit kein Browser noetig ist.
 */

interface Zone { naechsterRadius?: number; x?: number; y?: number }
interface TagKurz { windowId: string; titel: string; matches: Array<{ id: string; nr: number; beginn?: string }> }

const SEITE = 'https://www.thecomphub.com';
const GROSS = 20_000;
const KLEIN = 10_000;
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
  const strich = n * 0.0028;
  // Erst alle gelben, dann die schwarzen darueber - wie in der Vorlage.
  for (const s of games) if (da(s.klein)) teile.push(`<circle cx="${px(s.klein.x)}" cy="${py(s.klein.y)}" r="${pr(KLEIN)}" fill="rgba(250,204,21,0.34)" stroke="rgba(250,204,21,0.95)" stroke-width="${strich}"/>`);
  for (const s of games) if (da(s.gross)) teile.push(`<circle cx="${px(s.gross.x)}" cy="${py(s.gross.y)}" r="${pr(GROSS)}" fill="rgba(0,0,0,0.36)" stroke="rgba(0,0,0,0.92)" stroke-width="${strich}"/>`);
  const schrift = 'font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="700"';
  // Liegen zwei Zonen fast uebereinander, ruecken die Beschriftungen auseinander ("GAMGAME 10" am FNCS-Solos-Finale EU).
  const gesetzt: Array<{ x: number; y: number }> = [];
  const hoehe = n * 0.03; const breite = n * 0.13;
  for (const s of games) {
    if (!da(s.gross)) continue;
    const x = px(s.gross.x); let y = py(s.gross.y);
    for (let i = 0; i < 6 && gesetzt.some((g) => Math.abs(g.x - x) < breite && Math.abs(g.y - y) < hoehe); i += 1) y += hoehe;
    gesetzt.push({ x, y });
    teile.push(`<text x="${x}" y="${y}" ${schrift} font-size="${Math.round(n * 0.024)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="rgba(0,0,0,0.85)" stroke-width="${n * 0.005}" paint-order="stroke">GAME ${s.nr}</text>`);
  }
  const mehrere = tage.length > 1;
  const zeile = (text: string, x: number, y: number, groesse: number, farbe: string, extra = '') => teile.push(`<text x="${x}" y="${y}" ${schrift} font-size="${Math.round(n * groesse)}" fill="${farbe}" stroke="rgba(0,0,0,0.7)" stroke-width="${n * groesse * 0.22}" paint-order="stroke" ${extra}>${xml(text)}</text>`);
  zeile('ZONES', rand, n - rand - n * (mehrere ? 0.058 : 0.03), 0.05, '#fff');
  zeile(titel, rand, n - rand - (mehrere ? n * 0.028 : 0), 0.018, '#38bdf8');
  if (mehrere) zeile(legende.join(' · '), rand, n - rand, 0.015, '#fff');
  zeile('THECOMPHUB.COM', n - rand, n - rand, 0.016, 'rgba(255,255,255,0.85)', 'text-anchor="end"');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">${teile.join('')}</svg>`;
  // Erst zeichnen, dann verkleinern - sharp verkleinert sonst vor dem Ueberlagern, und die Zeichnung waere groesser als die Karte.
  const voll = await sharp(grund).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  const png = await sharp(voll).resize(o.breite ?? 1600, o.breite ?? 1600).png().toBuffer();
  return { png, titel, games: games.length, mitZone: games.filter((s) => da(s.gross)).length, tage: tage.map((t) => ({ windowId: t.windowId, games: t.matches.length })) };
}
