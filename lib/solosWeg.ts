import { EVENTS, getToken, verwirfToken, gecacht } from '@/lib/epicCups';
import { holeKatalog } from '@/lib/cupWertung';
import { globalsSolos, type SolosStufe } from '@/lib/globalsSolos';

/*
 * Der Weg ins Grand Final von FNCS Solos - Runde fuer Runde mit Spielerzahl, Punkteschwelle und den Marken, die Epic vergibt.
 *
 * Betreiber, 20.10.2026: eine fremde Seite zeigt den Weg als Plan (Qualifier 1 und 2 mit je drei Runden, Fast Track, Heats, Last Chance, Finale) und
 * dazu "Every arrow is an Epic token: one round's reward is the next round's entry requirement" - "kannst du die auch noch anmachen?".
 *
 * Alles, was hier steht, ist aus Epic gelesen oder aus Epics Zahlen abgeleitet; nichts ist geschaetzt, ohne dass es dasteht:
 *   - Auszahlungstabellen des Katalogs: wie viele weiterkommen (Top 8.000 / 1.000 / 100 / 8 / 70 / 22, Top 35 und 36-50 je Heat), "1.000 Punkte = sofort durch",
 *     das Preisgeld des Finales. Die beendeten Qualifier fuehrt Epic nicht mehr; ihre Schwellen kommen aus dem Archiv des Werkzeugs (lib/globalsSolos, Stufen).
 *   - Bestenlisten: die Punkte an der Schwelle ("#1.000 = 274 pts") und die Spielerzahl. Epic gibt je Liste nur die ersten 10.000 Plaetze heraus; steht eine Liste
 *     darueber, wird die Zahl aus dem Perzentil jedes Eintrags abgeleitet (Epic rundet es auf eine Stelle ab: der erste Platz, ab dem es um eine Stelle springt,
 *     legt die Gesamtzahl auf wenige Spieler genau fest - an Listen mit bekannter Groesse geprueft, dort trifft es genau). Solche Zahlen sind als "ca." markiert.
 *   - Runde 1 laeuft an zwei Tagen und wird zusammengezaehlt; wer in der Summe die Top 8.000 erreicht, laesst sich aus je zehntausend Plaetzen pro Tag nicht
 *     sicher bestimmen (wer an einem Tag ausserhalb der Top 10.000 liegt, fehlt). Deshalb steht dort die Spielerzahl je Tag, keine Schwelle.
 *   - Die Zahl, die Epic in die Heats setzt (Platz 108 statt 100): Heat-Plaetze minus die Fast-Track-Spieler, die weiterkommen. Das ist Rechnung, nicht Epics Wort,
 *     und steht als "gesetzt" im Plan. Die Probe an den echten Listen (alle ersten 108 stehen in den Heats) steht im Bericht des Betreibers vom 20.10.
 */

export type WegKennung = 'q1r1' | 'q1r2' | 'q1r3' | 'q2r1' | 'q2r2' | 'q2r3' | 'ft' | 'heats' | 'lcq' | 'lcl' | 'finale';

export interface WegZahl { zahl: number; /** Aus dem Perzentil abgeleitet, nicht abgezaehlt. */ ca: boolean; /** Mindestens so viele (Epic gibt nur zehntausend heraus). */ mind?: boolean }
export interface WegSchnitt { rang: number; punkte: number | null; /** Bei zwei Heats: welcher. */ bei?: string }
export interface WegKnoten {
  id: WegKennung;
  gruppe: 'q1' | 'q2' | 'lc' | 'ziel';
  /** Die Fenster dieser Stufe - ein Tag oder mehrere. */
  fenster: Array<{ windowId: string; eventId: string; name: string }>;
  von: number; bis: number | null;
  status: 'live' | 'kommt' | 'vorbei';
  spieler: WegZahl | null;
  /** Runde 1: die Spielerzahl je Tag. */
  jeTag?: WegZahl[];
  schnitt: WegSchnitt[];
  /** Sofort durch mit so vielen Punkten (Epic: Marke "rolling" ab Punktestand). */
  sofortPunkte?: number;
  /** Nur Finale. */
  preisgeld?: number | null; erster?: number | null;
}
export interface WegKante { von: WegKennung; nach: WegKennung; art: 'marke' | 'gesetzt' | 'finale'; text: string; /** Statt "Top N": der Wortlaut ist eine Spanne wie "9-100". */ spanne?: boolean; jeHeat?: boolean }
export interface WegDaten {
  region: string; turnier: string; stand: string;
  knoten: WegKnoten[]; kanten: WegKante[];
  /** Wie sich das Feld im Finale zusammensetzt: Fast Track / Heats / Last Chance. */
  herkunft: Array<{ von: WegKennung; zahl: number }>;
  fehler: string[];
}

/* ------------------------------------------------------------------ Bestenlisten lesen */

interface RohEintrag { rang: number; punkte: number; pct: number; ids: string[] }
interface RohSeite { totalPages: number; entries: RohEintrag[] }

async function seiteHolen(eventId: string, windowId: string, page: number): Promise<RohSeite> {
  const hole = async () => {
    const { token, accountId } = await getToken();
    return fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=${page}&rank=0&teamAccountIds=`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  };
  let r = await hole();
  if (r.status === 401) { verwirfToken(); r = await hole(); }
  // Ein Fenster, das noch nicht gespielt wurde, kennt Epic als "nicht gefunden" - das ist keine Stoerung, sondern eine leere Liste.
  if (r.status === 404) return { totalPages: 0, entries: [] };
  if (!r.ok) throw new Error(`Epic HTTP ${r.status}`);
  const j = await r.json() as { totalPages?: number; entries?: Array<{ rank?: number; pointsEarned?: number; percentile?: number; teamAccountIds?: string[] }> };
  return {
    totalPages: j.totalPages ?? 0,
    entries: (j.entries ?? []).map((e) => ({ rang: e.rank ?? 0, punkte: e.pointsEarned ?? 0, pct: e.percentile ?? 0, ids: e.teamAccountIds ?? [] })),
  };
}

/** Eine Seite, kurz gemerkt - beendete Fenster aendern sich nicht mehr und liegen laenger. */
const seite = (eventId: string, windowId: string, p: number, vorbei: boolean) =>
  gecacht(`weg|${eventId}|${windowId}|${p}`, vorbei ? 30 * 60_000 : 60_000, () => seiteHolen(eventId, windowId, p));

/** Wie viele Spieler in der Liste stehen: gezaehlt, wo Epic alles herausgibt, sonst aus dem Perzentil abgeleitet. */
async function spielerzahl(eventId: string, windowId: string, vorbei: boolean): Promise<WegZahl | null> {
  const erste = await seite(eventId, windowId, 0, vorbei);
  if (!erste.totalPages || !erste.entries.length) return null;
  const proSeite = erste.entries.length;
  const letzte = await seite(eventId, windowId, erste.totalPages - 1, vorbei);
  if (!letzte.entries.length) return null;
  const gezaehlt = (erste.totalPages - 1) * proSeite + letzte.entries.length;
  if (erste.totalPages < 100 || letzte.entries.length < proSeite) return { zahl: gezaehlt, ca: false };

  // Die Liste ist bei zehntausend abgeschnitten. Epic nennt zu jedem Eintrag Rang/Gesamtzahl, auf eine Stelle abgerundet; k ist der groesste Sprung, der noch
  // in den ersten zehntausend liegt. Der erste Platz r mit Stufe >= k legt die Gesamtzahl auf ((r-1)*10/k, r*10/k] fest - wenige Spieler Spielraum.
  const k = Math.round(letzte.entries[letzte.entries.length - 1].pct * 10);
  if (k < 1) return { zahl: gezaehlt, ca: false, mind: true };
  let lo = 0, hi = erste.totalPages - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const s = await seite(eventId, windowId, mid, vorbei);
    if (Math.round(s.entries[s.entries.length - 1].pct * 10) >= k) hi = mid; else lo = mid + 1;
  }
  const s = await seite(eventId, windowId, lo, vorbei);
  const e = s.entries.find((x) => Math.round(x.pct * 10) >= k);
  if (!e) return { zahl: gezaehlt, ca: false, mind: true };
  const unten = (10 * (e.rang - 1)) / k, oben = (10 * e.rang) / k;
  return { zahl: Math.round((unten + oben) / 2), ca: true };
}

/** Die Punkte, die ein Platz gerade hat - oder null, wo es den Platz (noch) nicht gibt. */
async function punkteBei(eventId: string, windowId: string, rang: number, vorbei: boolean): Promise<number | null> {
  if (rang < 1 || rang > 10_000) return null;
  const erste = await seite(eventId, windowId, 0, vorbei);
  if (!erste.entries.length) return null;
  const proSeite = erste.entries.length;
  const p = Math.floor((rang - 1) / proSeite);
  if (p >= erste.totalPages) return null;
  const s = p === 0 ? erste : await seite(eventId, windowId, p, vorbei);
  return s.entries.find((x) => x.rang === rang)?.punkte ?? null;
}

/* ------------------------------------------------------------------ Auszahlungstabellen lesen */

interface Tabelle { scoringType?: string; ranks?: Array<{ threshold?: number; payouts?: Array<{ rewardType?: string; rewardMode?: string; value?: string; quantity?: number }> }> }

/** Aus den Tabellen eines Schluessels: wer mit "token" belohnt wird, bis zu welchem Platz - je Marke (enthaelt den Namen). */
function markenBis(tabellen: Tabelle[] | undefined, teil: RegExp): number | null {
  for (const t of tabellen ?? []) {
    if (t.scoringType === 'value') continue;
    for (const r of t.ranks ?? []) {
      if ((r.payouts ?? []).some((p) => p.rewardType === 'token' && teil.test(p.value ?? ''))) return r.threshold ?? null;
    }
  }
  return null;
}

/** "Ab so vielen Punkten sofort durch": die Tabelle nach Punktestand (scoringType value) mit einer Marke. */
function sofortPunkteAus(tabellen: Tabelle[] | undefined): number | undefined {
  for (const t of tabellen ?? []) {
    if (t.scoringType !== 'value') continue;
    for (const r of t.ranks ?? []) if ((r.payouts ?? []).some((p) => p.rewardType === 'token')) return r.threshold;
  }
  return undefined;
}

/** Preisgeld der Auszahlungstabelle: jede Stufe nennt den letzten Platz ihrer Spanne (preisgeld-stufen-sind-spannen). */
function preisgeldAus(tabellen: Tabelle[] | undefined): { summe: number; erster: number } | null {
  for (const t of tabellen ?? []) {
    if (t.scoringType !== 'rank') continue;
    const stufen = (t.ranks ?? []).map((r) => ({ bis: r.threshold ?? 0, usd: (r.payouts ?? []).filter((p) => p.rewardType === 'ecomm' && p.value === 'USD').reduce((a, p) => a + (p.quantity ?? 0), 0) }))
      .filter((s) => s.bis > 0 && s.usd > 0).sort((a, b) => a.bis - b.bis);
    if (!stufen.length) continue;
    let vor = 0, summe = 0;
    for (const s of stufen) { summe += (s.bis - vor) * s.usd; vor = s.bis; }
    return { summe, erster: stufen[0].usd };
  }
  return null;
}

/* ------------------------------------------------------------------ der Plan */

const nummer = (s: SolosStufe) => Number(/Qualifier (\d)/.exec(s.name)?.[1] ?? 0);
const runde = (s: SolosStufe) => Number(/Round (\d)/.exec(s.name)?.[1] ?? 0);

function statusVon(ss: SolosStufe[]): 'live' | 'kommt' | 'vorbei' {
  return ss.some((s) => s.status === 'live') ? 'live' : ss.length && ss.every((s) => s.status === 'vorbei') ? 'vorbei' : 'kommt';
}

function knotenAus(id: WegKennung, gruppe: WegKnoten['gruppe'], ss: SolosStufe[]): WegKnoten | null {
  if (!ss.length) return null;
  const sortiert = [...ss].sort((a, b) => a.begin - b.begin);
  const ende = sortiert[sortiert.length - 1];
  return {
    id, gruppe, status: statusVon(ss), spieler: null, schnitt: [],
    fenster: sortiert.map((s) => ({ windowId: s.windowId, eventId: s.eventId, name: s.name })),
    von: sortiert[0].begin, bis: ende.end ?? ende.begin,
  };
}

/** Der Plan einer Region - anderthalb Minuten gemerkt, damit ein Besucher nach dem anderen nicht jedes Mal bei Epic nachfragt. */
export function wegBauen(region: string): Promise<WegDaten | null> {
  return gecacht(`weg|plan|${region}`, 90_000, () => wegBauenRoh(region));
}

async function wegBauenRoh(region: string): Promise<WegDaten | null> {
  const daten = await globalsSolos(region);
  if (!daten) return null;
  const fehler: string[] = [];
  const stufen = daten.stufen;
  const quals = stufen.filter((s) => s.art === 'qualifier' && /Qualifier \d/.test(s.name));
  const wahl = (n: number, r: number) => quals.filter((s) => nummer(s) === n && runde(s) === r);
  const knoten: WegKnoten[] = [];
  const nimm = (k: WegKnoten | null) => { if (k) knoten.push(k); return k; };
  const q = {
    q1r1: nimm(knotenAus('q1r1', 'q1', wahl(1, 1))), q1r2: nimm(knotenAus('q1r2', 'q1', wahl(1, 2))), q1r3: nimm(knotenAus('q1r3', 'q1', wahl(1, 3))),
    ft: nimm(knotenAus('ft', 'q1', stufen.filter((s) => s.art === 'fasttrack'))),
    q2r1: nimm(knotenAus('q2r1', 'q2', wahl(2, 1))), q2r2: nimm(knotenAus('q2r2', 'q2', wahl(2, 2))), q2r3: nimm(knotenAus('q2r3', 'q2', wahl(2, 3))),
    heats: nimm(knotenAus('heats', 'q2', stufen.filter((s) => s.art === 'heat'))),
    lcq: nimm(knotenAus('lcq', 'lc', stufen.filter((s) => s.art === 'lcq'))),
    lcl: nimm(knotenAus('lcl', 'lc', stufen.filter((s) => s.art === 'lcq-finale'))),
    finale: nimm(knotenAus('finale', 'ziel', stufen.filter((s) => s.art === 'finale'))),
  };
  const schwelle = (ss: SolosStufe[]) => ss.map((s) => s.qualifiziert).find((n): n is number => !!n);
  const vorbeiVon = (k: WegKnoten) => k.status === 'vorbei';

  // Epics Katalog dieser Region: die laufenden und kommenden Events mit Auszahlungstabellen (Heats, Last Chance, Finale).
  const kat = await holeKatalog(region).catch((e) => { fehler.push(`Katalog: ${(e as Error).message}`); return null; });
  const tabellen = (schluessel: string) => kat?.payoutTables?.[schluessel] as Tabelle[] | undefined;
  const sicher = async <T,>(wer: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { fehler.push(`${wer}: ${(e as Error).message}`); return null; } };

  // Die Marken der Heats und der Last Chance: aus der Tabelle des Events (Heats: Top 35 je Heat ins Finale, 36-50 in die Last Chance; Last Chance Lobby: Top 22).
  const heatEvent = q.heats?.fenster[0]?.eventId;
  const lclEvent = q.lcl?.fenster[0]?.eventId;
  const heatsFinale = heatEvent ? markenBis(tabellen(heatEvent), /Finalist/i) : null;
  const heatsLastChance = heatEvent ? markenBis(tabellen(heatEvent), /LastChance/i) : null;
  const lclFinale = lclEvent ? markenBis(tabellen(lclEvent), /Finalist/i) : null;
  if (q.heats && heatEvent) q.heats.sofortPunkte = sofortPunkteAus(tabellen(heatEvent));
  if (q.lcl && lclEvent) q.lcl.sofortPunkte = sofortPunkteAus(tabellen(lclEvent));

  const ft = stufen.filter((s) => s.art === 'fasttrack');
  const ftWeiter = schwelle(ft) ?? null;
  const lcqWeiter = schwelle(stufen.filter((s) => s.art === 'lcq')) ?? null;

  // Der Reihe nach alles, was Epic liefern muss - parallel, jedes fuer sich abgesichert.
  const aufgaben: Array<Promise<unknown>> = [];
  const zaehle = (k: WegKnoten | null) => {
    if (!k) return;
    if (k.fenster.length > 1 && (k.id === 'q1r1' || k.id === 'q2r1')) {
      aufgaben.push(Promise.all(k.fenster.map((f) => sicher(`${f.name} Spieler`, () => spielerzahl(f.eventId, f.windowId, vorbeiVon(k)))))
        .then((z) => { k.jeTag = z.filter((x): x is WegZahl => !!x); }));
      return;
    }
    if (k.fenster.length > 1) {
      // Heats und Finale: alle Fenster zusammen (Heat 1 + Heat 2) bzw. der erste Tag fuer das Finale.
      const fenster = k.id === 'finale' ? [k.fenster[0]] : k.fenster;
      aufgaben.push(Promise.all(fenster.map((f) => sicher(`${f.name} Spieler`, () => spielerzahl(f.eventId, f.windowId, vorbeiVon(k)))))
        .then((z) => { const ok = z.filter((x): x is WegZahl => !!x); if (ok.length) k.spieler = { zahl: ok.reduce((a, x) => a + x.zahl, 0), ca: ok.some((x) => x.ca) }; }));
      return;
    }
    const f = k.fenster[0];
    aufgaben.push(sicher(`${f.name} Spieler`, () => spielerzahl(f.eventId, f.windowId, vorbeiVon(k))).then((z) => { k.spieler = z; }));
  };
  for (const k of knoten) zaehle(k);

  const schnittAn = (k: WegKnoten | null, rang: number | null, welche: 'erste' | 'jedes' = 'erste') => {
    if (!k || !rang) return;
    const fenster = welche === 'jedes' ? k.fenster : [k.fenster[k.fenster.length - 1]];
    aufgaben.push(Promise.all(fenster.map((f) => sicher(`${f.name} #${rang}`, () => punkteBei(f.eventId, f.windowId, rang, vorbeiVon(k)))))
      .then((ps) => { fenster.forEach((f, i) => k.schnitt.push({ rang, punkte: ps[i], ...(welche === 'jedes' && fenster.length > 1 ? { bei: f.name } : {}) })); }));
  };
  schnittAn(q.q1r2, schwelle(wahl(1, 2)) ?? null); schnittAn(q.q2r2, schwelle(wahl(2, 2)) ?? null);
  schnittAn(q.q1r3, schwelle(wahl(1, 3)) ?? null);
  schnittAn(q.ft, ftWeiter);
  schnittAn(q.heats, heatsFinale, 'jedes');
  schnittAn(q.lcq, lcqWeiter);
  schnittAn(q.lcl, lclFinale);

  // Das Finale: Preisgeld aus der Tabelle des zweiten Tages (die Endwertung).
  if (q.finale) {
    const letzter = q.finale.fenster[q.finale.fenster.length - 1];
    const pg = preisgeldAus(tabellen(letzter.windowId)) ?? preisgeldAus(tabellen(q.finale.fenster[0].windowId));
    q.finale.preisgeld = pg?.summe ?? null; q.finale.erster = pg?.erster ?? null;
  }
  await Promise.all(aufgaben);
  for (const k of knoten) k.schnitt.sort((a, b) => (a.bei ?? '').localeCompare(b.bei ?? ''));

  // Wie viele aus Qualifier 2, Runde 3 in die Heats kommen: Plaetze der Heats minus die Fast-Track-Spieler, die weiterkommen (Epic setzt sie ohne Marke).
  const heatPlaetze = q.heats ? q.heats.fenster.length * 100 : 0;
  const ftEinzug = q.ft && ftWeiter && q.ft.spieler && !q.ft.spieler.mind ? q.ft.spieler.zahl - ftWeiter : null;
  const q2Heats = heatPlaetze && ftEinzug !== null ? heatPlaetze - ftEinzug : null;
  if (q.q2r3 && q2Heats && q2Heats > 0) schnittAn(q.q2r3, q2Heats);
  await Promise.all(aufgaben);

  // Die Pfeile.
  const kanten: WegKante[] = [];
  const kante = (von: WegKnoten | null, nach: WegKnoten | null, art: WegKante['art'], text: string, extra: Partial<WegKante> = {}) => { if (von && nach && text) kanten.push({ von: von.id, nach: nach.id, art, text, ...extra }); };
  const top = (n: number | null | undefined) => (n ? `Top ${n}` : '');
  kante(q.q1r1, q.q1r2, 'marke', top(schwelle(wahl(1, 1)))); kante(q.q1r2, q.q1r3, 'marke', top(schwelle(wahl(1, 2))));
  kante(q.q2r1, q.q2r2, 'marke', top(schwelle(wahl(2, 1)))); kante(q.q2r2, q.q2r3, 'marke', top(schwelle(wahl(2, 2))));
  if (q.ft) kante(q.q1r3, q.ft, 'marke', top(schwelle(wahl(1, 3)))); else kante(q.q1r3, q.heats, 'marke', top(schwelle(wahl(1, 3))));
  kante(q.ft, q.finale, 'finale', top(ftWeiter));
  if (q.ft?.spieler && ftWeiter && !q.ft.spieler.mind) kante(q.ft, q.heats, 'gesetzt', `${ftWeiter + 1}–${q.ft.spieler.zahl}`, { spanne: true });
  kante(q.q2r3, q.heats, 'gesetzt', top(q2Heats));
  kante(q.heats, q.finale, 'finale', top(heatsFinale), { jeHeat: true });
  if (heatsFinale && heatsLastChance) kante(q.heats, q.lcl, 'marke', `${heatsFinale + 1}–${heatsLastChance}`, { spanne: true, jeHeat: true });
  kante(q.lcq, q.lcl, 'marke', top(lcqWeiter));
  kante(q.lcl, q.finale, 'finale', top(lclFinale));

  const herkunft: WegDaten['herkunft'] = [];
  if (ftWeiter) herkunft.push({ von: 'ft', zahl: ftWeiter });
  if (heatsFinale && q.heats) herkunft.push({ von: 'heats', zahl: heatsFinale * q.heats.fenster.length });
  if (lclFinale) herkunft.push({ von: 'lcl', zahl: lclFinale });

  return { region, turnier: daten.turnier.name, stand: new Date().toISOString(), knoten, kanten, herkunft, fehler };
}

/* ------------------------------------------------------------------ Wo steht dieses Konto? */

export interface WegStand { knoten: WegKennung; fenster: string; name: string; rang: number; punkte: number; spieler: number | null }

/**
 * Die letzte Stufe, in der das Konto in der Bestenliste steht - vom Finale rueckwaerts. Ohne "tief" nur die kleinen Listen (hoechstens zwoelf Seiten), damit
 * der Aufruf in Sekunden fertig ist; mit "tief" auch Runde 1 und 2 und die Last Chance (bis zu hundert Seiten je Liste). Gefunden oder null.
 */
export async function wegStandVon(region: string, epicId: string, tief: boolean): Promise<{ stand: WegStand | null; durchsucht: number }> {
  const id = epicId.replace(/-/g, '').toLowerCase();
  const plan = await wegBauen(region);
  if (!plan) return { stand: null, durchsucht: 0 };
  const reihe: WegKennung[] = ['finale', 'lcl', 'heats', 'lcq', 'ft', 'q2r3', 'q1r3', 'q2r2', 'q1r2', 'q2r1', 'q1r1'];
  let durchsucht = 0;
  for (const kennung of reihe) {
    const k = plan.knoten.find((x) => x.id === kennung);
    if (!k) continue;
    for (const f of [...k.fenster].reverse()) {
      const erste = await seite(f.eventId, f.windowId, 0, k.status === 'vorbei');
      if (!erste.totalPages) continue;
      if (!tief && erste.totalPages > 12) continue;
      for (let p = 0; p < Math.min(erste.totalPages, 100); p += 6) {
        const gruppe: Array<Promise<RohSeite>> = [];
        for (let i = p; i < Math.min(p + 6, erste.totalPages, 100); i++) gruppe.push(i === 0 ? Promise.resolve(erste) : seite(f.eventId, f.windowId, i, k.status === 'vorbei'));
        for (const s of await Promise.all(gruppe)) {
          durchsucht++;
          const e = s.entries.find((x) => x.ids.includes(id));
          if (e) return { stand: { knoten: kennung, fenster: f.windowId, name: f.name, rang: e.rang, punkte: e.punkte, spieler: k.spieler?.zahl ?? null }, durchsucht };
        }
      }
    }
  }
  return { stand: null, durchsucht };
}
