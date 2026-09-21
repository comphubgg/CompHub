import { NextResponse } from 'next/server';
import { ohneDateien } from '@/lib/antwortSpeicher';
import { verdienst, lanEintraege } from '@/lib/preisgeld';
import { fertigeAntwort, abgelegteAntwort, AblageNichtErreichbar, CDN_FRIST } from '@/lib/antwortSpeicher';
import fs from '@/lib/ablageFs';
import path from 'path';
import {
  auswahl, bildFuer, gesamtSummen, heimatRegionen, liesVerzeichnis, SAISON_NAMEN,
  saisonName, saisonKurz, startseite, summen, tagesbeste, verlauf, epicVerlauf,
  istGrossesTurnier, istFinaleTag, aktenSchreiben, jahresListen, lanErgebnisse, type SpielerSumme,
  JAHR_SAISONS,
} from '@/lib/szeneStats';
import { DATEN_ORT } from '@/lib/datenOrt';
import { getToken, loeseNamenAuf } from '@/lib/epicCups';

/**
 * Das Namensverzeichnis - Konto-Id auf die Namen, unter denen jemand
 * schon angetreten ist.
 *
 * Es stand in dieser Kette bisher nicht drin, obwohl es die groesste
 * Sammlung im Werkzeug ist. Ein Mitspieler, den die Szene-Quelle nicht
 * fuehrt, erschien deshalb als "0C54DF68" - die ersten acht Zeichen seiner
 * Konto-Id.
 */
async function liesNamensverzeichnis(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8')) as
      Record<string, { haupt?: string; namen?: string[] }>;
    for (const [id, e] of Object.entries(roh)) {
      const n = e.haupt || e.namen?.[0];
      if (n) karte.set(id, n);
    }
  } catch { /* noch kein Verzeichnis */ }
  return karte;
}

// Die Einzelwerte aus dem eigenen Archiv, zusammengerechnet.
//
//   GET                             -> was im Archiv liegt (Saisons, Regionen)
//   GET ?saison=S41&region=EU       -> alle Spieler dieser Auswahl, summiert
//   GET ?event=Escargo_Day1         -> nur dieser eine Spieltag
//   GET ?spieler=<epicId>           -> dazu der Verlauf Spieltag fuer Spieltag
//
// Gerechnet wird ueber die Epic-Konto-ID. Die Quelle wird in der Antwort
// benannt, damit sie in der Oberflaeche stehen kann - sie gehoert nicht uns.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/*
 * Diese Auskunft rechnet ueber alle Spieltage und braucht dafuer Zeit.
 *
 * Auf einem eigenen Server faellt das nicht auf. Bei Vercel endet eine
 * Funktion nach zehn Sekunden, wenn nichts anderes dasteht - und dann kommt
 * beim Besucher "An error occurred with your deployment" an statt der
 * Startseitenzahlen. Sechzig Sekunden sind die Obergrenze des kostenlosen
 * Tarifs; gebraucht werden sie nur beim ersten Aufruf, danach antwortet der
 * Zwischenspeicher.
 */
export const maxDuration = 60;

const QUELLE = 'eucompetitive.com';

/**
 * Die eigenen Spielerprofile dazunehmen.
 *
 * Die Quelle fuehrt den Namen, unter dem jemand an dem Tag angetreten ist -
 * und Pros wechseln den staendig: derselbe Spieler heisst in einer Saison
 * "AURA shxrk", "aurora fv" und "shxrk". Wo ein gepflegtes Profil zu diesem
 * Konto vorliegt, gilt dessen Anzeigename und dessen Flagge; sonst der zuletzt
 * gesehene Turniername und keine Flagge.
 *
 * Nachgeschlagen wird ueber die Konto-ID, nie ueber den Namen - ein
 * Nachahmer traegt sonst die Flagge des Profis.
 */
interface Profil { id?: string; name: string; land?: string; x?: string; anzeige?: string }

let profile: Map<string, Profil> | null = null;
let profileStand = -1;

/**
 * Die Klarnamen und Laender aus der offenen Spielerliste der Quelle.
 *
 * Sie kennt zu viertausend Konten den Profinamen und das Land: das Konto
 * hinter "falcon peterbotǃ" heisst dort PETERBOT und traegt US, das hinter
 * "аurоra fv" heisst SHXRK. Ohne das stuende auf der Seite der Name, unter
 * dem jemand zufaellig an diesem Tag angetreten ist, und daneben die
 * Weltkugel.
 *
 * Es gilt als Grundlage, nicht als Wahrheit: ein selbst gepflegtes Profil
 * schlaegt sie immer. Von 106 Faellen, in denen beide ein Land fuehren,
 * stimmten 102 ueberein - die vier Abweichungen entscheidet der Nutzer.
 */
let szeneSpieler: Map<string, { name: string; land: string }> | null = null;
let szeneBis = 0;

async function liesSzeneSpieler() {
  if (szeneSpieler && Date.now() < szeneBis) return szeneSpieler;
  const karte = new Map<string, { name: string; land: string }>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
      Array<{ ID?: string; NAME?: string; COUNTRY?: string }>;
    for (const p of roh) {
      if (!p.ID || !p.NAME) continue;
      karte.set(p.ID, { name: p.NAME, land: (p.COUNTRY || '').toUpperCase() });
    }
  } catch { /* keine Kopie da */ }
  szeneSpieler = karte;
  szeneBis = Date.now() + 5 * 60_000;
  return karte;
}

/**
 * Die Spielerbilder.
 *
 * scripts/spielerbilder-anlegen.mjs legt je Spieler eine Datei unter
 * public/spielerbilder/ an - zunaechst nur die Silhouette, spaeter das echte
 * Foto. Zugeordnet wird ueber die Konto-Id, nicht ueber den Dateinamen.
 */
/**
 * Wann eine Datei zuletzt geaendert wurde.
 *
 * Die gemerkten Karten hingen frueher an einer Uhr: eine Minute lang wurde
 * der alte Stand ausgeliefert. Wer als Admin einen Namen aendert, sieht
 * dann "gespeichert", geht zurueck und findet den alten Namen wieder - der
 * Eindruck, es sei nichts passiert.
 *
 * Jetzt haengt der Merker an der Aenderungszeit der Datei. Solange sich
 * nichts aendert, wird nicht neu gelesen; sobald etwas geschrieben wird,
 * greift es sofort.
 */
async function geaendert(datei: string): Promise<number> {
  try {
    return (await fs.stat(datei)).mtimeMs;
  } catch {
    return 0;
  }
}

const BILDER_DATEI = path.join(DATEN_ORT, 'spielerbilder.json');
let bilder: Map<string, { pfad: string; echt: boolean }> | null = null;
let bilderStand = -1;

async function liesBilder() {
  const stand = await geaendert(BILDER_DATEI);
  if (bilder && bilderStand === stand) return bilder;
  const karte = new Map<string, { pfad: string; echt: boolean }>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spielerbilder.json'), 'utf8')) as
      Array<{ datei: string; epicId: string; echtesFoto?: boolean }>;
    /*
     * Nur echte Fotos werden ausgeliefert.
     *
     * 121 Eintraege zeigen auf ein und dieselbe Datei: eine graue Silhouette,
     * die aus der Szene-Quelle stammt und ueber jeden gelegt wurde, zu dem
     * dort kein Bild lag. Das ergab im Werkzeug zwei verschiedene Leerbilder
     * nebeneinander - bei diesen 121 die Silhouette, bei allen uebrigen das
     * Fragezeichen, das die Oberflaeche selbst zeichnet. Zwei Anblicke fuer
     * denselben Sachverhalt: "zu diesem Spieler haben wir kein Foto".
     *
     * Deshalb bleibt die Silhouette hier liegen. Wer kein wirkliches Foto
     * hat, bekommt gar keins - und damit ueberall dasselbe Fragezeichen.
     * Kodiert wird der Dateiname, damit auch Sonderzeichen durchkommen.
     */
    for (const e of roh) {
      if (!e.epicId || !e.echtesFoto) continue;
      karte.set(e.epicId, {
        pfad: `/spielerbilder/${encodeURIComponent(e.datei)}`,
        echt: true,
      });
    }
  } catch { /* noch keine angelegt */ }
  bilder = karte;
  bilderStand = stand;
  return karte;
}

const PROFIL_DATEI = path.join(DATEN_ORT, 'spieler-profile.json');
async function liesProfile(): Promise<Map<string, Profil>> {
  const stand = await geaendert(PROFIL_DATEI);
  if (profile && profileStand === stand) return profile;
  const karte = new Map<string, Profil>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as Record<string, Profil>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id) karte.set(id, pr);
    }
  } catch { /* noch keine Profile gepflegt */ }
  profile = karte;
  profileStand = stand;
  return karte;
}

/*
 * Gerechnet wird hoechstens einmal je Stunde, nicht je Besucher.
 *
 * Diese Auskunft geht ueber neunhundert Spieltage. Auf einem eigenen Server
 * faellt das kaum auf; bei Vercel faengt jede Anfrage von vorn an, und die
 * Startseite brauchte eine Minute dreiundfuenfzig. Der Betreiber dazu: "Es
 * geht viel zu lange, viel, viel, viel zu lange."
 *
 * Schneller lesen waere die falsche Antwort gewesen. Richtig ist, nicht bei
 * jedem Aufruf zu rechnen: die Zahlen aendern sich, wenn neue Spieltage
 * dazukommen - also stuendlich. Das Ergebnis liegt deshalb fertig in der
 * Ablage; siehe lib/antwortSpeicher.ts, dort steht auch, warum eine zu alte
 * Antwort trotzdem sofort ausgeliefert und nur im Hintergrund erneuert wird.
 *
 * Der Schluessel ist die vollstaendige Abfrage, nach Namen sortiert - zwei
 * Aufrufe mit denselben Angaben in anderer Reihenfolge sind dieselbe Frage.
 */
/*
 * Der Vorrat, in dem gesucht wird.
 *
 * Die Suche in der Kopfzeile ging bisher bei jedem Tastendruck ueber das
 * ganze Archiv: gesamtSummen() rechnet jeden Spieler ueber jeden Spieltag
 * zusammen. Auf der Platte war das traege, bei Vercel unbrauchbar - gemessen
 * zweiundvierzig bis sechzig Sekunden, und jede zweite Anfrage endete im
 * Zeitfehler. Der Betreiber: "ich kann in Tournaments keinen Spieler suchen."
 *
 * Gesucht wird jetzt in einem fertigen Vorrat. Er entsteht einmal je Stunde
 * mit allen anderen Antworten, und die Suche filtert ihn nur noch - das ist
 * eine Zeile lesen statt neunhundert Dateien rechnen.
 *
 * Aufgehoben wird er zusaetzlich im laufenden Vorgang: wer tippt, stellt
 * mehrere Anfragen hintereinander, und zwei Megabyte je Tastendruck neu zu
 * holen und auszupacken waere unnoetig.
 */
interface SuchEintrag {
  epicId: string;
  name: string;
  namen: string[];
  anzeige: string;
  gepflegt: boolean;
  land: string | null;
  x: string | null;
  bild: string | null;
  echtesFoto: boolean;
  heimat: string;
  matches: number;
  [k: string]: unknown;
}

let suchVorrat: { stand: SuchEintrag[]; bis: number } | null = null;

async function holeSuchIndex(): Promise<SuchEintrag[]> {
  if (suchVorrat && Date.now() < suchVorrat.bis) return suchVorrat.stand;

  const stand = await fertigeAntwort('szene|suchindex', async () => {
    const gepflegt = await liesProfile();
    const szene = await liesSzeneSpieler();
    const bildZu = await liesBilder();
    const heimat = await heimatRegionen();
    return (await gesamtSummen()).map((x) => {
      const pr = gepflegt.get(x.epicId);
      const sz = szene.get(x.epicId);
      return {
        ...x,
        anzeige: pr?.anzeige || pr?.name || sz?.name || x.name,
        gepflegt: Boolean(pr?.anzeige || pr?.name),
        land: pr?.land || sz?.land || null,
        x: pr?.x ?? null,
        bild: bildZu.get(x.epicId)?.pfad ?? null,
        echtesFoto: bildZu.get(x.epicId)?.echt ?? false,
        heimat: heimat.get(x.epicId) ?? '',
      };
    }) as SuchEintrag[];
  });

  // Fuenf Minuten im Vorgang - laenger lohnt nicht, kuerzer hilft nicht.
  suchVorrat = { stand, bis: Date.now() + 5 * 60_000 };
  return stand;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ansicht = url.searchParams.get('ansicht') ?? '';

  /*
   * Der Vorrat selbst wird nur vorgerechnet, nie ausgeliefert - er ist zwei
   * Megabyte gross und fuer niemanden ausser der Suche von Nutzen. Die
   * stuendliche Aktion ruft ihn auf, damit er bereitliegt.
   */
  if (ansicht === 'suchindex') {
    const stand = await holeSuchIndex();
    return NextResponse.json({ success: true, eintraege: stand.length });
  }

  /*
   * Die Suche wird nicht aufgehoben.
   *
   * Sie ist billig - sie geht ueber das Verzeichnis, nicht ueber alle
   * Spieltage - und ihre Schluessel sind unbegrenzt: jeder getippte
   * Buchstabe waere eine eigene Zeile in der Ablage.
   */
  if (ansicht === 'suche') return berechne(request);
  // Das Schreiben der Akten ist eine Arbeit, keine Antwort - nie aufheben.
  if (ansicht === 'akten') return berechne(request);
  /*
   * Ein einzelner Spieltag wird auch nicht aufgehoben.
   *
   * Er ist billig - eine Datei - und die Ablage hat ihm geschadet: eine
   * leere Antwort aus einem Aussetzer blieb dort liegen, und auf der Seite
   * stand "keine Einzelwerte", obwohl die Datei da war. Frisch gerechnet
   * dauert er gut eine Sekunde.
   */
  if (url.searchParams.get('event')) return berechne(request);

  /*
   * Die Antwort zu einem einzelnen Spieler wird wie jede andere abgelegt.
   *
   * Ein Versuch, sie beim Server ohne Dateien nur im Arbeitsspeicher zu
   * halten (um die Datenbank klein zu halten), machte jeden kalten Aufruf
   * zu einer Rechnung von zwanzig Sekunden - bei Vercel liegt jede der
   * vielen Dateien eine Netzrunde entfernt. Der Betreiber: "die Ladezeit
   * auf ein Profil von einem Pro ist viel zu lange." Also wieder die
   * fertige Antwort zuerst; dass die Ablage nicht unbegrenzt waechst,
   * erledigt der stuendliche Lauf (scripts/antworten-aufraeumen.mjs).
   */
  const schluessel = 'szene|' + ([...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|') || 'standard')
    /*
     * Kein eigener Schluessel fuer die neue Startansicht.
     *
     * Hier stand ein Zusatz, damit die alte abgelegte Antwort liegenbleibt
     * und einmal frisch gerechnet wird. Frisch rechnen kann die Startansicht
     * aber nur der Laufrechner der GitHub-Aktion, wo die Dateien liegen; auf
     * dem Server braucht sie ueber das Netz mehr als zehn Minuten, und die
     * Seite stand bis dahin leer. Unter dem alten Schluessel wird weiter die
     * letzte fertige Antwort ausgeliefert, bis die Aktion die neue ablegt.
     */
    + '';

  /*
   * Die Jahres- und Saisonlisten gehen ueber das ganze Archiv. Auf dem
   * Server ohne Dateien wird daraus nach fuenfzig Sekunden eine leere
   * Liste - und die lag dann als "frische" Antwort in der Ablage, bis der
   * naechste Lauf sie ueberschrieb. Genau so stand "2026" eine Minute lang
   * auf dem Ladeschirm und zeigte danach nichts. Solche Antworten rechnet
   * nur der Laufrechner; hier wird der letzte fertige Stand ausgeliefert,
   * auch wenn er ein paar Stunden alt ist.
   */
  const archivWeit = ['jahr', 'start', 'bilder', 'suche'].includes(url.searchParams.get('ansicht') ?? '')
    || url.searchParams.has('sort');
  if (archivWeit && ohneDateien()) {
    let fertig: unknown = null;
    try { fertig = await abgelegteAntwort<unknown>(schluessel); }
    catch { /* nicht erreichbar - unten 503, der Rand behaelt den letzten Stand */ }
    if (fertig) {
      return NextResponse.json(fertig, {
        headers: { 'Cache-Control': CDN_FRIST },
      });
    }
    // Liegt nichts, wartet niemand eine Minute auf eine leere Liste.
    return NextResponse.json(
      { success: false, error: 'Diese Auswertung ist noch nicht vorgerechnet. Der stuendliche Lauf legt sie ab.' },
      { status: 503, headers: { 'Retry-After': '600' } });
  }
  try {
    const wert = await fertigeAntwort(schluessel, async () => {
      const antwort = await berechne(request);
      if (!antwort.ok) throw new Error(`Antwort ${antwort.status}`);
      return await antwort.json() as unknown;
    }, undefined, !archivWeit);
    return NextResponse.json(wert, {
      headers: { 'Cache-Control': CDN_FRIST },
    });
  } catch (e) {
    // Ablage nicht erreichbar: 503, nichts Leeres rechnen und nichts davon
    // am Rand behalten. Andere Fehler: dann eben ohne Ablage antworten.
    if (e instanceof AblageNichtErreichbar) {
      return NextResponse.json({ success: false, error: e.message },
        { status: 503, headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' } });
    }
    return berechne(request);
  }
}

async function berechne(request: Request) {
  const p = new URL(request.url).searchParams;
  /*
   * "alle" heisst hier: kein Filter.
   *
   * Die Oberflaeche bietet unter Saison und Region ein "alle" an und schickt
   * genau dieses Wort mit. Hier wurde es bis jetzt als Saisonkennung
   * genommen - und weil keine Saison "alle" heisst, kam eine leere Antwort
   * zurueck. Im Profil stand dann "In diesem Zeitraum ist dieser Spieler
   * nicht angetreten", obwohl gerade ueber alles gefragt worden war.
   */
  const ohneFilter = (x: string | null) =>
    (!x || x === 'alle' || x === 'all' ? undefined : x);
  const saison = ohneFilter(p.get('saison'));
  /*
   * Ein Jahr als Zeitraum - die Saisons, die dazu zaehlen (JAHR_SAISONS).
   * Der Betreiber: "macht auch Jahre, zum Beispiel eine zweite Period mit
   * 2025, 24, 23 ..." Gilt fuer das Profil und seinen Verlauf.
   */
  const jahr = Number(p.get('jahr') ?? 0);
  const saisons = !saison && JAHR_SAISONS[jahr] ? JAHR_SAISONS[jahr] : undefined;
  const region = ohneFilter(p.get('region'));
  const event = p.get('event') ?? undefined;
  // Mehrere Spieltage auf einmal - fuer die Summe einer Turnierreihe.
  const events = (p.get('events') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const spieler = p.get('spieler') ?? undefined;
  const sortieren = p.get('sort') ?? 'elims';
  const grenze = Math.min(2000, Math.max(1, parseInt(p.get('limit') ?? '200', 10) || 200));
  const suche = (p.get('q') ?? '').trim().toLowerCase();

  try {
    /*
     * Die Akten schreiben - fuer den stuendlichen Lauf, der auf Dateien
     * arbeitet. Bei Vercel gibt es nichts zu schreiben; dort wuerde es
     * nur Minuten kosten.
     */
    if (p.get('ansicht') === 'akten') {
      if (ohneDateien()) {
        return NextResponse.json({ error: 'Akten werden nur dort geschrieben, wo die Dateien liegen.' },
          { status: 400 });
      }
      const ergebnis = await aktenSchreiben();
      return NextResponse.json({ success: true, ...ergebnis });
    }

    /*
     * Das Jahr - ueber alle Saisons, mit Preisgeld. Ueber die Ablage der
     * fertigen Antworten (siehe GET unten), gerechnet vom stuendlichen Lauf.
     */
    if (p.get('ansicht') === 'jahr') {
      const jahrRoh = p.get('jahr') ?? '';
      const jahr = jahrRoh === 'alle' || jahrRoh === 'all' ? 0
        : (Number(jahrRoh) || new Date().getUTCFullYear());
      const volleListe = p.get('liste') === 'verdienst';
      const daten = await jahresListen(jahr, region, p.get('saison') ?? undefined, volleListe);
      const gepflegt = await liesProfile();
      const bildZu = await liesBilder();
      const heimat = await heimatRegionen();
      const szene = await liesSzeneSpieler();
      /*
       * So schlank wie moeglich: die Antwort war 1,1 Megabyte (sieben Listen
       * zu vierhundert Plaetzen mit allen Werten), bei Vercel ueber zwei
       * Sekunden je Klick - der Betreiber: "viel, viel zu lange." Jetzt je
       * Liste zweihundert Plaetze, und je Platz nur, was die Karte und die
       * Liste zeigen: Name, Flagge, Bild, Heimat und die eine Kennzahl.
       */
      const schlank = (feld: string) => (s: SpielerSumme & { verdienst?: number }) => ({
        epicId: s.epicId,
        name: s.name,
        anzeige: gepflegt.get(s.epicId)?.anzeige || gepflegt.get(s.epicId)?.name
          || szene.get(s.epicId)?.name || s.name,
        gepflegt: Boolean(gepflegt.get(s.epicId)?.anzeige || gepflegt.get(s.epicId)?.name),
        land: gepflegt.get(s.epicId)?.land || szene.get(s.epicId)?.land || null,
        bild: bildZu.get(s.epicId)?.pfad ?? null,
        heimat: heimat.get(s.epicId) ?? s.regionen[0] ?? '',
        regionen: [heimat.get(s.epicId) ?? s.regionen[0] ?? ''],
        namen: [], events: s.events, matches: s.matches,
        [feld]: (s as unknown as Record<string, unknown>)[feld] ?? 0,
      });
      /*
       * "kurz": nur die fuenf mit dem meisten Preisgeld - fuer die
       * Startseite. Ein paar Kilobyte statt einer Viertelmegabyte.
       */
      if (p.get('kurz')) {
        const geld = daten.listen.find((l) => l.feld === 'verdienst');
        return NextResponse.json({
          success: true, jahr: daten.jahr, spieltage: daten.spieltage,
          plaetze: (geld?.plaetze ?? []).slice(0, 5).map(schlank('verdienst')),
          spieltageMitRegel: (geld as { spieltageMitRegel?: number } | undefined)?.spieltageMitRegel ?? 0,
        });
      }
      /*
       * "liste=verdienst": die ganze Preisgeldliste, jedes Konto mit Geld -
       * fuer die Seite hinter dem Plus, hundert je Seite. Bei "alle Zeit"
       * sind das ueber sechstausend Zeilen; deshalb eine eigene Antwort und
       * nicht Teil der Jahresantwort.
       */
      if (volleListe) {
        const geld = daten.listen.find((l) => l.feld === 'verdienst');
        return NextResponse.json({
          success: true, jahr: daten.jahr, region: daten.region, saison: daten.saison,
          plaetze: (geld?.plaetze ?? []).map(schlank('verdienst')),
        });
      }
      return NextResponse.json({
        success: true, quelle: QUELLE, ...daten,
        listen: daten.listen.map((l) => ({
          ...l, plaetze: l.plaetze.slice(0, 200).map(schlank(l.feld)),
        })),
      });
    }

    if (p.get('ansicht') === 'start') {
      const daten = await startseite(saison);
      const gepflegt = await liesProfile();
      const bildZu = await liesBilder();
      const heimat = await heimatRegionen();
      const szene = await liesSzeneSpieler();
      /*
       * Der Name haengt am Konto, nicht an der Saison.
       *
       * In Chapter 7 Season 3 stand oben "AURORA FV" - der Name, unter dem
       * das Konto damals antrat. Der Betreiber: "das ist Shark, das solltest
       * du wissen, es geht ueber die Account-ID." Also gilt der juengste
       * Name aus dem ganzen Archiv, wo kein gepflegter vorliegt.
       */
      const juengsteNamen = new Map((await gesamtSummen()).map((x) => [x.epicId, x.name]));
      const schmuecken = (s: { epicId: string; name: string } | null) => (s ? {
        ...s,
        anzeige: gepflegt.get(s.epicId)?.anzeige || gepflegt.get(s.epicId)?.name
          || szene.get(s.epicId)?.name || juengsteNamen.get(s.epicId) || s.name,
        gepflegt: Boolean(gepflegt.get(s.epicId)?.anzeige || gepflegt.get(s.epicId)?.name),
        land: gepflegt.get(s.epicId)?.land || szene.get(s.epicId)?.land || null,
        bild: bildZu.get(s.epicId)?.pfad ?? null,
        echtesFoto: bildZu.get(s.epicId)?.echt ?? false,
        // Wer im Archiv keine Heimat hat, behaelt die aus der Liste selbst
        // (die Elims-Liste zaehlt sie je Saison aus).
        heimat: heimat.get(s.epicId) ?? (s as { heimat?: string }).heimat ?? '',
      } : null);

      /**
       * Die Spieler mit Foto, nach Heimatregion sortiert.
       *
       * Zwei Abschnitte der Startseite leben davon: die Profilkarten, die
       * regionweise durchwechseln, und die Duelle. Beide zeigen nur, wer ein
       * echtes Foto hat - eine graue Silhouette taugt fuer keins von beidem.
       *
       * Die Region ist die Heimatregion des Kontos ueber das ganze Archiv,
       * nicht die des einzelnen Spieltags: sonst stuende jemand, der einmal
       * in einer fremden Region angetreten ist, unter der falschen Flagge.
       *
       * Gerechnet wird ueber das ganze Archiv, nicht ueber die oben gewaehlte
       * Saison. Eine frisch begonnene Saison hat zwei Spieltage - dort haette
       * kaum jemand genug Matches, und beide Abschnitte blieben leer, obwohl
       * die Daten vorhanden sind. Die Bestenlisten darueber zeigen ohnehin
       * die laufende Saison.
       */
      // Erst sortieren, dann schmuecken: das Schmuecken macht aus der Summe
      // ein Anzeigeobjekt, und danach ist nicht mehr zu sortieren.
      const mitFoto = (await gesamtSummen())
        .filter((x) => bildZu.get(x.epicId)?.echt && x.matches >= 10)
        .sort((a, b) => b.elims - a.elims);

      const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA'];
      const profile = REGIONEN.map((r) => ({
        region: r,
        spieler: mitFoto
          .filter((x) => (heimat.get(x.epicId) ?? '') === r)
          .slice(0, 5)
          .map((x) => schmuecken(x)!),
      })).filter((g) => g.spieler.length > 0);

      /**
       * Die Duelle.
       *
       * Gepaart wird innerhalb einer Region und moeglichst weit oben: wer
       * gegeneinander antritt, soll auch vergleichbar sein. Ein Duell
       * zwischen dem Ersten Europas und dem Fuenfzigsten Asiens sagt nichts.
       */
      const duelle: Array<{ links: unknown; rechts: unknown }> = [];
      for (const g of profile) {
        const feld = mitFoto.filter((x) => (heimat.get(x.epicId) ?? '') === g.region);
        for (let i = 0; i + 1 < feld.length && duelle.length < 15; i += 2) {
          duelle.push({ links: schmuecken(feld[i]), rechts: schmuecken(feld[i + 1]) });
        }
      }

      return NextResponse.json({
        success: true, quelle: QUELLE,
        profile,
        duelle: duelle.slice(0, 15),
        ...(daten ? {
          saison: daten.saison,
          grundlage: daten.grundlage,
          kacheln: (() => {
            /*
             * Die Mitspieler bekommen ihre Namen.
             *
             * Im Abzug stehen nur Konto-Ids. Auf der Kachel soll neben dem
             * Spieler stehen, mit wem er angetreten ist - dieselbe Kette wie
             * ueberall: gepflegtes Profil, sonst die Szeneliste, sonst der
             * Turniername.
             */
            const nameZu = (id: string) => gepflegt.get(id)?.anzeige
              || gepflegt.get(id)?.name || szene.get(id)?.name || id.slice(0, 8);
            const alle = daten.kacheln.map((k) => ({
              ...k,
              spitze: schmuecken(k.spitze),
              stand: k.stand ? {
                platz: k.stand.platz,
                punkte: k.stand.punkte,
                mitspieler: k.stand.mitspieler.map((id) => ({
                  epicId: id, name: nameZu(id),
                  land: gepflegt.get(id)?.land || szene.get(id)?.land || null,
                })),
              } : null,
            }));
            // Nur wer ein Foto hat: eine Karte, deren halbe Flaeche eine
            // graue Silhouette ist, taugt nicht als Aufmacher. Gibt es noch
            // gar keine Fotos, wird nicht gefiltert - lieber Silhouetten als
            // eine leere Seite.
            const mitBild = alle.filter((k) => k.spitze?.echtesFoto);
            // Jeden Spieler nur einmal: dieselben Namen fuehren mehrere
            // Spieltage an, und der Wechsel zeigte sonst dreimal dasselbe
            // Gesicht hintereinander.
            const gesehen = new Set<string>();
            const einmalig = (mitBild.length ? mitBild : alle).filter((k) => {
              const id = k.spitze?.epicId;
              if (!id || gesehen.has(id)) return false;
              gesehen.add(id);
              return true;
            });
            return einmalig.slice(0, 15);
          })(),
          listen: await Promise.all(daten.listen.map(async (l) => {
            /*
             * Namen nachschlagen, die noch fehlen.
             *
             * Die Elims-Liste kommt zum Teil aus den eigenen Replays und
             * kennt dort nur Konto-Kennungen; wer nie in einem Finale
             * stand, hat im Archiv keinen Namen. Epic liefert ihn, und
             * der Speicher merkt ihn sich fuer das naechste Mal.
             */
            const ohneName = l.plaetze.filter((x) => !x.name).map((x) => x.epicId);
            if (ohneName.length) {
              try {
                const { token } = await getToken();
                const namen = await loeseNamenAuf(ohneName, token);
                for (const x of l.plaetze) if (!x.name && namen[x.epicId]) x.name = namen[x.epicId];
              } catch { /* dann bleibt die Kennung - besser als ein erfundener Name */ }
            }
            /*
             * Schlank: vierhundert Plaetze je Liste mit allen dreissig
             * Werten waren zwei Megabyte je Seitenaufruf. Die Liste
             * braucht Name, Flagge, Bild, Heimat und die Kennzahlen, die
             * sie zeigt - der Rest kommt beim Oeffnen des Profils.
             */
            const schlank = (x: Record<string, unknown> | null) => {
              if (!x) return null;
              const raus: Record<string, unknown> = {};
              for (const k of ['epicId', 'name', 'anzeige', 'gepflegt', 'land', 'x', 'bild',
                'echtesFoto', 'heimat', 'regionen', 'jeRegion', 'events', 'matches',
                'elims', 'damage', 'quote', 'hits', 'headshots', 'builds',
                'elimsProMatch', 'damageProMatch', 'genauigkeit',
                'finalsElims', 'opensElims', 'finals', 'opens', 'opensMatches']) {
                if (x[k] !== undefined) raus[k] = x[k];
              }
              raus.namen = Array.isArray(x.namen) ? (x.namen as string[]).slice(0, 3) : [];
              return raus;
            };
            return { ...l, plaetze: l.plaetze.map((x) => schlank(schmuecken(x))) };
          })),
        } : {}),
      });
    }

    /**
     * Alle Spieler, zu denen ein echtes Foto vorliegt.
     *
     * Unabhaengig von Saison und Region - die Frage lautet hier nicht "wer
     * hat gut gespielt", sondern "von wem habe ich ueberhaupt ein Bild".
     */
    /**
     * Die Suche in der Kopfzeile.
     *
     * Sie sucht ueber das ganze Archiv, nicht nur ueber die oben gewaehlte
     * Saison - wer einen Namen eintippt, will diesen Spieler finden und
     * nicht erst herausfinden muessen, in welcher Saison er zuletzt
     * angetreten ist.
     *
     * Gesucht wird auf zwei Wegen: im Anzeigenamen und in allen Namen, unter
     * denen das Konto je angetreten ist. Wer "vico" tippt, findet auch "big
     * Vico".
     */
    if (p.get('ansicht') === 'suche') {
      const q = suche;
      if (q.length < 2) {
        return NextResponse.json({ success: true, quelle: QUELLE, spieler: [] });
      }
      const treffer = (await holeSuchIndex())
        .filter((e) => e.anzeige.toLowerCase().includes(q)
          || e.namen.some((n) => n.toLowerCase().includes(q)))
        // Wer mehr gespielt hat, steht oben: bei "twi" ist der gesuchte
        // Spieler der mit Hunderten Matches, nicht ein gleichnamiges Konto
        // mit dreien.
        .sort((a, b) => b.matches - a.matches)
        .slice(0, 8);

      return NextResponse.json({ success: true, quelle: QUELLE, spieler: treffer });
    }

    if (p.get('ansicht') === 'bilder') {
      const bildZu = await liesBilder();
      const gepflegt = await liesProfile();
      const szene = await liesSzeneSpieler();
      const heimat = await heimatRegionen();

      /**
       * Wer wichtig ist, steht oben.
       *
       * Gemessen ueber das ganze Archiv, nicht ueber eine Saison: gefragt ist
       * nicht, wer gerade gut spielt, sondern von wem ein Bild fehlt, das
       * fehlen wuerde. Als Mass dienen die Eliminierungen ueber alles - wer
       * viele hat, ist entweder stark oder lange dabei, und beides macht ihn
       * fuer die Sammlung wichtig.
       *
       * Konten mit weniger als zwanzig Matches bleiben draussen; sonst
       * stuenden in der Liste der Fehlenden tausende Karteileichen.
       */
      // Wer ein Foto hat, ist immer dabei - auch mit wenigen Matches.
      //
      // Die Schwelle von zwanzig Matches haelt die Liste der Fehlenden frei
      // von Karteileichen. Auf die Gruppe "mit Bild" darf sie aber nicht
      // wirken: sonst verschwindet ein Foto aus der Ansicht, nur weil es auf
      // einem Konto mit wenig Spielzeit sitzt - und man sucht es, obwohl es
      // laengst da ist.
      const feld = (await gesamtSummen())
        .filter((x) => x.matches >= 20 || bildZu.get(x.epicId)?.echt)
        .sort((a2, b2) => b2.elims - a2.elims);

      const spieler = feld.map((x) => {
        const pr = gepflegt.get(x.epicId);
        const sz = szene.get(x.epicId);
        const b3 = bildZu.get(x.epicId);
        return {
          epicId: x.epicId,
          anzeige: pr?.anzeige || pr?.name || sz?.name || x.name,
          gepflegt: Boolean(pr?.anzeige || pr?.name),
          land: pr?.land || sz?.land || null,
          heimat: heimat.get(x.epicId) ?? '',
          bild: b3?.echt ? b3.pfad : null,
          echtesFoto: Boolean(b3?.echt),
          matches: x.matches,
          events: x.events,
          elims: x.elims,
          damage: x.damage,
          quote: x.quote,
        };
      });

      return NextResponse.json({
        success: true, quelle: QUELLE, spieler,
        mit: spieler.filter((x) => x.echtesFoto).length,
        ohne: spieler.filter((x) => !x.echtesFoto).length,
      });
    }

    // Die Spieltage einer Saison, fuer die Turnieruebersicht.
    if (p.get('ansicht') === 'turniere') {
      const alle = await liesVerzeichnis();
      const gefiltert = alle
        .filter((e) => (!saison || e.season === saison)
                    && (!region || e.region === region));

      /*
       * Nur die grossen Finale - so wollte es der Betreiber.
       *
       * "unter der Statistik page ... sollen nur Finale kommen plus nur
       * Performance Cups und Divisions Cups für Division eins Finale ...
       * aber keine Division vier, drei, zwei oder irgendwelche Duo Reload
       * Victory Cups". Die Uebersicht soll die Szene abbilden, nicht jeden
       * offenen Cup mit zehntausend Teilnehmern.
       *
       * Mit "?alle=1" kommt trotzdem die volle Liste - die Daten sind ja
       * da, sie stehen nur nicht im Weg.
       */
      /*
       * Was keine Statistik hat, wird nicht aufgelistet.
       *
       * Die Epic-Spieltage kamen dazu, damit ein gestern gelaufenes Finale
       * nicht fehlt. Gemessen an der laufenden Liste tragen sie aber keine
       * Einzelwerte: von zwoelf geprueften lieferten zwoelf null Spieler,
       * waehrend zwoelf aus der Szene-Quelle alle rund hundert lieferten.
       * Eine Kachel, die sich anklicken laesst und dann leer ist, ist keine
       * Auskunft, sondern eine Sackgasse - der Betreiber dazu: "dann liest
       * Du auch nur die auf, ueber die Du auch Statistik hast, sonst musst
       * Du ihn ja nicht mal auflisten."
       *
       * Sie verschwinden damit nicht aus dem Werkzeug: Platz und Punkte
       * stehen unter Events, und darauf weist die Statistikseite oben auch
       * hin, solange ein Cup laeuft.
       */
      const ohneFilter = p.get('alle') === '1';
      const gross = gefiltert.filter((t) => {
        if (ohneFilter) return true;
        if (!istGrossesTurnier(t.name)) return false;
        return istFinaleTag(t.name,
          'istFinale' in t ? (t as { istFinale?: boolean }).istFinale : undefined,
          (t as { windowId?: string }).windowId);
      });

      const zusammen = gross
        .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));

      const turniere = [];
      for (const t of zusammen) {
        const lanTag = (await lanEintraege()).find((l) => l.fenster.split('_')[0] === (t.windowId ?? '').split('_')[0]);
        turniere.push({ ...t, bild: await bildFuer(t.name), saisonName: saisonName(t.season),
          lan: lanTag ? { name: lanTag.name, ort: lanTag.ort ?? null } : null });
      }

      /*
       * Wie viele es so und so waeren.
       *
       * Der Schalter "alle Spieltage" bringt in einer frisch angefangenen
       * Saison nichts: die Szene-Quelle veroeffentlicht ihre Einzelwerte ein
       * bis zwei Tage nach einem Cup, und bis dahin sind die wenigen
       * vorhandenen Turniere ohnehin alle grosse Finale. Gemessen: in S40
       * werden aus 46 Turnieren 118, in S41 aus 69 124 - in der laufenden
       * S42 aus 13 dagegen 13.
       *
       * Wer den Schalter umlegt und nichts passieren sieht, haelt ihn fuer
       * kaputt. Deshalb kommen beide Zahlen mit heraus, und die Oberflaeche
       * kann sagen, dass es gerade nichts weiter gibt.
       */
      const zahlen = {
        alle: gefiltert.length,
        grosse: gefiltert.filter((t) => istGrossesTurnier(t.name)
          && istFinaleTag(t.name,
            'istFinale' in t ? (t as { istFinale?: boolean }).istFinale : undefined,
            (t as { windowId?: string }).windowId)).length,
      };

      return NextResponse.json({ success: true, quelle: QUELLE, turniere, zahlen });
    }

    /*
     * Ohne jede Frage kommt die Auswahl selbst zurueck - welche Saisons und
     * welche Regionen es gibt. Genau das holt die Statistikseite beim ersten
     * Laden.
     *
     * Frueher genuegte dafuer, dass Saison und Region leer waren. Seit die
     * Oberflaeche oben ein "Alle Saisons" anbietet, ist eine leere Saison
     * aber eine echte Frage ueber das ganze Archiv - und sie bekam die
     * Auswahlliste statt der Spieler zurueck. Jetzt entscheidet, ob
     * ueberhaupt etwas gefragt wurde.
     */
    if (![...p.keys()].length) {
      return NextResponse.json({ success: true, quelle: QUELLE, ...(await auswahl()) });
    }

    const filter = { saison, saisons, region, event, events: events.length ? events : undefined };
    /*
     * Ohne jeden Filter ist das die Summe ueber das ganze Archiv - und die
     * liegt fertig in der Ablage (siehe gesamtSummen). Ein Profil ueber
     * "alle Saisons" las hier sonst bei Vercel neunhundert Dateien.
     */
    const { spieler: alle, spieltage } = (!saison && !saisons && !region && !event && !events.length)
      ? { spieler: await gesamtSummen(), spieltage: (await liesVerzeichnis()).length }
      : await summen(filter);

    if (spieler) {
      const eintrag = alle.find((s) => s.epicId === spieler);

      /**
       * Wo steht dieser Spieler im Feld?
       *
       * Das Vorbild zeigt an dieser Stelle Punktwerte wie "FIREPOWER 99/100,
       * Top 1%" - abgeleitet aus seinem Rating, das wir nicht haben. Was sich
       * aber ohne jede Annahme rechnen laesst, ist der Rang: wie viele der
       * Mitspieler liegen unter ihm? Aus neun solchen Raengen wird ein Wert
       * von null bis hundert, und der bedeutet genau das, was danebensteht -
       * keine geheime Formel.
       *
       * Zwei Festlegungen halten den Vergleich ehrlich:
       *
       * Verglichen wird gegen das gesamte Archiv, nicht gegen die oben
       * gewaehlte Saison. Eine Saison mit zwei Spieltagen enthaelt fast
       * niemanden mit genug Matches - dort stuende sonst ueberall eine Null.
       *
       * Und verglichen wird je Match, nicht in Summe. Sonst gewaenne allein,
       * wer oefter angetreten ist.
       */
      const gesamt = await gesamtSummen();
      const gEintrag = gesamt.find((s) => s.epicId === spieler);
      const feld = gesamt.filter((s) => s.matches >= 10);
      const rang = (wert: number, holen: (s: typeof gesamt[number]) => number) => {
        if (!feld.length) return 0;
        const drunter = feld.filter((s) => holen(s) < wert).length;
        return Math.round((drunter / feld.length) * 100);
      };
      /** Denselben Wert je Match - fuer den Spieler wie fuer das Feld. */
      const jeMatch = (holen: (s: typeof gesamt[number]) => number) =>
        (s: typeof gesamt[number]) => (s.matches > 0 ? holen(s) / s.matches : 0);
      const rangJe = (holen: (s: typeof gesamt[number]) => number) => {
        if (!gEintrag) return 0;
        const pro = jeMatch(holen);
        return rang(pro(gEintrag), pro);
      };
      const perzentile = gEintrag ? {
        elims: rangJe((s) => s.elims),
        damage: rangJe((s) => s.damage),
        headshots: rangJe((s) => s.headshots),
        mats: rangJe((s) => s.mats),
        builds: rangJe((s) => s.builds),
        timeAlive: rangJe((s) => s.timeAlive),
        reboots: rangJe((s) => s.reboots),
        // Quote und Trefferquote sind schon Verhaeltnisse - die bleiben, wie
        // sie sind, sonst teilte man zweimal.
        quote: rang(gEintrag.quote, (s) => s.quote),
        genauigkeit: rang(gEintrag.genauigkeit, (s) => s.genauigkeit),
        feldgroesse: feld.length,
      } : null;

      /**
       * Die Grand-Finals-Platzierungen aus der offenen Spielerliste.
       *
       * Sie fuehrt je Saison den erreichten Platz - null heisst, es gab keine
       * Teilnahme. Daraus entsteht dieselbe Tafel, die das Vorbild unter
       * "FNCS" zeigt.
       */
      // Fehlt die Kopie der Liste (Ablage gerade weg), bleibt die Tafel
      // leer - das Profil selbst kommt trotzdem.
      let szeneListe: Array<Record<string, string | number>> = [];
      try {
        szeneListe = JSON.parse(await fs.readFile(
          path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
          Array<Record<string, string | number>>;
      } catch { /* keine Kopie da */ }
      const eintragQuelle = szeneListe.find((x) => x.ID === spieler);
      const fncs = eintragQuelle ? {
        titel: Number(eintragQuelle.FNCS_WINS ?? 0),
        saisons: Object.entries(eintragQuelle)
          .filter(([k]) => /^(CH\d|GLOBALS|ALL_STAR|GRAND_ROYALE|INVITATIONAL)/.test(k))
          .map(([k, v]) => ({ saison: k.replace(/_/g, ' '), platz: Number(v) || 0 })),
      } : null;
      /**
       * Die Tage, an denen er der Staerkste war.
       *
       * Beim Vorbild heisst diese Marke "EVENT MVP" und richtet sich nach
       * ihrem Rating. Hier zaehlt, was in den Dateien steht: die meisten
       * Eliminierungen eines Spieltags.
       */
      const tage = (await tagesbeste()).get(spieler) ?? [];
      const tagesbest = tage
        .map((t) => ({ ...t, saisonName: saisonName(t.season) }))
        .sort((a, b) => b.elims - a.elims);

      /**
       * Zu den FNCS-Siegen so viel wie moeglich.
       *
       * Die offene Spielerliste fuehrt nur Saison und Platz. Alles Weitere -
       * Turniername, Werte - laesst sich nur dort ergaenzen, wo das eigene
       * Archiv die Saison ueberhaupt enthaelt; das sind CH7 S1 bis S4. Ein
       * Titel aus CH5 bleibt deshalb leer, und das steht dann auch als
       * Strich in der Zeile statt als geratene Zahl.
       *
       * Rating und Mitspieler stehen in keiner der beiden Quellen und
       * bleiben grundsaetzlich leer.
       */
      const kennungZu = new Map(Object.entries(SAISON_NAMEN)
        .map(([k]) => [saisonKurz(k).toUpperCase(), k]));
      const verzeichnis = await liesVerzeichnis();

      const fncsDetail = async (saisonLabel: string) => {
        const kennung = kennungZu.get(saisonLabel.replace(/\s+/g, '').toUpperCase());
        if (!kennung) return null;
        const tage = verzeichnis.filter((e) => e.season === kennung
          && /grand\s*final/i.test(e.name));
        if (!tage.length) return null;

        const zeilenDazu = (await verlauf(spieler, { saison: kennung }))
          .filter((z) => /grand\s*final/i.test(z.event));
        if (!zeilenDazu.length) return null;

        const n = (holen: (w: typeof zeilenDazu[number]['werte']) => number) =>
          zeilenDazu.reduce((summe, z) => summe + (holen(z.werte) || 0), 0);
        // Die Mitspieler stehen in Epics Bestenliste zu diesen Tagen - im
        // Verlauf sind sie deshalb schon aufgeloest. Genommen wird der Tag
        // mit den meisten Namen: an Tag zwei eines Grand Finals fehlt
        // gelegentlich ein Eintrag.
        const mitTeam = [...zeilenDazu]
          .sort((a2, b2) => b2.mitspieler.length - a2.mitspieler.length)[0];

        return {
          turnier: zeilenDazu[0].event.replace(/\s*-\s*Day\s*\d+$/i, ''),
          mitspieler: mitTeam.mitspieler,
          elims: n((w) => w.eliminations),
          damage: Math.round(n((w) => w.damageDealt)),
          builds: n((w) => w.woodBuildsPlaced) + n((w) => w.stoneBuildsPlaced)
            + n((w) => w.metalBuildsPlaced),
          mats: n((w) => w.woodFarmed) + n((w) => w.stoneFarmed)
            + n((w) => w.metalFarmed),
        };
      };

      const fncsSiegeRoh = fncs
        ? await Promise.all(fncs.saisons.filter((x) => x.platz === 1)
          .map(async (x) => ({ saison: x.saison, ...(await fncsDetail(x.saison)) })))
        : [];

      /**
       * Die Mitspieler der FNCS-Siege mit Namen versehen.
       *
       * Sie kommen als Konto-Ids aus Epics Bestenliste; die Namen holt
       * dieselbe Zuordnung, die auch die Turnierliste benutzt.
       */
      const profileFuerSiege = await liesProfile();
      const szeneFuerSiege = await liesSzeneSpieler();
      const fncsSiege = await Promise.all(fncsSiegeRoh.map(async (x) => {
        const ids: string[] = (x as { mitspieler?: string[] }).mitspieler ?? [];
        const namen = await Promise.all(ids.map(async (id) => {
          const pr2 = profileFuerSiege.get(id);
          const sz2 = szeneFuerSiege.get(id);
          return {
            epicId: id,
            name: pr2?.anzeige || pr2?.name || sz2?.name || id.slice(0, 8),
            land: pr2?.land || sz2?.land || null,
          };
        }));
        return { ...x, mitspieler: namen };
      }));

      /**
       * Wo der Spieler im Feld steht - regional und weltweit.
       *
       * Das Vorbild fuehrt dafuer "Regional Ranking" und "Global Ranking".
       * Beide Zahlen lassen sich abzaehlen: die Liste nach Eliminierungen
       * sortieren und nachsehen, an welcher Stelle er steht. Regional heisst
       * dabei: unter denen mit derselben Heimatregion, nicht unter denen,
       * die zufaellig einmal dort angetreten sind.
       *
       * Gezaehlt wird ueber denselben Zeitraum, der oben gewaehlt ist - bei
       * "alle Saisons" also ueber das ganze Archiv.
       */
      const heimatKarte = await heimatRegionen();
      const meineRegion = heimatKarte.get(spieler) ?? '';
      const nachElims = [...alle].sort((a2, b2) => b2.elims - a2.elims);
      const rangGlobal = nachElims.findIndex((x) => x.epicId === spieler) + 1;
      const regional = nachElims.filter(
        (x) => (heimatKarte.get(x.epicId) ?? '') === meineRegion);
      const rangRegional = regional.findIndex((x) => x.epicId === spieler) + 1;

      const pr = (await liesProfile()).get(spieler);
      const rohZeilen = await verlauf(spieler, { saison, saisons, region });

      /**
       * Dazu die Spieltage, die nur Epic kennt.
       *
       * Die Quelle veroeffentlicht ein bis zwei Tage spaeter, manche Cups
       * gar nicht. Solange fehlte das Turnier im Profil ganz - obwohl es
       * gelaufen ist und Epic Platz und Mitspieler herausgibt. Diese Zeilen
       * tragen kein einziges Werteld: Schaden, Material und Bauteile kennt
       * Epic nicht, und die Eliminierungen dort gelten fuers ganze Team.
       */
      const rohEpic = await epicVerlauf(spieler, { saison, saisons, region });

      /**
       * Die Mitspieler mit Namen und Flagge versehen.
       *
       * Im Abzug stehen nur Konto-Ids - Namen wechseln von Turnier zu
       * Turnier, die Id nicht. Der Anzeigename kommt deshalb erst hier
       * dazu, aus denselben Quellen wie beim Spieler selbst: gepflegtes
       * Profil, sonst die Szeneliste, sonst der Turniername.
       */
      const namensQuelle = await liesSzeneSpieler();
      const namensListe = await liesNamensverzeichnis();
      /*
       * Einmal laden, nicht je Mitspieler.
       *
       * Hier stand "(await liesProfile()).get(id)" in der Schleife ueber alle
       * Mitspieler aller Spieltage - und liesProfile fragt jedes Mal nach,
       * ob sich die Datei geaendert hat. Bei Vercel ist das eine Abfrage
       * an Supabase je Aufruf: hundert Mitspieler, zwanzig Sekunden.
       */
      const gepflegteProfile = await liesProfile();
      const nameZu = new Map<string, { name: string; land: string | null }>();
      /** Wer nirgends steht - fuer den lohnt die Nachfrage bei Epic. */
      const namenlos: string[] = [];
      for (const z of [...rohZeilen, ...rohEpic]) {
        for (const id of z.mitspieler) {
          if (nameZu.has(id)) continue;
          const pr2 = gepflegteProfile.get(id);
          const sz2 = namensQuelle.get(id);
          const ausArchiv = alle.find((x) => x.epicId === id)?.name;
          const gefunden = pr2?.anzeige || pr2?.name || sz2?.name || ausArchiv
            || namensListe.get(id);
          if (!gefunden) namenlos.push(id);
          nameZu.set(id, {
            name: gefunden || id.slice(0, 8),
            land: pr2?.land || sz2?.land || null,
          });
        }
      }

      /*
       * Und wer dann immer noch keinen Namen hat, wird bei Epic erfragt.
       *
       * In einem offenen Duos-Cup steht neben einem Profi irgendein Konto,
       * das keine unserer Listen kennt - im Profil stand dort dann
       * "0C54DF68". Epics Kontodienst nennt den aktuellen Anzeigenamen, und
       * genau dafuer ist er da; abgefragt werden alle offenen Ids in einem
       * Zug, und die Antwort haelt der Prozess vor. Bleibt die Antwort aus,
       * steht wieder die gekuerzte Id da - erfunden wird nichts.
       */
      if (namenlos.length) {
        try {
          const { token } = await getToken();
          const aufgeloest = await loeseNamenAuf(namenlos, token);
          for (const [id, name] of Object.entries(aufgeloest)) {
            if (!name || name === id.slice(0, 8)) continue;
            const vorher = nameZu.get(id);
            nameZu.set(id, { name, land: vorher?.land ?? null });
          }
        } catch { /* ohne Epic-Anmeldung bleibt die gekuerzte Id stehen */ }
      }
      /*
       * Dazu das Preisgeld je Spieltag, wo eine Regel gepflegt ist - siehe
       * lib/preisgeld. Abgeleitet aus Platz beziehungsweise Punkten; wo
       * keine Regel steht, bleibt es null.
       */
      const lanDesSpielers = await lanErgebnisse(spieler);
      const zeilen = await Promise.all(rohZeilen.map(async (z) => ({
        ...z,
        // Bei einer LAN kennt Epics Bestenliste nur Turnierkonten - der
        // Platz kommt aus der LAN-Datei.
        platz: z.platz ?? lanDesSpielers.find((l) => l.fenster === z.windowId)?.platz ?? null,
        lan: (await lanEintraege()).find((l) => l.fenster === z.windowId
          || l.fenster.replace(/_Day\d+$|_Finals_Day\d+$/i, '') === z.windowId.replace(/_Day\d+$|_Finals_Day\d+$/i, ''))
          ? { name: (await lanEintraege()).find((l) => l.fenster.split('_')[0] === z.windowId.split('_')[0])?.name ?? null,
              ort: (await lanEintraege()).find((l) => l.fenster.split('_')[0] === z.windowId.split('_')[0])?.ort ?? null }
          : null,
        verdienst: (await verdienst({
          windowId: z.windowId, region: z.region, name: z.event,
          platz: z.platz, punkte: z.punkte, epicId: spieler,
        }))?.betrag ?? null,
        mitspieler: z.mitspieler.map((id) => ({
          epicId: id,
          name: nameZu.get(id)?.name ?? id.slice(0, 8),
          land: nameZu.get(id)?.land ?? null,
        })),
      })));

      const epicZeilen = await Promise.all(rohEpic.map(async (z) => ({
        ...z,
        verdienst: z.verdienstArchiv ?? (await verdienst({
          windowId: z.windowId, region: z.region, name: z.titel,
          platz: z.platz, punkte: z.punkte, epicId: spieler,
        }))?.betrag ?? null,
        mitspieler: z.mitspieler.map((id) => ({
          epicId: id,
          name: nameZu.get(id)?.name ?? id.slice(0, 8),
          land: nameZu.get(id)?.land ?? null,
        })),
      })));

      /**
       * Ein Bild je Saison fuer die Bannerzeile ueber der Turnierliste.
       *
       * Zuerst stand dort die Grafik irgendeines Cups aus der Saison. Das war
       * falsch: ueber "Chapter 7 Season 3" prangte das Bild der Reload
       * Championship, und wer die Seite liest, haelt das fuer die Saison.
       *
       * Eine echte Saisongrafik gibt Epic nicht heraus. Deshalb kommt sie
       * jetzt aus public/saisonbilder/ - dort eine Datei S41.jpg oder
       * CH7S3.jpg ablegen, und sie erscheint. Liegt nichts da, bleibt das
       * Banner ohne Bild, statt ein fremdes zu zeigen.
       */
      const saisonBilder: Record<string, string | null> = {};
      const ORDNER = path.join(process.cwd(), 'public', 'saisonbilder');
      for (const kennung of new Set(
        [...zeilen, ...epicZeilen].map((z) => z.season))) {
        const kurz = saisonKurz(kennung);
        let gefunden: string | null = null;
        for (const stamm of [kennung, kurz]) {
          for (const endung of ['jpg', 'jpeg', 'png', 'webp']) {
            try {
              await fs.access(path.join(ORDNER, `${stamm}.${endung}`));
              gefunden = `/saisonbilder/${stamm}.${endung}`;
              break;
            } catch { /* weiter suchen */ }
          }
          if (gefunden) break;
        }
        saisonBilder[kennung] = gefunden;
      }
      /*
       * Auch ohne Zeile im Archiv der Quelle ein Profil.
       *
       * Die Quelle veroeffentlicht je Spieltag nur die besten hundert, und
       * fuer die laufende Saison bisher ueberhaupt nur die Finals. Wer
       * ausserhalb stand, hatte damit keinen Eintrag - und das Profil
       * meldete "In diesem Zeitraum ist dieser Spieler nicht angetreten",
       * obwohl Epic zehn Spieltage von ihm fuehrt.
       *
       * Der Ersatzeintrag traegt ausschliesslich, was Epic wirklich hergibt:
       * wie viele Spieltage und wie viele Matches. Schaden, Material und
       * Bauteile kennt Epic nicht, und die Eliminierungen dort gelten fuers
       * ganze Team - sie stehen deshalb gar nicht darin, statt als Null zu
       * erscheinen. "nurEpic" sagt der Oberflaeche, woran sie ist.
       */
      const szeneNamen = await liesSzeneSpieler();
      const grundlage = eintrag ?? (epicZeilen.length ? {
        epicId: spieler,
        name: szeneNamen.get(spieler)?.name ?? spieler.slice(0, 8),
        namen: [] as string[],
        regionen: [...new Set(epicZeilen.map((z) => z.region))],
        events: epicZeilen.length,
        matches: epicZeilen.reduce((a, z) => a + (z.matches ?? 0), 0),
        nurEpic: true,
      } : null);

      return NextResponse.json({
        success: true, quelle: QUELLE,
        spieler: grundlage ? {
          ...grundlage,
          anzeige: pr?.anzeige || pr?.name
            || szeneNamen.get(spieler)?.name || grundlage.name,
          gepflegt: Boolean(pr?.anzeige || pr?.name),
          land: pr?.land || szeneNamen.get(spieler)?.land || null,
          x: pr?.x ?? null,
          bild: (await liesBilder()).get(spieler)?.pfad ?? null,
          heimat: (await heimatRegionen()).get(spieler) ?? '',
        } : null,
        perzentile,
        rang: rangGlobal > 0 ? {
          global: rangGlobal, globalVon: nachElims.length,
          regional: rangRegional > 0 ? rangRegional : null,
          regionalVon: regional.length,
          region: meineRegion,
        } : null,
        tagesbest,
        fncsSiege,
        // LAN-Ergebnisse mit Preisgeld - Summit, Reload Elite Championship, Globals.
        lan: lanDesSpielers,
        saisonBilder,
        saisonNamen: Object.fromEntries(
          [...new Set([...zeilen, ...epicZeilen].map((z) => z.season))]
            .map((k) => [k, saisonName(k)])),
        fncs,
        verlauf: zeilen,
        epicZeilen,
      });
    }

    // Sortieren nach dem verlangten Feld. Unbekanntes faellt auf die
    // Eliminierungen zurueck, statt eine leere Liste zu liefern.
    const feld = (['elims', 'damage', 'matches', 'headshots', 'hits', 'assists',
      'quote', 'genauigkeit', 'mats', 'builds', 'timeAlive', 'elimsProMatch',
      'damageProMatch', 'events'].includes(sortieren) ? sortieren : 'elims') as
      keyof typeof alle[number];

    const gefiltert = suche
      ? alle.filter((s) => s.namen.some((n) => n.toLowerCase().includes(suche)))
      : alle;

    const sortiert = [...gefiltert].sort((a, b) =>
      Number(b[feld]) - Number(a[feld]));

    const gepflegt = await liesProfile();
    const bildZu = await liesBilder();
    const heimat = await heimatRegionen();
    const szene = await liesSzeneSpieler();
    const mitProfil = sortiert.slice(0, grenze).map((s) => {
      const pr = gepflegt.get(s.epicId);
      const sz = szene.get(s.epicId);
      return {
        ...s,
        anzeige: pr?.anzeige || pr?.name || sz?.name || s.name,
        // Von Hand gesetzt? Dann wird der Name unveraendert gezeigt - kein
        // Abschleifen, keine Sonderzeichen-Kosmetik.
        gepflegt: Boolean(pr?.anzeige || pr?.name),
        land: pr?.land || sz?.land || null,
        x: pr?.x ?? null,
        bild: bildZu.get(s.epicId)?.pfad ?? null,
        echtesFoto: bildZu.get(s.epicId)?.echt ?? false,
        // Nicht die Region des Spieltags, sondern die des Kontos.
        heimat: heimat.get(s.epicId) ?? s.regionen[0] ?? '',
      };
    });

    return NextResponse.json({
      success: true,
      quelle: QUELLE,
      spieltage,
      gesamt: gefiltert.length,
      sort: feld,
      spieler: mitProfil,
    });
  } catch (fehler) {
    return NextResponse.json(
      { success: false, error: (fehler as Error).message }, { status: 500 });
  }
}
