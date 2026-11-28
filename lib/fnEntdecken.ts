/*
 * Was Fortnites "Entdecken" gerade zeigt - mit den Spielerzahlen von jetzt (27.11.2026, Community-Bereich des neuen Hubs).
 *
 * Quelle ist Epics Entdecken-Dienst, derselbe, den das Spiel beim Oeffnen der Uebersicht fragt. Er nennt je Reihe ("Beliebt", "Von Epic" ...) die
 * Codes und zu jedem die Zahl der Spieler in diesem Moment (globalCCU) - auch fuer Epics eigene Modi (Battle Royale, Reload, OG ...), die in der
 * oeffentlichen Daten-Schnittstelle fehlen. Titel und Bilder kommen aus dem Links-Dienst (lib/fnInseln).
 *
 * Der Weg, wie ihn das Spiel geht:
 *   1. Welche Fassung laeuft?          GET  fortnite/api/version            -> "Release-39.30"
 *   2. Die Marke fuer diese Fassung    GET  fortnite/api/discovery/accessToken/++Fortnite+Release-39.30
 *   3. Die Uebersicht                  POST discovery/surface/CreativeDiscoverySurface_Frontend   (Kopf X-Epic-Access-Token)
 *   4. Weitere Seiten einer Reihe      POST discovery/surface/.../page
 *
 * Frist: fuenf Minuten. Dazu ein Verlauf je Code in Stundenpunkten ueber sieben Tage (fuer die Kurven im Hub).
 */

import { aendereJson, liesJson } from '@/lib/ablage';
import { getToken } from '@/lib/epicCups';
import { epicAbruf, epicFehler, mitSpeicher } from '@/lib/fnEpic';
import { holeInseln, type InselIntern } from '@/lib/fnInseln';

const FN = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api';
export const ENTDECKEN = 'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v2/discovery/surface';
const FLAECHE = 'CreativeDiscoverySurface_Frontend';

export const ENTDECKEN_FRIST_MS = 5 * 60_000;
/** So viele Folgeseiten werden je Abruf hoechstens nachgeladen (jede ist eine Anfrage an Epic). */
const SEITEN_HOECHSTENS = 16;
/** Und so viele je Reihe. */
const SEITEN_JE_REIHE = 2;

export interface Eintrag {
  code: string;
  titel: string;
  bild: string | null;
  creator: string | null;
  spieler: number;
  /** Von Epic selbst (Battle Royale, Reload, LEGO ...), nicht von einem Ersteller. */
  epic: boolean;
}

export interface Reihe {
  name: string;
  titel: string | null;
  codes: string[];
}

export interface Stand {
  stand: string;
  eintraege: Eintrag[];
  /** Die Reihen der Uebersicht in Epics Reihenfolge (nur mit ?reihen=1 in der Antwort). */
  reihen: Reihe[];
}

/* ------------------------------------------------------------ Fassung und Marke */

export interface Fassung { zweig: string; agent: string }

/**
 * Die laufende Fassung des Spiels ("++Fortnite+Release-39.30"). Der Entdecken-Dienst gibt seine Marke je Fassung aus; nach einem Update gilt die
 * alte nicht mehr. Eine Stunde gemerkt - ein Update kommt hoechstens alle zwei Wochen.
 */
export function fassung(): Promise<Fassung> {
  return mitSpeicher('entdecken|fassung', 60 * 60_000, async () => {
    const a = await epicAbruf<{ version?: string; branch?: string; cln?: string }>(`${FN}/version`);
    const zweig = a.daten?.branch || (a.daten?.version ? `Release-${a.daten.version}` : '');
    if (a.status !== 200 || !/^Release-\d+\.\d+/.test(zweig)) throw new Error(`Fassung des Spiels nicht feststellbar: ${epicFehler(a)}`);
    const voll = `++Fortnite+${zweig}`;
    return { zweig: voll, agent: `Fortnite/${voll}-CL-${a.daten?.cln || '0'} Windows/10.0.19045.1.256.64bit` };
  });
}

export function marke(f: Fassung): Promise<string> {
  return mitSpeicher(`entdecken|marke|${f.zweig}`, 60 * 60_000, async () => {
    const a = await epicAbruf<{ token?: string }>(`${FN}/discovery/accessToken/${encodeURIComponent(f.zweig)}`, { kopf: { 'User-Agent': f.agent } });
    if (a.status !== 200 || !a.daten?.token) throw new Error(`Marke fuer Entdecken nicht erhalten: ${epicFehler(a)}`);
    return a.daten.token;
  });
}

/* ------------------------------------------------------------ Die Uebersicht */

interface RohTreffer { linkCode?: string; globalCCU?: number; isVisible?: boolean }
interface RohSeite { results?: RohTreffer[]; hasMore?: boolean }
interface RohReihe { panelName?: string; panelDisplayName?: string | null; firstPage?: RohSeite }
interface RohFlaeche { testVariantName?: string; panels?: RohReihe[] }

async function ladeFlaeche(): Promise<{ reihen: Reihe[]; spieler: Map<string, number> }> {
  const f = await fassung();
  const { accountId } = await getToken();
  const kopf = { 'X-Epic-Access-Token': await marke(f), 'User-Agent': f.agent };
  const frage = `?appId=Fortnite&stream=${encodeURIComponent(f.zweig)}`;
  // Wer fragt: ein gewoehnlicher Spieler in Europa am PC, allein in der Gruppe. Epic verlangt die Angaben, die Zahlen (globalCCU) haengen nicht daran.
  const spielerAngaben = {
    playerId: accountId, partyMemberIds: [accountId], locale: 'en', matchmakingRegion: 'EU', platform: 'Windows',
    isCabined: false, ratingAuthority: 'USK', rating: 'USK_AGE_12', numLocalPlayers: 1,
  };

  const a = await epicAbruf<RohFlaeche>(`${ENTDECKEN}/${FLAECHE}${frage}`, { body: { ...spielerAngaben, accountLevel: 100, battlepassLevel: 1 }, kopf, ms: 20_000 });
  if (a.status !== 200 || !Array.isArray(a.daten?.panels)) throw new Error(`Entdecken nicht erhalten: ${epicFehler(a)}`);

  const spieler = new Map<string, number>();
  const nimm = (treffer: RohTreffer[] | undefined, codes: string[]) => {
    for (const t of treffer ?? []) {
      if (!t?.linkCode) continue;
      codes.push(t.linkCode);
      const n = Number(t.globalCCU);
      // Dieselbe Insel steht oft in mehreren Reihen - die Zahl ist dieselbe; bei Abweichung (zwei Abrufe, Sekunden auseinander) gilt die hoehere.
      if (Number.isFinite(n) && n > (spieler.get(t.linkCode) ?? -1)) spieler.set(t.linkCode, n);
    }
  };

  const reihen: Reihe[] = [];
  const mehr: Array<{ reihe: Reihe; seite: number }> = [];
  for (const p of a.daten.panels) {
    if (!p?.panelName) continue;
    const reihe: Reihe = { name: p.panelName, titel: p.panelDisplayName ?? null, codes: [] };
    nimm(p.firstPage?.results, reihe.codes);
    reihen.push(reihe);
    if (p.firstPage?.hasMore) mehr.push({ reihe, seite: 1 });
  }

  /*
   * Folgeseiten: reihum je Reihe eine Seite, bis das Kontingent aufgebraucht ist - so bekommt jede Reihe ihre zweite Seite, bevor eine die dritte
   * bekommt. Scheitert eine Folgeseite, bleibt die Reihe bei dem, was sie hat; die Uebersicht selbst steht ja schon.
   */
  let geholt = 0;
  for (let runde = 1; runde <= SEITEN_JE_REIHE && mehr.length && geholt < SEITEN_HOECHSTENS; runde += 1) {
    const jetzt = mehr.splice(0, Math.min(mehr.length, SEITEN_HOECHSTENS - geholt));
    geholt += jetzt.length;
    for (let i = 0; i < jetzt.length; i += 4) {
      await Promise.all(jetzt.slice(i, i + 4).map(async ({ reihe, seite }) => {
        try {
          const s = await epicAbruf<RohSeite>(`${ENTDECKEN}/${FLAECHE}/page${frage}`, {
            body: { ...spielerAngaben, testVariantName: a.daten?.testVariantName, panelName: reihe.name, pageIndex: seite }, kopf,
          });
          if (s.status !== 200) return;
          nimm(s.daten?.results, reihe.codes);
          if (s.daten?.hasMore) mehr.push({ reihe, seite: seite + 1 });
        } catch { /* diese Reihe bleibt kuerzer */ }
      }));
    }
  }
  for (const r of reihen) r.codes = [...new Set(r.codes)];
  return { reihen: reihen.filter((r) => r.codes.length), spieler };
}

/**
 * Aus Codes und Zahlen die Liste - Spiellisten eines Modus zusammengefasst.
 *
 * Epic fuehrt einen Modus als "Set" (set_br_playlists = Battle Royale) und darunter seine Spiellisten (playlist_defaultsolo, ..._duo ...); jede
 * Spielliste nennt ihr Set (parent_set). Meist steht in der Uebersicht das Set mit der Summe. Steht stattdessen (oder zusaetzlich) eine einzelne
 * Spielliste da, soll der Hub trotzdem eine Zeile "Battle Royale" zeigen:
 *   - Set und Spielliste beide da  -> die Spielliste faellt weg (ihre Spieler stecken in der Zahl des Sets),
 *   - nur Spiellisten da           -> sie werden unter dem Code des Sets zusammengezaehlt.
 */
async function formeEintraege(spieler: Map<string, number>): Promise<Eintrag[]> {
  const { inseln } = await holeInseln([...spieler.keys()]);

  const summe = new Map<string, number>();
  const teile = new Map<string, number>();
  for (const [code, n] of spieler) {
    const eltern = inseln.get(code)?.eltern;
    if (!eltern || eltern === code) { summe.set(code, Math.max(n, summe.get(code) ?? 0)); continue; }
    teile.set(eltern, (teile.get(eltern) ?? 0) + n);
  }
  const nurTeile = [...teile.keys()].filter((set) => !summe.has(set));
  if (nurTeile.length) {
    const { inseln: sets } = await holeInseln(nurTeile);
    for (const set of nurTeile) {
      summe.set(set, teile.get(set) ?? 0);
      const i = sets.get(set);
      if (i) inseln.set(set, i);
    }
  }

  const eintraege: Eintrag[] = [];
  for (const [code, n] of summe) {
    if (!(n > 0)) continue;
    const i: InselIntern | null | undefined = inseln.get(code);
    eintraege.push({
      code, titel: i?.titel ?? code, bild: i?.bild ?? null, creator: i?.creator ?? null, spieler: n,
      // Kennt der Links-Dienst den Code gerade nicht, entscheidet die Form: Epics eigene Codes sind Namen, Inseln von Erstellern zwoelf Ziffern.
      epic: i ? i.epic : !/^\d{4}-\d{4}-\d{4}$/.test(code),
    });
  }
  return eintraege.sort((x, y) => y.spieler - x.spieler || x.code.localeCompare(y.code));
}

/** Der Stand von jetzt, hoechstens fuenf Minuten alt. Antwortet Epic nicht, gilt der letzte weiter. */
export function entdecken(): Promise<Stand> {
  taktStarten();
  Z.gefragt = Date.now();
  return standHolen();
}

function standHolen(): Promise<Stand> {
  return mitSpeicher<Stand>('entdecken|stand', ENTDECKEN_FRIST_MS, async () => {
    const { reihen, spieler } = await ladeFlaeche();
    const stand: Stand = { stand: new Date().toISOString(), eintraege: await formeEintraege(spieler), reihen };
    verlaufMerken(stand);
    return stand;
  });
}

/* ------------------------------------------------------------ Verlauf */

/*
 * Stundenpunkte ueber sieben Tage, je Code der HOECHSTE Stand der Stunde.
 *
 * Der hoechste und nicht der Mittelwert, weil er sich ohne Zaehler fortschreiben laesst: ein Neustart mitten in der Stunde oder ein zweiter Vorgang,
 * der dieselbe Datei schreibt, verfaelscht ihn nicht (max ist max). Gefuehrt werden die oberen Eintraege jedes Abrufs und alle von Epic.
 *
 * Geschrieben wird hoechstens alle dreissig Minuten in die Ablage (fn-entdecken-verlauf.json) - jede Fassung ist dort ein Commit. Was dazwischen
 * liegt, steht im Arbeitsspeicher; nach einem Neustart fehlen hoechstens diese Minuten, und die Stunde fuellt sich mit dem naechsten Abruf wieder.
 *
 * Damit die Kurve keine Loecher hat, wenn eine Weile niemand die Seite oeffnet, holt der Server den Stand selbst alle fuenf Minuten - aber nur,
 * solange in den letzten 24 Stunden jemand danach gefragt hat. Ohne Besucher kostet es Epic nichts.
 */
const VERLAUF_DATEI = 'fn-entdecken-verlauf.json';
const STUNDEN = 7 * 24;
const VERLAUF_OBERE = 60;
const VERLAUF_CODES = 400;
const SCHREIB_ABSTAND_MS = 30 * 60_000;
const GEFRAGT_FRIST_MS = 24 * 60 * 60_000;

/** stunden: Stunden seit 1970, aufsteigend; werte[code][i] gehoert zu stunden[i] (null = in der Stunde nicht gesehen). */
interface Verlauf { stunden: number[]; werte: Record<string, Array<number | null>> }

interface Zustand {
  verlauf: Verlauf | null; geladen: boolean; laedt: Promise<Verlauf> | null; geaendert: boolean; geschrieben: number; schreibt: boolean;
  uhr: ReturnType<typeof setInterval> | null; gefragt: number;
}
const Z: Zustand = ((globalThis as { __comphubFnEntdecken?: Zustand }).__comphubFnEntdecken ??= {
  verlauf: null, geladen: false, laedt: null, geaendert: false, geschrieben: Date.now(), schreibt: false, uhr: null, gefragt: 0,
});

const gueltig = (v: unknown): v is Verlauf => Boolean(v) && Array.isArray((v as Verlauf).stunden) && typeof (v as Verlauf).werte === 'object';

/** Zwei Verlaeufe zu einem: alle Stunden beider, je Punkt der hoehere Wert, auf sieben Tage gekuerzt. */
function mische(a: Verlauf, b: Verlauf): Verlauf {
  const ab = Math.floor(Date.now() / 3_600_000) - STUNDEN + 1;
  const stunden = [...new Set([...a.stunden, ...b.stunden])].filter((s) => Number.isFinite(s) && s >= ab).sort((x, y) => x - y);
  const stelle = new Map(stunden.map((s, i) => [s, i]));
  const werte: Verlauf['werte'] = {};
  for (const v of [a, b]) {
    for (const [code, reihe] of Object.entries(v.werte)) {
      if (!Array.isArray(reihe)) continue;
      const ziel = (werte[code] ??= new Array<number | null>(stunden.length).fill(null));
      reihe.forEach((w, i) => {
        const j = stelle.get(v.stunden[i]);
        if (j !== undefined && typeof w === 'number' && w > (ziel[j] ?? -1)) ziel[j] = w;
      });
    }
  }
  // Codes ohne einen einzigen Punkt im Zeitraum fallen weg; sind es danach noch zu viele, die mit dem niedrigsten Hoechststand.
  let codes = Object.keys(werte).filter((c) => werte[c].some((w) => w !== null));
  if (codes.length > VERLAUF_CODES) {
    const spitze = (c: string) => Math.max(...werte[c].map((w) => w ?? 0));
    codes = codes.sort((x, y) => spitze(y) - spitze(x)).slice(0, VERLAUF_CODES);
  }
  return { stunden, werte: Object.fromEntries(codes.map((c) => [c, werte[c]])) };
}

async function verlaufLaden(): Promise<Verlauf> {
  if (Z.geladen && Z.verlauf) return Z.verlauf;
  Z.laedt ??= liesJson<unknown>(VERLAUF_DATEI, null)
    .catch(() => null)
    .then((v) => {
      const ausAblage: Verlauf = gueltig(v) ? v : { stunden: [], werte: {} };
      // Was vor dem Laden schon gemerkt wurde (der erste Abruf wartet nicht auf die Ablage), geht nicht verloren.
      Z.verlauf = mische(ausAblage, Z.verlauf ?? { stunden: [], werte: {} });
      Z.geladen = true;
      return Z.verlauf;
    })
    .finally(() => { Z.laedt = null; });
  return Z.laedt;
}

function verlaufMerken(stand: Stand): void {
  const stunde = Math.floor(Date.parse(stand.stand) / 3_600_000);
  const jetzt: Verlauf = { stunden: [stunde], werte: {} };
  stand.eintraege.forEach((e, i) => { if (i < VERLAUF_OBERE || e.epic) jetzt.werte[e.code] = [e.spieler]; });
  Z.verlauf = mische(Z.verlauf ?? { stunden: [], werte: {} }, jetzt);
  Z.geaendert = true;
  void verlaufLaden().then(() => verlaufSichern()).catch(() => { /* beim naechsten Abruf wieder */ });
}

async function verlaufSichern(): Promise<void> {
  if (!Z.geaendert || Z.schreibt || !Z.verlauf || Date.now() - Z.geschrieben < SCHREIB_ABSTAND_MS) return;
  Z.schreibt = true;
  try {
    // Auf den frisch gelesenen Stand gesetzt (aendereJson): schreibt ein zweiter Vorgang dieselbe Datei, bleiben seine Punkte erhalten.
    const neu = await aendereJson<Verlauf>(VERLAUF_DATEI, { stunden: [], werte: {} }, (alt) => mische(gueltig(alt) ? alt : { stunden: [], werte: {} }, Z.verlauf!), 0);
    Z.verlauf = mische(neu, Z.verlauf);
    Z.geaendert = false;
  } catch { /* bleibt vorgemerkt - in einer halben Stunde wieder */ }
  Z.geschrieben = Date.now();
  Z.schreibt = false;
}

function taktStarten(): void {
  if (Z.uhr || process.env.NEXT_PHASE === 'phase-production-build') return;
  Z.uhr = setInterval(() => {
    if (Date.now() - Z.gefragt > GEFRAGT_FRIST_MS) return;
    void standHolen().catch(() => { /* Epic antwortet gerade nicht - in fuenf Minuten wieder */ });
  }, ENTDECKEN_FRIST_MS + 5_000);
  Z.uhr.unref?.();
}

export interface VerlaufAntwort {
  stand: string;
  /** Je Code die Stundenpunkte, aufsteigend: [Beginn der Stunde in ms seit 1970, hoechste Spielerzahl der Stunde]. */
  verlauf: Record<string, Array<[number, number]>>;
}

/** Der Verlauf fuer die gefragten Codes (oder alle gefuehrten) ueber die letzten `tage` Tage. */
export async function entdeckenVerlauf(codes: string[] | null, tage: number): Promise<VerlaufAntwort> {
  const v = await verlaufLaden();
  const ab = Math.floor(Date.now() / 3_600_000) - Math.max(1, Math.min(7, tage)) * 24 + 1;
  const verlauf: VerlaufAntwort['verlauf'] = {};
  for (const code of codes ?? Object.keys(v.werte)) {
    const reihe = v.werte[code];
    if (!reihe) continue;
    const punkte: Array<[number, number]> = [];
    reihe.forEach((w, i) => { if (typeof w === 'number' && v.stunden[i] >= ab) punkte.push([v.stunden[i] * 3_600_000, w]); });
    if (punkte.length) verlauf[code] = punkte;
  }
  return { stand: new Date().toISOString(), verlauf };
}
