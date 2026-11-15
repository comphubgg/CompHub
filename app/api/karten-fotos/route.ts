import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { liesJson } from '@/lib/ablage';

/*
 * Die Fotos fuer das Bild unter einer Player Card oder einem Team Spotlight (lib/statKarteBild.ts, Betreiber 15.11.2026).
 *
 *   GET ?ids=<epicId>,<epicId>,…&namen=<name>,<name>,…   -> { spieler: [{ id, name, datei, gesicht }] }
 *
 * Je Spieler die Datei in public/spielerbilder und die Lage des Gesichts (public/spielerbilder/_gesichter.json). Ein echtes Foto ist nur eine Datei ueber
 * 4.000 Byte - darunter liegt die graue Silhouette (dieselbe Regel wie lib/ftPostsDaten.ts). Ohne echtes Foto kommt datei: null; das Bild zeichnet dann
 * den Platzhalter, statt den Spieler wegzulassen.
 *
 * Gesucht wird ueber die Konto-Id (spielerbilder.json). Kennt das Verzeichnis die Id gar nicht (oder fehlt sie), ueber den Namen als Dateiname
 * ("Peterbot" -> peterbot.jpg) - dieselbe Reihenfolge wie lib/ftPostsDaten.ts. Steht die Id im Verzeichnis, gilt nur deren Datei.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ORDNER = path.join(process.cwd(), 'public', 'spielerbilder');
const ID = /^[0-9a-f]{32}$/i;

/** Der Name als Dateiname (dieselbe Regel wie lib/ftPostsDaten.ts, kurz). */
const kurz = (n: string) => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(t1|roc|ag|flcn|havok|godl|vp|xp42|s8ul|fokus|nstar|rt|flc|glore|m8|cgn)\s+/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function echt(datei: string | undefined): Promise<boolean> {
  if (!datei || datei.includes('/') || datei.includes('\\')) return false;
  const st = await fs.stat(path.join(ORDNER, datei)).catch(() => null);
  return Boolean(st?.isFile() && st.size > 4000);
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const ids = (p.get('ids') ?? '').split(',').map((x) => x.trim()).slice(0, 12);
  const namen = (p.get('namen') ?? '').split(',').map((x) => x.trim());

  const [verzeichnis, gesichter] = await Promise.all([
    liesJson<Array<{ epicId?: string; datei?: string }>>('spielerbilder.json', []),
    fs.readFile(path.join(ORDNER, '_gesichter.json'), 'utf8')
      .then((t) => JSON.parse(t) as Record<string, number[]>).catch(() => ({} as Record<string, number[]>)),
  ]);
  const nachId = new Map(verzeichnis.filter((e) => e.epicId && e.datei).map((e) => [e.epicId!.toLowerCase(), e.datei!]));

  const spieler = await Promise.all(ids.map(async (roh, i) => {
    const id = ID.test(roh) ? roh.toLowerCase() : '';
    const name = namen[i] ?? '';
    let datei: string | null = null;
    if (id && nachId.has(id)) {
      const d = nachId.get(id);
      if (await echt(d)) datei = d!;
    } else if (name) {
      const k = kurz(name);
      for (const d of [k, k.split('-')[0]].filter(Boolean).flatMap((x) => [`${x}.jpg`, `${x}.png`])) {
        if (await echt(d)) { datei = d; break; }
      }
    }
    const g = datei ? gesichter[datei] : null;
    return { id: id || null, name, datei, gesicht: Array.isArray(g) && g.length >= 3 ? [g[0], g[1], g[2]] as [number, number, number] : null };
  }));

  return NextResponse.json({ spieler }, { headers: { 'Cache-Control': 'no-store' } });
}
