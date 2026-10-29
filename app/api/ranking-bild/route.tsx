import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fokusVon } from '@/lib/fotoFokus';
import { liesJson } from '@/lib/ablage';
import { GET as prLesen } from '../power-rankings/route';

/*
 * Die Grafik zum Power-Ranking-Update in #news (lib/newsPosts). Der Betreiber (29.10.2026): "nicht so wie im Bild (nur ein Schriftzug), sondern mit einer HUD
 * - Anzeige mit Flaggen, Top 3 usw., nicht ohne Bilder". 1600 x 900 wie die Plakate: oben die drei Ersten mit Foto, Flagge, Punkten und Bewegung, rechts
 * die Plaetze 4 bis 10, unten der groesste Aufsteiger der ersten hundert. Oeffentlich (der Bot holt das Bild ohne Anmeldung); gerechnet wird nur aus der
 * Rangliste, die ohnehin auf der Seite steht.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const B = 1600; const H = 900;
const BLAU = '#38bdf8';
const MED = ['#f5b301', '#cbd5e1', '#fb923c'];

interface Spieler { rank: number; id: string; name: string; anzeige?: string; land?: string; wertung: number; deltaPlatz?: number; bild?: string | null }

async function bildDaten(quelle: string | null | undefined, ursprung: string, breite: number): Promise<string | null> {
  if (!quelle) return null;
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

const zahl = (n: number) => Math.round(n).toLocaleString('en-US');
const kuerze = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Ein Dreieck als Zeichnung - die Schriften haben kein ▲/▼ (es kam als leeres Kaestchen). */
function Pfeil({ hoch, gross, farbe }: { hoch: boolean; gross: number; farbe: string }) {
  const s = Math.round(gross * 0.62);
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" style={{ marginRight: 4 }}>
      <polygon points={hoch ? '5,1 9.5,9 0.5,9' : '0.5,1 9.5,1 5,9'} fill={farbe} />
    </svg>
  );
}

function Bewegung({ d, gross = 30 }: { d?: number; gross?: number }) {
  if (!d) return <div style={{ display: 'flex', fontSize: gross, color: '#64748b' }}>–</div>;
  const farbe = d > 0 ? '#22c55e' : '#ef4444';
  return <div style={{ display: 'flex', alignItems: 'center', fontSize: gross, fontWeight: 700, color: farbe }}><Pfeil hoch={d > 0} gross={gross} farbe={farbe} />{Math.abs(d)}</div>;
}

export async function GET(request: Request) {
  try {
    const ursprung = new URL(request.url).origin;
    const [j, profile] = await Promise.all([
      prLesen(new Request('http://localhost/api/power-rankings?page=1')).then((r) => r.json()) as Promise<{ players?: Spieler[]; fetchedAt?: number }>,
      liesJson<Record<string, { anzeige?: string; name?: string; land?: string }>>('spieler-profile.json', {}),
    ]);
    const roh = j.players ?? [];
    if (roh.length < 10) return Response.json({ ok: false, fehler: 'Rangliste nicht ladbar' }, { status: 200 });
    const name = (s: Spieler) => (profile[s.id]?.anzeige || profile[s.id]?.name || s.anzeige || s.name).toUpperCase();
    const land = (s: Spieler) => (profile[s.id]?.land || s.land || '').toLowerCase();
    const top = roh.slice(0, 10);
    // Der groesste Aufsteiger der ersten hundert (die zweite Seite dazu).
    const zwei = await prLesen(new Request('http://localhost/api/power-rankings?page=2')).then((r) => r.json()).catch(() => ({})) as { players?: Spieler[] };
    const kletterer = [...roh, ...(zwei.players ?? [])].filter((s) => s.rank <= 100 && (s.deltaPlatz ?? 0) > 0).sort((a, b) => (b.deltaPlatz ?? 0) - (a.deltaPlatz ?? 0))[0] ?? null;

    const [logo, bricolage, figtree] = await Promise.all([
      bildDaten('/logos/CompHub-Logo-frei.png', ursprung, 200), schrift('Bricolage Grotesque', 800), schrift('Figtree', 700),
    ]);
    const fotos = new Map<string, string | null>();
    const flaggen = new Map<string, string | null>();
    await Promise.all([...top.slice(0, 3), ...(kletterer ? [kletterer] : [])].map(async (s) => { fotos.set(s.id, await bildDaten(s.bild, ursprung, 500)); }));
    await Promise.all([...top, ...(kletterer ? [kletterer] : [])].map(async (s) => {
      const l = land(s); if (l && !flaggen.has(l)) flaggen.set(l, await bildDaten(`/flags/${l}.png`, ursprung, 120));
    }));
    const flagge = (s: Spieler, w: number, h: number) => {
      const d = flaggen.get(land(s));
      return d ? <img src={d} width={w} height={h} style={{ width: w, height: h, borderRadius: 4, marginRight: 12, objectFit: 'cover' }} /> : <div style={{ display: 'flex', width: 0 }} />;
    };
    const foto = (s: Spieler, w: number, h: number) => {
      const d = fotos.get(s.id);
      return (
        <div style={{ display: 'flex', position: 'relative', width: w, height: h, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(160deg,#17406e 0%,#0d1d35 100%)' }}>
          {d ? <img src={d} width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, objectFit: 'cover', objectPosition: fokusVon(s.bild) }} />
            : <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: h / 2.4, color: '#1e3a5f', fontWeight: 800 }}>{name(s).slice(0, 1)}</div>}
        </div>
      );
    };
    const stand = new Date(j.fetchedAt ?? Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    // Podest: der Erste in der Mitte, groesser.
    const podest = [top[1], top[0], top[2]];

    const bild = (
      <div style={{ display: 'flex', flexDirection: 'column', width: B, height: H, background: 'radial-gradient(circle at 30% 0%, #0f2744 0%, #070b14 55%, #05070d 100%)', color: '#f1f5f9', fontFamily: 'Figtree', padding: '44px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 6, color: BLAU, fontWeight: 700 }}>COMPHUB · EPIC POWER RANKINGS</div>
            <div style={{ display: 'flex', fontFamily: 'Bricolage', fontSize: 76, fontWeight: 800, lineHeight: 1, marginTop: 6 }}>POWER RANKINGS UPDATE</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {logo ? <img src={logo} width={96} height={70} style={{ width: 96, height: 70 }} /> : null}
            <div style={{ display: 'flex', fontSize: 22, color: '#94a3b8', marginTop: 8 }}>{stand}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, marginTop: 30 }}>
          {/* Podest */}
          <div style={{ display: 'flex', alignItems: 'flex-end', width: 900 }}>
            {podest.map((s, i) => {
              const erster = s.rank === 1;
              const w = erster ? 300 : 250; const h = erster ? 380 : 310;
              return (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: w + 40, marginRight: i < 2 ? 0 : 0 }}>
                  <div style={{ display: 'flex', position: 'relative' }}>
                    {foto(s, w, h)}
                    <div style={{ display: 'flex', position: 'absolute', left: 12, top: 12, width: 64, height: 64, borderRadius: 32, background: MED[s.rank - 1], color: '#0b1120', fontSize: 34, fontWeight: 800, alignItems: 'center', justifyContent: 'center' }}>{s.rank}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, fontFamily: 'Bricolage', fontSize: erster ? 38 : 32, fontWeight: 800 }}>{flagge(s, 40, 28)}{kuerze(name(s), 13)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ display: 'flex', fontSize: 28, color: BLAU, fontWeight: 700, marginRight: 14 }}>{zahl(s.wertung)} pts</div>
                    <Bewegung d={s.deltaPlatz} gross={26} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Plaetze 4 bis 10 und der Aufsteiger */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 30 }}>
            {top.slice(3).map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', height: 54, borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', width: 52, fontSize: 28, color: '#94a3b8', fontWeight: 700 }}>{s.rank}</div>
                {flagge(s, 34, 24)}
                <div style={{ display: 'flex', flex: 1, fontSize: 28, fontWeight: 700 }}>{kuerze(name(s), 15)}</div>
                <div style={{ display: 'flex', width: 120, justifyContent: 'flex-end', fontSize: 26, color: '#cbd5e1', marginRight: 16 }}>{zahl(s.wertung)}</div>
                <div style={{ display: 'flex', width: 60, justifyContent: 'flex-end' }}><Bewegung d={s.deltaPlatz} gross={22} /></div>
              </div>
            ))}
            {kletterer && (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 22, padding: '14px 18px', borderRadius: 16, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)' }}>
                {foto(kletterer, 72, 72)}
                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16 }}>
                  <div style={{ display: 'flex', fontSize: 18, letterSpacing: 3, color: '#4ade80', fontWeight: 700 }}>BIGGEST CLIMBER · TOP 100</div>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, fontWeight: 700, marginTop: 4 }}>{flagge(kletterer, 34, 24)}{kuerze(name(kletterer), 14)}<div style={{ display: 'flex', alignItems: 'center', color: '#4ade80', marginLeft: 12 }}><Pfeil hoch gross={28} farbe="#4ade80" />{kletterer.deltaPlatz} → #{kletterer.rank}</div></div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 22, color: '#64748b', marginTop: 10 }}>thecomphub.com/power-rankings</div>
      </div>
    );
    const fonts = [
      ...(bricolage ? [{ name: 'Bricolage', data: bricolage, weight: 800 as const }] : []),
      ...(figtree ? [{ name: 'Figtree', data: figtree, weight: 700 as const }] : []),
    ];
    const antwort = new ImageResponse(bild, { width: B, height: H, fonts });
    antwort.headers.set('Cache-Control', 'public, max-age=300');
    return antwort;
  } catch (e) {
    // Kein 5xx (Lastverteiler) - der Beitrag geht dann ohne Grafik hinaus.
    return Response.json({ ok: false, fehler: (e as Error).message }, { status: 200 });
  }
}
