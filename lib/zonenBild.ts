import sharp from 'sharp';
import { GET as replayAbruf } from '@/app/api/replay/route';
import { fortniteKarte } from '@/lib/bildAdressen';

/*
 * Das Zonen-Bild eines Finales, auf dem Server gezeichnet (Aufgabe 128, Betreiber 19.10.2026: "Zonenbilder fuer Finals" als automatischer Post).
 *
 * Dasselbe Bild wie im Admin-Werkzeug (app/admin/replay/ZonenBild.tsx): je Game die Zone mit Radius 20.000 als Kreis mit "GAME N" - Tag 1 schwarz, Tag 2 rot,
 * ein dritter violett -, darunter in Gelb die Zone mit 10.000, in die sie danach rotierte. Die Zonen kommen aus den Server-Replays (tools/replay-voll), ueber
 * dieselbe Schnittstelle wie dort (/api/replay?tag=, ?zonen=). Gezeichnet als SVG ueber der leeren Karte (sharp), damit kein Browser noetig ist.
 */

interface Zone { naechsterRadius?: number; x?: number; y?: number }
interface TagKurz { windowId: string; titel: string; matches: Array<{ id: string; nr: number; beginn?: string }> }

const SEITE = 'https://www.thecomphub.com';
const SPANNE = 135_000;
const GROSS = 20_000;
const KLEIN = 10_000;
const TAGFARBEN = ['rgba(8,8,12,0.74)', 'rgba(220,20,60,0.68)', 'rgba(124,58,237,0.66)'];
const TAGFARBEN_VOLL = ['#08080c', '#dc143c', '#7c3aed'];
const GELB = 'rgba(250,204,21,0.62)';
const tagNummer = (windowId: string, i: number) => Number(/Day\s*(\d+)/i.exec(windowId)?.[1] ?? i + 1);
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ZonenBild { png: Buffer; titel: string; games: number; mitZone: number; tage: Array<{ windowId: string; games: number }> }

/** Die Tage eines Finales (alle Tage derselben Region) mit ihren Games - wie die Replay-Seite sie kennt. */
export async function zonenTage(windowId: string): Promise<TagKurz[]> {
  const r = await replayAbruf(new Request(`${SEITE}/api/replay?tag=${encodeURIComponent(windowId)}`));
  if (!r.ok) return [];
  const j = await r.json() as { zonenTage?: TagKurz[] };
  return j.zonenTage ?? [];
}

/** Das Bild zu einem Spieltag; mit "alleTage" alle Tage des Finales zusammen (Nummern fortlaufend, Farbe je Tag). */
export async function zonenBild(windowId: string, o: { alleTage?: boolean; ursprung?: string; breite?: number } = {}): Promise<ZonenBild | null> {
  const alle = await zonenTage(windowId);
  const tage = o.alleTage ? alle : alle.filter((t) => t.windowId === windowId);
  if (!tage.length) return null;
  const zonen: Record<string, Zone[]> = {};
  for (const t of tage) {
    const r = await replayAbruf(new Request(`${SEITE}/api/replay?zonen=${encodeURIComponent(t.windowId)}`));
    if (r.ok) Object.assign(zonen, ((await r.json()) as { zonen?: Record<string, Zone[]> }).zonen ?? {});
  }

  const karteRoh = await fetch(`${o.ursprung ?? SEITE}${fortniteKarte(false)}`, { signal: AbortSignal.timeout(30_000) });
  if (!karteRoh.ok) return null;
  const n = 2048;
  const karte = await sharp(Buffer.from(await karteRoh.arrayBuffer())).resize(n, n).png().toBuffer();
  const px = (v: number) => ((v + SPANNE) / (2 * SPANNE)) * n;
  const pr = (r: number) => (r / (2 * SPANNE)) * n;

  let versatz = 0;
  const games: Array<{ gross?: Zone; klein?: Zone; nr: number; farbe: string }> = [];
  tage.forEach((t) => {
    const farbe = TAGFARBEN[alle.indexOf(t) % TAGFARBEN.length];
    for (const m of t.matches) {
      const z = zonen[m.id] ?? [];
      games.push({ gross: z.find((x) => Math.round(x.naechsterRadius ?? 0) === GROSS), klein: z.find((x) => Math.round(x.naechsterRadius ?? 0) === KLEIN), nr: versatz + m.nr, farbe });
    }
    versatz += t.matches.length;
  });
  const da = (z?: Zone): z is Zone & { x: number; y: number } => typeof z?.x === 'number' && typeof z?.y === 'number';
  const jahr = (() => { const b = tage[0]?.matches[0]?.beginn; return b ? new Date(b).getUTCFullYear() : null; })();
  const titel = [tage[0].titel.replace(/^Fortnite\s+/i, '').toUpperCase(), jahr].filter(Boolean).join(' ')
    + (tage.length === 1 && alle.length > 1 ? ` · DAY ${tagNummer(windowId, alle.findIndex((t) => t.windowId === windowId))}` : '');
  const rand = n * 0.03;
  const teile: string[] = [];
  // Erst alle gelben, dann die dunklen darueber - wie in der Vorlage.
  for (const s of games) if (da(s.klein)) teile.push(`<circle cx="${px(s.klein.x)}" cy="${px(s.klein.y)}" r="${pr(KLEIN)}" fill="${GELB}"/>`);
  for (const s of games) if (da(s.gross)) teile.push(`<circle cx="${px(s.gross.x)}" cy="${px(s.gross.y)}" r="${pr(GROSS)}" fill="${s.farbe}"/>`);
  const schrift = 'font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="700"';
  // Liegen zwei Zonen fast uebereinander, ruecken die Beschriftungen auseinander ("GAMGAME 10" am FNCS-Solos-Finale EU).
  const gesetzt: Array<{ x: number; y: number }> = [];
  const hoehe = n * 0.03; const breite = n * 0.13;
  for (const s of games) {
    if (!da(s.gross)) continue;
    const x = px(s.gross.x); let y = px(s.gross.y);
    for (let i = 0; i < 6 && gesetzt.some((g) => Math.abs(g.x - x) < breite && Math.abs(g.y - y) < hoehe); i += 1) y += hoehe;
    gesetzt.push({ x, y });
    teile.push(`<text x="${x}" y="${y}" ${schrift} font-size="${Math.round(n * 0.024)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="rgba(0,0,0,0.55)" stroke-width="${n * 0.004}" paint-order="stroke">GAME ${s.nr}</text>`);
  }
  teile.push(`<text x="${rand}" y="${n - rand - n * 0.03}" font-family="Segoe UI, Inter, Arial, sans-serif" font-weight="800" font-size="${Math.round(n * 0.05)}" fill="#fff">ZONES</text>`);
  teile.push(`<text x="${rand}" y="${n - rand}" ${schrift} font-size="${Math.round(n * 0.018)}" fill="#38bdf8">${xml(titel)}</text>`);
  teile.push(`<text x="${n - rand}" y="${n - rand}" ${schrift} font-size="${Math.round(n * 0.016)}" text-anchor="end" fill="rgba(255,255,255,0.75)">THECOMPHUB.COM</text>`);
  if (tage.length > 1) {
    tage.forEach((t, i) => {
      const y = n - rand - n * 0.105 + i * n * 0.024;
      teile.push(`<circle cx="${rand + n * 0.007}" cy="${y - n * 0.005}" r="${n * 0.007}" fill="${TAGFARBEN_VOLL[alle.indexOf(t) % TAGFARBEN_VOLL.length]}" stroke="#fff" stroke-width="${n * 0.0015}"/>`);
      teile.push(`<text x="${rand + n * 0.022}" y="${y}" ${schrift} font-size="${Math.round(n * 0.016)}" fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width="${n * 0.003}" paint-order="stroke">DAY ${tagNummer(t.windowId, alle.indexOf(t))}</text>`);
    });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">${teile.join('')}</svg>`;
  // Erst zeichnen, dann verkleinern - sharp verkleinert sonst vor dem Ueberlagern, und die Zeichnung waere groesser als die Karte.
  const voll = await sharp(karte).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  const png = await sharp(voll).resize(o.breite ?? 1600, o.breite ?? 1600).png().toBuffer();
  return { png, titel, games: games.length, mitZone: games.filter((s) => da(s.gross)).length, tage: tage.map((t) => ({ windowId: t.windowId, games: t.matches.length })) };
}
