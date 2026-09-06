import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
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
  try {
    const roh = JSON.parse(await fs.readFile(PROFILE, 'utf8')) as
      Record<string, { id?: string; anzeige?: string; name?: string }>;
    const karte = new Map<string, string>();
    for (const [schluessel, p] of Object.entries(roh)) {
      const id = p.id || schluessel;
      const name = p.anzeige || p.name;
      if (/^[0-9a-f]{32}$/.test(id) && name) karte.set(id, name);
    }
    return karte;
  } catch {
    return new Map();
  }
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
function raster(n: number): { spalten: number; reihen: number } {
  if (n <= 5) return { spalten: n, reihen: 1 };
  if (n === 6) return { spalten: 3, reihen: 2 };
  if (n === 9) return { spalten: 3, reihen: 3 };
  if (n === 10) return { spalten: 5, reihen: 2 };
  return { spalten: 4, reihen: 2 };
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
    }, { status: 500 });
  }
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
  const { spalten, reihen } = raster(gewaehlt.length);

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
      'X-Uebersprungen': encodeURIComponent(uebersprungen.join(', ')),
      'Cache-Control': 'no-store',
    },
  });
}
