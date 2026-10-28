import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { fokusVon } from '@/lib/fotoFokus';
import { plakatTeams, plakatText, feldGroesse, type PlakatTeam, type PlakatSpieler } from '@/lib/plakatDaten';
import { topFuenf } from '@/lib/tiktokAnfrage';
import { zonenBild } from '@/lib/zonenBild';
import { GET as szeneAbruf } from '@/app/api/szene-stats/route';
import { lanEintraege } from '@/lib/preisgeld';
import { jahrVonSaison } from '@/lib/saisonJahre';
import { liesVerdienstArchiv } from '@/lib/verdienstArchiv';
import { cupNameAusKennung } from '@/lib/rundenName';
import { spielerKontext } from '@/lib/globalsSolos';
import { liesJson } from '@/lib/ablage';

/*
 * Plakate zum Posten (Betreiber, 21.10.2026): "ein Plakat im eigenen Stil und mit anderer Anordnung fuer Team Stats bzw. Solo Stats, fuer Standings, fuer Finals und andere
 * Statistiken - unter Posts, erstellbar, und es soll immer wieder kommen". 1600 x 900, dunkler Grund und Blau wie die Seite, Anzeigeschrift Bricolage, Text Figtree.
 *
 *   GET ?art=spieler&event=..&windows=a,b&team=<teamId>|&q=<name>   Stats eines Spielers oder Teams: sechs Werte und Platz fuer Platz die Matches
 *   GET ?art=standings&event=..&windows=..&anzahl=10                 die Besten einer Bestenliste mit Foto, Punkten, Siegen, Eliminierungen
 *   GET ?art=finale&event=..&windows=..&preis=$253,500               der Sieger gross, dahinter die naechsten Plaetze
 *   GET ?art=top5&region=EU&liste=verdienst&jahr=2026                Top 5 einer Statistik (wie das TikTok-Video)
 *   GET ?art=zonen&window=<Spieltag>&alle=1                         die Zonen jedes Games (alle=1: alle Tage des Finales, Tag 1 schwarz, Tag 2 rot)
 *   GET ?art=earnings&q=<Name>|&id=<Konto>                           Preisgeld eines Spielers Jahr fuer Jahr seit 2019 (Zeitstrahl wie bei Swizzy)
 *   &titel=..&stufe=..&region=..&datum=..                            die Kopfzeilen (kommen von der Seite /admin/plakate)
 *   &format=json                                                     statt des Bildes ein Beitragstext mit den X-Konten (und die Teams)
 *
 * Nur fuer den Admin: jede Abfrage holt Bestenlisten bei Epic und rechnet Bilder - das gehoert nicht in fremde Hand.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const B = 1600; const H = 900;
const BLAU = '#38bdf8';
const GOLD = '#f5b301';
const MED = ['#f5b301', '#cbd5e1', '#fb923c'];

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

const zahl = (n: number) => Math.round(n).toLocaleString('en-US');
const FAMILIE = 'Bricolage, Figtree, sans-serif';
const nameGross = (s: string) => s.toUpperCase();
const kuerze = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Bilder { foto: Map<string, string | null>; flagge: Map<string, string | null>; logo: string | null }

/** Das Foto eines Spielers - Quadrat mit Rundung, Gesicht nach fotoFokus; ohne Foto eine dunkle Flaeche mit dem Zeichen einer Person. */
function foto(s: PlakatSpieler, b: Bilder, w: number, h: number, radius = 16) {
  const d = b.foto.get(s.id + '|' + (s.bild ?? ''));
  return (
    <div style={{ display: 'flex', position: 'relative', width: w, height: h, borderRadius: radius, overflow: 'hidden', background: 'linear-gradient(160deg,#17406e 0%,#0d1d35 100%)' }}>
      {d
        ? <img src={d} width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, objectFit: 'cover', objectPosition: fokusVon(s.bild) }} />
        : (
          <svg width={w} height={h} viewBox="0 0 100 100" style={{ position: 'absolute', left: 0, top: 0 }}>
            <circle cx="50" cy="38" r="17" fill="rgba(255,255,255,0.14)" />
            <path d="M16 96c0-19 15-33 34-33s34 14 34 33z" fill="rgba(255,255,255,0.14)" />
          </svg>
        )}
    </div>
  );
}

function flagge(land: string | null, b: Bilder, w = 40, h = 28) {
  const d = land ? b.flagge.get(land.toLowerCase()) : null;
  if (!d) return null;
  return <img src={d} width={w} height={h} style={{ width: w, height: h, borderRadius: 5, objectFit: 'cover', marginRight: 8 }} />;
}

const marke = (b: Bilder, groesse = 30, url = false) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
    {b.logo && <div style={{ display: 'flex', width: Math.round(groesse * 1.4), height: groesse, flexShrink: 0 }}><img src={b.logo} width={Math.round(groesse * 1.4)} height={groesse} style={{ width: Math.round(groesse * 1.4), height: groesse, objectFit: 'contain' }} /></div>}
    <div style={{ display: 'flex', fontSize: groesse, fontWeight: 800, letterSpacing: 1, flexShrink: 0 }}>
      <div style={{ display: 'flex', color: BLAU }}>COMP</div><div style={{ display: 'flex' }}>HUB</div>
    </div>
    {url && <div style={{ display: 'flex', fontSize: Math.round(groesse * 0.75), color: '#64748b', marginLeft: 6, flexShrink: 0 }}>thecomphub.com</div>}
  </div>
);

/** Die Adresse klein unten rechts - auf jedem Plakat dieselbe Stelle. */
const adresse = (
  <div style={{ position: 'absolute', right: 48, bottom: 12, display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 2, color: '#64748b' }}>thecomphub.com</div>
);

/** Die Schriftgroesse eines Titels nach seiner Laenge - Platz und Zeilen, die er einnehmen darf, stehen beim Aufrufer. */
const titelGr = (t: string, gross: number) => (t.length <= 22 ? gross : t.length <= 30 ? Math.round(gross * 0.86) : t.length <= 40 ? Math.round(gross * 0.74) : Math.round(gross * 0.64));

const grund = (kinder: React.ReactNode) => (
  <div style={{ display: 'flex', width: B, height: H, position: 'relative', background: 'linear-gradient(135deg,#04070d 0%,#0a1324 55%,#06101f 100%)', color: '#fff', fontFamily: 'Figtree, sans-serif', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: -260, top: -300, width: 980, height: 980, borderRadius: 490, background: 'radial-gradient(circle, rgba(14,165,233,0.26), rgba(14,165,233,0) 70%)', display: 'flex' }} />
    <div style={{ position: 'absolute', right: -300, bottom: -380, width: 900, height: 900, borderRadius: 450, background: 'radial-gradient(circle, rgba(99,102,241,0.16), rgba(99,102,241,0) 70%)', display: 'flex' }} />
    {kinder}
    {adresse}
  </div>
);

/* ------------------------------------------------------------------ Spieler / Team */

/** Die Fotos eines Teams nebeneinander - jedes in eigener Kachel, hoch genug, dass das Gesicht ganz zu sehen ist (nicht zu schmalen Streifen zerquetscht). */
function fotoReihe(spieler: PlakatSpieler[], b: Bilder, breite: number, hoehe: number, abstand = 8) {
  const n = Math.max(1, spieler.length);
  const fw = Math.floor((breite - abstand * (n - 1)) / n);
  return (
    <div style={{ display: 'flex', width: breite, height: hoehe, gap: abstand }}>
      {spieler.map((s, i) => {
        const d = b.foto.get(s.id + '|' + (s.bild ?? ''));
        return (
          <div key={i} style={{ display: 'flex', position: 'relative', width: fw, height: hoehe, overflow: 'hidden', background: 'linear-gradient(160deg,#17406e 0%,#0d1d35 100%)' }}>
            {d
              ? <img src={d} width={fw} height={hoehe} style={{ position: 'absolute', left: 0, top: 0, width: fw, height: hoehe, objectFit: 'cover', objectPosition: fokusVon(s.bild) }} />
              : (
                <svg width={fw} height={hoehe} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', left: 0, top: 0 }}>
                  <circle cx="50" cy="38" r="17" fill="rgba(255,255,255,0.14)" />
                  <path d="M16 96c0-19 15-33 34-33s34 14 34 33z" fill="rgba(255,255,255,0.14)" />
                </svg>
              )}
          </div>
        );
      })}
    </div>
  );
}

function spielerPlakat(t: PlakatTeam, k: { titel: string; stufe: string; region: string; datum: string }, b: Bilder) {
  const n = t.spieler.length;
  const art = n <= 1 ? 'SOLO STATS' : n === 2 ? 'DUO STATS' : 'TRIO STATS';
  const namen = t.spieler.map((s) => nameGross(s.name));
  // Links die Fotos - so hoch, dass man jedes Gesicht erkennt (Betreiber, 26.10.2026: "man muss die Spieler schon erkennen koennen"); darunter Platz, Flaggen und Namen.
  const PW = 600; const PH = 804;
  const FOTOH = n <= 1 ? 500 : n === 2 ? 430 : 400;
  const RX = 48 + PW + 40; const RB = B - 48 - RX;
  const kw = Math.floor((RB - 48) / 3);
  const kachel = (l: string, w: string, hell = false, gold = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: kw, height: 150, borderRadius: 22, padding: '22px 24px', justifyContent: 'space-between', background: hell ? 'linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%)' : 'rgba(255,255,255,0.06)', border: hell ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.12)' }}>
      <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 3, color: hell ? '#e0f2fe' : '#94a3b8' }}>{l}</div>
      <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 72, fontWeight: 800, lineHeight: 1, color: gold ? GOLD : '#fff' }}>{w}</div>
    </div>
  );

  const m = t.matches.slice(0, 12);
  const feld = feldGroesse(n);
  const balkenH = 128;
  const spalte = m.length ? Math.min(96, Math.floor((RB - 44 - 8 * (m.length - 1)) / m.length)) : 70;
  const nameGr = n === 1 ? (namen[0].length > 14 ? 52 : namen[0].length > 9 ? 62 : 74) : n === 2 ? 46 : 38;
  const medaille = t.rang <= 3 ? MED[t.rang - 1] : '#fff';

  return grund(
    <>
      <div style={{ position: 'absolute', left: 48, top: 48, width: PW, height: PH, display: 'flex', flexDirection: 'column', borderRadius: 32, overflow: 'hidden', background: '#0f1d38', border: '2px solid rgba(255,255,255,0.14)' }}>
        {fotoReihe(t.spieler, b, PW, FOTOH)}
        <div style={{ position: 'absolute', left: 0, top: FOTOH - 120, width: PW, height: 120, display: 'flex', background: 'linear-gradient(0deg, rgba(15,29,56,0.95) 0%, rgba(15,29,56,0) 100%)' }} />
        <div style={{ position: 'absolute', left: 28, right: 24, top: FOTOH + 18, bottom: 22, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', width: 210, fontFamily: FAMILIE, fontSize: t.rang >= 10 ? 96 : 128, fontWeight: 800, lineHeight: 1, color: medaille }}>{`#${t.rang}`}</div>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
            <div style={{ display: 'flex', marginBottom: 10 }}>{t.spieler.map((s, i) => <div key={i} style={{ display: 'flex' }}>{flagge(s.land, b, 44, 30)}</div>)}</div>
            {namen.map((nm, i) => <div key={i} style={{ display: 'flex', fontFamily: FAMILIE, fontSize: nameGr, fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{kuerze(nm, 16)}</div>)}
          </div>
        </div>
      </div>

      {/* rechts: Kopf */}
      <div style={{ position: 'absolute', left: RX, top: 44, width: RB, height: 150, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: RB - 260 }}>
          <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: titelGr(k.titel, 52), fontWeight: 800, lineHeight: 1.05, maxHeight: 112, overflow: 'hidden' }}>{kuerze(k.titel, 56)}</div>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: BLAU, letterSpacing: 3, textTransform: 'uppercase', marginTop: 10, whiteSpace: 'nowrap', overflow: 'hidden' }}>{kuerze([k.stufe, k.region, k.datum].filter(Boolean).join(' · '), 40)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14, flexShrink: 0, width: 250 }}>
          {marke(b, 26)}
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 800, letterSpacing: 4, color: BLAU, border: '2px solid rgba(56,189,248,0.6)', borderRadius: 999, padding: '5px 18px', whiteSpace: 'nowrap' }}>{art}</div>
        </div>
      </div>

      {/* sechs Werte */}
      <div style={{ position: 'absolute', left: RX, top: 214, width: RB, display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {kachel('POINTS', zahl(t.punkte), true)}
        {kachel('MATCHES', String(t.spiele))}
        {kachel('WINS', String(t.siege), false, t.siege > 0)}
        {kachel('ELIMS', String(t.elims))}
        {kachel('AVG ELIMS', t.avgElims.toFixed(1))}
        {kachel('AVG PLACE', t.avgPlatz ? t.avgPlatz.toFixed(1) : '-')}
      </div>

      {/* Match fuer Match */}
      <div style={{ position: 'absolute', left: RX, top: 568, width: RB, height: 284, display: 'flex', flexDirection: 'column', borderRadius: 26, padding: '18px 22px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, letterSpacing: 3, color: '#94a3b8' }}>
          <span>GAME BY GAME</span><span style={{ color: '#64748b' }}>PLACE · ELIMS</span>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'flex-end', justifyContent: m.length < 8 ? 'space-around' : 'flex-start', gap: 8, marginTop: 6 }}>
          {m.map((x, i) => {
            const p = x.platz ?? feld;
            const hoch = Math.max(14, Math.round(balkenH * (1 - (Math.min(p, feld) - 1) / feld)));
            const farbe = p === 1 ? GOLD : p <= 10 ? BLAU : '#3b5b8a';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: spalte }}>
                <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 30, fontWeight: 800, color: p === 1 ? GOLD : '#fff' }}>{x.platz ? `#${x.platz}` : '-'}</div>
                <div style={{ display: 'flex', width: Math.max(30, spalte - 18), height: hoch, borderRadius: 10, marginTop: 6, background: farbe }} />
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginTop: 6 }}>{`${x.elims}`}</div>
                <div style={{ display: 'flex', fontSize: 16, color: '#64748b' }}>{`G${i + 1}`}</div>
              </div>
            );
          })}
          {!m.length && <div style={{ display: 'flex', fontSize: 26, color: '#64748b', paddingBottom: 60 }}>No match data yet</div>}
        </div>
      </div>
    </>,
  );
}

/* ------------------------------------------------------------------ Standings und Finale */

function zeile(t: PlakatTeam, b: Bilder, w: number, h: number) {
  const n = t.spieler.length;
  const ph = h - 28;
  // Hochkant-Kacheln, so breit, dass das Gesicht ganz drauf ist (nicht zu Streifen gequetscht).
  const fb = n === 1 ? ph : Math.round(ph * 0.8);
  const nameGr = n === 1 ? 36 : n === 2 ? 28 : 22;
  return (
    <div key={t.rang} style={{ display: 'flex', alignItems: 'center', width: w, height: h, borderRadius: 24, padding: '0 22px 0 14px', background: t.rang === 1 ? 'linear-gradient(90deg,rgba(245,179,1,0.20) 0%,rgba(255,255,255,0.06) 60%)' : 'rgba(255,255,255,0.06)', border: t.rang === 1 ? '1px solid rgba(245,179,1,0.5)' : '1px solid rgba(255,255,255,0.11)' }}>
      <div style={{ display: 'flex', width: 66, justifyContent: 'center', fontFamily: FAMILIE, fontSize: 46, fontWeight: 800, color: t.rang <= 3 ? MED[t.rang - 1] : '#94a3b8' }}>{t.rang}</div>
      <div style={{ display: 'flex', gap: 5, marginRight: 16, flexShrink: 0 }}>{t.spieler.map((s, i) => <div key={i} style={{ display: 'flex' }}>{foto(s, b, fb, ph, 12)}</div>)}</div>
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
        {t.spieler.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: nameGr, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.12 }}>{flagge(s.land, b, 32, 22)}{kuerze(nameGross(s.name), 14)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 54, fontWeight: 800, color: BLAU, lineHeight: 1 }}>{zahl(t.punkte)}</div>
        <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginTop: 4 }}>{`${t.siege} ${t.siege === 1 ? 'WIN' : 'WINS'} · ${t.elims} ELIMS`}</div>
      </div>
    </div>
  );
}

function standingsPlakat(teams: PlakatTeam[], k: { titel: string; stufe: string; region: string; datum: string }, b: Bilder, anzahl: number) {
  // Immer die Top 10 (Betreiber, 26.10.2026) - wo es weniger gibt, eben weniger.
  const liste = teams.slice(0, 10);
  const proSpalte = Math.ceil(liste.length / 2);
  const zeilenH = proSpalte > 5 ? 106 : 118;
  const spalten = [liste.slice(0, proSpalte), liste.slice(proSpalte)];
  return grund(
    <>
      <div style={{ position: 'absolute', left: 48, top: 40, width: 1504, height: 140, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 1100, flexShrink: 0 }}>
          <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: titelGr(k.titel, 68), fontWeight: 800, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden' }}>{kuerze(k.titel, 64)}</div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: BLAU, letterSpacing: 4, textTransform: 'uppercase', marginTop: 12, whiteSpace: 'nowrap' }}>{kuerze(['Standings', k.stufe, k.region, k.datum].filter(Boolean).join(' · '), 70)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0, width: 300, justifyContent: 'flex-end' }}>{marke(b, 30)}</div>
      </div>
      <div style={{ position: 'absolute', left: 48, top: 196, right: 48, display: 'flex', gap: 24 }}>
        {spalten.map((sp, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 740 }}>{sp.map((t) => zeile(t, b, 740, zeilenH))}</div>
        ))}
      </div>
    </>,
  );
}

function finalePlakat(teams: PlakatTeam[], k: { titel: string; stufe: string; region: string; datum: string; preis: string; wort?: string }, b: Bilder) {
  const sieger = teams[0];
  const rest = teams.slice(1, 6);
  const n = sieger?.spieler.length ?? 1;
  // Die Fotos des Siegers in eigenen Kacheln, hoch genug fuer jedes Gesicht; darunter Flaggen, Namen und Punkte (nicht ueber die Gesichter gelegt).
  const PW = 640; const PH = 804;
  const FOTOH = n <= 1 ? 500 : n === 2 ? 430 : 400;
  const namen = (sieger?.spieler ?? []).map((s) => nameGross(s.name));
  const nameGr = n === 1 ? (namen[0].length > 12 ? 56 : 72) : n === 2 ? 44 : 36;
  return grund(
    <>
      <div style={{ position: 'absolute', left: 48, top: 48, width: PW, height: PH, display: 'flex', flexDirection: 'column', borderRadius: 32, overflow: 'hidden', background: '#0f1d38', border: '2px solid rgba(245,179,1,0.6)' }}>
        {fotoReihe(sieger?.spieler ?? [], b, PW, FOTOH)}
        <div style={{ position: 'absolute', left: 24, top: 22, display: 'flex', fontSize: 26, fontWeight: 800, letterSpacing: 8, color: '#0b1220', background: GOLD, borderRadius: 999, padding: '8px 24px' }}>{k.wort ?? 'WINNER'}</div>
        <div style={{ position: 'absolute', left: 30, right: 30, top: FOTOH + 20, bottom: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', marginBottom: 10 }}>{(sieger?.spieler ?? []).map((s, i) => <div key={i} style={{ display: 'flex' }}>{flagge(s.land, b, 48, 33)}</div>)}</div>
          {namen.map((nm, i) => <div key={i} style={{ display: 'flex', fontFamily: FAMILIE, fontSize: nameGr, fontWeight: 800, lineHeight: 1.02, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{kuerze(nm, 16)}</div>)}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
            <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 70, fontWeight: 800, color: GOLD, lineHeight: 1 }}>{zahl(sieger?.punkte ?? 0)}</div>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: '#cbd5e1' }}>{`PTS · ${sieger?.siege ?? 0} ${sieger?.siege === 1 ? 'WIN' : 'WINS'} · ${sieger?.elims ?? 0} ELIMS`}</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 724, top: 48, width: 828, height: 130, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 540 }}>
          <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: titelGr(k.titel, 50), fontWeight: 800, lineHeight: 1.05, maxHeight: 104, overflow: 'hidden' }}>{kuerze(k.titel, 52)}</div>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: BLAU, letterSpacing: 3, textTransform: 'uppercase', marginTop: 10, whiteSpace: 'nowrap' }}>{kuerze([k.stufe || 'Finals', k.region, k.datum].filter(Boolean).join(' · '), 40)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0, width: 250, justifyContent: 'flex-end' }}>{marke(b, 24)}</div>
      </div>
      <div style={{ position: 'absolute', left: 724, top: 196, display: 'flex', flexDirection: 'column', gap: 11 }}>{rest.map((t) => zeile(t, b, 828, 104))}</div>
      {k.preis && (
        <div style={{ position: 'absolute', left: 724, top: 800, width: 828, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, padding: '0 24px', background: 'rgba(14,165,233,0.14)', border: '1px solid rgba(56,189,248,0.4)' }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 4, color: '#7dd3fc' }}>PRIZE POOL</div>
          <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 34, fontWeight: 800, color: '#fff' }}>{k.preis}</div>
        </div>
      )}
    </>,
  );
}

/* ------------------------------------------------------------------ Top 5 einer Statistik */

interface Top5 { titel: string; unter: string; zeilen: Array<{ rang: number; name: string; wert: string; einheit: string; beschreibung: string; land: string | null; bild: string | null }> }

function top5Plakat(d: Top5, b: Bilder) {
  return grund(
    <>
      <div style={{ position: 'absolute', left: 64, top: 64, width: 520, display: 'flex', flexDirection: 'column' }}>
        {marke(b, 30, true)}
        <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 170, fontWeight: 800, lineHeight: 0.95, color: BLAU, marginTop: 70, whiteSpace: 'nowrap' }}>TOP 5</div>
        <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 56, fontWeight: 800, lineHeight: 1.08, marginTop: 24 }}>{d.titel}</div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: 4, color: '#94a3b8', textTransform: 'uppercase', marginTop: 18 }}>{d.unter}</div>
      </div>
      <div style={{ position: 'absolute', left: 640, top: 48, width: 912, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {d.zeilen.map((z) => {
          const f = b.foto.get(`top|${z.rang}`);
          return (
            <div key={z.rang} style={{ display: 'flex', alignItems: 'center', height: 148, borderRadius: 26, padding: '0 28px 0 18px', background: z.rang === 1 ? 'linear-gradient(90deg,rgba(245,179,1,0.20) 0%,rgba(255,255,255,0.06) 60%)' : 'rgba(255,255,255,0.06)', border: z.rang === 1 ? '1px solid rgba(245,179,1,0.5)' : '1px solid rgba(255,255,255,0.11)' }}>
              <div style={{ display: 'flex', width: 70, justifyContent: 'center', fontFamily: FAMILIE, fontSize: 56, fontWeight: 800, color: z.rang <= 3 ? MED[z.rang - 1] : '#94a3b8' }}>{z.rang}</div>
              <div style={{ display: 'flex', position: 'relative', width: 112, height: 112, borderRadius: 18, overflow: 'hidden', marginRight: 22, background: 'linear-gradient(160deg,#17406e 0%,#0d1d35 100%)' }}>
                {f && <img src={f} width={112} height={112} style={{ position: 'absolute', left: 0, top: 0, width: 112, height: 112, objectFit: 'cover', objectPosition: fokusVon(z.bild) }} />}
              </div>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 42, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1 }}>{flagge(z.land, b, 36, 25)}{kuerze(z.name, 16)}</div>
                <div style={{ display: 'flex', fontSize: 20, color: '#94a3b8', marginTop: 6, maxWidth: 520 }}>{kuerze(z.beschreibung, 54)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 58, fontWeight: 800, color: BLAU, lineHeight: 1 }}>{z.wert}</div>
                <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, color: '#94a3b8', letterSpacing: 3, marginTop: 4 }}>{z.einheit}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>,
  );
}

/* ------------------------------------------------------------------ Earnings-Zeitstrahl */

/*
 * Das Preisgeld eines Spielers Jahr fuer Jahr (Aufgabe 160, Betreiber 26.10.2026: "Earnings-Zeitstrahl 2019 bis 2026 wie bei Swizzy").
 * Je Jahr die Zahl aus der Preisgeld-Liste der Statistik ("Meistes Preisgeld", vom stuendlichen Lauf vorgerechnet - Epics Spieltage liest der
 * Server selbst nicht), dazu LANs, die dort noch nicht zaehlen, weil ihre Preisliste nicht ganz zugeordnet ist, wo dieser Spieler zugeordnet ist.
 * Die groessten Zahltage kommen aus der Verdienst-Akte, dem Profil und den LAN-Listen. Geschaetzt wird nichts.
 */
const ERSTES_JAHR = 2019;

interface Zeitstrahl {
  name: string; land: string | null; bild: string | null;
  jahre: Array<{ jahr: number; betrag: number }>;
  gesamt: number;
  groesste: Array<{ titel: string; datum: number | null; betrag: number }>;
}

/** Name oder Konto-Id -> Konto: zuerst die Profis mit Foto, dann das Namensverzeichnis. */
async function kontoZu(q: string): Promise<string | null> {
  if (/^[0-9a-f]{32}$/i.test(q)) return q.toLowerCase();
  const k = (x: unknown) => String(x ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
  const ziel = k(q);
  if (!ziel) return null;
  const bilder = await liesJson<Array<{ epicId?: string; name?: string; turniername?: string; matches?: number }>>('spielerbilder.json', []);
  const genau = bilder.filter((x) => x.epicId && [x.name, x.turniername].some((n) => k(n) === ziel || k(String(n ?? '').replace(/^\S{1,5}\s+/, '').replace(/\s+\d+\D*$/, '')) === ziel));
  const teil = genau.length ? genau : bilder.filter((x) => x.epicId && [x.name, x.turniername].some((n) => k(n).includes(ziel)));
  const bester = teil.sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0))[0];
  if (bester?.epicId) return bester.epicId;
  const namen = await liesJson<Record<string, string>>('epic-namen.json', {});
  const treffer = Object.entries(namen).filter(([, n]) => k(n) === ziel);
  return treffer.length === 1 ? treffer[0][0] : null;
}

async function zeitstrahlDaten(id: string, ursprung: string): Promise<Zeitstrahl> {
  const bis = new Date().getUTCFullYear();
  const jahre: Zeitstrahl['jahre'] = [];
  for (let jahr = ERSTES_JAHR; jahr <= bis; jahr += 1) {
    const r = await szeneAbruf(new Request(`${ursprung}/api/szene-stats?ansicht=jahr&jahr=${jahr}&liste=verdienst`) as never);
    const j = await r.json() as { plaetze?: Array<{ epicId: string; verdienst?: number }> };
    if (!Array.isArray(j.plaetze)) throw new Error(`Die Preisgeld-Liste ${jahr} ist gerade nicht erreichbar.`);
    jahre.push({ jahr, betrag: j.plaetze.find((x) => x.epicId === id)?.verdienst ?? 0 });
  }
  // Die groessten Zahltage: ein Spieltag zaehlt einmal (der hoechste Betrag je Fenster).
  const posten = new Map<string, { titel: string; datum: number | null; betrag: number }>();
  const dazu = (w: string, x: { titel: string; datum: number | null; betrag: number }) => { if (x.betrag > (posten.get(w)?.betrag ?? 0)) posten.set(w, x); };
  for (const e of (await liesVerdienstArchiv()).konten[id] ?? []) dazu(e[0], { titel: cupNameAusKennung(e[0]) || e[0], datum: Date.parse(e[2]) || null, betrag: e[5] });
  for (const e of await lanEintraege()) {
    const x = e.spieler.find((sp) => sp.epicId === id);
    if (!x) continue;
    dazu(e.fenster, { titel: e.name, datum: e.datum ? Date.parse(e.datum) : null, betrag: x.betrag });
    // LANs, die die Jahresliste noch nicht zaehlt (Preisliste nicht ganz zugeordnet) - fuer diesen Spieler ist der Betrag belegt.
    if (e.offen?.length) { const jj = jahre.find((j) => j.jahr === jahrVonSaison(e.season)); if (jj) jj.betrag += x.betrag; }
  }
  try {
    const pr = await (await szeneAbruf(new Request(`${ursprung}/api/szene-stats?spieler=${id}`) as never)).json() as {
      verlauf?: Array<{ event?: string; windowId: string; datum?: number | null; verdienst?: number | null }>;
      epicZeilen?: Array<{ windowId: string; datum?: number | null; verdienst?: number | null }>;
    };
    const zeilen: Array<{ event?: string; windowId: string; datum?: number | null; verdienst?: number | null }> = [...(pr.verlauf ?? []), ...(pr.epicZeilen ?? [])];
    for (const z of zeilen) {
      if (!z.verdienst) continue;
      const lesbar = z.event && /\s/.test(z.event) ? z.event : cupNameAusKennung(z.windowId) || z.windowId;
      dazu(z.windowId, { titel: lesbar, datum: z.datum ?? null, betrag: z.verdienst });
    }
  } catch { /* ohne Profil bleiben Akte und LANs */ }
  const kontext = await spielerKontext();
  const profil = kontext(id, '');
  // Ein Foto in voller Groesse statt des kleinen Vorschaubilds.
  const bilder = await liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []);
  const datei = bilder.find((x) => x.epicId === id && x.echtesFoto)?.datei;
  return {
    name: profil.anzeige || profil.name || id.slice(0, 8), land: profil.land, bild: datei ? `/spielerbilder/${encodeURIComponent(datei)}` : profil.bild,
    jahre, gesamt: jahre.reduce((a, j) => a + j.betrag, 0),
    groesste: [...posten.values()].sort((a, b) => b.betrag - a.betrag).slice(0, 3),
  };
}

const geld = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${zahl(n)}`);
const monat = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase() : '');

function zeitstrahlPlakat(d: Zeitstrahl, b: Bilder) {
  const f = b.foto.get('zeit|foto');
  const max = Math.max(1, ...d.jahre.map((j) => j.betrag));
  const bestes = d.jahre.reduce((a, j) => (j.betrag > a.betrag ? j : a), d.jahre[0]);
  const HOCH = 330; const BREITE = 912; const n = d.jahre.length;
  const spalte = Math.floor(BREITE / n);
  return grund(
    <>
      {/* Links das Foto, nach rechts in den Grund auslaufend */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 600, height: H, display: 'flex' }}>
        {f && <img src={f} width={600} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 600, height: H, objectFit: 'cover', objectPosition: fokusVon(d.bild) }} />}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 600, height: H, display: 'flex', background: 'linear-gradient(90deg,rgba(4,7,13,0) 35%,rgba(6,12,24,0.92) 88%,#07101f 100%)' }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: 600, height: 540, display: 'flex', background: 'linear-gradient(180deg,rgba(4,7,13,0) 0%,rgba(4,7,13,0.8) 40%,rgba(4,7,13,0.97) 68%)' }} />
        <div style={{ position: 'absolute', left: 56, top: 56, display: 'flex' }}>{marke(b, 30)}</div>
        <div style={{ position: 'absolute', left: 56, bottom: 70, width: 520, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 6, color: '#94a3b8' }}>CAREER EARNINGS</div>
          <div style={{ display: 'flex', alignItems: 'center', fontFamily: FAMILIE, fontSize: 92, fontWeight: 800, lineHeight: 1, marginTop: 10, textTransform: 'uppercase' }}>{flagge(d.land, b, 64, 44)}{kuerze(nameGross(d.name), 11)}</div>
          <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 104, fontWeight: 800, color: BLAU, lineHeight: 1, marginTop: 14 }}>${zahl(d.gesamt)}</div>
        </div>
      </div>

      {/* Rechts die Jahre */}
      <div style={{ position: 'absolute', left: 640, top: 64, width: BREITE, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 5, color: '#94a3b8' }}>PRIZE MONEY BY YEAR</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: HOCH + 70, marginTop: 26, borderBottom: '2px solid rgba(255,255,255,0.14)' }}>
          {d.jahre.map((j) => {
            const h = j.betrag > 0 ? Math.max(6, Math.round((j.betrag / max) * HOCH)) : 0;
            const gold = j.jahr === bestes.jahr && j.betrag > 0;
            return (
              <div key={j.jahr} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: spalte, height: HOCH + 70 }}>
                <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: gold ? GOLD : j.betrag ? '#e2e8f0' : '#475569', marginBottom: 10 }}>{j.betrag ? geld(j.betrag) : '–'}</div>
                <div style={{ display: 'flex', width: spalte - 34, height: h, borderRadius: '14px 14px 0 0', background: gold ? 'linear-gradient(180deg,#fcd34d 0%,#f5b301 100%)' : 'linear-gradient(180deg,#7dd3fc 0%,#0ea5e9 100%)' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', marginTop: 12 }}>
          {d.jahre.map((j) => (
            <div key={j.jahr} style={{ display: 'flex', width: spalte, justifyContent: 'center', fontFamily: FAMILIE, fontSize: 30, fontWeight: 800, color: j.jahr === bestes.jahr && j.betrag > 0 ? GOLD : '#cbd5e1' }}>{j.jahr}</div>
          ))}
        </div>

        {/* Die drei groessten Zahltage */}
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 5, color: '#94a3b8', marginTop: 40 }}>BIGGEST PAYDAYS</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          {d.groesste.map((g, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', width: Math.floor((BREITE - 32) / 3), padding: '16px 20px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.11)' }}>
              <div style={{ display: 'flex', fontFamily: FAMILIE, fontSize: 40, fontWeight: 800, color: i === 0 ? GOLD : BLAU, lineHeight: 1 }}>${zahl(g.betrag)}</div>
              <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, marginTop: 8, lineHeight: 1.2 }}>{kuerze(g.titel, 34)}</div>
              <div style={{ display: 'flex', fontSize: 17, color: '#94a3b8', marginTop: 4 }}>{monat(g.datum)}</div>
            </div>
          ))}
        </div>
      </div>
    </>,
  );
}

/* ------------------------------------------------------------------ die Abfrage */

export async function GET(request: Request) {
  // Der Admin - oder der Ablauf der Ergebnis-Posts mit dem Bot-Schluessel/CRON_SECRET im Kopf (Standings-Plakat als Bild des Posts).
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const ablauf = !!bearer && [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].some((x) => (x ?? '').trim() === bearer);
  if (!ablauf && !await istAdminAnfrage(request)) return new Response('nur fuer den Admin', { status: 403 });
  const p = new URL(request.url).searchParams;
  const ursprung = new URL(request.url).origin;
  const art = p.get('art') ?? 'spieler';
  const nurText = p.get('format') === 'json';
  const kopf = {
    titel: (p.get('titel') ?? '').slice(0, 90), stufe: (p.get('stufe') ?? '').slice(0, 40), region: (p.get('region') ?? '').slice(0, 20),
    datum: (p.get('datum') ?? '').slice(0, 30), preis: (p.get('preis') ?? '').slice(0, 24),
  };

  try {
    if (art === 'zonen') {
      const z = await zonenBild(p.get('window') ?? '', { alleTage: p.get('alle') === '1', ursprung });
      if (!z) return Response.json({ ok: false, fehler: 'Zu diesem Spieltag gibt es keine ausgewerteten Replays.' }, { status: 200 });
      if (nurText) return Response.json({ ok: true, text: `${z.titel} - zones of every game`, games: z.games, mitZone: z.mitZone });
      return new Response(new Uint8Array(z.png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=120' } });
    }
    // Fotos, Flaggen, Logo und Schriften
    const [logo, bricolage, figtree] = await Promise.all([bildDaten('/logos/CompHub-Logo-frei.png', ursprung, 200), schrift('Bricolage Grotesque', 800), schrift('Figtree', 700)]);
    const fonts = [
      ...(bricolage ? [{ name: 'Bricolage', data: bricolage, weight: 800 as const }] : []),
      ...(figtree ? [{ name: 'Figtree', data: figtree, weight: 700 as const }] : []),
    ];
    const b: Bilder = { foto: new Map(), flagge: new Map(), logo };
    const lade = async (spieler: PlakatSpieler[]) => {
      await Promise.all(spieler.flatMap((s) => [
        (async () => { const k = s.id + '|' + (s.bild ?? ''); if (!b.foto.has(k)) b.foto.set(k, await bildDaten(s.bild, ursprung, 720)); })(),
        (async () => { const l = (s.land ?? '').toLowerCase(); if (l && !b.flagge.has(l)) b.flagge.set(l, await bildDaten(`/flags/${l}.png`, ursprung, 120)); })(),
      ]));
    };

    let bild: React.ReactElement;
    let text = '';
    if (art === 'earnings') {
      const id = await kontoZu((p.get('id') ?? p.get('q') ?? '').trim());
      if (!id) return Response.json({ ok: false, fehler: 'Diesen Spieler finde ich nicht - Namen wie im Profil eingeben.' }, { status: 200 });
      const d = await zeitstrahlDaten(id, ursprung);
      if (!d.gesamt) return Response.json({ ok: false, fehler: 'Zu diesem Spieler ist kein Preisgeld bekannt.' }, { status: 200 });
      const bestes = d.jahre.reduce((a, j) => (j.betrag > a.betrag ? j : a), d.jahre[0]);
      text = `${d.name}: $${zahl(d.gesamt)} in prize money since ${d.jahre.find((j) => j.betrag > 0)?.jahr ?? ERSTES_JAHR} - best year ${bestes.jahr} with $${zahl(bestes.betrag)}.`;
      if (nurText) return Response.json({ ok: true, text });
      b.foto.set('zeit|foto', await bildDaten(d.bild, ursprung, 900));
      if (d.land) b.flagge.set(d.land.toLowerCase(), await bildDaten(`/flags/${d.land.toLowerCase()}.png`, ursprung, 120));
      bild = zeitstrahlPlakat(d, b);
    } else if (art === 'top5') {
      const jahr = Number(p.get('jahr') ?? new Date().getUTCFullYear());
      const d = await topFuenf({ region: (p.get('region') ?? '').toUpperCase(), liste: p.get('liste') ?? 'verdienst', jahr });
      if (d.keinCup || !d.zeilen?.length) return Response.json({ ok: false, fehler: d.grund ?? 'Keine Daten' }, { status: 200 });
      const zeilen = d.zeilen.map((z) => ({
        rang: z.rang, name: z.namen[0] ?? '', wert: `${z.praefix ?? ''}${z.wertText ?? z.punkte.toLocaleString('en-US')}`, einheit: z.einheit ?? '', beschreibung: z.beschreibung ?? '',
        land: z.laender[0] || null, bild: (z.fotos[0] ?? null) as string | null,
      }));
      await Promise.all(zeilen.map(async (z) => { b.foto.set(`top|${z.rang}`, await bildDaten(z.bild, ursprung, 400)); const l = (z.land ?? '').toLowerCase(); if (l && !b.flagge.has(l)) b.flagge.set(l, await bildDaten(`/flags/${l}.png`, ursprung, 120)); }));
      text = d.text ?? '';
      if (nurText) return Response.json({ ok: true, text });
      bild = top5Plakat({ titel: d.cupName || d.titel || '', unter: d.spieltag || '', zeilen }, b);
    } else {
      const event = p.get('event') ?? '';
      const windows = (p.get('windows') ?? p.get('window') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!event || !windows.length) return Response.json({ ok: false, fehler: 'event und window fehlen' }, { status: 200 });
      const suche = (p.get('q') ?? '').trim();
      const teamId = p.get('team') ?? '';
      const anzahl = 10;
      let teams = await plakatTeams({ ursprung, event, windows, limit: art === 'spieler' && (teamId || suche) ? 200 : 30 });
      if (!teams.length) return Response.json({ ok: false, fehler: 'Zu diesem Spieltag gibt es noch keine Bestenliste.' }, { status: 200 });
      if (art === 'spieler') {
        let t = teamId ? teams.find((x) => x.teamId === teamId) : undefined;
        if (!t && suche) {
          const q = suche.toLowerCase();
          t = teams.find((x) => x.spieler.some((s) => s.name.toLowerCase().includes(q)));
          // Nicht in den ersten 200: gezielt nach dem Namen fragen (die Antwort traegt den echten Platz).
          if (!t) { const g = await plakatTeams({ ursprung, event, windows, suche }); t = g[0]; }
        }
        t ??= teams[0];
        await lade(t.spieler);
        text = plakatText({ art, titel: kopf.titel, stufe: kopf.stufe, team: t });
        if (nurText) return Response.json({ ok: true, text, team: t });
        bild = spielerPlakat(t, kopf, b);
      } else {
        teams = teams.slice(0, art === 'finale' ? 6 : anzahl);
        await lade(teams.flatMap((t) => t.spieler));
        text = plakatText({ art, titel: kopf.titel, stufe: kopf.stufe, teams });
        if (nurText) return Response.json({ ok: true, text, teams });
        // Ein einzelner Tag eines mehrtaegigen Finales (Day 1): der Erste fuehrt, er hat nicht gewonnen - gewonnen hat, wer beide Tage zusammen vorn liegt (Betreiber, 28.10.2026).
        // Preisgeld nur fuer die Gesamtwertung beider Tage, nie unter einem einzelnen Tag (Betreiber, 28.10.2026).
        const einTagEinerReihe = windows.length === 1 && /Day\d+/i.test(windows[0]);
        bild = art === 'finale' ? finalePlakat(teams, { ...kopf, wort: einTagEinerReihe ? 'LEADER' : 'WINNER', preis: einTagEinerReihe ? '' : kopf.preis }, b) : standingsPlakat(teams, kopf, b, anzahl);
      }
    }
    const antwort = new ImageResponse(bild, { width: B, height: H, fonts });
    antwort.headers.set('Cache-Control', 'private, max-age=120');
    return antwort;
  } catch (e) {
    return Response.json({ ok: false, fehler: (e as Error).message }, { status: 200 });
  }
}
