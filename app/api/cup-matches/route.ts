import path from 'path';
import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import {
  gecacht, holeTop, getToken, loeseNamenAuf, EpicLoginNoetig, type CupEintrag,
} from '@/lib/epicCups';
import {
  holeKatalog, punkteFuerRunde, regionAus, wertungVon, type WertungsRegel,
} from '@/lib/cupWertung';

// Die einzelnen Runden eines Spieltags.
//
//   ?event=…&window=…&limit=500
//
// Epic fuehrt das Leaderboard je Team und haengt an jedes Team seine
// Rundenliste an: zu jeder gespielten Runde eine Sitzungskennung, die
// Endzeit und die gezaehlten Werte. Diese Kennung ist dieselbe, die
// anderswo "Match ID" heisst - Epic gibt sie aus, sie ist nicht erfunden.
//
// Umgedreht ergibt das, was der Betreiber sehen wollte: nicht "wie stand
// das Team am Ende des Tages", sondern "wer wurde in diesem einen Spiel
// welcher". Dafuer werden alle Rundenlisten aller Teams nach der
// Sitzungskennung gruppiert.
//
// Drei Groessen stehen nicht in Epics Antwort und werden hier hergeleitet -
// jede aus Epics eigenen Zahlen, keine geschaetzt:
//
//   Beginn der Runde   Endzeit minus Lebenszeit. Alle Teams einer Lobby
//                      starten gemeinsam; nachgemessen an einer echten
//                      Runde liegen die so errechneten Anfaenge sechs
//                      Sekunden auseinander. Genommen wird der mittlere.
//   Lobbygroesse       der hoechste vergebene Platz.
//   Noch im Spiel      der niedrigste vergebene Platz minus eins. Epic
//                      traegt ein Team erst ein, wenn es ausgeschieden ist;
//                      wer oberhalb des niedrigsten Platzes fehlt, lebt noch.
//
// Die Punkte einer Runde kommen aus Epics eigener Punktetabelle - siehe
// lib/cupWertung.ts.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TTL = 60_000;

/**
 * Wie lange eine Antwort gilt, solange eine Runde laeuft.
 *
 * Waehrend eines Spieltags will der Betreiber die Match-ID und den Stand
 * frueh sehen: "wenn Du die Delay-Zeit fixen koenntest, bis ein Livecup
 * angezeigt wird ... dass man schneller die Match ID ansehen kann." Eine
 * Minute war dafuer zu lang - der Tracker stand regelmaessig vorn.
 *
 * Fuenfzehn Sekunden. Kuerzer waere Unfug: Epic aktualisiert die Bestenliste
 * selbst nicht schneller, und jede Anfrage kostet dort mehrere Seiten.
 */
const TTL_LIVE = 15_000;

/**
 * Der beste bekannte Stand je Runde.
 *
 * Die Zahl der verbleibenden Teams darf nur fallen. Sie kam aber aus
 * verschiedenen Abfragen, und eine aeltere Antwort machte aus vierzig wieder
 * einundvierzig - der Betreiber: "und wenn ich dann meine Seite reloade, ist
 * auf einmal wieder Top einundvierzig. Das kann ja nicht sein."
 *
 * Deshalb wird der niedrigste je gesehene Platz je Runde gemerkt und nie
 * wieder nach oben gelassen. Der Vorrat lebt im laufenden Vorgang; startet
 * er neu, faengt die Zahl beim aktuellen Stand an - schlimmer als vorher
 * wird es dadurch nie.
 */
const bestenStand = new Map<string, number>();

/** Den niedrigsten je gesehenen Platz einer Runde - und nie wieder hoeher. */
function merkeStand(runde: string, jetzt: number): number {
  const alt = bestenStand.get(runde);
  const wert = alt === undefined ? jetzt : Math.min(alt, jetzt);
  bestenStand.set(runde, wert);
  /*
   * Der Vorrat waechst mit jeder Runde. Bei zweihundert Eintraegen fliegt
   * die Haelfte heraus - eine Runde von gestern interessiert niemanden mehr.
   */
  if (bestenStand.size > 200) {
    const raus = [...bestenStand.keys()].slice(0, 100);
    for (const k of raus) bestenStand.delete(k);
  }
  return wert;
}

/** Wann zu diesem Spieltag zuletzt eine laufende Runde gesehen wurde. */
const zuletztLive = new Map<string, number>();

/** Solange nach der letzten Ausscheidung gilt eine Lobby als laufend. */
const LIVE_FENSTER = 20 * 60_000;

interface Zeile {
  platz: number | null;
  /** Der Platz am Ende des ganzen Spieltags - zum Wiedererkennen. */
  tagesPlatz: number;
  teamId: string | null;
  spieler: Array<{ id: string; name: string }>;
  elims: number;
  wins: number;
  timeAlive: number;
  damage: number;
  /** Wann dieses Team ausgeschieden ist. */
  ende: string | null;
  /** Aus Epics Punktetabelle gerechnet - null, wenn es keine gibt. */
  punkte: number | null;
  /** Aus dem Replay nachgetragen, weil Epic dieses Match nicht fuehrt. */
  ausReplay?: boolean;
  /** Werte aus dem eigenen Replay - nur fuer den, der es aufgezeichnet hat. */
  eigen?: EigeneWerte | null;
}

interface Runde { ende: string | null; beginne: number[]; teams: Zeile[] }

/**
 * Wer laut Replay in welcher Lobby war.
 *
 * Epic traegt gelegentlich einzelne Matches eines Teams gar nicht in seine
 * Bestenliste ein. Weil eine Aufstellung genau aus dieser Bestenliste gebaut
 * wird, fehlt das Team dann in seiner Lobby - nachgemessen an einem
 * Reload-Duos-Finale: neun Plaetze in sieben von fuenfundvierzig Lobbys,
 * obwohl das ganze Feld mit 297 von 297 Teams geladen war.
 *
 * Im Server-Replay derselben Runde sind sie da. Die Auswertung legt deshalb
 * je Match die beteiligten Konten neben die uebrigen Werte - allerdings nur
 * fuer Finals, weil dieselbe Angabe ueber alle offenen Runden hinweg 128 MB
 * kosten wuerde und dort ohnehin die Zehntausend-Grenze der Bestenliste
 * regiert.
 *
 * Fehlt die Datei, aendert sich nichts: dann bleibt es bei dem, was Epic
 * hergibt.
 */
/**
 * Was aus einem eigenen Replay je Match herausgeloest wurde.
 *
 * Siehe scripts/eigene-replays.mjs. Diese Werte gibt es nur fuer die
 * Person, die das Replay aufgezeichnet hat - Epic veroeffentlicht sie
 * nirgends, und in einem Server-Replay stehen sie ebenfalls nicht. Wer sie
 * sehen will, laesst einmal meine-werte-holen.bat laufen.
 */
interface EigeneWerte {
  elims: number | null;
  assists: number | null;
  trefferquote: number | null;
  schadenWaffen: number | null;
  schadenSonst: number | null;
  schadenAnSpieler: number | null;
  schadenErhalten: number | null;
  schadenAnBauten: number | null;
  matsGefarmt: number | null;
  matsVerbaut: number | null;
  streckeMeter: number | null;
  wiederbelebt: number | null;
}

interface EigenesMatch {
  sitzung: string;
  konto: string;
  name: string | null;
  werte: EigeneWerte;
}

/**
 * Alle eigenen Werte, die auf diesem Stand vorliegen.
 *
 * Geordnet nach Match und Konto, damit sie beim Zusammensetzen einer
 * Aufstellung ohne Suchen danebengelegt werden koennen. Fehlt der Ordner,
 * fehlen eben die Werte - alles andere steht trotzdem da.
 */
async function eigeneWerte(): Promise<Map<string, Map<string, EigeneWerte>>> {
  const raus = new Map<string, Map<string, EigeneWerte>>();
  const wurzel = path.join(DATEN_ORT, 'eigene-matches');
  let konten: string[];
  try {
    konten = await fs.readdir(wurzel);
  } catch {
    return raus;
  }
  for (const konto of konten) {
    if (konto.startsWith('_')) continue;
    let dateien: string[];
    try {
      dateien = await fs.readdir(path.join(wurzel, konto));
    } catch { continue; }
    for (const d of dateien) {
      if (!d.endsWith('.json') || d.startsWith('_')) continue;
      try {
        const m = JSON.parse(
          await fs.readFile(path.join(wurzel, konto, d), 'utf8')) as EigenesMatch;
        if (!m?.sitzung || !m?.werte) continue;
        const sitzung = m.sitzung.toLowerCase();
        if (!raus.has(sitzung)) raus.set(sitzung, new Map());
        raus.get(sitzung)!.set((m.konto ?? konto).toLowerCase(), m.werte);
      } catch { /* eine kaputte Datei haelt den Rest nicht auf */ }
    }
  }
  return raus;
}

interface ReplayTeam {
  platz: number | null;
  spieler: Array<{ id: string; name: string | null }>;
}
/**
 * Was im Aggregat je Match steht.
 *
 * Zwei Fassungen nebeneinander: "teams" stammt aus der tiefen Auswertung
 * und nennt die Platzierung, "konten" ist der aeltere Stand und nennt nur,
 * wer dabei war. Aeltere Fenster werden nicht neu geholt - Epic haelt
 * Replays einunddreissig Tage -, also muss beides gelesen werden koennen.
 */
type Besetzung = { teams?: ReplayTeam[]; konten?: string[] } | string[];

/**
 * Konto-Kennungen vergleichbar machen.
 *
 * Epics Bestenliste schreibt sie klein, der C#-Leser des Replays gross.
 * Ohne diese Angleichung trifft nichts aufeinander: jedes Team des Replays
 * gilt dann als unbekannt und wird noch einmal angelegt - gemessen sechzig
 * Zeilen in einer Lobby mit zwanzig Teams, und siebzehnhundert
 * "nachgetragene" Teams in einem Fenster, das genau neun vermisste.
 */
const kennung = (id: string | null | undefined) => (id ?? '').toLowerCase();

async function lobbyBesetzung(
  windowId: string,
): Promise<Record<string, Besetzung>> {
  const saison = /^(S\d+)_/i.exec(windowId)?.[1]?.toUpperCase() ?? '';
  if (!saison) return {};
  try {
    const roh = await fs.readFile(
      path.join(DATEN_ORT, 'replays', saison, windowId, '_aggregat.json'), 'utf8');
    const agg = JSON.parse(roh) as { lobbys?: Record<string, Besetzung> };
    return agg.lobbys ?? {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = p.get('event');
  const window_ = p.get('window');
  // Bis zum ganzen Feld: eine Lobby einer Qualifikation zieht sich durch
  // die gesamte Bestenliste, und eine halbe Aufstellung waere schlimmer
  // als gar keine.
  const limit = Math.min(parseInt(p.get('limit') ?? '500', 10) || 500, 10_000);

  if (!event || !window_) {
    return NextResponse.json({ error: 'event und window sind noetig' }, { status: 400 });
  }

  try {
    /*
     * Laeuft gerade etwas, gilt die kurze Frist.
     *
     * Ob etwas laeuft, weiss man erst nach dem Rechnen - deshalb wird die
     * vorige Antwort befragt: stand dort eine laufende Runde, ist die
     * naechste Antwort schnell wieder faellig.
     */
    const vorher = zuletztLive.get(`${event}|${window_}`);
    const frist = vorher && Date.now() - vorher < 30 * 60_000 ? TTL_LIVE : TTL;
    const daten = await gecacht(`matches|${event}|${window_}|${limit}`, frist,
      () => holeTop(event, window_, limit));

    /*
     * Die Punktetabelle des Spieltags.
     *
     * Sie ist eine Beigabe: laesst sie sich nicht holen, bleiben die
     * Rundenpunkte leer und alles andere steht trotzdem da.
     */
    let wertung: WertungsRegel[] = [];
    try {
      const katalog = await holeKatalog(regionAus(window_));
      wertung = wertungVon(katalog, window_, event);
    } catch { /* ohne Tabelle keine Rundenpunkte */ }

    const runden = new Map<string, Runde>();
    /*
     * Zu jedem Konto sein Eintrag in der Bestenliste.
     *
     * Damit bekommt ein Team, das aus dem Replay nachgetragen wird, seinen
     * richtigen Namen, seinen Mitspieler und seinen Tagesplatz - alles aus
     * Epics eigenen Daten. Erfunden wird nichts; das Replay sagt nur, DASS
     * es in dieser Lobby war.
     */
    const nachKonto = new Map<string, CupEintrag>();
    for (const e of daten.entries as CupEintrag[]) {
      for (const sp of e.players) if (sp.id) nachKonto.set(kennung(sp.id), e);
    }

    for (const e of daten.entries as CupEintrag[]) {
      for (const m of e.matches) {
        if (!m.sessionId) continue;
        const r = runden.get(m.sessionId)
          ?? { ende: m.endTime ?? null, beginne: [], teams: [] };
        // Die spaeteste Endzeit der Runde - das ist ihr Ende.
        if (m.endTime && (!r.ende || m.endTime > r.ende)) r.ende = m.endTime;
        if (m.endTime && typeof m.timeAlive === 'number' && m.timeAlive > 0) {
          r.beginne.push(Date.parse(m.endTime) - m.timeAlive * 1000);
        }
        const platz = typeof m.placement === 'number' ? m.placement : null;
        r.teams.push({
          platz,
          tagesPlatz: e.rank,
          teamId: e.teamId,
          spieler: e.players.map((s) => ({ id: s.id, name: s.name })),
          elims: m.elims ?? 0,
          wins: m.wins ?? 0,
          timeAlive: m.timeAlive ?? 0,
          damage: m.damage ?? 0,
          ende: m.endTime ?? null,
          punkte: punkteFuerRunde(wertung, platz, m.elims ?? 0),
        });
        runden.set(m.sessionId, r);
      }
    }

    /*
     * Die Teams nachtragen, die Epic zu dieser Runde nicht gefuehrt hat.
     *
     * Sie bekommen keinen Platz - der laesst sich aus dem Replay nicht
     * gewinnen. Nachgemessen: ordnet man die Teams nach ihrem
     * Todeszeitpunkt, ergibt das in null von sieben Lobbys die echten
     * Plaetze; wer im Sturm stirbt oder ueberlebt, taucht in den
     * Ereignissen gar nicht auf. Ein Platz waere also geraten - der Name
     * dagegen ist belegt.
     */
    const besetzung = await lobbyBesetzung(window_);
    let nachgetragen = 0;
    /** Wie viele Plaetze aus dem Replay stammen statt aus der Bestenliste. */
    let plaetzeAusReplay = 0;

    /*
     * Die Namen der Konten, die Epic nicht in seiner Bestenliste fuehrt.
     *
     * Erst sammeln, dann in einem Zug aufloesen: Epic nimmt hundert Konten
     * je Abfrage, und einzeln nachzufragen waere je Lobby eine eigene
     * Runde bei einer Schnittstelle, die ohnehin ungern viel gefragt wird.
     */
    /** Die blossen Konten einer Besetzung - egal in welcher Fassung. */
    const kontenVon = (b: Besetzung): string[] => {
      if (Array.isArray(b)) return b;
      if (b.teams?.length) {
        return b.teams.flatMap((t) => t.spieler.map((p) => kennung(p.id)));
      }
      return (b.konten ?? []).map(kennung);
    };

    const namenNach = new Map<string, string>();
    const offen = new Set<string>();
    for (const [sitzung, b] of Object.entries(besetzung)) {
      const r = runden.get(sitzung);
      if (!r) continue;
      const da = new Set<string>();
      for (const t of r.teams) for (const sp of t.spieler) da.add(kennung(sp.id));
      for (const k of kontenVon(b)) if (!da.has(k) && !nachKonto.has(k)) offen.add(k);
    }
    if (offen.size) {
      try {
        const { token } = await getToken();
        const namen = await loeseNamenAuf([...offen], token);
        for (const [id, name] of Object.entries(namen)) namenNach.set(id, name);
      } catch { /* ohne Namen bleibt die gekuerzte Kennung */ }
    }
    for (const [sitzung, b] of Object.entries(besetzung)) {
      const r = runden.get(sitzung);
      if (!r) continue;

      /*
       * Wo das Replay die Platzierung kennt, gilt sie.
       *
       * Sie ist abgelesen, nicht abgeleitet - der C#-Leser gibt die
       * vollstaendige Aufstellung eines Matches heraus, nachgemessen
       * zwanzig Teams mit den Plaetzen eins bis zwanzig, lueckenlos. Epics
       * Bestenliste hat an derselben Stelle Loecher, weil sie einzelne
       * Matches eines Teams nicht fuehrt.
       *
       * Getroffen werden die Teams ueber die Konto-Kennung; wo Epic schon
       * einen Platz nennt, bleibt er stehen, damit sich beide Quellen nicht
       * gegenseitig ueberschreiben.
       */
      const ausReplay = !Array.isArray(b) ? (b.teams ?? []) : [];
      const platzFuer = new Map<string, number>();
      for (const t of ausReplay) {
        if (t.platz === null || t.platz === undefined) continue;
        for (const p of t.spieler) platzFuer.set(kennung(p.id), t.platz);
      }
      if (platzFuer.size) {
        for (const t of r.teams) {
          if (t.platz !== null && t.platz !== undefined) continue;
          for (const sp of t.spieler) {
            const p = platzFuer.get(kennung(sp.id));
            if (p !== undefined) { t.platz = p; plaetzeAusReplay += 1; break; }
          }
        }
      }

      const konten = kontenVon(b);
      const schonDa = new Set<string>();
      for (const t of r.teams) for (const sp of t.spieler) schonDa.add(kennung(sp.id));

      const neueTeams = new Set<CupEintrag>();
      /*
       * Konten, die Epic ueberhaupt nicht fuehrt.
       *
       * Sie sind der haeufigere Fall: nachgemessen an einem
       * Reload-Duos-Finale stehen von den Konten, die in einer
       * Lobby fehlen, null in der Bestenliste - auch nicht mit null
       * Punkten. Ihr Name laesst sich aber unmittelbar bei Epic
       * nachschlagen, und das ist derselbe Weg, ueber den jeder andere
       * Name dieser Seite kommt.
       */
      const unbekannt: string[] = [];
      for (const konto of konten) {
        if (schonDa.has(konto)) continue;
        const eintrag = nachKonto.get(konto);
        if (eintrag) neueTeams.add(eintrag);
        else unbekannt.push(konto);
      }
      for (const e of neueTeams) {
        const p = e.players.map((sp) => platzFuer.get(kennung(sp.id)))
          .find((x) => x !== undefined) ?? null;
        if (p !== null) plaetzeAusReplay += 1;
        r.teams.push({
          platz: p,
          tagesPlatz: e.rank,
          teamId: e.teamId,
          spieler: e.players.map((sp) => ({ id: sp.id, name: sp.name })),
          elims: 0, wins: 0, timeAlive: 0, damage: 0,
          ende: null, punkte: null,
          ausReplay: true,
        });
        nachgetragen += 1;
      }
      /*
       * Als Team, so wie das Replay sie gruppiert.
       *
       * Frueher stand hier je Konto eine eigene Zeile, weil weder Epic noch
       * die Ereignisse verraten, wer mit wem spielte - ein Duo erschien
       * dann zweimal mit demselben Platz. Die tiefe Auswertung des Replays
       * gruppiert die Spieler aber selbst; das ist abgelesen und nicht
       * geraten, also wird es genommen.
       */
      const offenNoch = new Set(unbekannt);
      for (const t of ausReplay) {
        const seine = t.spieler.filter((p) => offenNoch.has(kennung(p.id)));
        if (!seine.length) continue;
        for (const p of seine) offenNoch.delete(kennung(p.id));
        if (t.platz !== null && t.platz !== undefined) plaetzeAusReplay += 1;
        r.teams.push({
          platz: t.platz ?? null,
          tagesPlatz: 0,
          teamId: null,
          spieler: seine.map((p) => ({
            id: kennung(p.id),
            name: p.name ?? namenNach.get(kennung(p.id)) ?? kennung(p.id).slice(0, 8),
          })),
          elims: 0, wins: 0, timeAlive: 0, damage: 0,
          ende: null, punkte: null,
          ausReplay: true,
        });
        nachgetragen += 1;
      }
      // Was das Replay nicht gruppiert hat - aeltere Auswertungen ohne
      // Aufstellung -, bleibt einzeln stehen. Ein Platz steht dort nicht.
      for (const konto of offenNoch) {
        r.teams.push({
          platz: platzFuer.get(konto) ?? null,
          tagesPlatz: 0,
          teamId: null,
          spieler: [{ id: konto, name: namenNach.get(konto) ?? konto.slice(0, 8) }],
          elims: 0, wins: 0, timeAlive: 0, damage: 0,
          ende: null, punkte: null,
          ausReplay: true,
        });
        nachgetragen += 1;
      }
    }

    /*
     * Und die eigenen Werte danebenlegen, wo es welche gibt.
     *
     * Sie haengen an Match und Konto. Betroffen ist immer nur die Zeile
     * des eigenen Teams; alle anderen bleiben, wie Epic sie liefert - fuer
     * sie existieren diese Zahlen schlicht nicht.
     */
    const eigene = await eigeneWerte();
    let mitEigenen = 0;
    if (eigene.size) {
      for (const [sitzung, r] of runden) {
        const jeKonto = eigene.get(sitzung.toLowerCase());
        if (!jeKonto) continue;
        for (const t of r.teams) {
          for (const sp of t.spieler) {
            const w = jeKonto.get(kennung(sp.id));
            if (w) { t.eigen = w; mitEigenen += 1; break; }
          }
        }
      }
    }

    const jetzt = Date.now();

    /*
     * Die Runden in ihrer Reihenfolge.
     *
     * Nummeriert wird nach der Endzeit, nicht nach der Reihenfolge, in der
     * Epic sie ausliefert - die haengt am Team, dessen Liste gerade gelesen
     * wurde. "Spiel 3" soll fuer alle dasselbe Spiel meinen.
     */
    const spiele = [...runden.entries()]
      .map(([id, r]) => ({
        id,
        ende: r.ende,
        beginne: r.beginne,
        teams: r.teams.sort((a, b) =>
          (a.platz ?? 9999) - (b.platz ?? 9999) || a.tagesPlatz - b.tagesPlatz),
      }))
      .sort((a, b) => (a.ende ?? '').localeCompare(b.ende ?? ''))
      .map((s, i) => {
        const plaetze = s.teams
          .map((x) => x.platz)
          .filter((n): n is number => typeof n === 'number');
        const hoechster = plaetze.length ? Math.max(...plaetze) : 0;
        const niedrigster = plaetze.length ? Math.min(...plaetze) : 0;

        /*
         * Der Beginn der Runde - der mittlere der errechneten Anfaenge.
         *
         * Der Mittelwert waere anfaellig: ein Team, dessen Lebenszeit Epic
         * abweichend zaehlt, zoege ihn mit. Der mittlere Wert nicht.
         */
        const sortiert = [...s.beginne].sort((a, b) => a - b);
        const beginn = sortiert.length
          ? sortiert[Math.floor(sortiert.length / 2)] : null;

        /*
         * Laeuft diese Lobby noch?
         *
         * Zwei Bedingungen zusammen: es gibt noch keinen ersten Platz, und
         * die letzte Ausscheidung liegt nicht lange zurueck. Ohne die zweite
         * gaelte jede Lobby, aus der wir nur einen Ausschnitt sehen, auf
         * ewig als laufend.
         */
        const letzteAenderung = s.ende ? Date.parse(s.ende) : 0;
        const live = niedrigster > 1
          && letzteAenderung > 0
          && jetzt - letzteAenderung < LIVE_FENSTER;

        /*
         * Ist diese Aufstellung vollstaendig?
         *
         * Epics Bestenliste gibt hoechstens zehntausend Plaetze heraus. In
         * einer Qualifikation mit mehr Teilnehmern fehlen deshalb genau die
         * Lobby-Mitglieder, die weiter hinten stehen - und dann steht eine
         * Liste da, in der auf Platz 2 der Platz 5 folgt.
         *
         * Der Betreiber dazu: "Wenn Du schon eine Lobby erstellst mit einer
         * Liste, dann jeden Spieler von eins bis hundert. Wenn Du mal nicht
         * alle hast, dann schreibst Du nur die Match-ID hin."
         *
         * Bei einer laufenden Lobby gilt das nicht: dort fehlen die Teams,
         * die noch leben, und das ist keine Luecke, sondern der Spielstand.
         * Erwartet werden deshalb nur die Plaetze unterhalb des niedrigsten
         * gesehenen.
         */
        const erwartet = hoechster - (live ? niedrigster : 1) + 1;
        /*
         * Doppelte Platznummern sind kein Loch.
         *
         * Epic vergibt bei einem Verbindungsabbruch schon einmal denselben
         * Platz zweimal. Frueher galt eine Lobby deshalb als unvollstaendig,
         * obwohl kein einziger Platz fehlte - von siebenundneunzig beendeten
         * Runden bestanden null die Pruefung, und die Aufstellung blieb
         * ueberall verborgen. Gezaehlt werden deshalb die verschiedenen
         * Plaetze, nicht die Zeilen.
         */
        const einmalig = new Set(plaetze);
        const vollstaendig = plaetze.length > 0 && einmalig.size >= erwartet;

        return {
          id: s.id,
          ende: s.ende,
          teams: s.teams,
          nummer: i + 1,
          live,
          /** Beginn der Runde als ISO-Zeit - hergeleitet, siehe oben. */
          beginn: beginn ? new Date(beginn).toISOString() : null,
          /**
           * Wie lange die Runde laeuft beziehungsweise lief, in Sekunden.
           * Bei einer laufenden Lobby bis jetzt, sonst bis zur letzten
           * Ausscheidung.
           */
          dauer: beginn
            ? Math.max(0, Math.round(
              ((live ? jetzt : letzteAenderung || jetzt) - beginn) / 1000))
            : null,
          /** Der hoechste vergebene Platz - so gross war die Lobby. */
          lobby: hoechster || null,
          /**
           * Wie viele Teams noch im Spiel sind.
           *
           * Nur abwaerts: eine aeltere Antwort darf die Zahl nicht wieder
           * anheben. Siehe bestenStand oben.
           */
          verbleibend: live
            ? Math.max(0, merkeStand(s.id, niedrigster) - 1) : 0,
          /** Wie viele Teams wir zu dieser Runde ueberhaupt sehen. */
          gesehen: s.teams.length,
          vollstaendig,
          /** Wie viele Plaetze in der erwarteten Spanne fehlen. */
          fehlend: Math.max(0, erwartet - einmalig.size),
          laengsteLebenszeit: s.teams.reduce((a, t) => Math.max(a, t.timeAlive), 0),
          sieger: s.teams.find((t) => t.platz === 1)?.spieler.map((x) => x.name) ?? [],
        };
      })
      // Das Juengste zuerst: wer nachsieht, sucht die laufende oder die
      // gerade beendete Runde, nicht die von vor zwei Stunden.
      .sort((a, b) => (b.ende ?? '').localeCompare(a.ende ?? ''));

    /*
     * Merken, dass hier gerade gespielt wird.
     *
     * Danach richtet sich die Frist der naechsten Antwort: waehrend eines
     * Spieltags soll sie nach fuenfzehn Sekunden wieder faellig sein, sonst
     * nach einer Minute.
     */
    if (spiele.some((x) => x.live)) {
      zuletztLive.set(`${event}|${window_}`, Date.now());
    }

    /*
     * Reichte die Bestenliste ueberhaupt bis ans Ende des Feldes?
     *
     * Eine Lobby wird aus den Teams gebaut, die in der Bestenliste stehen.
     * Epic gibt daraus hoechstens zehntausend Plaetze heraus; wer im
     * Tagesranking dahinter liegt, kommt in keiner Aufstellung vor - auch
     * dann nicht, wenn er in seiner Lobby Dritter wurde.
     *
     * Bisher fiel das nur auf, wenn dadurch eine Luecke entstand ("auf
     * Platz 2 folgt Platz 7"). Endet eine Aufstellung dagegen glatt bei
     * acht, sieht sie vollstaendig aus und ist es nicht: die Plaetze
     * danach fehlen geschlossen. Der Betreiber hat genau das gemeldet -
     * "im Bild zwei wird nicht mal gesagt, dass da Stats fehlen".
     *
     * Kam die Bestenliste an ihre Grenze, gilt das fuer jede Aufstellung
     * dieses Spieltags, und die Anzeige sagt es dazu.
     */
    const feldGrenze = daten.entries.length >= limit;

    return NextResponse.json({
      spiele,
      teams: daten.entries.length,
      /** Stiess die Bestenliste an ihre Grenze? Dann fehlen Plaetze unten. */
      feldGrenze,
      /** Wie viele Teams aus den Replays nachgetragen wurden. */
      nachgetragen,
      /** Wie viele Plaetze aus dem Replay stammen statt aus der Bestenliste. */
      plaetzeAusReplay,
      /** Zu wie vielen Zeilen eigene Replay-Werte vorliegen. */
      mitEigenen,
      /** Steht eine Punktetabelle zur Verfuegung? */
      mitPunkten: wertung.length > 0,
      hinweis: 'Values are per team, the way Epic reports them.',
    });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
