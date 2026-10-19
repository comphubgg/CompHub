import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { tagesplan } from '@/lib/tagesposts';
import { fokusVon } from '@/lib/fotoFokus';
import { FARBE, type KartenPost } from '@/lib/postKarte';

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
  const [logo, bricolage, figtree] = await Promise.all([
    bildDaten('/logos/CompHub-Logo-frei.png', ursprung, 200), schrift('Bricolage Grotesque', 800), schrift('Figtree', 700),
  ]);
  const fonts = [
    ...(bricolage ? [{ name: 'Bricolage', data: bricolage, weight: 800 as const }] : []),
    ...(figtree ? [{ name: 'Figtree', data: figtree, weight: 700 as const }] : []),
  ];
  const familie = 'Bricolage, Figtree, sans-serif';

  /*
   * Das Kartenbild mit den Laendern (Betreiber, 19.10.2026: "den blauen Hintergrund, nicht so schwarz - und die Schriftarten sehen komisch aus, es soll aussehen
   * wie in meinem Tool, als waere es ein Screenshot"). Frueher als SVG mit Arial gezeichnet, jetzt wie die Karte der Seite: Formen als dunkelblaue, durchscheinende
   * Flaechen, Namen in Figtree, blaue Baender oben und unten. Die Ecken tragen die Farbe ihres Landes.
   */
  if (d.art === 'karte') {
    const k = d as unknown as KartenPost['bild'];
    const G = 1200;
    const karte = await bildDaten(k.karte, ursprung, G);
    const flaechen = k.zonen.map((z, zi) => {
      const pts = z.punkte.map((q) => `${((q.x / 100) * G).toFixed(1)},${((q.y / 100) * G).toFixed(1)}`).join(' ');
      return <polygon key={zi} points={pts} fill={z.land ? (FARBE[z.land] ?? '#6b7280') : '#0a2342'} fillOpacity={z.land ? 0.62 : 0.6} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={2} />;
    });
    const namen = k.zonen.map((z, zi) => {
      const xs = z.punkte.map((q) => (q.x / 100) * G); const ys = z.punkte.map((q) => (q.y / 100) * G);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const breite = x1 - x0; const hoehe = y1 - y0;
      const langst = Math.max(...z.namen.map((n) => n.length), 4);
      const schriftGr = Math.max(11, Math.min(28, hoehe / (z.namen.length + 0.7), (breite * 0.9) / (langst * 0.62)));
      return (
        <div key={zi} style={{ position: 'absolute', left: x0, top: y0, width: breite, height: hoehe, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {z.namen.map((n, i) => (
            <div key={i} style={{ display: 'flex', fontSize: schriftGr, fontWeight: 700, lineHeight: 1.1, color: '#ffffff', textTransform: 'uppercase', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(2,10,24,0.95)' }}>{n}</div>
          ))}
          {z.land && breite > 70 && (
            <div style={{ position: 'absolute', left: 5, top: 5, display: 'flex', fontSize: 14, fontWeight: 700, color: '#ffffff', background: 'rgba(7,20,43,0.9)', borderRadius: 7, padding: '2px 8px' }}>{z.land}</div>
          )}
        </div>
      );
    });
    const titel = k.titel.length > 52 ? `${k.titel.slice(0, 51)}…` : k.titel;
    const kartenBildEl = (
      <div style={{ display: 'flex', position: 'relative', width: G, height: G, background: '#0a2a5a', color: '#fff', fontFamily: 'Figtree, sans-serif', overflow: 'hidden' }}>
        {karte && <img src={karte} width={G} height={G} style={{ position: 'absolute', left: 0, top: 0, width: G, height: G, objectFit: 'cover' }} />}
        <svg width={G} height={G} viewBox={`0 0 ${G} ${G}`} style={{ position: 'absolute', left: 0, top: 0 }}>{flaechen}</svg>
        {namen}
        <div style={{ position: 'absolute', left: 0, top: 0, width: G, height: 118, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px', background: 'linear-gradient(180deg, rgba(6,24,56,0.95) 0%, rgba(6,24,56,0.75) 70%, rgba(6,24,56,0) 100%)' }}>
          <div style={{ display: 'flex', fontFamily: familie, fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}>{titel}</div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: '#7dd3fc', letterSpacing: 3, marginTop: 6, textTransform: 'uppercase' }}>{`Where the teams dropped · ${k.region}`}</div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: G - 96, width: G, height: 96, display: 'flex', alignItems: 'center', padding: '16px 34px 0', background: 'linear-gradient(0deg, rgba(6,24,56,0.97) 0%, rgba(6,24,56,0.8) 65%, rgba(6,24,56,0) 100%)' }}>
          {logo && <img src={logo} width={62} height={44} style={{ objectFit: 'contain', marginRight: 14 }} />}
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, letterSpacing: 1 }}><span style={{ color: BLAU }}>COMP</span><span>HUB</span></div>
          <div style={{ display: 'flex', fontSize: 22, color: '#7aa2c9', marginLeft: 16 }}>thecomphub.com</div>
        </div>
      </div>
    );
    const kar = new ImageResponse(kartenBildEl, { width: G, height: G, fonts });
    kar.headers.set('Cache-Control', 'public, max-age=3600');
    return kar;
  }

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
  } else if (d.art === 'duell') {
    // Kopf an Kopf: die Fotos ganz aussen, die Namen daneben, darunter die Zahlen - wie die Tafel auf der Statistikseite (ohne Rahmen).
    const l = d.links as { name: string; land: string | null; bild: string };
    const r = d.rechts as { name: string; land: string | null; bild: string };
    const [fl, fr] = await Promise.all([bildDaten(l.bild, ursprung, 700), bildDaten(r.bild, ursprung, 700)]);
    const werte = (d.werte as Array<[string, string, string]>) ?? [];
    const zahlVon = (t: string) => Number(String(t).replace(/,/g, ''));
    bild = rahmen(
      <>
        <div style={{ position: 'absolute', left: 0, top: 0, width: B, height: 500, display: 'flex', background: '#0f1d38' }}>
          {fl && <img src={fl} width={420} height={500} style={{ width: 420, height: 500, objectFit: 'cover', objectPosition: fokusVon(l.bild) }} />}
          <div style={{ display: 'flex', width: 330, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 30 }}>
            <div style={{ display: 'flex', fontFamily: familie, fontSize: l.name.length > 8 ? 54 : 66, fontWeight: 800, lineHeight: 1.0, textTransform: 'uppercase' }}>{l.name}</div>
          </div>
          <div style={{ display: 'flex', width: 100, alignItems: 'center', justifyContent: 'center', fontFamily: familie, fontSize: 70, fontWeight: 800, fontStyle: 'italic', color: BLAU }}>VS</div>
          <div style={{ display: 'flex', width: 330, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 30 }}>
            <div style={{ display: 'flex', fontFamily: familie, fontSize: r.name.length > 8 ? 54 : 66, fontWeight: 800, lineHeight: 1.0, textTransform: 'uppercase', textAlign: 'right' }}>{r.name}</div>
          </div>
          {fr && <img src={fr} width={420} height={500} style={{ width: 420, height: 500, objectFit: 'cover', objectPosition: fokusVon(r.bild) }} />}
        </div>
        <div style={{ position: 'absolute', left: 0, top: 500, width: B, display: 'flex', flexDirection: 'column', padding: '14px 120px 0' }}>
          {werte.map(([name, a, b]) => {
            const vorn = zahlVon(a) >= zahlVon(b);
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', height: 62, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', width: 330, justifyContent: 'flex-start', fontFamily: familie, fontSize: 44, fontWeight: 800, color: vorn ? BLAU : '#e2e8f0' }}>{a}</div>
                <div style={{ display: 'flex', flex: 1, justifyContent: 'center', fontSize: 26, color: '#94a3b8', letterSpacing: 4, textTransform: 'uppercase' }}>{name}</div>
                <div style={{ display: 'flex', width: 330, justifyContent: 'flex-end', fontFamily: familie, fontSize: 44, fontWeight: 800, color: !vorn ? BLAU : '#e2e8f0' }}>{b}</div>
              </div>
            );
          })}
        </div>
      </>,
    );
  } else if (d.art === 'rekord') {
    // Die ersten Drei einer Bestenliste mit Foto.
    const drei = (d.drei as Array<{ rang: number; name: string; land: string | null; bild: string; wert: string }>) ?? [];
    const fotos = await Promise.all(drei.map((x) => bildDaten(x.bild, ursprung, 700)));
    const reihe = [1, 0, 2].map((i) => ({ x: drei[i], f: fotos[i] })).filter((e) => e.x);
    const MED: Record<number, string> = { 1: '#f5b301', 2: '#cbd5e1', 3: '#fb923c' };
    bild = rahmen(
      <>
        <div style={{ position: 'absolute', left: 64, top: 52, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, color: BLAU, letterSpacing: 4, textTransform: 'uppercase' }}>{String(d.saison ?? '')}</div>
          <div style={{ display: 'flex', fontFamily: familie, fontSize: 76, fontWeight: 800, lineHeight: 1.05, marginTop: 6 }}>{String(d.titel ?? '')}</div>
        </div>
        <div style={{ position: 'absolute', left: 64, top: 220, width: B - 128, height: 560, display: 'flex', gap: 28, alignItems: 'flex-end' }}>
          {reihe.map(({ x, f }) => (
            <div key={x.rang} style={{ position: 'relative', display: 'flex', width: 478, height: x.rang === 1 ? 560 : 500, borderRadius: 30, overflow: 'hidden', background: '#0f1d38', border: '2px solid rgba(255,255,255,0.14)' }}>
              {f && <img src={f} width={478} height={x.rang === 1 ? 560 : 500} style={{ position: 'absolute', left: 0, top: 0, width: 478, height: x.rang === 1 ? 560 : 500, objectFit: 'cover', objectPosition: fokusVon(x.bild) }} />}
              <div style={{ position: 'absolute', left: 0, bottom: 0, width: 478, height: 240, display: 'flex', background: 'linear-gradient(0deg, rgba(4,9,20,0.95) 0%, rgba(4,9,20,0) 100%)' }} />
              <div style={{ position: 'absolute', left: 20, top: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 58, borderRadius: 29, background: MED[x.rang] ?? '#cbd5e1', color: '#0b1220', fontFamily: familie, fontSize: 34, fontWeight: 800 }}>{x.rang}</div>
              <div style={{ position: 'absolute', left: 26, bottom: 24, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontFamily: familie, fontSize: 50, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.0 }}>{x.name}</div>
                <div style={{ display: 'flex', fontFamily: familie, fontSize: 62, fontWeight: 800, color: BLAU, marginTop: 6 }}>{x.wert}</div>
              </div>
            </div>
          ))}
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
