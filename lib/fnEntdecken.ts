/*
 * Was Fortnites "Entdecken" gerade zeigt - mit den Spielerzahlen von jetzt (27.11.2026, Community-Bereich des neuen Hubs).
 *
 * Quelle ist Epics Entdecken-Dienst, derselbe, den das Spiel fragt. Er nennt je Reihe die Codes und zu jedem die Zahl der Spieler in diesem Moment
 * (globalCCU) - auch fuer Epics eigene Modi (Battle Royale, Reload, OG ...), die in der oeffentlichen Daten-Schnittstelle fehlen. Titel und Bilder
 * kommen aus dem Links-Dienst (lib/fnInseln).
 *
 * Der Weg (an der echten Quelle geprueft, 28.11.2026, Spielfassung 43.11):
 *   1. Welche Fassung laeuft?        GET  fortnite/api/version -> "Release-43.11"   (ohne "stream" antwortet der Dienst mit 400)
 *   2. Die Marke fuer diese Fassung  GET  fortnite/api/discovery/accessToken/++Fortnite+Release-43.11
 *   3. Zwei Flaechen                 POST discovery/surface/<Flaeche>
 *        CreativeDiscoverySurface_EpicPage  Epics eigene Modi: experience_br (Battle Royale), experience_reload, LEGO, Festival, Rette die Welt ...
 *        CreativeDiscoverySurface_Browse    57 Reihen nach Genre (Combat, 1v1, Tycoon ...) mit den Inseln der Ersteller
 *      Die Startflaeche des Spiels (CreativeDiscoverySurface_Frontend) taugt nicht mehr: seit dem Umbau der Uebersicht liefert sie eine einzige,
 *      leere Reihe ("Frontend_ASpot").
 *   4. Folgeseiten einer Reihe       POST discovery/surface/<Flaeche>/page   - nur alle dreissig Minuten, um weitere Inseln zu finden
 *   5. Zahlen zu bekannten Codes     POST discovery/link-entries             - fuer Inseln, die gerade nicht auf einer ersten Seite stehen
 *
 * Frist: fuenf Minuten. Dazu ein Verlauf je Code in Stundenpunkten ueber sieben Tage (fuer die Kurven im Hub).
 *
 * Was der Dienst nicht hergibt: eine Liste ALLER Inseln nach Spielerzahl. Gefuehrt wird, was in den Reihen steht (erste Seiten und zwei Folgeseiten)
 * - die grossen Inseln stehen dort, eine kleine ohne Platz in einer Reihe fehlt. Inseln, deren Zahl Epic verbirgt (globalCCU -1), fehlen ebenfalls.
 */

import { aendereJson, liesJson } from '@/lib/ablage';
import { getToken } from '@/lib/epicCups';
import { epicAbruf, epicFehler, mitSpeicher } from '@/lib/fnEpic';
import { holeInseln, type InselIntern } from '@/lib/fnInseln';

const FN = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api';
export const ENTDECKEN = 'https://fn-service-discovery-live-public.ogs.live.on.epicgames.com/api/v2/discovery';
const FLAECHE_EPIC = 'CreativeDiscoverySurface_EpicPage';
const FLAECHE_INSELN = 'CreativeDiscoverySurface_Browse';

export const ENTDECKEN_FRIST_MS = 5 * 60_000;
/** Alle dreissig Minuten werden auch Folgeseiten der Reihen geholt - hoechstens so viele Anfragen, je Reihe hoechstens SEITEN_JE_REIHE. */
const TIEF_ABSTAND_MS = 30 * 60_000;
const VERALTET_HOECHSTENS_MS = 15 * 60_000;
const SEITEN_HOECHSTENS = 80;
const SEITEN_JE_REIHE = 2;
/** So viele bekannte Codes, die gerade auf keiner ersten Seite stehen, werden je Abruf nachgefragt - und so viele je Anfrage. */
const NACHFRAGEN_HOECHSTENS = 600;
const JE_NACHFRAGE = 100;
/** Ein Code, der sieben Tage in keiner Reihe mehr stand, wird nicht weiter nachgefragt. */
const BEKANNT_FRIST_MS = 7 * 24 * 60 * 60_000;

/** Eine Spielliste innerhalb eines Modus (Solo, Duo ... unter Battle Royale). Ihre Spieler stecken schon in der Zahl des Modus. */
export interface Teil {
  code: string;
  titel: string;
  spieler: number;
}

export interface Eintrag {
  code: string;
  titel: string;
  bild: string | null;
  creator: string | null;
  spieler: number;
  /** Von Epic selbst (Battle Royale, Reload, LEGO ...), nicht von einem Ersteller. */
  epic: boolean;
  /** Nur bei Epics Modi mit mehreren Spiellisten: die einzelnen Spiellisten, nach Spielern absteigend. */
  teile?: Teil[];
}

export interface Reihe {
  name: string;
  titel: string | null;
  codes: string[];
}

export interface Stand {
  stand: string;
  eintraege: Eintrag[];
  /** Die Reihen der Flaechen in Epics Reihenfolge, nur Codes mit Spielerzahl (nur mit ?reihen=1 in der Antwort). */
  reihen: Reihe[];
}

/* ------------------------------------------------------------ Fassung und Marke */

export interface Fassung { zweig: string; agent: string; saison: number }

/**
 * Die laufende Fassung des Spiels ("++Fortnite+Release-43.11"). Der Entdecken-Dienst gibt seine Marke je Fassung aus; nach einem Update gilt die
 * alte nicht mehr. Eine Stunde gemerkt - ein Update kommt hoechstens alle zwei Wochen. Die Zahl vor dem Punkt ist zugleich die Saison (43).
 */
export function fassung(): Promise<Fassung> {
  return mitSpeicher('entdecken|fassung', 60 * 60_000, async () => {
    const a = await epicAbruf<{ version?: string; branch?: string; cln?: string }>(`${FN}/version`);
    const zweig = a.daten?.branch || (a.daten?.version ? `Release-${a.daten.version}` : '');
    const m = /^Release-(\d+)\.\d+/.exec(zweig);
    if (a.status !== 200 || !m) throw new Error(`Fassung des Spiels nicht feststellbar: ${epicFehler(a)}`);
    const voll = `++Fortnite+${zweig}`;
    return { zweig: voll, agent: `Fortnite/${voll}-CL-${a.daten?.cln || '0'} Windows/10.0.19045.1.256.64bit`, saison: Number(m[1]) };
  });
}

export function marke(f: Fassung): Promise<string> {
  return mitSpeicher(`entdecken|marke|${f.zweig}`, 60 * 60_000, async () => {
    const a = await epicAbruf<{ token?: string }>(`${FN}/discovery/accessToken/${encodeURIComponent(f.zweig)}`, { kopf: { 'User-Agent': f.agent } });
    if (a.status !== 200 || !a.daten?.token) throw new Error(`Marke fuer Entdecken nicht erhalten: ${epicFehler(a)}`);
    return a.daten.token;
  });
}

/* ------------------------------------------------------------ Die Flaechen */

interface RohTreffer { linkCode?: string; globalCCU?: number }
interface RohSeite { results?: RohTreffer[]; hasMore?: boolean }
interface RohReihe { panelName?: string; panelDisplayName?: string | null; firstPage?: RohSeite }
interface RohFlaeche { testVariantName?: string; panels?: RohReihe[] }

interface Rahmen { kopf: Record<string, string>; frage: string; wer: Record<string, unknown> }

async function rahmen(): Promise<Rahmen> {
  const f = await fassung();
  const { accountId } = await getToken();
  return {
    kopf: { 'X-Epic-Access-Token': await marke(f), 'User-Agent': f.agent },
    frage: `?appId=Fortnite&stream=${encodeURIComponent(f.zweig)}`,
    // Wer fragt: ein gewoehnlicher Spieler in Europa am PC, allein in der Gruppe. Die Zahlen (globalCCU) sind weltweit und haengen nicht daran.
    wer: {
      playerId: accountId, partyMemberIds: [accountId], locale: 'en', matchmakingRegion: 'EU', platform: 'Windows',
      isCabined: false, ratingAuthority: 'USK', rating: 'USK_AGE_12', numLocalPlayers: 1,
    },
  };
}

/** Eine Zahl uebernehmen. Dieselbe Insel steht oft in mehreren Reihen; weichen zwei Abrufe ab (Sekunden auseinander), gilt die hoehere. */
function nimmZahl(spieler: Map<string, number>, code: string, roh: unknown) {
  const n = Number(roh);
  if (Number.isFinite(n) && n > (spieler.get(code) ?? -1)) spieler.set(code, n);
}

/**
 * Eine Flaeche mit ihren Reihen; mit `folgeseiten` > 0 auch Folgeseiten - reihum je Reihe eine, bis das Kontingent aufgebraucht ist (so bekommt jede
 * Reihe ihre zweite Seite, bevor eine die dritte bekommt). Scheitert eine Folgeseite, bleibt die Reihe bei dem, was sie hat.
 */
async function ladeFlaeche(flaeche: string, r: Rahmen, spieler: Map<string, number>, folgeseiten: number): Promise<Reihe[]> {
  const a = await epicAbruf<RohFlaeche>(`${ENTDECKEN}/surface/${flaeche}${r.frage}`, { body: { ...r.wer, accountLevel: 100, battlepassLevel: 1 }, kopf: r.kopf, ms: 20_000 });
  if (a.status !== 200 || !Array.isArray(a.daten?.panels)) throw new Error(`Entdecken (${flaeche}) nicht erhalten: ${epicFehler(a)}`);

  const nimm = (treffer: RohTreffer[] | undefined, codes: string[]) => {
    for (const t of treffer ?? []) {
      if (!t?.linkCode) continue;
      codes.push(t.linkCode);
      nimmZahl(spieler, t.linkCode, t.globalCCU);
    }
  };

  const reihen: Reihe[] = [];
  let mehr: Array<{ reihe: Reihe; seite: number }> = [];
  for (const p of a.daten.panels) {
    if (!p?.panelName) continue;
    const reihe: Reihe = { name: p.panelName, titel: p.panelDisplayName ?? null, codes: [] };
    nimm(p.firstPage?.results, reihe.codes);
    reihen.push(reihe);
    if (p.firstPage?.hasMore) mehr.push({ reihe, seite: 1 });
  }

  let geholt = 0;
  while (mehr.length && geholt < folgeseiten) {
    const jetzt = mehr.slice(0, folgeseiten - geholt);
    geholt += jetzt.length;
    const danach: typeof mehr = [];
    for (let i = 0; i < jetzt.length; i += 4) {
      await Promise.all(jetzt.slice(i, i + 4).map(async ({ reihe, seite }) => {
        try {
          const s = await epicAbruf<RohSeite>(`${ENTDECKEN}/surface/${flaeche}/page${r.frage}`, {
            body: { ...r.wer, testVariantName: a.daten?.testVariantName, panelName: reihe.name, pageIndex: seite }, kopf: r.kopf,
          });
          if (s.status !== 200) return;
          nimm(s.daten?.results, reihe.codes);
          if (s.daten?.hasMore && seite < SEITEN_JE_REIHE) danach.push({ reihe, seite: seite + 1 });
        } catch { /* diese Reihe bleibt kuerzer */ }
      }));
    }
    mehr = danach;
  }
  return reihen;
}

/** Die Zahlen zu einer Reihe von Codes, ohne dass sie in einer Reihe stehen muessen. Was scheitert, fehlt - der Abruf als Ganzes steht trotzdem. */
async function frageZahlen(codes: string[], r: Rahmen, spieler: Map<string, number>): Promise<void> {
  for (let i = 0; i < codes.length; i += JE_NACHFRAGE) {
    try {
      const a = await epicAbruf<Record<string, RohTreffer | null>>(`${ENTDECKEN}/link-entries`, { body: { linkCodes: codes.slice(i, i + JE_NACHFRAGE) }, kopf: r.kopf });
      if (a.status !== 200 || !a.daten) continue;
      for (const [code, t] of Object.entries(a.daten)) if (t) nimmZahl(spieler, code, t.globalCCU);
    } catch { /* beim naechsten Abruf wieder */ }
  }
}

/* ------------------------------------------------------------ Die Liste */

/**
 * Aus Codes und Zahlen die Liste.
 *
 * Epic fuehrt einen Modus als "Erlebnis" (experience_br = Battle Royale) und darunter seine Spiellisten (playlist_defaultsolo ...); jede Spielliste
 * nennt ihr Erlebnis (parent_experience, aelter: parent_set). Damit niemand doppelt gezaehlt wird, steht in der Liste nur der Modus; seine
 * Spiellisten haengen als "teile" daran:
 *   - Modus und Spielliste beide da -> die Spielliste wird Teil des Modus (ihre Spieler stecken in seiner Zahl),
 *   - nur Spiellisten da            -> sie werden unter dem Code des Modus zusammengezaehlt (wenn der Links-Dienst den Modus kennt).
 * Dazu fragt die Liste fuer jeden Modus von Epic die Spiellisten nach, die er selbst nennt (sub_link_codes).
 */
async function formeEintraege(spieler: Map<string, number>, r: Rahmen): Promise<Eintrag[]> {
  // Nur Codes mit Zahl: Verweise auf Unterseiten (reference_...) und Inseln mit verborgener Zahl kommen mit -1.
  for (const [code, n] of spieler) if (!(n > 0)) spieler.delete(code);
  const { inseln } = await holeInseln([...spieler.keys()]);

  // Die Spiellisten, die Epics Modi selbst nennen, dazuholen (Zahlen und Titel).
  const unter = new Set<string>();
  for (const code of spieler.keys()) {
    const i = inseln.get(code);
    if (i?.epic) for (const u of i.unter.slice(0, 80)) if (!spieler.has(u)) unter.add(u);
  }
  if (unter.size) {
    await frageZahlen([...unter], r, spieler);
    for (const [code, n] of spieler) if (!(n > 0)) spieler.delete(code);
    const { inseln: dazu } = await holeInseln([...unter].filter((u) => spieler.has(u)));
    for (const [code, i] of dazu) inseln.set(code, i);
  }

  // Wer gehoert wozu? Aus beiden Richtungen: die Spielliste nennt ihren Modus, der Modus nennt seine Spiellisten.
  const elternVon = new Map<string, string>();
  for (const code of spieler.keys()) {
    const i = inseln.get(code);
    if (i?.epic) for (const u of i.unter) if (u !== code && spieler.has(u)) elternVon.set(u, code);
  }
  for (const code of spieler.keys()) {
    const e = inseln.get(code)?.eltern;
    if (e && e !== code && !elternVon.has(code)) elternVon.set(code, e);
  }
  const fehlendeEltern = [...new Set(elternVon.values())].filter((e) => !spieler.has(e));
  const { inseln: elternInseln } = fehlendeEltern.length ? await holeInseln(fehlendeEltern) : { inseln: new Map<string, InselIntern | null>() };

  const oben = new Map<string, { n: number; teile: Teil[] }>();
  const fach = (code: string) => { let f = oben.get(code); if (!f) { f = { n: 0, teile: [] }; oben.set(code, f); } return f; };
  for (const [code, n] of spieler) {
    const e = elternVon.get(code);
    if (!e) { fach(code).n = n; continue; }
    if (!spieler.has(e) && !elternInseln.get(e)) { fach(code).n = n; continue; } // der Modus ist dem Links-Dienst unbekannt: die Spielliste steht fuer sich
    fach(e).teile.push({ code, titel: inseln.get(code)?.titel ?? code, spieler: n });
    if (!inseln.has(e)) inseln.set(e, elternInseln.get(e) ?? null);
  }

  const eintraege: Eintrag[] = [];
  for (const [code, f] of oben) {
    const i: InselIntern | null | undefined = inseln.get(code);
    // Der Modus hat eine eigene Zahl (dann gilt sie), sonst die Summe seiner Spiellisten.
    const n = spieler.get(code) ?? f.teile.reduce((sum, t) => sum + t.spieler, 0);
    if (!(n > 0)) continue;
    eintraege.push({
      code, titel: i?.titel ?? code, bild: i?.bild ?? null, creator: i?.creator ?? null, spieler: n,
      // Kennt der Links-Dienst den Code gerade nicht, entscheidet die Form: Epics eigene Codes sind Namen, Inseln von Erstellern zwoelf Ziffern.
      epic: i ? i.epic : !/^\d{4}-\d{4}-\d{4}$/.test(code),
      ...(f.teile.length ? { teile: f.teile.sort((x, y) => y.spieler - x.spieler) } : {}),
    });
  }
  return eintraege.sort((x, y) => y.spieler - x.spieler || x.code.localeCompare(y.code));
}

/**
 * Der Stand von jetzt, hoechstens fuenf Minuten alt. Antwortet Epic nicht, gilt der letzte weiter.
 *
 * Ein Besucher wartet nur beim allerersten Abruf nach einem Neustart: danach erneuert der Takt (unten) den Stand, und wer genau in die Luecke
 * zwischen Ablauf und Erneuerung faellt, bekommt den bisherigen (hoechstens fuenfzehn Minuten alten) Stand, waehrend im Hintergrund geholt wird.
 */
export function entdecken(): Promise<Stand> {
  taktStarten();
  Z.gefragt = Date.now();
  const alter = Z.stand ? Date.now() - Date.parse(Z.stand.stand) : Infinity;
  if (Z.stand && alter < VERALTET_HOECHSTENS_MS) {
    if (alter >= ENTDECKEN_FRIST_MS) void standHolen().catch(() => { /* der bisherige Stand bleibt */ });
    return Promise.resolve(Z.stand);
  }
  return standHolen();
}

function standHolen(): Promise<Stand> {
  return mitSpeicher<Stand>('entdecken|stand', ENTDECKEN_FRIST_MS, async () => {
    const r = await rahmen();
    const jetzt = Date.now();
    // Der erste Abruf nach einem Neustart bleibt flach (auf ihn wartet ein Besucher), der zweite geht in die Tiefe.
    const tief = Z.tiefZuletzt !== 0 && jetzt - Z.tiefZuletzt >= TIEF_ABSTAND_MS;
    if (Z.tiefZuletzt === 0) Z.tiefZuletzt = jetzt - TIEF_ABSTAND_MS;
    const spieler = new Map<string, number>();
    const [epic, inseln] = await Promise.all([
      ladeFlaeche(FLAECHE_EPIC, r, spieler, 0),
      ladeFlaeche(FLAECHE_INSELN, r, spieler, tief ? SEITEN_HOECHSTENS : 0),
    ]);
    if (tief) Z.tiefZuletzt = jetzt;

    // Was in den letzten Tagen in einer Reihe stand und jetzt auf keiner ersten Seite: einzeln nachfragen, die groessten zuerst.
    for (const [code, n] of spieler) if (n > 0) Z.bekannt.set(code, { n, gesehen: jetzt });
    const nach: string[] = [];
    for (const [code, b] of Z.bekannt) {
      if (jetzt - b.gesehen > BEKANNT_FRIST_MS) Z.bekannt.delete(code);
      else if (!spieler.has(code)) nach.push(code);
    }
    nach.sort((x, y) => (Z.bekannt.get(y)?.n ?? 0) - (Z.bekannt.get(x)?.n ?? 0));
    await frageZahlen(nach.slice(0, NACHFRAGEN_HOECHSTENS), r, spieler);
    // Die nachgefragte Zahl merken (fuer die Reihenfolge beim naechsten Mal) - "gesehen" bleibt: das zaehlt nur, wenn Epic die Insel selbst zeigt.
    for (const code of nach) { const n = spieler.get(code); const b = Z.bekannt.get(code); if (b && n !== undefined) b.n = Math.max(0, n); }

    const eintraege = await formeEintraege(spieler, r);
    const mitZahl = new Set(spieler.keys());
    const reihen = [...epic, ...inseln]
      .map((x) => ({ ...x, codes: [...new Set(x.codes)].filter((c) => mitZahl.has(c)) }))
      .filter((x) => x.codes.length);
    const stand: Stand = { stand: new Date().toISOString(), eintraege, reihen };
    Z.stand = stand;
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
  /** Codes, die in den letzten Tagen in einer Reihe standen: letzte Zahl und wann zuletzt gesehen. */
  bekannt: Map<string, { n: number; gesehen: number }>; tiefZuletzt: number; stand: Stand | null;
}
const Z: Zustand = ((globalThis as { __comphubFnEntdecken?: Zustand }).__comphubFnEntdecken ??= {
  verlauf: null, geladen: false, laedt: null, geaendert: false, geschrieben: Date.now(), schreibt: false, uhr: null, gefragt: 0,
  bekannt: new Map(), tiefZuletzt: 0, stand: null,
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
  stand.eintraege.forEach((e, i) => {
    if (i >= VERLAUF_OBERE && !e.epic) return;
    jetzt.werte[e.code] = [e.spieler];
    // Auch die Spiellisten von Epics Modi (Zero Build, Ranked ... unter Battle Royale) - fuer eigene Kurven.
    if (e.epic) for (const t of e.teile ?? []) jetzt.werte[t.code] = [t.spieler];
  });
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
