import { NextResponse } from 'next/server';
import { istKennungName } from '@/lib/kennungName';
import fs from '@/lib/ablageFs';
import path from 'path';
import sharp from 'sharp';
import { DATEN_ORT } from '@/lib/datenOrt';

// Das Fotomosaik zu einem Beitrag.
//
// Unter einer Bestenliste steht auf X ueblicherweise ein breites Bild, in dem
// die genannten Spieler nebeneinander stehen - schmale Hochkant-Streifen ohne
// Fuge dazwischen. Genau das entsteht hier aus den Fotos, die ohnehin schon
// unter public/spielerbilder liegen.
//
//   GET ?ids=<epicId>,<epicId>,…    -> PNG
//
// Erfunden wird nichts: Es kommen nur Konten hinein, zu denen ein echtes Foto
// vorliegt. Wer keins hat, faellt weg, statt mit einer Silhouette aufgefuellt
// zu werden - ein Platzhalter neben vier Portraits sieht aus wie ein Fehler
// und waere in einem oeffentlichen Beitrag peinlich.
//
// Bis zu fuenf stehen nebeneinander. Darueber wird umgebrochen: sechs
// ergeben drei mal zwei, neun drei mal drei, zehn fuenf mal zwei. Mehr als
// zehn nicht - dann ist von einem Gesicht nichts mehr zu erkennen.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VERZEICHNIS = path.join(DATEN_ORT, 'spielerbilder.json');
const BILDER = path.join(process.cwd(), 'public', 'spielerbilder');
const PROFILE = path.join(DATEN_ORT, 'spieler-profile.json');

/**
 * Die gepflegten Anzeigenamen.
 *
 * Unter dem Bild sollen dieselben Namen stehen wie ueberall sonst im
 * Werkzeug. Im Bilderverzeichnis steht der Name, unter dem das Foto einmal
 * abgelegt wurde - der ist heute vielleicht ein anderer, denn ein Profi
 * aendert seinen Ingame-Namen, wann er will. Die Zuordnung haengt an der
 * Konto-Id, und die gilt hier genauso.
 */
async function anzeigeNamen(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();

  /*
   * Von hinten nach vorn, damit das Wichtigere das Schwaechere ueberschreibt.
   *
   * Zuletzt gilt immer der gepflegte Anzeigename. Davor die offene
   * Spielerliste der Szene-Quelle, die den Profinamen fuehrt ("HIGGS"), und
   * ganz zuerst der Hauptname aus dem eigenen Verzeichnis.
   *
   * Warum diese Kette noetig ist: unter dem Bild stand "XSET BatmnBugha",
   * wo "Higgs" gemeint war. Beides sind Turniernamen desselben Kontos, und
   * ohne gepflegtes Profil griff der zuletzt abgelegte - also ein
   * beliebiger. Der Betreiber dazu: "Wenn ich einen Namen als Admin anpasse,
   * dann heisst der immer so."
   */
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8')) as
      Record<string, { haupt?: string; namen?: string[] }>;
    for (const [id, e] of Object.entries(roh)) {
      const name = e.haupt || e.namen?.[0];
      if (/^[0-9a-f]{32}$/.test(id) && name) karte.set(id, name);
    }
  } catch { /* kein Verzeichnis */ }

  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
      Array<{ ID?: string; NAME?: string }>;
    for (const p of roh) if (p.ID && p.NAME && !istKennungName(p.NAME, p.ID)) karte.set(p.ID, p.NAME);
  } catch { /* keine Kopie da */ }

  try {
    const roh = JSON.parse(await fs.readFile(PROFILE, 'utf8')) as
      Record<string, { id?: string; anzeige?: string; name?: string }>;
    for (const [schluessel, p] of Object.entries(roh)) {
      const id = p.id || schluessel;
      const name = p.anzeige || p.name;
      if (/^[0-9a-f]{32}$/.test(id) && name) karte.set(id, name);
    }
  } catch { /* noch keine Profile */ }

  return karte;
}

/** Die Breite steht fest, die Hoehe richtet sich nach dem Raster. */
const BREITE = 2000;
const HOEHE = 1250;

/*
 * In welchem Rahmen sich eine Kachel bewegen darf.
 *
 * Die Fotos liegen zwischen 0,59 und 0,79 im Seitenverhaeltnis. Weicht die
 * Kachel davon stark ab, schneidet der Zuschnitt grosse Teile weg - und
 * zwar genau dort, wo das Gesicht ist:
 *
 *   zu schmal (0,32 bei fuenf Bildern in einer Reihe) -> ueber die Haelfte
 *     der Breite faellt weg, mittig herausgeschnitten. Wer im Foto nicht
 *     mittig steht, verliert sein Gesicht.
 *   zu breit (1,60 bei drei mal drei) -> mehr als die Haelfte der Hoehe
 *     faellt weg. Von oben geschnitten bleibt dann Haar und Stirn, das
 *     Kinn ist ab.
 *
 * Also ein Fenster: nie breiter als hoch, nie schmaler als 0,62. Beides an
 * echten Fotos nachgesehen, nicht gerechnet.
 */
const SCHMALSTE_KACHEL = 0.62;
const BREITESTE_KACHEL = 1.0;

/** Weniger als zwei sind kein Mosaik, mehr als zehn kein Gesicht mehr. */
const MIN = 2;
const MAX = 10;

/**
 * Wie viele Spalten und Reihen bei dieser Anzahl.
 *
 * Bis fuenf bleibt es bei einer Reihe - das ist die Form, die unter einer
 * Bestenliste auf X ueblich ist. Darueber wird umgebrochen, und zwar so,
 * dass das Raster aufgeht und keine Kachel leer bleibt:
 *
 *   6 -> 3x2     7 -> 4x2 (eine Luecke)   8 -> 4x2
 *   9 -> 3x3    10 -> 5x2
 *
 * Sieben ist der einzige Fall mit einer Luecke; sie steht rechts unten und
 * bleibt in der Hintergrundfarbe. Eine krumme Aufteilung waere das
 * kleinere Uebel gegenueber einem gestauchten Gesicht.
 */
/**
 * Ein Raster, das restlos aufgeht.
 *
 * Der Betreiber: "Bei der Bildgenerierung sollen nicht solche grauen Bilder
 * kommen, nur Spieler mit Bildern." Genau das entstand, wenn die Zahl der
 * Fotos nicht in das feste Raster passte - bei sieben Fotos stand ein
 * Viererraster mit zwei Reihen da, und die achte Kachel blieb leer.
 *
 * Deshalb wird die Aufteilung jetzt aus der Zahl der Fotos gerechnet: die
 * meisten Spalten bis fuenf, durch die sich die Zahl restlos teilen laesst.
 * Geht keine auf - sieben ist eine Primzahl -, bleibt lieber ein Foto
 * draussen, als dass ein Loch stehenbleibt. Welches, sagt die Antwort
 * mit.
 */
function raster(n: number): { spalten: number; reihen: number; nutze: number } {
  for (let m = n; m >= 1; m -= 1) {
    if (m <= 5) return { spalten: m, reihen: 1, nutze: m };
    // Breit vor hoch: fuenf nebeneinander liest sich besser als zwei.
    for (let spalten = 5; spalten >= 2; spalten -= 1) {
      if (m % spalten === 0) {
        return { spalten, reihen: m / spalten, nutze: m };
      }
    }
  }
  return { spalten: 1, reihen: 1, nutze: Math.min(1, n) };
}

interface Eintrag {
  datei: string; epicId: string; name: string; echtesFoto?: boolean;
}

async function verzeichnis(): Promise<Map<string, Eintrag>> {
  try {
    const liste = JSON.parse(await fs.readFile(VERZEICHNIS, 'utf8')) as Eintrag[];
    return new Map(liste.filter((e) => e.epicId).map((e) => [e.epicId, e]));
  } catch {
    return new Map();
  }
}

export async function GET(request: Request) {
  try {
    return await baueMosaik(request);
  } catch (e) {
    /*
     * Lieber ein Satz als eine Fehlerseite.
     *
     * Kam hier ein HTML-Fehler heraus, scheiterte in der Oberflaeche das
     * Auslesen des JSON, und uebrig blieb das nichtssagende "kein Bild".
     */
    return NextResponse.json({
      error: 'Das Mosaik ließ sich nicht bauen.',
      hinweis: e instanceof Error ? e.message : String(e),
    }, { status: 424 });
  }
}

/*
 * Das Team-Spotlight als Banner (?form=banner). Der Betreiber (25.9.2026, mit Beispielbild): "so soll das aussehen ... mit den Profilbildern von dem Team,
 * diese Formation, so gross und so breit". Die Spieler stehen nebeneinander im Format 3:1, jeder ein gleich breiter Streifen, in der Mitte das CompHub-Logo
 * mit einem hellen Schein. Bei einer ungeraden Zahl (Trio) stuende das Logo mitten auf einem Gesicht - dann sitzt es kleiner im unteren Drittel.
 */
const BANNER_BREITE = 3000;
const BANNER_HOEHE = 1000;
const LOGO = path.join(process.cwd(), 'public', 'logos', 'CompHub-Logo-frei.png');

async function banner(gewaehlt: Eintrag[], namen: Map<string, string>, uebersprungen: string[]) {
  const n = gewaehlt.length;
  const breite = Math.floor(BANNER_BREITE / n);
  const lagen: sharp.OverlayOptions[] = await Promise.all(gewaehlt.map(async (e, i) => ({
    input: await sharp(path.join(BILDER, e.datei))
      .resize(i === n - 1 ? BANNER_BREITE - breite * (n - 1) : breite, BANNER_HOEHE, { fit: 'cover', position: 'top' })
      .toBuffer(),
    left: i * breite, top: 0,
  })));
  const ungerade = n % 2 === 1;
  const logoHoehe = Math.round(BANNER_HOEHE * (ungerade ? 0.24 : 0.34));
  const logo = await sharp(LOGO).resize({ height: logoHoehe }).png().toBuffer();
  const logoBreite = (await sharp(logo).metadata()).width ?? logoHoehe;
  const mitteY = Math.round(BANNER_HOEHE * (ungerade ? 0.78 : 0.5));
  const schein = Buffer.from(`<svg width="${BANNER_BREITE}" height="${BANNER_HOEHE}" xmlns="http://www.w3.org/2000/svg"><defs>`
    + '<radialGradient id="s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>'
    + '<stop offset="0.4" stop-color="#bae6fd" stop-opacity="0.22"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient></defs>'
    + `<ellipse cx="${BANNER_BREITE / 2}" cy="${mitteY}" rx="${Math.round(logoHoehe * 1.9)}" ry="${Math.round(logoHoehe * 1.25)}" fill="url(#s)"/></svg>`);
  const png = await sharp({ create: { width: BANNER_BREITE, height: BANNER_HOEHE, channels: 3, background: { r: 9, g: 9, b: 11 } } })
    .composite([...lagen, { input: schein, left: 0, top: 0 },
      { input: logo, left: Math.round((BANNER_BREITE - logoBreite) / 2), top: Math.round(mitteY - logoHoehe / 2) }])
    .png({ compressionLevel: 9 }).toBuffer();
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png', 'Content-Length': String(png.length),
      'X-Spieler': encodeURIComponent(gewaehlt.map((e) => namen.get(e.epicId) || e.name).join(' · ')),
      'X-Uebersprungen': encodeURIComponent(uebersprungen.join(', ')),
      'Cache-Control': 'no-store',
    },
  });
}

async function baueMosaik(request: Request) {
  const p = new URL(request.url).searchParams;
  /*
   * Konten, wahlweise nach Teams gruppiert.
   *
   * "a,b,c" sind drei einzelne Konten. "a|b,c|d" sind zwei Duos - und dann
   * gilt: aus jedem Duo hoechstens einer, bevor ueberhaupt ein zweiter
   * Spieler desselben Teams infrage kommt. Ohne das standen bei neun Bildern
   * viereinhalb Teams nebeneinander, jeweils zweimal dieselben Gesichter.
   */
  const gruppen = (p.get('ids') ?? '').split(',')
    .map((x) => x.split('|').map((y) => y.trim()).filter(Boolean))
    .filter((g) => g.length);

  /*
   * Wie viele Streifen.
   *
   * Die Liste kommt mit Vorrat - nicht zu jedem Konto liegt ein Foto. Wie
   * viele am Ende nebeneinander stehen, entscheidet der Beitrag, nicht die
   * Laenge der Liste.
   */
  const wunschZahl = Number(p.get('anzahl'));
  const zahl = Number.isFinite(wunschZahl)
    ? Math.min(MAX, Math.max(MIN, Math.round(wunschZahl))) : MAX;

  if (!gruppen.length) {
    return NextResponse.json({ error: 'keine Konto-Ids' }, { status: 400 });
  }

  const karte = await verzeichnis();
  const namen = await anzeigeNamen();

  /*
   * Erst von jedem Team einer - und zwar der, von dem es ein Foto gibt.
   *
   * Deshalb wird hier und nicht beim Aufrufer sortiert: nur hier ist
   * bekannt, wer ueberhaupt ein echtes Foto hat. Steht vom Erstgenannten
   * keines zur Verfuegung, rueckt sein Partner fuer das Team nach, statt
   * dass das Team ganz herausfaellt. Erst wenn danach noch Platz ist,
   * kommen die uebrigen Spieler dazu.
   */
  const hatFoto = (id: string) => {
    const e = karte.get(id);
    return Boolean(e?.echtesFoto && e.datei);
  };
  const gewuenscht = [
    ...gruppen.map((g) => g.find(hatFoto) ?? g[0]),
    ...gruppen.flat(),
  ];

  /*
   * Die Reihenfolge der Liste bleibt erhalten - Platz eins steht links.
   * Uebersprungen wird, wer kein echtes Foto hat; ein Konto zweimal zu
   * zeigen, nur weil es zweimal in der Liste steht, waere auch verkehrt.
   */
  const vorrat: Eintrag[] = [];
  const gesehen = new Set<string>();
  for (const id of gewuenscht) {
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    const e = karte.get(id);
    if (!e?.echtesFoto || !e.datei) continue;
    vorrat.push(e);
  }

  /*
   * Jetzt erst zuschneiden - und dabei ueberspringen, was sich nicht
   * oeffnen laesst.
   *
   * Vorher wurden erst "zahl" Eintraege gewaehlt und danach alle auf
   * einmal geschnitten. Eine kaputte Datei riss dann das ganze Bild mit,
   * und auf der Seite stand nur "kein Bild". Ein Foto, das sich nicht
   * lesen laesst, ist derselbe Fall wie gar kein Foto: der naechste aus
   * dem Vorrat rueckt nach.
   */
  const gewaehlt: Eintrag[] = [];
  const uebersprungen: string[] = [];
  for (const e of vorrat) {
    if (gewaehlt.length >= zahl) break;
    try {
      await sharp(path.join(BILDER, e.datei)).metadata();
      gewaehlt.push(e);
    } catch {
      uebersprungen.push(e.datei);
    }
  }

  if (gewaehlt.length < MIN) {
    return NextResponse.json({
      error: 'zu wenige Fotos',
      gefunden: gewaehlt.length,
      hinweis: `Für ein Mosaik braucht es mindestens ${MIN} echte Fotos. `
        + 'Wer keins hat, wird nicht durch einen Platzhalter ersetzt.'
        + (uebersprungen.length
          ? ` Nicht lesbar: ${uebersprungen.join(', ')}.` : ''),
    }, { status: 422 });
  }

  if (p.get('form') === 'banner') return banner(gewaehlt, namen, uebersprungen);

  /*
   * Der Zuschnitt.
   *
   * Die Vorlagen sind unterschiedlich gross und unterschiedlich angeschnitten
   * - von 400x500 bis 669x1142, im Verhaeltnis zwischen 0,59 und 0,79. Ein
   * Streifen ist mit 0,32 viel schmaler; "cover" fuellt ihn restlos, ohne zu
   * verzerren, und schneidet dafuer links und rechts weg.
   *
   * Zentriert, nicht nach Auffaelligkeit. Zuerst stand hier sharps
   * "attention" - naheliegend, weil es den auffaelligsten Bereich sucht und
   * das bei einem Portrait das Gesicht sein sollte. Bei fuenf Streifen war
   * das Ergebnis unbrauchbar: einmal fand es die Lehne eines Gaming-Stuhls,
   * zweimal blieb vom Kopf nur die obere Haelfte im Bild.
   *
   * Die Fotos sind bereits als Portraits zugeschnitten, das Gesicht sitzt
   * also ohnehin in der Mitte. Genau dort zu schneiden trifft es zuverlaessig
   * - bei allen fuenf, ohne Ausreisser.
   */
  const { spalten, reihen, nutze } = raster(gewaehlt.length);
  // Was das Raster nicht fuellt, faellt hinten weg - und wird unten benannt.
  const zuviel = gewaehlt.slice(nutze);
  gewaehlt.length = nutze;

  /*
   * Die Kachelgroesse.
   *
   * Gerechnet wird mit ganzen Punkten, sonst entstehen zwischen den Kacheln
   * haarfeine Fugen in der Hintergrundfarbe. Was durch das Abrunden rechts
   * und unten uebrig bleibt, bekommt die jeweils letzte Kachel einer Reihe
   * beziehungsweise Spalte dazu.
   */
  const kachelBreite = Math.floor(BREITE / spalten);
  /*
   * Lieber ein flacheres Bild als ein zerschnittenes Gesicht.
   *
   * Steht nur eine Reihe da, waere die Kachel bei fester Gesamthoehe
   * absurd hochkant. Dann wird das ganze Bild flacher, statt aus jedem
   * Foto einen schmalen Streifen zu saegen.
   */
  const kachelHoehe = Math.min(
    Math.max(
      Math.floor(HOEHE / reihen),
      // Nie breiter als hoch - ein Gesicht braucht ein stehendes Format.
      Math.round(kachelBreite / BREITESTE_KACHEL)),
    // Und nie so schmal, dass links und rechts das halbe Foto wegfaellt.
    Math.round(kachelBreite / SCHMALSTE_KACHEL));
  const gesamtHoehe = kachelHoehe * reihen;
  // Was das Abrunden der Breite uebrig laesst, bekommt die letzte Spalte -
  // sonst bliebe rechts eine haarfeine Fuge in der Hintergrundfarbe stehen.
  // In der Hoehe entsteht kein Rest: die Leinwand ist genau so hoch wie die
  // Reihen zusammen.
  const restBreite = BREITE - kachelBreite * spalten;

  const gelegt = await Promise.all(gewaehlt.map(async (e, i) => {
    const spalte = i % spalten;
    const reihe = Math.floor(i / spalten);
    const b = kachelBreite + (spalte === spalten - 1 ? restBreite : 0);
    const h = kachelHoehe;
    return {
      input: await sharp(path.join(BILDER, e.datei))
        // Von oben, nicht aus der Mitte: bei einem sitzenden Spieler sitzt
        // der Kopf im oberen Drittel. Dieselbe Regel wie ueberall sonst in
        // der Oberflaeche, wo die Fotos mit "object-top" stehen.
        .resize(b, h, { fit: 'cover', position: 'top' })
        .toBuffer(),
      left: spalte * kachelBreite,
      top: reihe * kachelHoehe,
    };
  }));

  const png = await sharp({
    create: {
      width: BREITE, height: gesamtHoehe, channels: 3,
      background: { r: 9, g: 9, b: 11 },
    },
  }).composite(gelegt).png({ compressionLevel: 9 }).toBuffer();

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      // Die Namen der Gezeigten, damit die Oberflaeche sie benennen kann,
      // ohne das Verzeichnis noch einmal zu lesen.
      'X-Spieler': encodeURIComponent(
        gewaehlt.map((e) => namen.get(e.epicId) || e.name).join(' · ')),
      // Was nicht mitkonnte - die Oberflaeche zeigt es als Hinweis unter
      // dem fertigen Bild, statt es stillschweigend wegzulassen.
      'X-Uebersprungen': encodeURIComponent([
        ...uebersprungen,
        ...zuviel.map((e) => namen.get(e.epicId) || e.name),
      ].join(', ')),
      'Cache-Control': 'no-store',
    },
  });
}
