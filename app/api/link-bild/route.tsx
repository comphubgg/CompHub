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
 *   GET ?seite=start               die Seite als Ganzes (Standard fuer jeden Link): Logo links, rechts schraeg gestellte Ansichten - Leaderboard, Player Stats,
 *                                  Karte, Heats, Statistik (wie im Vorstellungsvideo, nur sauberer; Bilder in public/vorschau, video-werkstatt/aufnehmen9.py)
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

/** Die Seite als Ganzes - fuer jeden geteilten Link. */
async function startBild(): Promise<Response> {
  const [logo, bricolage, figtree, ...bilder] = await Promise.all([
    lokal('logos/CompHub-Logo-frei.png', 300), schrift('Bricolage Grotesque', 800), schrift('Figtree', 700),
    ...['statistik', 'karte', 'stats', 'leaderboard', 'heats'].map((n) => lokal(`vorschau/${n}.jpg`, 760)),
  ]);
  const fonts = [
    ...(bricolage ? [{ name: 'Bricolage', data: bricolage, weight: 800 as const }] : []),
    ...(figtree ? [{ name: 'Figtree', data: figtree, weight: 700 as const }] : []),
  ];
  // Schraeg gefaechert wie Karten auf einem Tisch: hinten Statistik und Karte, vorne Player Stats, Leaderboard, Heats.
  const lagen: Array<{ bild: string | null; x: number; y: number; w: number; dreh: number; titel: string }> = [
    { bild: bilder[0], x: 560, y: -10, w: 460, dreh: -7, titel: 'STATISTICS' },
    { bild: bilder[1], x: 820, y: 40, w: 420, dreh: 6, titel: 'DROP MAPS' },
    { bild: bilder[2], x: 600, y: 215, w: 470, dreh: -4, titel: 'PLAYER STATS' },
    { bild: bilder[3], x: 790, y: 330, w: 430, dreh: 5, titel: 'LIVE LEADERBOARDS' },
    { bild: bilder[4], x: 520, y: 400, w: 400, dreh: -3, titel: 'HEATS' },
  ];
  const bild = (
    <div style={{ display: 'flex', width: B, height: H, position: 'relative', background: 'linear-gradient(135deg,#03060c 0%,#07122a 60%,#04101f 100%)', color: '#fff', fontFamily: 'Figtree, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -200, top: -220, width: 760, height: 760, borderRadius: 380, display: 'flex', background: 'radial-gradient(circle, rgba(14,165,233,0.28), rgba(14,165,233,0) 70%)' }} />
      <div style={{ position: 'absolute', right: -160, bottom: -260, width: 760, height: 760, borderRadius: 380, display: 'flex', background: 'radial-gradient(circle, rgba(56,189,248,0.18), rgba(56,189,248,0) 70%)' }} />
      {lagen.map((l, i) => (
        <div key={i} style={{ position: 'absolute', left: l.x, top: l.y, width: l.w, height: Math.round(l.w * 0.625) + 34, display: 'flex', flexDirection: 'column', transform: `rotate(${l.dreh}deg)`, borderRadius: 16, overflow: 'hidden', border: '2px solid rgba(56,189,248,0.45)', background: '#0b1220', boxShadow: '0 24px 60px rgba(0,0,0,0.65)' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 34, paddingLeft: 14, gap: 8, background: '#0f1a2e', fontSize: 15, letterSpacing: 2, color: '#7dd3fc' }}>
            <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 4, background: i === 3 ? '#ef4444' : '#38bdf8' }} />{l.titel}
          </div>
          {l.bild && <img src={l.bild} width={l.w} height={Math.round(l.w * 0.625)} style={{ width: l.w, height: Math.round(l.w * 0.625), objectFit: 'cover', objectPosition: 'top' }} />}
        </div>
      ))}
      {/* Links das Logo auf eigener Flaeche, damit nichts darueberliegt */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 560, height: H, display: 'flex', background: 'linear-gradient(90deg, rgba(3,6,12,1) 0%, rgba(3,6,12,0.96) 75%, rgba(3,6,12,0) 100%)' }} />
      <div style={{ position: 'absolute', left: 64, top: 0, width: 470, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {logo && <img src={logo} width={150} height={106} style={{ width: 150, height: 106, objectFit: 'contain' }} />}
        <div style={{ display: 'flex', marginTop: 18, fontFamily: 'Bricolage, sans-serif', fontSize: 92, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}>
          <div style={{ display: 'flex' }}>COMP</div><div style={{ display: 'flex', color: '#38bdf8' }}>HUB</div>
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 26, color: '#cbd5e1', lineHeight: 1.35 }}>Fortnite competitive — live leaderboards, player stats, drop maps and heats.</div>
        <div style={{ display: 'flex', alignSelf: 'flex-start', alignItems: 'center', gap: 12, marginTop: 30, padding: '12px 24px', borderRadius: 40, border: '2px solid rgba(255,255,255,0.18)', background: 'rgba(15,23,42,0.85)', fontSize: 28, fontWeight: 700 }}>
          <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: '#38bdf8' }} />thecomphub.com
        </div>
      </div>
    </div>
  );
  return new ImageResponse(bild, { width: B, height: H, fonts, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } });
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get('seite') === 'start') return startBild();
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
