import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { heatsDaten } from '@/lib/heatsPosts';
import { gecacht } from '@/lib/epicCups';

/*
 * Das Vorschaubild eines Links (Betreiber, 8.11.2026: "ein Thumbnail wie das von EU Competitive, wo ich unter dem Post den Link setze - wenn man aufs Bild
 * drueckt, instant dort"). X, Discord und WhatsApp zeigen es unter dem geteilten Link: links das CompHub-Logo, dahinter das Bild der Reihe, rechts die Heats.
 *
 *   GET ?seite=solos&region=EU     FNCS Solos (Reload): Bild der Reihe und - sobald eingeteilt - die Ersten beider Heats
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const B = 1200; const H = 630;

const schriften = new Map<string, ArrayBuffer>();
async function schrift(familie: string, gewicht: number): Promise<ArrayBuffer | null> {
  const k = `${familie}|${gewicht}`;
  if (schriften.has(k)) return schriften.get(k) ?? null;
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${familie.replace(/ /g, '+')}:wght@${gewicht}`, { signal: AbortSignal.timeout(8_000) })).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const daten = await (await fetch(url, { signal: AbortSignal.timeout(8_000) })).arrayBuffer();
    schriften.set(k, daten);
    return daten;
  } catch { return null; }
}

/** Ein Bild aus public/ als PNG-Datenadresse (die Zeichnung kann kein WebP). */
async function lokal(datei: string, breite: number): Promise<string | null> {
  try {
    const roh = fs.readFileSync(path.join(process.cwd(), 'public', datei));
    return `data:image/png;base64,${(await sharp(roh).resize({ width: breite, withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
  } catch { return null; }
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const region = (p.get('region') ?? 'EU').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'EU';
  const [grund, logo, bricolage, figtree, plan] = await Promise.all([
    lokal('cups/fncs-solo-reload.webp', 1200), lokal('logos/CompHub-Logo-frei.png', 260),
    schrift('Bricolage Grotesque', 800), schrift('Figtree', 700),
    gecacht(`linkbild|heats|${region}`, 10 * 60_000, () => heatsDaten(region, undefined, true)).catch(() => []),
  ]);
  const heats = (plan.find((d) => d.gefunden > 0)?.heats ?? []).slice(0, 2);
  const fonts = [
    ...(bricolage ? [{ name: 'Bricolage', data: bricolage, weight: 800 as const }] : []),
    ...(figtree ? [{ name: 'Figtree', data: figtree, weight: 700 as const }] : []),
  ];
  const bild = (
    <div style={{ display: 'flex', width: B, height: H, position: 'relative', background: '#05080f', color: '#fff', fontFamily: 'Figtree, sans-serif', overflow: 'hidden' }}>
      {grund && <img src={grund} width={B} height={H} style={{ position: 'absolute', left: 0, top: 0, width: B, height: H, objectFit: 'cover', opacity: 0.35 }} />}
      <div style={{ position: 'absolute', left: 0, top: 0, width: B, height: H, display: 'flex', background: 'linear-gradient(90deg, rgba(5,8,15,0.97) 0%, rgba(5,8,15,0.85) 45%, rgba(5,8,15,0.35) 100%)' }} />
      {/* links: Logo und Titel */}
      <div style={{ position: 'absolute', left: 64, top: 0, height: H, width: 520, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {logo && <img src={logo} width={110} height={78} style={{ width: 110, height: 78, objectFit: 'contain' }} />}
          <div style={{ display: 'flex', fontFamily: 'Bricolage, sans-serif', fontSize: 62, fontWeight: 800, letterSpacing: 1 }}>
            <div style={{ display: 'flex', color: '#38bdf8' }}>COMP</div><div style={{ display: 'flex' }}>HUB</div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 34, fontFamily: 'Bricolage, sans-serif', fontSize: 58, fontWeight: 800, lineHeight: 1.0 }}>FNCS SOLOS</div>
        <div style={{ display: 'flex', fontFamily: 'Bricolage, sans-serif', fontSize: 58, fontWeight: 800, lineHeight: 1.0, color: '#38bdf8' }}>RELOAD</div>
        <div style={{ display: 'flex', marginTop: 22, fontSize: 24, color: '#94a3b8', letterSpacing: 3 }}>{`HEATS · MAP · STATS · ${region}`}</div>
      </div>
      {/* rechts: die Heats als Tafel */}
      <div style={{ position: 'absolute', right: 56, top: 60, width: 520, height: 510, display: 'flex', flexDirection: 'column', background: 'rgba(15,23,42,0.94)', border: '2px solid rgba(56,189,248,0.35)', borderRadius: 22, padding: '22px 26px' }}>
        <div style={{ display: 'flex', fontFamily: 'Bricolage, sans-serif', fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>HEATS</div>
        <div style={{ display: 'flex', fontSize: 17, color: '#64748b', marginTop: 4 }}>{heats.length ? 'Who plays when — the full draw on thecomphub.com' : 'The road to the Grand Finals'}</div>
        <div style={{ display: 'flex', gap: 18, marginTop: 18 }}>
          {(heats.length ? heats : [{ nr: 1, spieler: [] }, { nr: 2, spieler: [] }] as Array<{ nr: number; spieler: Array<{ id: string; name: string; punkte: number }> }>).map((h) => (
            <div key={h.nr} style={{ display: 'flex', flexDirection: 'column', width: 225 }}>
              <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: '#38bdf8', letterSpacing: 2, marginBottom: 8 }}>{`HEAT ${h.nr}`}</div>
              {h.spieler.slice(0, 9).map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', height: 37, borderTop: '1px solid rgba(148,163,184,0.15)', fontSize: 19 }}>
                  <div style={{ display: 'flex', width: 26, color: '#64748b' }}>{String(i + 1)}</div>
                  <div style={{ display: 'flex', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>{s.name.toUpperCase().slice(0, 13)}</div>
                  <div style={{ display: 'flex', color: '#cbd5e1' }}>{String(s.punkte)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 64, bottom: 30, display: 'flex', fontSize: 22, fontWeight: 700, color: '#64748b', letterSpacing: 2 }}>thecomphub.com</div>
    </div>
  );
  return new ImageResponse(bild, { width: B, height: H, fonts, headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } });
}
