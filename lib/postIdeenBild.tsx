/* eslint-disable @next/next/no-img-element -- satori (next/og) zeichnet nur <img>, next/image gibt es dort nicht */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { ReactElement } from 'react';
import type { BildOrg, BildSpieler, BildZeile, Format, IdeeBild, PlanTag } from '@/lib/postIdeen';

/*
 * Das Bild zu einer Post-Idee (lib/postIdeen.ts) - im Stil des freigegebenen LCQ-Banners (18.11.2026): dunkler Navy-Verlauf mit blauen Lichtern,
 * Ueberschriften in Anton, heller Text in Figtree, oben rechts das neue blau-weisse Zeichen (CompHub-Logo-frei.png) mit COMPHUB, unten thecomphub.com.
 * Flaggen aus public/flags, Org-Logos ohne Hintergrund (public/orgs oder hochgeladen), Spielerfotos nur, wenn sie frei sind (die Daten liefern nur freie).
 *
 *   1600 x 900  Standard fuer Listen-Posts
 *   1500 x 500  das Banner-Format von X
 *
 * Gezeichnet wird mit next/og (satori): jedes Element mit mehreren Kindern braucht display:flex, Bilder muessen PNG/JPEG als data:-Adresse sein.
 */

const BLAU = '#38bdf8';
const GRAU = '#94a3b8';
const HELL = '#cbd5e1';
const KASTEN = { background: 'rgba(15,23,42,.6)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 18 } as const;

export interface BildMittel {
  logo: string | null;
  bilder: Map<string, string | null>;
  fonts: Array<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: 'normal' }>;
}

/* ------------------------------------------------------------------ Laden */

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
    const png = await sharp(puffer).resize({ width: breite, height: breite, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch { return null; }
}

const schriften = new Map<string, ArrayBuffer | null>();
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

const flaggePfad = (l: string) => `/flags/${l.toLowerCase()}.png`;

/** Alles, was das Bild braucht: Logo, Schriften, Flaggen, Org-Logos und Fotos - als data:-Adressen. */
export async function bildMittel(b: IdeeBild, ursprung: string): Promise<BildMittel> {
  const quellen = new Map<string, number>();
  const dazu = (q: string | null | undefined, breite: number) => { if (q) quellen.set(q, Math.max(breite, quellen.get(q) ?? 0)); };
  const sp = (s: BildSpieler) => { if (s.land) dazu(flaggePfad(s.land), 60); };
  if (b.typ === 'orgs') {
    for (const o of b.orgs) { dazu(o.logo, 160); o.spieler.forEach(sp); }
    b.frei.forEach(sp);
  } else if (b.typ === 'liste') {
    for (const z of b.zeilen) { dazu(z.logo, 200); dazu(z.foto, b.zeilen.length === 1 ? 640 : 220); if (z.land) dazu(flaggePfad(z.land), 90); }
  }
  const [logo, anton, figtree6, figtree8, ...bilder] = await Promise.all([
    bildDaten('/logos/CompHub-Logo-frei.png', ursprung, 240),
    schrift('Anton', 400), schrift('Figtree', 600), schrift('Figtree', 800),
    ...[...quellen].map(([q, w]) => bildDaten(q, ursprung, w)),
  ]);
  const fonts: BildMittel['fonts'] = [];
  if (anton) fonts.push({ name: 'Anton', data: anton, weight: 400, style: 'normal' });
  if (figtree6) fonts.push({ name: 'Figtree', data: figtree6, weight: 600, style: 'normal' });
  if (figtree8) fonts.push({ name: 'Figtree', data: figtree8, weight: 800, style: 'normal' });
  return { logo, fonts, bilder: new Map([...quellen.keys()].map((q, i) => [q, bilder[i] ?? null])) };
}

/* ------------------------------------------------------------------ Bausteine */

const ANTON = 'Anton, Impact, sans-serif';

function Marke({ m, groesse }: { m: BildMittel; groesse: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(groesse * 0.35), flexShrink: 0 }}>
      {m.logo && <img alt="" src={m.logo} width={Math.round(groesse * 1.36)} height={groesse} style={{ width: Math.round(groesse * 1.36), height: groesse, objectFit: 'contain' }} />}
      <div style={{ display: 'flex', fontFamily: ANTON, fontSize: Math.round(groesse * 0.62), letterSpacing: 2 }}>
        <div style={{ display: 'flex', color: '#fff' }}>COMP</div><div style={{ display: 'flex', color: BLAU }}>HUB</div>
      </div>
    </div>
  );
}

function Flagge({ m, land, b, h }: { m: BildMittel; land: string | null | undefined; b: number; h: number }) {
  const d = land ? m.bilder.get(flaggePfad(land)) : null;
  if (!d) return <div style={{ display: 'flex', width: b, height: h, borderRadius: 3, background: 'rgba(148,163,184,.22)', flexShrink: 0 }} />;
  return <img alt="" src={d} width={b} height={h} style={{ width: b, height: h, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />;
}

function OrgLogo({ m, logo, groesse, name }: { m: BildMittel; logo: string | null; groesse: number; name: string }) {
  const d = logo ? m.bilder.get(logo) : null;
  return (
    <div style={{ display: 'flex', width: groesse, height: groesse, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {d
        ? <img alt="" src={d} width={groesse} height={groesse} style={{ width: groesse, height: groesse, objectFit: 'contain' }} />
        : <div style={{ display: 'flex', fontFamily: ANTON, fontSize: Math.round(groesse * 0.5), color: GRAU }}>{name.slice(0, 2).toUpperCase()}</div>}
    </div>
  );
}

function Grund({ breite, hoehe, children }: { breite: number; hoehe: number; children: ReactElement | ReactElement[] }) {
  const g = Math.min(900, hoehe);
  return (
    <div style={{ display: 'flex', position: 'relative', width: breite, height: hoehe, color: '#fff', fontFamily: 'Figtree', overflow: 'hidden',
      background: 'linear-gradient(135deg,#04070d 0%,#0a1324 60%,#06101f 100%)' }}>
      {/* satori zeichnet einen Verlauf nur so hoch wie die Flaeche - die Lichter duerfen darum nicht hoeher sein als das Bild (sonst eine harte Kante). */}
      <div style={{ display: 'flex', position: 'absolute', left: -Math.round(g * 0.25), top: -Math.round(g * 0.31), width: g, height: g, borderRadius: g / 2,
        backgroundImage: 'radial-gradient(circle, rgba(14,165,233,.28), rgba(14,165,233,0) 70%)' }} />
      <div style={{ display: 'flex', position: 'absolute', right: -Math.round(g * 0.33), bottom: -Math.round(g * 0.44), width: g, height: g, borderRadius: g / 2,
        backgroundImage: 'radial-gradient(circle, rgba(56,189,248,.14), rgba(56,189,248,0) 70%)' }} />
      {children}
    </div>
  );
}

const kurz = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ------------------------------------------------------------------ 1600 x 900 */

function Kopf16({ b, m }: { b: IdeeBild; m: BildMittel }) {
  const lang = b.titel.length > 26;
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 60, top: 44, right: 60, justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1180 }}>
        <div style={{ display: 'flex', color: BLAU, fontWeight: 800, letterSpacing: 4, fontSize: 22 }}>{b.kicker}</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: lang ? 64 : 76, lineHeight: 1, marginTop: 10, letterSpacing: 1 }}>{b.titel}</div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 24, color: HELL, fontWeight: 600 }}>{b.unter}</div>
      </div>
      <Marke m={m} groesse={58} />
    </div>
  );
}

function Fuss16({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 60, right: 60, bottom: 26, justifyContent: 'space-between', color: GRAU, fontSize: 20, fontWeight: 800 }}>
      <div style={{ display: 'flex' }}>{text}</div>
      <div style={{ display: 'flex', color: BLAU }}>thecomphub.com</div>
    </div>
  );
}

/* --- Orgs: Karten in Spalten, rechts die Free Agents */

/** Zeilenhoehe, Schrift, Spalten, Kopfhoehe der Karte; eng: weniger Rand (damit drei Spalten statt vier reichen). */
interface OrgMass { zeile: number; schrift: number; spalten: number; kopf: number; eng?: boolean }
const rand = (ms: OrgMass) => (ms.eng ? { innen: '8px 14px 10px', unten: 10, oben: 4, abzeichen: 22, summe: 8 + 10 + 4 + 4 + 10 } : { innen: '12px 16px 14px', unten: 14, oben: 6, abzeichen: 26, summe: 12 + 14 + 6 + 4 + 14 });

function orgKartenHoehe(o: BildOrg, ms: OrgMass) {
  const r = rand(ms);
  return r.summe + ms.kopf + (o.erster ? r.abzeichen : 0) + o.spieler.length * ms.zeile;
}

/** Karten so auf Spalten verteilen, dass die hoechste moeglichst niedrig bleibt (der Reihe nach in die niedrigste). */
function verteile(orgs: BildOrg[], ms: OrgMass): { spalten: BildOrg[][]; hoehe: number } {
  const spalten: BildOrg[][] = Array.from({ length: ms.spalten }, () => []);
  const h = Array(ms.spalten).fill(0) as number[];
  for (const o of orgs) {
    const i = h.indexOf(Math.min(...h));
    spalten[i].push(o); h[i] += orgKartenHoehe(o, ms);
  }
  return { spalten, hoehe: Math.max(...h) };
}

function OrgKarte({ o, m, ms, breite, abzeichen }: { o: BildOrg; m: BildMittel; ms: OrgMass; breite: number; abzeichen: string }) {
  // Wie viele Zeichen in eine Zeile passen (Figtree fett etwa 0,52 der Schriftgroesse je Zeichen).
  const zeichen = (platz: number, schrift: number) => Math.max(6, Math.floor(platz / (schrift * 0.52)));
  const r = rand(ms);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: r.innen, marginBottom: r.unten, borderRadius: 16,
      background: o.erster ? 'rgba(14,165,233,.16)' : 'rgba(15,23,42,.6)',
      border: o.erster ? `2px solid ${BLAU}` : '1px solid rgba(56,189,248,.25)' }}>
      {o.erster && <div style={{ display: 'flex', color: BLAU, fontSize: 14, fontWeight: 800, letterSpacing: 2, height: r.abzeichen, whiteSpace: 'nowrap' }}>{abzeichen}</div>}
      <div style={{ display: 'flex', alignItems: 'center', height: ms.kopf, gap: 12 }}>
        <OrgLogo m={m} logo={o.logo} groesse={ms.kopf - 6} name={o.name} />
        <div style={{ display: 'flex', flex: 1, fontSize: ms.schrift + 2, fontWeight: 800, overflow: 'hidden', whiteSpace: 'nowrap' }}>{kurz(o.name, zeichen(breite - 32 - ms.kopf - 12 - 34, ms.schrift + 2))}</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: ms.kopf - 4, color: o.erster ? BLAU : '#fff' }}>{o.anzahl}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: r.oben }}>
        {o.spieler.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: ms.zeile, gap: 10, fontSize: ms.schrift, fontWeight: 600, color: '#fff' }}>
            <Flagge m={m} land={s.land} b={Math.round(ms.schrift * 1.3)} h={Math.round(ms.schrift * 0.9)} />
            <div style={{ display: 'flex', whiteSpace: 'nowrap' }}>{kurz(s.name, zeichen(breite - 32 - ms.schrift * 1.3 - 10, ms.schrift))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FreiKasten({ frei, m, breite, hoehe, gross }: { frei: BildSpieler[]; m: BildMittel; breite: number; hoehe: number; gross: boolean }) {
  // Spalten und Schrift so waehlen, dass alle Namen passen; sonst die ersten und "+n more".
  const innen = hoehe - (gross ? 92 : 70);
  let wahl = { spalten: 2, schrift: 21, zeile: 31 };
  for (const v of [{ spalten: 2, schrift: 21, zeile: 31 }, { spalten: 2, schrift: 18, zeile: 26 }, { spalten: 3, schrift: 16, zeile: 23 }, { spalten: 3, schrift: 14, zeile: 20 }]) {
    wahl = v;
    if (Math.floor(innen / v.zeile) * v.spalten >= frei.length) break;
  }
  const proSpalte = Math.max(1, Math.floor(innen / wahl.zeile));
  const platz = proSpalte * wahl.spalten;
  const zeigen = frei.length > platz ? frei.slice(0, platz - 1) : frei;
  const rest = frei.length - zeigen.length;
  const spalten: BildSpieler[][] = Array.from({ length: wahl.spalten }, (_, i) => zeigen.slice(i * proSpalte, (i + 1) * proSpalte));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: breite, height: hoehe, padding: gross ? '24px 26px' : '16px 18px', ...KASTEN }}>
      <div style={{ display: 'flex', color: BLAU, fontSize: gross ? 20 : 16, fontWeight: 800, letterSpacing: 3, marginBottom: gross ? 18 : 10 }}>FREE AGENTS · {frei.length}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {spalten.map((sp, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {sp.map((s, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 9, height: wahl.zeile, fontSize: wahl.schrift, fontWeight: 600 }}>
                <Flagge m={m} land={s.land} b={Math.round(wahl.schrift * 1.3)} h={Math.round(wahl.schrift * 0.9)} />
                <div style={{ display: 'flex', whiteSpace: 'nowrap' }}>{kurz(s.name, wahl.spalten === 2 ? 15 : 12)}</div>
              </div>
            ))}
            {rest > 0 && i === spalten.length - 1 && <div style={{ display: 'flex', height: wahl.zeile, fontSize: wahl.schrift, color: GRAU, fontWeight: 800 }}>+{rest} more</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Orgs16({ b, m }: { b: Extract<IdeeBild, { typ: 'orgs' }>; m: BildMittel }) {
  const oben = 262; const unten = 74; const hoehe = 900 - oben - unten;
  const freiBreite = b.frei.length > 36 ? 520 : 440;
  const links = 1480 - freiBreite - 30;
  const versuche: OrgMass[] = [
    { zeile: 30, schrift: 20, spalten: 3, kopf: 46 }, { zeile: 26, schrift: 18, spalten: 3, kopf: 42 }, { zeile: 26, schrift: 18, spalten: 3, kopf: 40, eng: true },
    { zeile: 23, schrift: 17, spalten: 3, kopf: 36, eng: true }, { zeile: 24, schrift: 17, spalten: 4, kopf: 38, eng: true }, { zeile: 21, schrift: 15, spalten: 4, kopf: 34, eng: true },
  ];
  let ms = versuche[versuche.length - 1];
  let v = verteile(b.orgs, ms);
  for (const x of versuche) { const t = verteile(b.orgs, x); if (t.hoehe <= hoehe) { ms = x; v = t; break; } }
  const spaltenBreite = Math.floor((links - (ms.spalten - 1) * 14) / ms.spalten);
  return (
    <Grund breite={1600} hoehe={900}>
      <Kopf16 b={b} m={m} />
      <div style={{ display: 'flex', position: 'absolute', left: 60, top: oben, width: 1480, height: hoehe, gap: 30 }}>
        <div style={{ display: 'flex', width: links, height: hoehe, gap: 14, overflow: 'hidden' }}>
          {v.spalten.map((sp, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', width: spaltenBreite }}>
              {sp.map((o, j) => <OrgKarte key={j} o={o} m={m} ms={ms} breite={spaltenBreite} abzeichen={b.abzeichen} />)}
            </div>
          ))}
        </div>
        <FreiKasten frei={b.frei} m={m} breite={freiBreite} hoehe={hoehe} gross />
      </div>
      <Fuss16 text={b.fuss} />
    </Grund>
  );
}

/* --- Liste: Plaetze mit Logo, Foto oder Flagge */

function Bildchen({ z, m, groesse }: { z: BildZeile; m: BildMittel; groesse: number }) {
  const foto = z.foto ? m.bilder.get(z.foto) : null;
  if (foto) {
    return <img alt="" src={foto} width={groesse} height={groesse} style={{ width: groesse, height: groesse, objectFit: 'cover', objectPosition: '50% 20%', borderRadius: 14, flexShrink: 0 }} />;
  }
  if (z.logo !== undefined && z.logo !== null) return <OrgLogo m={m} logo={z.logo} groesse={groesse} name={z.titel} />;
  if (z.land) {
    return (
      <div style={{ display: 'flex', width: groesse, height: groesse, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Flagge m={m} land={z.land} b={Math.round(groesse * 0.86)} h={Math.round(groesse * 0.58)} />
      </div>
    );
  }
  return <OrgLogo m={m} logo={null} groesse={groesse} name={z.titel} />;
}

function Liste16({ b, m }: { b: Extract<IdeeBild, { typ: 'liste' }>; m: BildMittel }) {
  if (b.zeilen.length === 1) return <Held16 b={b} m={m} />;
  const oben = 262; const unten = 74; const hoehe = 900 - oben - unten;
  const n = b.zeilen.length;
  const zeile = Math.min(112, Math.floor((hoehe - (n - 1) * 12) / n));
  const bild = zeile - 24;
  return (
    <Grund breite={1600} hoehe={900}>
      <Kopf16 b={b} m={m} />
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 60, top: oben, width: 1480, gap: 12 }}>
        {b.zeilen.map((z, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: zeile, padding: '0 28px', gap: 24, borderRadius: 18,
            background: z.hervor ? 'rgba(14,165,233,.16)' : 'rgba(15,23,42,.6)', border: z.hervor ? `2px solid ${BLAU}` : '1px solid rgba(56,189,248,.25)' }}>
            <div style={{ display: 'flex', width: 70, fontFamily: ANTON, fontSize: 48, color: z.hervor ? BLAU : '#fff' }}>{z.rang}</div>
            <Bildchen z={z} m={m} groesse={bild} />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 34, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {(z.foto || z.logo) && z.land ? <Flagge m={m} land={z.land} b={42} h={29} /> : null}
                <div style={{ display: 'flex' }}>{kurz(z.titel, 30)}</div>
              </div>
              {z.unter && <div style={{ display: 'flex', fontSize: 20, color: GRAU, fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap' }}>{kurz(z.unter, 95)}</div>}
            </div>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 52, color: z.hervor ? BLAU : '#fff' }}>{z.wert}</div>
          </div>
        ))}
      </div>
      <Fuss16 text={b.fuss} />
    </Grund>
  );
}

/** Eine einzelne Zeile (Meilenstein): Foto gross, Name und Betrag. */
function Held16({ b, m }: { b: Extract<IdeeBild, { typ: 'liste' }>; m: BildMittel }) {
  const z = b.zeilen[0];
  return (
    <Grund breite={1600} hoehe={900}>
      <Kopf16 b={b} m={m} />
      <div style={{ display: 'flex', position: 'absolute', left: 60, top: 262, width: 1480, height: 564, alignItems: 'center', gap: 56, padding: '0 56px', ...KASTEN }}>
        <Bildchen z={z} m={m} groesse={420} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {z.land && <Flagge m={m} land={z.land} b={64} h={44} />}
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 96, lineHeight: 1 }}>{kurz(z.titel.toUpperCase(), 16)}</div>
          </div>
          <div style={{ display: 'flex', color: BLAU, fontWeight: 800, letterSpacing: 4, fontSize: 22, marginTop: 30 }}>{b.wertTitel}</div>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 120, color: BLAU, lineHeight: 1.05 }}>{z.wert}</div>
          {z.unter && <div style={{ display: 'flex', fontSize: 26, color: HELL, fontWeight: 600, marginTop: 10 }}>{z.unter}</div>}
        </div>
      </div>
      <Fuss16 text={b.fuss} />
    </Grund>
  );
}

/* --- Plan: Tage als Kacheln */

function Plan16({ b, m }: { b: Extract<IdeeBild, { typ: 'plan' }>; m: BildMittel }) {
  const tage = b.tage.slice(0, 8);
  const spalten = tage.length <= 3 ? tage.length : tage.length <= 6 ? 3 : 4;
  const reihen = Math.ceil(tage.length / spalten);
  const hoehe = 900 - 262 - 74;
  const kachelH = Math.floor((hoehe - (reihen - 1) * 16) / reihen);
  const kachelB = Math.floor((1480 - (spalten - 1) * 16) / spalten);
  const maxEintraege = Math.max(1, Math.floor((kachelH - 70) / 58));
  return (
    <Grund breite={1600} hoehe={900}>
      <Kopf16 b={b} m={m} />
      <div style={{ display: 'flex', flexWrap: 'wrap', position: 'absolute', left: 60, top: 262, width: 1480, gap: 16 }}>
        {tage.map((t, i) => <TagKachel key={i} t={t} breite={kachelB} hoehe={kachelH} max={maxEintraege} />)}
      </div>
      <Fuss16 text={b.fuss} />
    </Grund>
  );
}

function TagKachel({ t, breite, hoehe, max, klein = false }: { t: PlanTag; breite: number; hoehe: number; max: number; klein?: boolean }) {
  const zeigen = t.eintraege.slice(0, max);
  const rest = t.eintraege.length - zeigen.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: breite, height: hoehe, padding: klein ? '12px 16px' : '20px 24px', ...KASTEN }}>
      <div style={{ display: 'flex', color: BLAU, fontSize: klein ? 15 : 20, fontWeight: 800, letterSpacing: 3, marginBottom: klein ? 6 : 12 }}>{t.tag.toUpperCase()}</div>
      {zeigen.map((e, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: klein ? 6 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: klein ? 16 : 22, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {e.finale && <div style={{ display: 'flex', background: BLAU, color: '#04070d', fontSize: klein ? 11 : 14, fontWeight: 800, padding: '2px 8px', borderRadius: 6, letterSpacing: 1 }}>FINAL</div>}
            <div style={{ display: 'flex' }}>{kurz(e.titel, Math.floor((breite - (klein ? 32 : 48) - (e.finale ? (klein ? 52 : 70) : 0)) / ((klein ? 16 : 22) * 0.52)))}</div>
          </div>
          <div style={{ display: 'flex', fontSize: klein ? 13 : 18, color: GRAU, fontWeight: 600, marginTop: 2 }}>{e.zeiten}</div>
        </div>
      ))}
      {rest > 0 && <div style={{ display: 'flex', fontSize: klein ? 14 : 18, color: GRAU, fontWeight: 800 }}>+{rest} more</div>}
    </div>
  );
}

/* --- Werbung */

function Promo16({ b, m }: { b: Extract<IdeeBild, { typ: 'promo' }>; m: BildMittel }) {
  return (
    <Grund breite={1600} hoehe={900}>
      <div style={{ display: 'flex', position: 'absolute', right: 60, top: 44 }}><Marke m={m} groesse={58} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 60, top: 200, width: 1480 }}>
        <div style={{ display: 'flex', color: BLAU, fontWeight: 800, letterSpacing: 5, fontSize: 26 }}>{b.kicker}</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 150, lineHeight: 1, marginTop: 12 }}>{b.titel}</div>
        <div style={{ display: 'flex', fontSize: 32, color: HELL, fontWeight: 600, marginTop: 18 }}>{b.unter}</div>
        <div style={{ display: 'flex', gap: 22, marginTop: 56 }}>
          {b.punkte.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '24px 26px', fontSize: 25, fontWeight: 800, ...KASTEN }}>
              <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: BLAU, marginRight: 16, flexShrink: 0 }} />
              <div style={{ display: 'flex' }}>{p}</div>
            </div>
          ))}
        </div>
      </div>
      <Fuss16 text="" />
    </Grund>
  );
}

/* ------------------------------------------------------------------ 1500 x 500 (Banner) */

function Seite15({ b, m, children }: { b: IdeeBild; m: BildMittel; children: ReactElement }) {
  return (
    <Grund breite={1500} hoehe={500}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 52, top: 44, bottom: 40, width: 520, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: BLAU, fontWeight: 800, letterSpacing: 3, fontSize: 17, lineHeight: 1.3 }}>{b.kicker}</div>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: b.titel.length > 22 ? 54 : 64, lineHeight: 1.02, marginTop: 10 }}>{b.titel}</div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 19, color: HELL, fontWeight: 600, lineHeight: 1.3 }}>{b.unter}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Marke m={m} groesse={40} />
          <div style={{ display: 'flex', color: BLAU, fontSize: 18, fontWeight: 800 }}>thecomphub.com</div>
        </div>
      </div>
      <div style={{ display: 'flex', position: 'absolute', left: 610, right: 44, top: 40, bottom: 40 }}>{children}</div>
    </Grund>
  );
}

function Orgs15({ b, m }: { b: Extract<IdeeBild, { typ: 'orgs' }>; m: BildMittel }) {
  const zeigen = b.orgs.slice(0, 8);
  const breite = Math.floor((846 - 3 * 14) / 4);
  return (
    <Seite15 b={b} m={m}>
      <div style={{ display: 'flex', flexDirection: 'column', width: 846, height: 420 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {zeigen.map((o, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: breite, height: 176, padding: '10px 10px 12px', borderRadius: 16,
              background: o.erster ? 'rgba(14,165,233,.16)' : 'rgba(15,23,42,.6)', border: o.erster ? `2px solid ${BLAU}` : '1px solid rgba(56,189,248,.25)' }}>
              <div style={{ display: 'flex', height: 18, color: BLAU, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>{o.erster ? b.abzeichen : ''}</div>
              <OrgLogo m={m} logo={o.logo} groesse={68} name={o.name} />
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 36, color: o.erster ? BLAU : '#fff', lineHeight: 1.1 }}>{o.anzahl}</div>
              <div style={{ display: 'flex', fontSize: 15, fontWeight: 800, color: HELL, whiteSpace: 'nowrap' }}>{kurz(o.name, 18)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: 19, fontWeight: 800, color: HELL }}>
          {b.orgs.length > zeigen.length ? `+${b.orgs.length - zeigen.length} more orgs · ` : ''}{b.frei.length} free agents of {b.gesamt} players
        </div>
      </div>
    </Seite15>
  );
}

function Liste15({ b, m }: { b: Extract<IdeeBild, { typ: 'liste' }>; m: BildMittel }) {
  const zeilen = b.zeilen.slice(0, 5);
  const zeile = zeilen.length === 1 ? 300 : Math.floor((420 - (zeilen.length - 1) * 10) / zeilen.length);
  const bild = Math.min(zeile - 16, zeilen.length === 1 ? 240 : 64);
  return (
    <Seite15 b={b} m={m}>
      <div style={{ display: 'flex', flexDirection: 'column', width: 846, gap: 10, justifyContent: 'center', height: 420 }}>
        {zeilen.map((z, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: zeile, padding: '0 22px', gap: 18, borderRadius: 16,
            background: z.hervor ? 'rgba(14,165,233,.16)' : 'rgba(15,23,42,.6)', border: z.hervor ? `2px solid ${BLAU}` : '1px solid rgba(56,189,248,.25)' }}>
            {zeilen.length > 1 && <div style={{ display: 'flex', width: 40, fontFamily: ANTON, fontSize: 34, color: z.hervor ? BLAU : '#fff' }}>{z.rang}</div>}
            <Bildchen z={z} m={m} groesse={bild} />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: zeilen.length === 1 ? 44 : 26, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {(z.foto || z.logo) && z.land ? <Flagge m={m} land={z.land} b={34} h={23} /> : null}
                <div style={{ display: 'flex' }}>{kurz(z.titel, 24)}</div>
              </div>
              {z.unter && <div style={{ display: 'flex', fontSize: 16, color: GRAU, fontWeight: 600, whiteSpace: 'nowrap' }}>{kurz(z.unter, 60)}</div>}
              {zeilen.length === 1 && <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 84, color: BLAU, marginTop: 8 }}>{z.wert}</div>}
            </div>
            {zeilen.length > 1 && <div style={{ display: 'flex', fontFamily: ANTON, fontSize: 38, color: z.hervor ? BLAU : '#fff' }}>{z.wert}</div>}
          </div>
        ))}
      </div>
    </Seite15>
  );
}

function Plan15({ b, m }: { b: Extract<IdeeBild, { typ: 'plan' }>; m: BildMittel }) {
  const tage = b.tage.slice(0, 6);
  const spalten = Math.min(3, tage.length);
  const reihen = Math.ceil(tage.length / spalten);
  const kachelB = Math.floor((846 - (spalten - 1) * 12) / spalten);
  const kachelH = Math.floor((420 - (reihen - 1) * 12) / reihen);
  return (
    <Seite15 b={b} m={m}>
      <div style={{ display: 'flex', flexWrap: 'wrap', width: 846, gap: 12 }}>
        {tage.map((t, i) => <TagKachel key={i} t={t} breite={kachelB} hoehe={kachelH} max={Math.max(1, Math.floor((kachelH - 44) / 44))} klein />)}
      </div>
    </Seite15>
  );
}

function Promo15({ b, m }: { b: Extract<IdeeBild, { typ: 'promo' }>; m: BildMittel }) {
  return (
    <Seite15 b={{ ...b, titel: b.titel }} m={m}>
      <div style={{ display: 'flex', flexDirection: 'column', width: 846, height: 420, justifyContent: 'center', gap: 14 }}>
        {b.punkte.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '22px 26px', fontSize: 26, fontWeight: 800, ...KASTEN }}>
            <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: BLAU, marginRight: 16 }} />
            <div style={{ display: 'flex' }}>{p}</div>
          </div>
        ))}
      </div>
    </Seite15>
  );
}

/* ------------------------------------------------------------------ Einstieg */

export function ideeBild(b: IdeeBild, format: Format, m: BildMittel): { element: ReactElement; breite: number; hoehe: number } {
  const banner = format === '1500x500';
  let element: ReactElement;
  if (b.typ === 'orgs') element = banner ? <Orgs15 b={b} m={m} /> : <Orgs16 b={b} m={m} />;
  else if (b.typ === 'liste') element = banner ? <Liste15 b={b} m={m} /> : <Liste16 b={b} m={m} />;
  else if (b.typ === 'plan') element = banner ? <Plan15 b={b} m={m} /> : <Plan16 b={b} m={m} />;
  else element = banner ? <Promo15 b={b} m={m} /> : <Promo16 b={b} m={m} />;
  return { element, breite: banner ? 1500 : 1600, hoehe: banner ? 500 : 900 };
}
