import { NextResponse } from 'next/server';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

/*
 * Die Grafik zu einer Neuigkeit (#news): das Vorschaubild, das Epic selbst für den Cup führt, abgedunkelt, mit dem Namen groß darüber, einer Zeile (Start und Regionen) in der
 * Farbe des Cups und dem CompHub-Zeichen - 1200 x 675, im Stil der Ankündigungen von Fortnite Competitive. Nur Bilder von Epics Server (cdn2.unrealengine.com), der eigenen
 * Seite oder aus public/ - sonst ließe sich über diese Adresse jede beliebige Seite abrufen.
 *
 *   GET ?bild=<Adresse>&titel=…&zeile=…&farbe=<hex ohne #>   -> PNG
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const B = 1200;
const H = 675;
const ERLAUBT = /^https:\/\/(cdn2\.unrealengine\.com|cdn1\.epicgames\.com|www\.thecomphub\.com)\//;

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

/** Den Titel auf höchstens drei Zeilen umbrechen. */
function zeilen(titel: string, breite: number): string[] {
  const raus: string[] = [];
  let z = '';
  for (const w of titel.toUpperCase().split(/\s+/)) {
    if (z && (z + ' ' + w).length > breite) { raus.push(z); z = w; } else z = z ? `${z} ${w}` : w;
  }
  if (z) raus.push(z);
  return raus.slice(0, 3);
}

async function hintergrund(bild: string): Promise<Buffer | null> {
  try {
    if (bild.startsWith('/')) {
      const datei = path.join(process.cwd(), 'public', bild.replace(/^\/+/, ''));
      if (!datei.startsWith(path.join(process.cwd(), 'public'))) return null;
      return await fs.readFile(datei);
    }
    if (!ERLAUBT.test(bild)) return null;
    const r = await fetch(bild, { signal: AbortSignal.timeout(15_000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const titel = (p.get('titel') ?? '').slice(0, 90) || 'Competitive Fortnite';
  const zeile = (p.get('zeile') ?? '').slice(0, 100);
  const farbe = /^[0-9a-fA-F]{6}$/.test(p.get('farbe') ?? '') ? `#${p.get('farbe')}` : '#38bdf8';
  const rohes = await hintergrund(p.get('bild') ?? '');

  let grund: Buffer;
  try {
    grund = rohes
      ? await sharp(rohes).resize(B, H, { fit: 'cover', position: 'attention' }).modulate({ brightness: 0.78 }).png().toBuffer()
      : await sharp({ create: { width: B, height: H, channels: 3, background: '#0b1220' } }).png().toBuffer();
  } catch {
    grund = await sharp({ create: { width: B, height: H, channels: 3, background: '#0b1220' } }).png().toBuffer();
  }

  const z = zeilen(titel, 20);
  const groesse = z.length > 2 ? 74 : 90;
  const y0 = H - 118 - (z.length - 1) * (groesse + 6);
  const text = z.map((t, i) => `<text x="64" y="${y0 + i * (groesse + 6)}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="900" font-style="italic" font-size="${groesse}" fill="#ffffff" letter-spacing="-1">${xml(t)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${H}">
    <defs>
      <linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop offset="0.28" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.92"/></linearGradient>
      <linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="${B}" height="${H}" fill="url(#l)"/>
    <rect width="${B}" height="${H}" fill="url(#u)"/>
    <rect x="64" y="52" width="10" height="34" fill="${farbe}"/>
    <text x="88" y="80" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="800" font-size="26" letter-spacing="6" fill="#ffffff">COMPHUB  ·  COMPETITIVE</text>
    ${text}
    <rect x="64" y="${H - 86}" width="${Math.min(B - 128, Math.max(160, zeile.length * 15))}" height="4" fill="${farbe}"/>
    <text x="64" y="${H - 44}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" font-size="30" fill="${farbe}">${xml(zeile)}</text>
    <text x="${B - 64}" y="${H - 44}" text-anchor="end" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="800" font-size="28" fill="#ffffff" fill-opacity="0.85">thecomphub.com</text>
  </svg>`;
  const png = await sharp(grund).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
}
