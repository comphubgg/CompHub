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
 * Nachgebaut nach dem Vorbild, das der Betreiber danebengehalten hat: oben
 * beide Namen mit Bild, darunter Rang und die Aufteilung der Punkte, rechts
 * der Verlauf ueber die Runden, darunter die Kennzahlen mit Pfeil.
 *
 * Kein "gegeneinander" - es ist ein Team. Der Pfeil sagt nur, wer bei
 * dieser Kennzahl vorn liegt. Ein Bild steht nur da, wo eines gepflegt ist;
 * ein grauer Platzhalter waere schlechter als nichts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

interface Spieler { id: string; name: string; img?: string | null }

interface Runde {
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

/**
 * Der Verlauf der Punkte ueber die Runden.
 *
 * Zwei Flaechen uebereinander: unten die Punkte aus Eliminierungen, darueber
 * die aus Platzierungen. So ist zu sehen, woher das Ergebnis kam - genau das
 * zeigt auch das Vorbild.
 */
function Verlauf({ platz, elim, ort }: {
  platz: number[]; elim: number[]; ort: string;
}) {
  const n = platz.length;
  if (n < 2) return null;
  const B = 640; const H = 170;
  const links = 10; const unten = 24;
  const hoechster = Math.max(...platz, 1);
  const x = (i: number) => links + (i / (n - 1)) * (B - links - 10);
  const y = (w: number) => H - unten - (w / hoechster) * (H - unten - 14);

  const flaeche = (oben: number[], unter: number[]) => {
    const hin = oben.map((w, i) => `${x(i)},${y(w)}`).join(' L ');
    const zurueck = unter.map((w, i) => [x(i), y(w)] as const).reverse()
      .map(([a, b]) => `${a},${b}`).join(' L ');
    return `M ${hin} L ${zurueck} Z`;
  };
  const linie = (w: number[]) =>
    w.map((v, i) => `${i ? 'L' : 'M'} ${x(i)},${y(v)}`).join(' ');

  const boden = platz.map(() => 0);
  const mitte = Math.floor(n / 2);

  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="h-44 w-full" role="img"
      aria-label="Punkteverlauf">
      <line x1={links} y1={H - unten} x2={B - 10} y2={H - unten}
        stroke="#3f3f46" strokeWidth="1" />

      {/* Platzierungspunkte: die obere, groessere Flaeche. */}
      <path d={flaeche(platz, elim)} fill="rgba(14,165,233,0.25)" />
      <path d={linie(platz)} fill="none" stroke="#38bdf8" strokeWidth="1.5" />

      {/* Eliminierungspunkte darunter. */}
      <path d={flaeche(elim, boden)} fill="rgba(148,163,184,0.22)" />
      <path d={linie(elim)} fill="none" stroke="#cbd5e1" strokeWidth="1.5" />

      <text x={x(mitte)} y={y(platz[mitte]) - 7} fill="#7dd3fc" fontSize="11">
        Placement
      </text>
      <text x={x(mitte)} y={y(elim[mitte]) - 7} fill="#e2e8f0" fontSize="11">
        Elimination
      </text>

      {platz.map((unbenutzt, i) => (
        <text key={i} x={x(i)} y={H - 8} fill="#71717a" fontSize="10"
          textAnchor="middle">{(i + 1).toLocaleString(ort)}</text>
      ))}
    </svg>
  );
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

  const team = useMemo(() => {
    const k = gewaehlt.trim().toLowerCase();
    if (!k) return null;
    return teams.find((e) => e.players.some((p) => p.name.toLowerCase() === k))
      ?? teams.find((e) => e.players.some((p) => p.name.toLowerCase().includes(k)))
      ?? null;
  }, [gewaehlt, teams]);

  /** Der gewaehlte Spieler steht links, sein Mitspieler rechts. */
  const [ich, mate] = useMemo(() => {
    if (!team) return [null, null] as const;
    const k = gewaehlt.trim().toLowerCase();
    const a = team.players.find((p) => p.name.toLowerCase().includes(k)) ?? team.players[0];
    const b = team.players.find((p) => p !== a) ?? null;
    return [a, b] as const;
  }, [team, gewaehlt]);

  const werteVon = useCallback((p: Spieler | null) => {
    if (!p || !einzel) return null;
    return einzel.find((x) => x.epicId.toLowerCase() === p.id.toLowerCase()) ?? null;
  }, [einzel]);

  const vorschlaege = useMemo(() => {
    const k = suche.trim().toLowerCase();
    if (!k) return [];
    const raus: Spieler[] = [];
    for (const e of teams) {
      for (const p of e.players) {
        if (p.name.toLowerCase().includes(k)) raus.push(p);
        if (raus.length >= 8) return raus;
      }
    }
    return raus;
  }, [suche, teams]);

  /** Die Punkte je Runde, aufsummiert und getrennt nach Herkunft. */
  const verlauf = useMemo(() => {
    if (!team || !wertung.length) return null;
    const platz: number[] = []; const elim: number[] = [];
    let sp = 0; let se = 0;
    const runden = [...team.matches].sort(
      (a, b) => (a.endTime ?? '').localeCompare(b.endTime ?? ''));
    for (const m of runden) {
      const p = punkteJeRunde(wertung, m.placement ?? null, m.elims ?? 0);
      if (!p) continue;
      sp += p.ausPlatz; se += p.ausElims;
      platz.push(sp + se); elim.push(se);
    }
    return platz.length ? { platz, elim, ausPlatz: sp, ausElims: se } : null;
  }, [team, wertung]);

  const zahl = (w: number, nk = 0) =>
    w.toLocaleString(ort, { minimumFractionDigits: nk, maximumFractionDigits: nk });

  if (!windowId) return null;

  const meine = werteVon(ich);
  const seine = werteVon(mate);

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
  }> = (meine || seine) ? [
    { name: 'Schaden an Spielern', a: meine?.damage ?? null, b: seine?.damage ?? null },
    { name: 'Schaden erhalten', a: meine?.damageTaken ?? null, b: seine?.damageTaken ?? null, kleinerIstBesser: true },
    { name: 'Schadensverhältnis', a: meine?.quote ?? null, b: seine?.quote ?? null, nk: 2 },
    { name: 'Trefferquote', a: meine?.genauigkeit ?? null, b: seine?.genauigkeit ?? null, einheit: '%', nk: 1 },
    { name: 'Kopftreffer', a: meine?.headshots ?? null, b: seine?.headshots ?? null },
    { name: 'Treffer', a: meine?.hits ?? null, b: seine?.hits ?? null },
    { name: 'Schüsse', a: meine?.shots ?? null, b: seine?.shots ?? null },
    { name: 'Geheilt', a: meine?.heals ?? null, b: seine?.heals ?? null },
    { name: 'Material gefarmt', a: meine?.mats ?? null, b: seine?.mats ?? null },
    { name: 'Bauteile gesetzt', a: meine?.builds ?? null, b: seine?.builds ?? null },
    { name: 'Assists', a: meine?.assists ?? null, b: seine?.assists ?? null },
    { name: 'Sturmschaden', a: meine?.stormDamage ?? null, b: seine?.stormDamage ?? null, kleinerIstBesser: true },
    { name: 'Strecke', a: meine?.distanzGesamt ?? null, b: seine?.distanzGesamt ?? null, einheit: 'km', nk: 1 },
  ] : [];

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
                      <img src={p.img} alt="" className="h-6 w-6 rounded-full object-cover" />
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            {/* --------------------------------------------- Links: die Zahlen */}
            <div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-3 grid grid-cols-2 gap-3">
                  {[ich, mate].map((p, k) => (
                    <div key={k} className="flex flex-col items-center gap-1.5">
                      {p?.img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.img} alt=""
                          className="h-12 w-12 rounded-full object-cover" />
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

                {verlauf && (
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Placement</span>
                      <span className="tabular-nums text-slate-300">
                        {zahl(verlauf.ausPlatz)} <T>Punkte</T>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Elimination</span>
                      <span className="tabular-nums text-slate-300">
                        {zahl(verlauf.ausElims)} <T>Punkte</T>
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

            {/* ------------------------------------------ Rechts: der Verlauf */}
            <div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
                {verlauf ? (
                  <>
                    <Verlauf platz={verlauf.platz} elim={verlauf.elim} ort={ort} />
                    <p className="text-center text-[10px] text-slate-600"><T>Runde</T></p>
                  </>
                ) : (
                  <p className="py-12 text-center text-xs leading-relaxed text-slate-600">
                    <T>Zu diesem Spieltag veröffentlicht Epic keine Punktetabelle —
                    ohne sie lässt sich der Verlauf nicht aufteilen.</T>
                  </p>
                )}
              </div>

              {einzel !== null && einzel.length === 0 && (
                <p className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3
                              text-[11px] leading-relaxed text-slate-500">
                  <T>Schaden, Trefferquote und Material veröffentlicht Epic nicht.
                  Sie kommen aus einer Szene-Quelle, die ein bis zwei Tage später
                  erscheint und nicht jeden Cup abdeckt — alles darüber steht
                  trotzdem, es kommt aus Epics Bestenliste.</T>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
