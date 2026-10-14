import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { mapsVerzeichnis } from '@/lib/mapsVerzeichnis';
import { fensterFuer } from '@/lib/globalsSolos';
import { ALT } from '@/lib/alteMaps';

/*
 * Das Kartenbild mit den Laendern (Betreiber, 14.10.2026): "solche Bilder wie das letzte, dieses Kartenbild mit den Laendern, kannst du von alleine
 * erstellen - wenn mehrere Franzosen auf einem Punkt droppen, markierst du das: Franzosen-Ecke".
 *
 * Aus den Landepunkten eines kuerzlich beendeten Cups (die Formen und Spieler, die die Karten-Seite ohnehin zeigt) wird je Form gezaehlt, aus welchem
 * Land ihre Spieler kommen. Stehen drei oder mehr aus demselben Land (und mindestens die Haelfte der Form) in einer Form, ist das eine "Ecke": sie
 * bekommt die Farbe des Landes und eine Marke; der Text des Posts nennt die groessten. Nichts davon ist geraten - Land und Landepunkt kommen aus den
 * Daten des Cups; wer dort ohne Land steht, zaehlt nicht mit.
 *
 * Das Bild selbst entsteht als SVG (Karte darunter, Formen und Namen darauf) und wird mit sharp zu einem PNG, 1200 x 1200 wie das Vorbild.
 */

export interface KartenZone { punkte: Array<{ x: number; y: number }>; namen: string[]; land: string | null; anzahl: number }
export interface KartenPost {
  schluessel: string; titel: string; text: string;
  bild: { art: 'karte'; titel: string; region: string; karte: string | null; zonen: KartenZone[] };
}

const SEITE = 'https://www.thecomphub.com';

/** Grundfarbe je Land (Flaggenfarbe) - fuer die Ecken. Unbekanntes Land: Grau. */
const FARBE: Record<string, string> = {
  FR: '#2a5cff', ES: '#f1bf00', DE: '#ffcc00', PL: '#dc143c', GB: '#c8102e', US: '#3c5fb4', SE: '#2a8fd6', NO: '#ba0c2f', DK: '#e0283c',
  NL: '#ff7a00', IT: '#1fae5b', BE: '#fdda24', PT: '#1f8a3a', TR: '#e30a17', BR: '#18b04f', MX: '#1f9d5b', CA: '#ff3b30', AT: '#ed2939',
  CH: '#d52b1e', CZ: '#2a63b8', FI: '#2f6fe0', RU: '#d52b1e', RO: '#fcd116', UA: '#2a7be0', GR: '#2a7bd6', JP: '#e0143c', KR: '#cd2e3a',
  AU: '#2a4ad0', AR: '#74acdf', SK: '#2a62d0', HU: '#2e9b4a', RS: '#c6363c', BA: '#2a55b0', CL: '#d52b1e', CO: '#fcd116', PE: '#d91023',
  SA: '#1f8a4a', EG: '#c8102e', MA: '#c1272d', ZA: '#1f8a4a', NZ: '#1f3fa0', IE: '#169b62', LT: '#fdb913', LV: '#9e3039', EE: '#2a7be0', BG: '#1f8a4a',
};

const landName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; } };
const demonym: Record<string, string> = {
  FR: 'French', ES: 'Spanish', DE: 'German', PL: 'Polish', GB: 'British', US: 'American', SE: 'Swedish', NO: 'Norwegian', DK: 'Danish', NL: 'Dutch',
  IT: 'Italian', BE: 'Belgian', PT: 'Portuguese', TR: 'Turkish', BR: 'Brazilian', MX: 'Mexican', CA: 'Canadian', AT: 'Austrian', CH: 'Swiss', CZ: 'Czech',
  FI: 'Finnish', RU: 'Russian', RO: 'Romanian', UA: 'Ukrainian', GR: 'Greek', JP: 'Japanese', KR: 'Korean', AU: 'Australian', AR: 'Argentine',
};
const gross = (n: string) => n.toUpperCase();

/**
 * Die Formen eines Fensters in Ecken umrechnen.
 *
 * Eine Ecke ist eine Form, in der mehrere Teams desselben Landes stehen: bei Solos drei oder mehr Spieler aus einem Land, bei Duos und Trios zwei oder
 * mehr Teams (ein einzelnes Trio aus einem Land ist noch keine Ecke - es ist ein Team). Das Land eines Teams ist das, aus dem mindestens die Haelfte seiner
 * Spieler kommt.
 */
function zonen(f: { formen: Array<{ punkte: Array<{ x: number; y: number }>; spieler: string[]; gruppen?: string[][] }>; spieler: Array<{ anzeige: string; land: string | null }> }): KartenZone[] {
  const land = new Map(f.spieler.map((s) => [s.anzeige, (s.land ?? '').toUpperCase() || null]));
  return f.formen.filter((x) => x.punkte.length >= 3 && x.spieler.length > 0).map((x) => {
    const gr = x.gruppen && x.gruppen.length ? x.gruppen : x.spieler.map((n) => [n]);
    const teams = gr.map((t) => {
      const zaehler = new Map<string, number>();
      for (const n of t) { const l = land.get(n); if (l) zaehler.set(l, (zaehler.get(l) ?? 0) + 1); }
      const b = [...zaehler.entries()].sort((a, c) => c[1] - a[1])[0];
      return { n: t.length, land: b && b[1] >= t.length / 2 ? b[0] : null };
    });
    const je = new Map<string, { teams: number; spieler: number }>();
    for (const t of teams) if (t.land) { const e = je.get(t.land) ?? { teams: 0, spieler: 0 }; e.teams += 1; e.spieler += t.n; je.set(t.land, e); }
    const beste = [...je.entries()].sort((a, c) => c[1].spieler - a[1].spieler)[0];
    const mindestens = teams.every((t) => t.n === 1) ? 3 : 2;
    const ecke = !!beste && beste[1].teams >= mindestens;
    return { punkte: x.punkte, namen: x.spieler.map(gross), land: ecke ? beste[0] : null, anzahl: ecke ? beste[1].spieler : 0 };
  });
}

/** Posts aus den juengsten beendeten Cups mit Landepunkten. */
export async function kartenKandidaten(): Promise<KartenPost[]> {
  const raus: KartenPost[] = [];
  try {
    const jetzt = Date.now();
    const liste = (await mapsVerzeichnis())
      .filter((e) => !e.turnierId.startsWith(ALT) && e.datum && (e.ende ?? (e.datum as number) + 4 * 3600_000) < jetzt && jetzt - (e.datum as number) < 30 * 86_400_000)
      .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0)).slice(0, 5);
    for (const e of liste) {
      try {
        const r = await fensterFuer(e.turnierId, e.region, e.windowId);
        if (!r || r.fenster.formen.length < 6) continue;
        const z = zonen(r.fenster);
        const ecken = z.filter((x) => x.land).sort((a, b) => b.anzahl - a.anzahl);
        // Manche Eintraege tragen nur "Fortnite" als Titel (Performance Cups): dann Cup und Spieltag, mit dem Datum, damit zwei Wochen nicht gleich heissen.
        const roh = e.titel.replace(/\s*·\s*/g, ' - ');
        const datumKurz = new Date(e.datum as number).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Brussels' });
        const titel = roh.toLowerCase().includes((e.cup ?? '').toLowerCase().split(' ')[0]) && roh.length > 9 ? roh : `${e.cup} - ${e.fenster} (${datumKurz})`;
        const aufgezaehlt = ecken.slice(0, 2).map((x) => {
          const adj = demonym[x.land as string];
          return `The ${adj ?? landName(x.land as string)} corner: ${x.anzahl} ${adj ? `${adj} players` : `players from ${landName(x.land as string)}`} landed in the same spot.`;
        });
        raus.push({
          schluessel: `karte:${e.windowId}`, titel: `Karte: ${titel}`,
          text: `Where the teams dropped at ${titel}.${aufgezaehlt.length ? `\n\n${aufgezaehlt.join('\n')}` : ''}\n\nEvery landing spot, every team: ${SEITE}/tournament-maps/karte?t=${encodeURIComponent(e.turnierId)}&r=${encodeURIComponent(e.region)}&w=${encodeURIComponent(e.windowId)}`,
          bild: { art: 'karte', titel, region: e.region, karte: r.fenster.bild ?? null, zonen: z },
        });
      } catch { /* ohne Landepunkte faellt dieser Cup weg */ }
    }
  } catch { /* ohne Verzeichnis keine Kartenposts */ }
  return raus;
}

/* ------------------------------------------------------------------ Zeichnen */

async function laden(quelle: string | null, ursprung: string, breite: number): Promise<Buffer | null> {
  if (!quelle) return null;
  try {
    let puffer: Buffer | null = null;
    if (quelle.startsWith('/')) {
      const lokal = path.join(process.cwd(), 'public', decodeURIComponent(quelle.split('?')[0]));
      if (fs.existsSync(lokal)) puffer = fs.readFileSync(lokal);
    }
    if (!puffer) {
      const r = await fetch(quelle.startsWith('/') ? `${ursprung}${quelle}` : quelle, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return null;
      puffer = Buffer.from(await r.arrayBuffer());
    }
    return await sharp(puffer).resize({ width: breite, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch { return null; }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Das PNG zur Karte (1200 x 1200). */
export async function kartenBild(d: KartenPost['bild'], ursprung: string): Promise<Buffer> {
  const G = 1200;
  const [karte, logo] = await Promise.all([
    laden(d.karte, ursprung, G),
    sharp(path.join(process.cwd(), 'public', 'logos', 'CompHub-Logo-frei.png')).resize({ height: 54 }).png().toBuffer().catch(() => null),
  ]);
  const teile: string[] = [];
  teile.push(`<rect width="${G}" height="${G}" fill="#0a2a5a"/>`);
  if (karte) teile.push(`<image href="data:image/jpeg;base64,${karte.toString('base64')}" x="0" y="0" width="${G}" height="${G}" preserveAspectRatio="xMidYMid slice"/>`);
  for (const z of d.zonen) {
    const pts = z.punkte.map((p) => `${(p.x / 100) * G},${(p.y / 100) * G}`).join(' ');
    const farbe = z.land ? (FARBE[z.land] ?? '#6b7280') : '#0b1220';
    teile.push(`<polygon points="${pts}" fill="${farbe}" fill-opacity="${z.land ? 0.55 : 0.5}" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/>`);
    const xs = z.punkte.map((p) => (p.x / 100) * G); const ys = z.punkte.map((p) => (p.y / 100) * G);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const breite = x1 - x0; const hoehe = y1 - y0;
    const langst = Math.max(...z.namen.map((n) => n.length), 4);
    const schrift = Math.max(11, Math.min(30, hoehe / (z.namen.length + 0.6), (breite * 0.92) / (langst * 0.62)));
    const start = (y0 + y1) / 2 - ((z.namen.length - 1) * schrift * 1.12) / 2;
    z.namen.forEach((n, i) => {
      teile.push(`<text x="${(x0 + x1) / 2}" y="${start + i * schrift * 1.12}" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${schrift}" fill="#ffffff" stroke="#05080e" stroke-width="${schrift / 9}" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${esc(n)}</text>`);
    });
    if (z.land && breite > 70) teile.push(`<rect x="${x0 + 6}" y="${y0 + 6}" width="46" height="26" rx="7" fill="#05080e" fill-opacity="0.85"/><text x="${x0 + 29}" y="${y0 + 19.5}" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="15" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${esc(z.land)}</text>`);
  }
  // Kopfband und Fuss
  teile.push(`<rect x="0" y="0" width="${G}" height="86" fill="#05080e" fill-opacity="0.82"/>`);
  teile.push(`<text x="32" y="38" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="32" fill="#ffffff">${esc(d.titel.length > 46 ? `${d.titel.slice(0, 45)}…` : d.titel)}</text>`);
  teile.push(`<text x="32" y="68" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="#38bdf8" letter-spacing="3">WHERE THE TEAMS DROPPED · ${esc(d.region)}</text>`);
  teile.push(`<rect x="0" y="${G - 74}" width="${G}" height="74" fill="#05080e" fill-opacity="0.82"/>`);
  if (logo) teile.push(`<image href="data:image/png;base64,${logo.toString('base64')}" x="28" y="${G - 64}" height="54" preserveAspectRatio="xMinYMid meet"/>`);
  teile.push(`<text x="${logo ? 112 : 32}" y="${G - 29}" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="30" fill="#38bdf8">COMP<tspan fill="#ffffff">HUB</tspan><tspan fill="#64748b" font-size="22" font-weight="700" dx="18">thecomphub.com</tspan></text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${G}" viewBox="0 0 ${G} ${G}">${teile.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
