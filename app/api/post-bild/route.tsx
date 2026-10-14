import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { tagesplan } from '@/lib/tagesposts';
import { fokusVon } from '@/lib/fotoFokus';
import { kartenBild, type KartenPost } from '@/lib/postKarte';

/*
 * Das Bild zu einem Post des Tages (lib/tagesposts): 1600 x 900, im Stil der Seite - dunkler Grund, Blau, Anzeigeschrift.
 *
 *   GET ?datum=2026-10-14&nr=0   -> PNG
 *
 * Alles, was im Bild steht, kommt aus dem Plan des Tages (echte Zahlen und Namen); die Fotos werden hier geholt und verkleinert. Vier Anordnungen:
 * Cup (Sieger und Podest mit dem Cup-Bild), Spieler (Foto gross, drei Werte), Rangliste, und die "Werbe"-Karte mit grosser Zahl und Fotos.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const B = 1600; const H = 900;
const BLAU = '#38bdf8';

/** Ein Bild aus public (oder von der eigenen Seite) als PNG-Datenadresse - satori kennt kein WebP. */
async function bildDaten(quelle: unknown, ursprung: string, breite = 800): Promise<string | null> {
  if (typeof quelle !== 'string' || !quelle) return null;
  try {
    let puffer: Buffer | null = null;
    if (quelle.startsWith('/')) {
      const lokal = path.join(process.cwd(), 'public', decodeURIComponent(quelle.split('?')[0]));
      if (fs.existsSync(lokal)) puffer = fs.readFileSync(lokal);
    }
    if (!puffer) {
      const r = await fetch(quelle.startsWith('/') ? `${ursprung}${quelle}` : quelle, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return null;
      puffer = Buffer.from(await r.arrayBuffer());
    }
    const png = await sharp(puffer).resize({ width: breite, withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch { return null; }
}

const schriften = new Map<string, ArrayBuffer>();
async function schrift(familie: string, gewicht: number): Promise<ArrayBuffer | null> {
  const k = `${familie}|${gewicht}`;
  if (schriften.has(k)) return schriften.get(k) ?? null;
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${familie.replace(/ /g, '+')}:wght@${gewicht}`, { signal: AbortSignal.timeout(10_000) })).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const daten = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).arrayBuffer();
    schriften.set(k, daten);
    return daten;
  } catch { return null; }
}

const kopf = (logo: string | null) => (
  <div style={{ position: 'absolute', left: 64, bottom: 44, display: 'flex', alignItems: 'center', gap: 16 }}>
    {logo && <img src={logo} width={64} height={46} style={{ objectFit: 'contain' }} />}
    <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>
      <span style={{ color: BLAU }}>COMP</span><span>HUB</span>
    </div>
    <div style={{ display: 'flex', fontSize: 24, color: '#64748b', marginLeft: 12 }}>thecomphub.com</div>
  </div>
);

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const datum = (p.get('datum') ?? '').slice(0, 10);
  const nr = Number(p.get('nr') ?? 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return new Response('datum fehlt', { status: 400 });
  const plan = await tagesplan(datum, false);
  const post = plan?.posts[nr];
  if (!post) return new Response('kein Post', { status: 404 });
  const ursprung = new URL(request.url).origin;
  const d = post.bild as Record<string, unknown>;
  // Das Kartenbild mit den Laendern entsteht als SVG und wird mit sharp zu einem PNG (lib/postKarte), nicht ueber satori.
  if (d.art === 'karte') {
    const png = await kartenBild(d as unknown as KartenPost['bild'], ursprung);
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
  }
  const [logo, bricolage, figtree] = await Promise.all([
    bildDaten('/logos/CompHub-Logo-frei.png', ursprung, 200), schrift('Bricolage Grotesque', 800), schrift('Figtree', 700),
  ]);
  const fonts = [
    ...(bricolage ? [{ name: 'Bricolage', data: bricolage, weight: 800 as const }] : []),
    ...(figtree ? [{ name: 'Figtree', data: figtree, weight: 700 as const }] : []),
  ];
  const familie = 'Bricolage, Figtree, sans-serif';

  const rahmen = (kinder: React.ReactNode) => (
    <div style={{ display: 'flex', width: B, height: H, position: 'relative', background: 'linear-gradient(135deg,#04070d 0%,#0a1324 60%,#06101f 100%)', color: '#fff', fontFamily: 'Figtree, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -200, top: -260, width: 900, height: 900, borderRadius: 450, background: 'radial-gradient(circle, rgba(14,165,233,0.30), rgba(14,165,233,0) 70%)', display: 'flex' }} />
      {kinder}
      {kopf(logo)}
    </div>
  );

  let bild: React.ReactElement;
  if (d.art === 'cup') {
    const banner = await bildDaten(d.bild, ursprung, 1000);
    const zeilen = (d.zeilen as Array<{ rang: number; name: string; punkte: number; siege: number; elims: number }>) ?? [];
    const [e, z, dr] = zeilen;
    bild = rahmen(
      <>
        {banner && <img src={banner} width={760} height={H} style={{ position: 'absolute', left: 840, top: 0, width: 760, height: H, objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', left: 840, top: 0, width: 760, height: H, display: 'flex', background: 'linear-gradient(90deg,#0a1324 0%,rgba(10,19,36,0.55) 40%,rgba(10,19,36,0.15) 100%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '72px 64px', width: 980 }}>
          <div style={{ display: 'flex', fontSize: 28, color: BLAU, letterSpacing: 4, textTransform: 'uppercase' }}>{`${d.region ?? ''} · ${d.saison ?? ''}`}</div>
          <div style={{ display: 'flex', fontFamily: familie, fontSize: 64, fontWeight: 800, lineHeight: 1.05, marginTop: 14, maxHeight: 140, overflow: 'hidden' }}>{String(d.titel ?? '')}</div>
          <div style={{ display: 'flex', fontSize: 26, color: '#94a3b8', letterSpacing: 6, marginTop: 56 }}>WINNER</div>
          <div style={{ display: 'flex', fontFamily: familie, fontSize: 104, fontWeight: 800, lineHeight: 1.0, marginTop: 6, textTransform: 'uppercase', maxHeight: 220, overflow: 'hidden' }}>{e?.name}</div>
          <div style={{ display: 'flex', fontSize: 40, color: BLAU, marginTop: 14 }}>
            {`${e?.punkte?.toLocaleString('en-US')} pts${e?.siege ? ` · ${e.siege} ${e.siege === 1 ? 'win' : 'wins'}` : ''}${e?.elims ? ` · ${e.elims} elims` : ''}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 40, fontSize: 36, color: '#cbd5e1' }}>
            {z && <div style={{ display: 'flex' }}><span style={{ color: '#94a3b8', width: 90 }}>2nd</span><span style={{ textTransform: 'uppercase' }}>{z.name}</span><span style={{ marginLeft: 20, color: '#64748b' }}>{z.punkte}</span></div>}
            {dr && <div style={{ display: 'flex' }}><span style={{ color: '#94a3b8', width: 90 }}>3rd</span><span style={{ textTransform: 'uppercase' }}>{dr.name}</span><span style={{ marginLeft: 20, color: '#64748b' }}>{dr.punkte}</span></div>}
          </div>
        </div>
      </>,
    );
  } else if (d.art === 'spieler') {
    const foto = await bildDaten(d.bild, ursprung, 900);
    const werte = (d.werte as Array<[string, string]>) ?? [];
    bild = rahmen(
      <>
        {foto && <img src={foto} width={720} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 720, height: H, objectFit: 'cover', objectPosition: fokusVon(String(d.bild ?? '')) }} />}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 720, height: H, display: 'flex', background: 'linear-gradient(90deg,rgba(10,19,36,0) 55%,#0a1324 100%)' }} />
        <div style={{ position: 'absolute', left: 720, top: 0, width: 880, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 70px' }}>
          <div style={{ display: 'flex', fontSize: 28, color: BLAU, letterSpacing: 4, textTransform: 'uppercase' }}>{`Player · ${d.region ?? 'Global'}`}</div>
          <div style={{ display: 'flex', fontFamily: familie, fontSize: 124, fontWeight: 800, lineHeight: 1.0, marginTop: 12, textTransform: 'uppercase', maxHeight: 260, overflow: 'hidden' }}>{String(d.name ?? '')}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 52, width: 740 }}>
            {werte.map(([l, w]) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', width: 232, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: '24px 22px' }}>
                <div style={{ display: 'flex', fontSize: 22, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase' }}>{l}</div>
                <div style={{ display: 'flex', fontFamily: familie, fontSize: 56, fontWeight: 800, color: l === 'Damage ratio' ? '#34d399' : '#fff', marginTop: 8 }}>{w}</div>
              </div>
            ))}
          </div>
        </div>
      </>,
    );
  } else if (d.art === 'ranking') {
    const zeilen = (d.zeilen as Array<{ rang: number; name: string; wert: string; delta: number }>) ?? [];
    bild = rahmen(
      <div style={{ display: 'flex', flexDirection: 'column', padding: '64px 90px', width: '100%' }}>
        <div style={{ display: 'flex', fontSize: 28, color: BLAU, letterSpacing: 4, textTransform: 'uppercase' }}>Epic ranking · top 5</div>
        <div style={{ display: 'flex', fontFamily: familie, fontSize: 92, fontWeight: 800, marginTop: 8 }}>Power Rankings</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 36 }}>
          {zeilen.map((r) => (
            <div key={r.rang} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 22, padding: '14px 30px' }}>
              <div style={{ display: 'flex', width: 70, fontFamily: familie, fontSize: 54, fontWeight: 800, color: r.rang === 1 ? '#f5b301' : '#94a3b8' }}>{r.rang}</div>
              <div style={{ display: 'flex', flex: 1, fontSize: 50, fontWeight: 700, textTransform: 'uppercase' }}>{r.name}</div>
              <div style={{ display: 'flex', fontFamily: familie, fontSize: 52, fontWeight: 800, color: BLAU }}>{r.wert}</div>
              <div style={{ display: 'flex', width: 150, justifyContent: 'flex-end', fontSize: 34, color: r.delta > 0 ? '#34d399' : r.delta < 0 ? '#fb7185' : '#64748b' }}>
                {r.delta > 0 ? `▲ ${r.delta}` : r.delta < 0 ? `▼ ${-r.delta}` : '–'}
              </div>
            </div>
          ))}
        </div>
      </div>,
    );
  } else {
    // Die Werbekarte: grosse Zahl oder Wort links, vier Spielerkarten wie ein Faecher rechts.
    const quellen = ((d.fotos as unknown[]) ?? []).slice(0, 4);
    const fotos = await Promise.all(quellen.map((f) => bildDaten(f, ursprung, 520)));
    const karten = fotos.map((f, i) => ({ f, fokus: fokusVon(String(quellen[i] ?? '')) })).filter((x): x is { f: string; fokus: string } => !!x.f);
    bild = rahmen(
      <>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px', width: 860, height: H }}>
          <div style={{ display: 'flex', fontFamily: familie, fontSize: String(d.gross).length > 8 ? 130 : 200, fontWeight: 800, color: BLAU, lineHeight: 1.0 }}>{String(d.gross ?? '')}</div>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, marginTop: 20, maxWidth: 760, lineHeight: 1.15 }}>{String(d.unter ?? '')}</div>
        </div>
        <div style={{ position: 'absolute', left: 880, top: 140, width: 700, height: 560, display: 'flex' }}>
          {karten.map((k, i) => (
            <img key={i} src={k.f} width={220} height={420} style={{ width: 220, height: 420, objectFit: 'cover', objectPosition: k.fokus, borderRadius: 26, marginLeft: i ? -70 : 0, marginTop: i % 2 ? 60 : 0, border: '3px solid rgba(255,255,255,0.18)', transform: `rotate(${(i - (karten.length - 1) / 2) * 4}deg)` }} />
          ))}
        </div>
      </>,
    );
  }

  const antwort = new ImageResponse(bild, { width: B, height: H, fonts });
  antwort.headers.set('Cache-Control', 'public, max-age=3600');
  return antwort;
}
