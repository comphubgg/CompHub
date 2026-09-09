'use client';

/*
 * Die Werte eines Teams zu einem Spieltag - beide Spieler nebeneinander.
 *
 * ------------------------------------------------------- Woher die Zahlen
 *
 * Zwei Quellen, und der Unterschied entscheidet, was in welchem Cup zu
 * sehen ist:
 *
 *   Epics Bestenliste liefert zu JEDEM Cup Platz, Punkte, Eliminierungen,
 *   Siege und Lebenszeit - und je Runde die Platzierung und die Elims.
 *   Zusammen mit Epics eigener Punktetabelle ergibt das die Aufteilung in
 *   Placement- und Elimination-Points und damit den Verlauf ueber die
 *   Runden. Das steht in jedem Cup zur Verfuegung: Skin-Cup, Ranked,
 *   Division, Reload, Performance - egal welcher.
 *
 *   Die Szene-Quelle liefert zusaetzlich Schaden, Trefferquote,
 *   Kopftreffer, Material und Bauteile, und zwar je Spieler statt je Team.
 *   Sie deckt aber nicht jeden Cup ab und erscheint ein bis zwei Tage
 *   spaeter.
 *
 * Deshalb ist der Bereich zweigeteilt: was immer vorliegt, steht immer da.
 * Was nur manchmal vorliegt, kommt dazu, wenn es vorliegt - und sonst steht
 * der Grund darunter statt einer Reihe von Nullen.
 *
 * ------------------------------------------------------------ Die Anzeige
 *
 * Oben beide Namen mit Bild, darunter Rang und die Aufteilung der Punkte,
 * darunter die Kennzahlen mit Pfeil - ueber die ganze Breite. Ein Diagramm
 * stand hier einmal daneben; der Betreiber wollte den Platz fuer die Zahlen.
 *
 * Kein "gegeneinander" - es ist ein Team. Der Pfeil sagt nur, wer bei
 * dieser Kennzahl vorn liegt. Ein Bild steht nur da, wo eines gepflegt ist;
 * ein grauer Platzhalter waere schlechter als nichts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';
import { namensSchluessel, gefaltet } from '@/lib/homoglyph';

interface Spieler { id: string; name: string; img?: string | null }

interface Runde {
  sessionId?: string;
  placement?: number;
  elims?: number;
  endTime?: string;
}

interface Eintrag {
  rank: number;
  points: number;
  elims: number;
  wins: number;
  games: number;
  timeAlive: number;
  avgPlace: number;
  players: Spieler[];
  matches: Runde[];
}

/** Eine Regel aus Epics Punktetabelle. */
interface Regel {
  was: string; schwelle: number; regel: string;
  punkte: number; jeStueck: boolean;
}

/** Ein Spieler, so wie /api/spieler-stats ihn ausgibt. */
interface Einzelwerte {
  name: string; epicId: string;
  assists: number; reboots: number; headshots: number;
  hits: number; shots: number; damage: number; damageTaken: number;
  quote: number; heals: number; stormDamage: number; genauigkeit: number;
  mats: number; builds: number; distanzGesamt: number;
}

const SPEICHER = 'comphub.werte.namen';

/**
 * Die Punkte einer Runde, getrennt nach Herkunft.
 *
 * Dieselbe Rechnung wie in lib/cupWertung, nur aufgeteilt: der Betreiber
 * will sehen, wie viel vom Ergebnis aus der Platzierung und wie viel aus
 * Eliminierungen kam. Ohne Punktetabelle bleibt beides leer - gerechnet
 * wird nur, was Epic selbst vorgibt.
 */
function punkteJeRunde(wertung: Regel[], platz: number | null, elims: number) {
  if (!wertung.length) return null;
  let ausPlatz = 0;
  let ausElims = 0;
  for (const r of wertung) {
    if (r.was === 'Placement') {
      if (platz === null) continue;
      if (r.regel === 'lte' ? platz <= r.schwelle : platz >= r.schwelle) ausPlatz += r.punkte;
    } else if (r.was === 'Elimination') {
      if (elims >= r.schwelle) ausElims += r.jeStueck ? r.punkte * elims : r.punkte;
    } else if (r.was === 'Victory Royale') {
      if (platz === 1) ausPlatz += r.punkte;
    } else if (r.was === 'Match played') {
      ausPlatz += r.punkte;
    }
  }
  return { ausPlatz, ausElims };
}

/** Sekunden als "1h 8m" oder "12m 30s". */
function dauer(sekunden: number): string {
  const s = Math.max(0, Math.round(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function Werte({
  windowId, teams, wertung,
}: {
  windowId: string | null;
  teams: Eintrag[];
  /** Epics Punktetabelle dieses Spieltags - fuer die Aufteilung der Punkte. */
  wertung: Regel[];
}) {
  const t = useT();
  const { sprache } = useSprache();
  const ort = ortVon(sprache);

  const [einzel, setEinzel] = useState<Einzelwerte[] | null>(null);
  /**
   * Die Werte aus den Replays, die auf diesem Rechner lagen.
   *
   * Je Konto und Sitzung. Sie sind die einzige Quelle fuer Schaden in
   * Cups, die die Szene-Quelle nicht abdeckt - Division 2 bis 5, Reload,
   * Ranked, Skin-Cups. Es sind allerdings immer nur die eigenen: fuer alle
   * anderen Spieler eines Matches enthaelt ein Replay diese Felder nicht.
   */
  const [ausReplay, setAusReplay] =
    useState<Record<string, Record<string, Record<string, number | null>>>>({});
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState('');
  const [zuletzt, setZuletzt] = useState<string[]>([]);

  useEffect(() => {
    try {
      const roh = localStorage.getItem(SPEICHER);
      if (roh) setZuletzt(JSON.parse(roh) as string[]);
    } catch { /* dann eben ohne Verlauf */ }
  }, []);

  const merken = useCallback((name: string) => {
    setZuletzt((bisher) => {
      const neu = [name, ...bisher.filter((x) => x !== name)].slice(0, 8);
      try { localStorage.setItem(SPEICHER, JSON.stringify(neu)); } catch { /* egal */ }
      return neu;
    });
  }, []);

  /* Die Einzelwerte sind eine Zugabe: fehlen sie, steht trotzdem alles da,
     was aus Epics Bestenliste kommt. */
  useEffect(() => {
    if (!windowId) return undefined;
    let weg = false;
    setEinzel(null);
    fetch(`/api/spieler-stats?window=${encodeURIComponent(windowId)}`)
      .then((r) => r.json())
      .then((j) => { if (!weg) setEinzel(j?.vorhanden ? (j.spieler ?? []) : []); })
      .catch(() => { if (!weg) setEinzel([]); });
    return () => { weg = true; };
  }, [windowId]);

  /* Einmal je Seitenaufruf - die Datei aendert sich nur, wenn jemand das
     Skript laufen laesst. */
  useEffect(() => {
    let weg = false;
    fetch('/api/eigene-werte')
      .then((r) => r.json())
      .then((j) => { if (!weg) setAusReplay(j?.konten ?? {}); })
      .catch(() => { if (!weg) setAusReplay({}); });
    return () => { weg = true; };
  }, []);

  const team = useMemo(() => {
    const roh = gewaehlt.trim().toLowerCase();
    if (!roh) return null;
    const k = gefaltet(namensSchluessel(gewaehlt));
    return teams.find((e) => e.players.some((p) => p.name.toLowerCase() === roh))
      ?? teams.find((e) => e.players.some(
        (p) => k.length > 0 && gefaltet(namensSchluessel(p.name)) === k))
      ?? teams.find((e) => e.players.some((p) => p.name.toLowerCase().includes(roh)))
      ?? null;
  }, [gewaehlt, teams]);

  /** Der gewaehlte Spieler steht links, sein Mitspieler rechts. */
  const [ich, mate] = useMemo(() => {
    if (!team) return [null, null] as const;
    const roh = gewaehlt.trim().toLowerCase();
    const k = gefaltet(namensSchluessel(gewaehlt));
    const a = team.players.find((p) => p.name.toLowerCase().includes(roh))
      ?? team.players.find((p) => k.length > 0
        && gefaltet(namensSchluessel(p.name)) === k)
      ?? team.players[0];
    const b = team.players.find((p) => p !== a) ?? null;
    return [a, b] as const;
  }, [team, gewaehlt]);

  const werteVon = useCallback((p: Spieler | null) => {
    if (!p || !einzel) return null;
    return einzel.find((x) => x.epicId.toLowerCase() === p.id.toLowerCase()) ?? null;
  }, [einzel]);

  /**
   * Die eigenen Replay-Werte dieses Spielers, aufaddiert ueber die Runden
   * dieses Spieltags.
   *
   * Zugeordnet wird ueber die Sitzungskennung: sie steht sowohl an Epics
   * Runde als auch am ausgelesenen Replay. Gezaehlt wird nur, was zu diesem
   * Spieltag gehoert - ein Konto hat Werte aus vielen Cups.
   */
  const eigenesVon = useCallback((p: Spieler | null) => {
    if (!p || !team) return null;
    const jeSitzung = ausReplay[p.id.toLowerCase()];
    if (!jeSitzung) return null;
    const summe: Record<string, number> = {};
    let treffer = 0;
    for (const m of team.matches) {
      const w = m.sessionId ? jeSitzung[m.sessionId.toLowerCase()] : undefined;
      if (!w) continue;
      treffer += 1;
      for (const [k, v] of Object.entries(w)) {
        if (typeof v === 'number') summe[k] = (summe[k] ?? 0) + v;
      }
    }
    if (!treffer) return null;
    /*
     * Die Trefferquote ist ein Anteil und darf nicht addiert werden.
     * Gemittelt ueber die Runden ist sie das, was sie sein soll.
     */
    if (typeof summe.trefferquote === 'number') {
      summe.trefferquote /= treffer;
    }
    return { werte: summe, runden: treffer };
  }, [team, ausReplay]);

  /*
   * Die Suche findet auch Namen mit Sonderzeichen.
   *
   * "juanito 11ǃ" traegt ein Zeichen, das wie ein Ausrufezeichen aussieht
   * und keines ist; andere Namen mischen kyrillische Buchstaben unter die
   * lateinischen. Ein blosses includes auf dem Rohnamen findet davon nichts.
   * namensSchluessel faltet beide Seiten auf dieselbe Schreibweise - genau
   * dafuer gibt es die Funktion schon im Werkzeug -, und gefaltet nimmt
   * zusaetzlich die Ziffernschreibweise mit ("vic0" und "vico").
   *
   * Gezeigt wird alles, was passt, nicht die ersten acht: der Betreiber
   * sucht nach einem Namen und will alle sehen, die ihn tragen.
   */
  const vorschlaege = useMemo(() => {
    const roh = suche.trim().toLowerCase();
    if (!roh) return [];
    const k = gefaltet(namensSchluessel(suche));
    const raus: Spieler[] = [];
    const gesehen = new Set<string>();
    for (const e of teams) {
      for (const p of e.players) {
        if (gesehen.has(p.id)) continue;
        const passt = p.name.toLowerCase().includes(roh)
          || (k.length > 0 && gefaltet(namensSchluessel(p.name)).includes(k));
        if (!passt) continue;
        gesehen.add(p.id);
        raus.push(p);
        if (raus.length >= 60) return raus;
      }
    }
    return raus;
  }, [suche, teams]);

  /**
   * Woher die Punkte kamen: aus Platzierungen oder aus Eliminierungen.
   *
   * Aufaddiert ueber alle Runden. Der Verlauf je Runde stand hier einmal als
   * Diagramm daneben - der Betreiber wollte die Flaeche lieber breit fuer die
   * Zahlen, also bleibt nur die Aufteilung.
   */
  const punkte = useMemo(() => {
    if (!team || !wertung.length) return null;
    let ausPlatz = 0; let ausElims = 0;
    for (const m of team.matches) {
      const p = punkteJeRunde(wertung, m.placement ?? null, m.elims ?? 0);
      if (!p) continue;
      ausPlatz += p.ausPlatz; ausElims += p.ausElims;
    }
    return { ausPlatz, ausElims };
  }, [team, wertung]);

  const zahl = (w: number, nk = 0) =>
    w.toLocaleString(ort, { minimumFractionDigits: nk, maximumFractionDigits: nk });

  if (!windowId) return null;

  const meine = werteVon(ich);
  const seine = werteVon(mate);
  const meinReplay = eigenesVon(ich);
  const seinReplay = eigenesVon(mate);

  /**
   * Ein Wert aus der Szene-Quelle - und wenn sie diesen Cup nicht abdeckt,
   * aus dem eigenen Replay.
   *
   * Die Szene-Quelle hat den Vorrang: sie kennt jeden Spieler, das Replay
   * nur den, der es aufgezeichnet hat. Umgekehrt deckt sie laengst nicht
   * jeden Cup ab - in Division 2 bis 5, Reload, Ranked und den Skin-Cups
   * ist das Replay die einzige Quelle, die es gibt.
   */
  const ausBeiden = (
    szene: number | null | undefined,
    replay: number | null | undefined,
  ): number | null => {
    if (typeof szene === 'number') return szene;
    if (typeof replay === 'number') return replay;
    return null;
  };

  const r1 = meinReplay?.werte ?? {};
  const r2 = seinReplay?.werte ?? {};

  /*
   * Die Zeilen der Tabelle.
   *
   * Was aus der Szene-Quelle kommt, erscheint nur, wenn sie diesen Spieltag
   * kennt. "kleinerIstBesser" dreht den Pfeil dort um, wo weniger das
   * bessere Ergebnis ist.
   */
  const zeilen: Array<{
    name: string; a: number | null; b: number | null;
    einheit?: string; nk?: number; kleinerIstBesser?: boolean;
  }> = (meine || seine || meinReplay || seinReplay) ? [
    { name: 'Schaden an Spielern',
      a: ausBeiden(meine?.damage, r1.schadenAnSpieler),
      b: ausBeiden(seine?.damage, r2.schadenAnSpieler) },
    { name: 'Schaden erhalten',
      a: ausBeiden(meine?.damageTaken, r1.schadenErhalten),
      b: ausBeiden(seine?.damageTaken, r2.schadenErhalten), kleinerIstBesser: true },
    { name: 'Schadensverhältnis',
      a: ausBeiden(meine?.quote,
        r1.schadenErhalten ? r1.schadenAnSpieler / r1.schadenErhalten : null),
      b: ausBeiden(seine?.quote,
        r2.schadenErhalten ? r2.schadenAnSpieler / r2.schadenErhalten : null), nk: 2 },
    { name: 'Trefferquote',
      a: ausBeiden(meine?.genauigkeit,
        typeof r1.trefferquote === 'number' ? r1.trefferquote * 100 : null),
      b: ausBeiden(seine?.genauigkeit,
        typeof r2.trefferquote === 'number' ? r2.trefferquote * 100 : null),
      einheit: '%', nk: 1 },
    { name: 'Kopftreffer', a: meine?.headshots ?? null, b: seine?.headshots ?? null },
    { name: 'Treffer', a: meine?.hits ?? null, b: seine?.hits ?? null },
    { name: 'Schüsse', a: meine?.shots ?? null, b: seine?.shots ?? null },
    { name: 'Schaden an Bauten',
      a: r1.schadenAnBauten ?? null, b: r2.schadenAnBauten ?? null },
    { name: 'Geheilt', a: meine?.heals ?? null, b: seine?.heals ?? null },
    { name: 'Material gefarmt',
      a: ausBeiden(meine?.mats, r1.matsGefarmt),
      b: ausBeiden(seine?.mats, r2.matsGefarmt) },
    { name: 'Material verbaut', a: r1.matsVerbaut ?? null, b: r2.matsVerbaut ?? null },
    { name: 'Bauteile gesetzt', a: meine?.builds ?? null, b: seine?.builds ?? null },
    { name: 'Assists',
      a: ausBeiden(meine?.assists, r1.assists),
      b: ausBeiden(seine?.assists, r2.assists) },
    { name: 'Wiederbelebungen',
      a: ausBeiden(meine?.reboots, r1.wiederbelebt),
      b: ausBeiden(seine?.reboots, r2.wiederbelebt) },
    { name: 'Sturmschaden', a: meine?.stormDamage ?? null, b: seine?.stormDamage ?? null, kleinerIstBesser: true },
    { name: 'Strecke',
      a: ausBeiden(meine?.distanzGesamt,
        typeof r1.streckeMeter === 'number' ? r1.streckeMeter / 1000 : null),
      b: ausBeiden(seine?.distanzGesamt,
        typeof r2.streckeMeter === 'number' ? r2.streckeMeter / 1000 : null),
      einheit: 'km', nk: 1 },
  ].filter((z) => z.a !== null || z.b !== null) : [];

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b
                         border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100"><T>Deine Werte</T></h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={gewaehlt}
            onChange={(e) => { setGewaehlt(e.target.value); if (e.target.value) merken(e.target.value); }}
            className="w-48 rounded-lg border border-sky-600/60 bg-zinc-900/80 px-3 py-1.5
                       text-xs text-slate-100 outline-none focus:border-sky-500">
            <option value="">{t('Konto auswählen')}</option>
            {zuletzt.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="relative">
            <input value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={t('Spieler suchen …')}
              className="w-48 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5
                         text-xs text-slate-100 outline-none focus:border-sky-500" />
            {vorschlaege.length > 0 && (
              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg
                              border border-zinc-700 bg-zinc-900 shadow-xl">
                {vorschlaege.map((p) => (
                  <button key={p.id} type="button"
                    onClick={() => { setGewaehlt(p.name); merken(p.name); setSuche(''); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs
                               text-slate-200 transition hover:bg-sky-500/15 hover:text-sky-300">
                    {/* Bild nur, wo eines gepflegt ist - kein grauer Platzhalter. */}
                    {p.img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.img} alt=""
                        className="h-8 w-6 shrink-0 rounded object-contain" />
                    )}
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="p-4">
        {!team && (
          <p className="py-8 text-center text-sm text-slate-500">
            <T>Wähle oben dein Konto — dann stehen hier deine Werte und die
            deines Mitspielers nebeneinander.</T>
          </p>
        )}

        {team && (
          <div>
            <div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-3 grid grid-cols-2 gap-3">
                  {[ich, mate].map((p, k) => (
                    <div key={k} className="flex flex-col items-center gap-1.5">
                      {p?.img && (
                        /*
                          * Hochkant und vollstaendig.
                          *
                          * Rund und beschnitten war es vorher - damit fehlte
                          * bei jedem Bild der Rand, und Spielerfotos sind
                          * genau dort selten leer. Der Betreiber wollte "das
                          * ganze Bild" sehen: also ein stehendes Rechteck und
                          * object-contain, das nichts abschneidet.
                          */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.img} alt=""
                          className="h-24 w-[4.5rem] rounded-md bg-zinc-900/60
                                     object-contain" />
                      )}
                      <span className={`text-center text-sm font-semibold ${
                        k === 0 ? 'text-sky-300' : 'text-rose-300'}`}>
                        {p?.name ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2
                                border-t border-zinc-800 pt-3">
                  <span className="text-lg font-bold text-slate-100">
                    <T>Rang</T> #{zahl(team.rank)}
                    <span className="ml-2 text-xs font-normal text-slate-500"
                      title={`${zahl(teams.length)} ${t('geladen')}`}>
                      <T>Top</T> {zahl((team.rank / Math.max(1, teams.length)) * 100, 1)} %
                    </span>
                  </span>
                  <span className="text-lg font-bold text-sky-400">
                    {zahl(team.points)} <T>Punkte</T>
                  </span>
                </div>

                {punkte && (
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Placement</span>
                      <span className="tabular-nums text-slate-300">
                        {zahl(punkte.ausPlatz)} <T>Punkte</T>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Elimination</span>
                      <span className="tabular-nums text-slate-300">
                        {zahl(punkte.ausElims)} <T>Punkte</T>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
                {/* Team-Werte: die gibt es je Team, nicht je Spieler. */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 bg-zinc-900/40 px-3 py-2
                                text-xs">
                  {([
                    ['Eliminierungen', zahl(team.elims)],
                    ['Runden', zahl(team.games)],
                    ['Siege', zahl(team.wins)],
                    ['Ø Platz', zahl(team.avgPlace, 2)],
                    ['Lebenszeit', dauer(team.timeAlive)],
                  ] as Array<[string, string]>).map(([n, w]) => (
                    <div key={n} className="flex justify-between gap-2">
                      <span className="text-slate-500"><T>{n}</T></span>
                      <span className="tabular-nums text-slate-300">{w}</span>
                    </div>
                  ))}
                </div>

                {zeilen.length > 0 && (
                  <>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 border-y
                                    border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[10px]
                                    uppercase tracking-wider text-slate-500">
                      <span className="truncate text-right">{ich?.name}</span>
                      <span className="w-36 text-center"><T>Kennzahl</T></span>
                      <span className="truncate">{mate?.name ?? ''}</span>
                    </div>
                    {zeilen.map((z) => {
                      const { a, b } = z;
                      const aBesser = a !== null && b !== null
                        && (z.kleinerIstBesser ? a < b : a > b);
                      const bBesser = a !== null && b !== null
                        && (z.kleinerIstBesser ? b < a : b > a);
                      const zeig = (w: number | null) => (w === null
                        ? '—' : `${zahl(w, z.nk ?? 0)}${z.einheit ? ` ${z.einheit}` : ''}`);
                      return (
                        <div key={z.name}
                          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2
                                     border-b border-zinc-900/70 px-3 py-1.5 last:border-0">
                          <span className={`text-right text-sm font-semibold tabular-nums ${
                            aBesser ? 'text-sky-300' : 'text-slate-400'}`}>
                            {zeig(a)}{aBesser && <span className="ml-1 text-[10px]">▲</span>}
                          </span>
                          <span className="w-36 text-center text-[11px] text-slate-500">
                            <T>{z.name}</T>
                          </span>
                          <span className={`text-sm font-semibold tabular-nums ${
                            bBesser ? 'text-rose-300' : 'text-slate-400'}`}>
                            {zeig(b)}{bBesser && <span className="ml-1 text-[10px]">▲</span>}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {einzel !== null && einzel.length === 0 && !meinReplay && !seinReplay && (
              <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3
                            text-[11px] leading-relaxed text-slate-500">
                <T>Schaden, Trefferquote und Material veröffentlicht Epic nicht.
                Für diesen Cup liegen sie auch nicht aus der Szene-Quelle vor.
                Deine eigenen Werte bekommst du trotzdem: einmal
                meine-werte-holen.bat starten — dann liest das Werkzeug die
                Replays, die Fortnite auf deinem Rechner ablegt.</T>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
