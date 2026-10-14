'use client';

/*
 * Die Power Rankings im neuen Design (14.10.2026).
 *
 * Gleich bleiben die Daten: Epics weltweite Liste mit zehntausend Plaetzen, tagesaktuell (/api/power-rankings). Neu ist alles, was man sieht:
 * oben die Spitze als drei Karten (Podest), daneben die groessten Spruenge seit der letzten Fortschreibung und die Laender der ersten
 * hundert; darunter die ganze Liste mit einem Balken je Zeile, der die Wertung gegen die Spitze stellt. Der Spielername ist der, unter dem
 * das Werkzeug ihn fuehrt (Profil, Namensliste der Szene), Epics Name steht klein darunter.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import TeamFlagge from '@/components/TeamFlagge';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

interface Spieler {
  rank: number; id: string; name: string; anzeige: string; land: string;
  wertung: number; bestwert: number; deltaWertung: number; deltaPlatz: number;
}
interface Seite {
  success: boolean; page: number; totalPages: number; matched: number; total: number; fetchedAt: number;
  players: Spieler[]; holt?: boolean; ersterPlatz?: number; letzterPlatz?: number; fehlend?: number; error?: string;
}
interface Uebersicht {
  success: boolean; fetchedAt: number; total: number;
  spitze: Spieler[]; aufsteiger: Spieler[]; absteiger: Spieler[]; laender: Array<{ land: string; n: number }>;
}

const ZEILEN = [50, 100] as const;
/** Gold, Silber, Bronze - feste Farben, in beiden Fassungen gleich. */
const MEDAILLE = ['#f5b301', '#9aa6ba', '#cc7a3d'] as const;

function seitWann(ms: number, t: (s: string) => string) {
  if (!ms) return '';
  const mit = (satz: string, n: number) => t(satz).replace('{n}', String(n));
  const minuten = Math.round((Date.now() - ms) / 60_000);
  if (minuten < 2) return t('gerade eben');
  if (minuten < 60) return mit('vor {n} Minuten', minuten);
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return mit(stunden === 1 ? 'vor {n} Stunde' : 'vor {n} Stunden', stunden);
  const tage = Math.round(stunden / 24);
  return mit(tage === 1 ? 'vor {n} Tag' : 'vor {n} Tagen', tage);
}

/** Ein Pfeil als gezeichneter Winkel - hoch oder runter. */
function Winkel({ hoch, px = 11 }: { hoch: boolean; px?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={px} height={px} aria-hidden="true" className="shrink-0 overflow-visible">
      <path d={hoch ? 'M4 15.5 12 7.5l8 8' : 'M4 8.5 12 16.5l8-8'} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Die Bewegung seit der letzten Fortschreibung: Pfeil und Zahl, farbig nur im Pfeil. */
function Bewegung({ platz, gross = false }: { platz: number; gross?: boolean }) {
  if (!platz) return <span className="text-slate-600">—</span>;
  const hoch = platz > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${gross ? 'text-sm' : 'text-xs'} ${hoch ? 'text-emerald-500' : 'text-rose-500'}`}>
      <Winkel hoch={hoch} />{Math.abs(platz)}
    </span>
  );
}

/** Der Name: gross der gefuehrte Name, klein darunter Epics Name - wenn sie sich unterscheiden. */
function Name({ s, klein = false }: { s: Spieler; klein?: boolean }) {
  const epic = s.name || '';
  const gleich = !epic || epic.toLowerCase() === (s.anzeige || '').toLowerCase();
  return (
    <span className="min-w-0">
      <span className={`block truncate font-bold leading-tight text-slate-100 ${klein ? 'text-[0.95rem]' : 'text-base'}`}>{s.anzeige || epic || '—'}</span>
      {!gleich && <span className="block truncate text-[0.72rem] leading-tight text-slate-500">{epic}</span>}
    </span>
  );
}

export default function RanglisteNeu() {
  const { t, sprache } = useSprache();
  const ort = ortVon(sprache);
  const zahl = (n: number) => n.toLocaleString(ort);
  const laendername = useMemo(() => {
    try { const d = new Intl.DisplayNames([sprache === 'de' ? 'de' : 'en'], { type: 'region' }); return (c: string) => d.of(c.toUpperCase()) ?? c.toUpperCase(); } catch { return (c: string) => c.toUpperCase(); }
  }, [sprache]);

  const [uebersicht, setUebersicht] = useState<Uebersicht | null>(null);
  const [suche, setSuche] = useState('');
  const [proSeite, setProSeite] = useState<number>(ZEILEN[0]);
  const [seite, setSeite] = useState(1);
  const [daten, setDaten] = useState<Seite | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    fetch('/api/power-rankings?uebersicht=1', { cache: 'no-store' }).then((r) => r.json()).then((j: Uebersicht) => { if (!weg && j?.success) setUebersicht(j); }).catch(() => { /* ohne Uebersicht bleibt die Liste */ });
    return () => { weg = true; };
  }, []);

  const holen = useCallback(async () => {
    setLaedt(true); setFehler(null);
    try {
      const p = new URLSearchParams({ page: String(seite), pageSize: String(proSeite) });
      if (suche.trim()) p.set('q', suche.trim());
      const r = await fetch(`/api/power-rankings?${p}`, { cache: 'no-store' });
      const j = await r.json() as Seite;
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Nicht ladbar');
      setDaten(j);
    } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, [seite, proSeite, suche]);

  useEffect(() => {
    const uhr = window.setTimeout(holen, suche ? 300 : 0);
    return () => window.clearTimeout(uhr);
  }, [holen, suche]);

  const seitenZahl = daten?.totalPages ?? 1;
  const seiteJetzt = Math.min(Math.max(1, seite), seitenZahl);
  const leiste = useMemo(() => {
    const raus: Array<number | 'luecke'> = [];
    for (let i = 1; i <= seitenZahl; i++) {
      if (i === 1 || i === seitenZahl || Math.abs(i - seiteJetzt) <= 1) raus.push(i);
      else if (raus[raus.length - 1] !== 'luecke') raus.push('luecke');
    }
    return raus;
  }, [seitenZahl, seiteJetzt]);

  const spieler = daten?.players ?? [];
  const spitze = uebersicht?.spitze ?? [];
  const obergrenze = Math.max(spitze[0]?.wertung ?? 0, ...spieler.map((s) => s.wertung), 1);
  // Der Balken beginnt beim schwaechsten Wert der Seite - sonst wuerden zwei Dutzend Plaetze, die um zweitausend Punkte auseinanderliegen, alle fast voll aussehen.
  const untergrenze = spieler.length ? Math.min(...spieler.map((s) => s.wertung)) : 0;
  const balken = (w: number) => (obergrenze > untergrenze ? 6 + (94 * (w - untergrenze)) / (obergrenze - untergrenze) : 100);
  const stand = uebersicht?.fetchedAt || daten?.fetchedAt || 0;
  // Das Podest zeigt Platz 2, 1, 3 - die Eins in der Mitte und hoeher.
  const podest = spitze.length === 3 ? [spitze[1], spitze[0], spitze[2]] : [];

  return (
    <div className="space-y-8" data-tour="rankingsTable">
      {/* ------------------------------------------------------------------ Spitze */}
      {podest.length === 3 && (
        <section aria-label={t('Spitzenreiter')} className="grid gap-4 md:grid-cols-3 md:items-end">
          {podest.map((s, i) => {
            const platz = s.rank; const farbe = MEDAILLE[Math.min(platz, 3) - 1];
            const mitte = i === 1;
            return (
              <article key={s.id || s.rank} className={`relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-sm ${mitte ? 'px-6 pb-7 pt-8 md:pb-9 md:pt-10' : 'px-6 pb-6 pt-7'}`}>
                <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: farbe }} />
                <div className="flex items-start justify-between gap-3">
                  <span className="schrift-anzeige text-6xl font-extrabold leading-none tracking-tight" style={{ color: farbe }}>{platz}</span>
                  <TeamFlagge groesse={mitte ? 52 : 44} laender={[s.land || undefined]} />
                </div>
                <div className="mt-5"><Name s={s} /></div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500"><T>PR-Wertung</T></p>
                    <p className="schrift-anzeige text-3xl font-extrabold leading-tight tabular-nums text-slate-100">{zahl(s.wertung)}</p>
                  </div>
                  <Bewegung platz={s.deltaPlatz} gross />
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* ----------------------------------------------------------- Bewegung und Laender */}
      {uebersicht && (
        <section className="grid gap-4 lg:grid-cols-3">
          {([['aufsteiger', t('Aufsteiger'), true], ['absteiger', t('Absteiger'), false]] as const).map(([schluessel, titel, hoch]) => (
            <div key={schluessel} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="schrift-anzeige text-lg font-bold text-slate-100">{titel}</h2>
                <span className="text-[0.7rem] text-slate-500"><T>seit der letzten Fortschreibung</T></span>
              </div>
              <ol className="space-y-1.5">
                {uebersicht[schluessel].slice(0, 6).map((s) => (
                  <li key={s.id || s.rank} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-zinc-800/70">
                    <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-500">#{s.rank}</span>
                    <TeamFlagge groesse={22} laender={[s.land || undefined]} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{s.anzeige || s.name}</span>
                    <span className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${hoch ? 'text-emerald-500' : 'text-rose-500'}`}><Winkel hoch={hoch} />{Math.abs(s.deltaPlatz)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="schrift-anzeige text-lg font-bold text-slate-100"><T>Aus welchen Ländern die Top 100 kommen</T></h2>
            </div>
            <ul className="space-y-2">
              {uebersicht.laender.map((l) => (
                <li key={l.land} className="flex items-center gap-3">
                  <TeamFlagge groesse={22} laender={[l.land]} />
                  <span className="w-28 shrink-0 truncate text-sm font-semibold text-slate-200">{laendername(l.land)}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-800"><span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${(l.n / (uebersicht.laender[0]?.n || 1)) * 100}%` }} /></span>
                  <span className="w-7 shrink-0 text-right text-sm font-bold tabular-nums text-slate-100">{l.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------- Die Liste */}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <h2 className="schrift-anzeige text-xl font-bold text-slate-100"><T>Alle Plätze</T></h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {daten ? `${zahl(daten.total)} ${t('Spieler')}` : t('Wird geladen …')}
              {daten && daten.matched !== daten.total ? ` · ${zahl(daten.matched)} ${t('Treffer')}` : ''}
              {!!stand && ` · ${t('Stand')} ${seitWann(stand, t)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input value={suche} onChange={(e) => { setSuche(e.target.value); setSeite(1); }} placeholder={t('Spieler suchen …')}
              className="w-60 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <T>Zeilen</T>
              <select value={proSeite} onChange={(e) => { setProSeite(+e.target.value); setSeite(1); }}
                className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500">
                {ZEILEN.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </header>

        {!!daten?.fehlend && !daten.holt && (
          <p className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 text-sm text-amber-200">
            <T>Epics Rangliste war beim letzten Abruf nur teilweise erreichbar.</T>{' '}
            {t('Hier stehen die Plätze')} {zahl(daten.ersterPlatz ?? 0)}–{zahl(daten.letzterPlatz ?? 0)}, {zahl(daten.fehlend)} {t('Plätze fehlen')}.{' '}
            <T>Der nächste vollständige Abruf ersetzt die Liste von selbst.</T>
          </p>
        )}

        {fehler ? <p className="p-8 text-center text-sm text-rose-500">{fehler}</p>
          : laedt && !spieler.length ? <LadeSchirm />
          : daten?.holt ? <p className="p-8 text-center text-sm text-slate-400"><T>Die Rangliste wird gerade geholt — zehntausend Plätze in hundert Schritten. Das dauert einige Minuten; lade die Seite danach neu.</T></p>
          : !spieler.length ? <p className="p-8 text-center text-sm text-slate-500">{suche ? <>{t('Kein Spieler gefunden für')} „{suche}“.</> : <T>Keine Daten.</T>}</p>
          : (
            <>
              <ol>
                {spieler.map((s) => (
                  <li key={`${s.rank}-${s.name}`} className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-zinc-800/70 px-4 py-3 transition last:border-b-0 hover:bg-zinc-800/50 sm:grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-6">
                    <span className={`schrift-anzeige text-xl font-extrabold tabular-nums ${s.rank <= 3 ? '' : 'text-slate-300'}`} style={s.rank <= 3 ? { color: MEDAILLE[s.rank - 1] } : undefined}>{zahl(s.rank)}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <TeamFlagge groesse={30} laender={[s.land || undefined]} />
                      <Name s={s} klein />
                    </span>
                    {/* Der Balken stellt die Wertung gegen die Spitze - nur ab Tablet, auf dem Handy bleibt die Zeile schmal. */}
                    <span className="hidden sm:block">
                      <span className="relative block h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${balken(s.wertung)}%` }} />
                      </span>
                      <span className="mt-1 block text-[0.7rem] tabular-nums text-slate-500"><T>Höchstwert</T> {zahl(s.bestwert)}</span>
                    </span>
                    <span className="flex items-center justify-end gap-4 text-right">
                      <span className="hidden sm:block"><Bewegung platz={s.deltaPlatz} /></span>
                      <span>
                        <span className="schrift-anzeige block text-lg font-extrabold leading-tight tabular-nums text-slate-100">{zahl(s.wertung)}</span>
                        <span className={`block text-[0.7rem] font-semibold tabular-nums ${s.deltaWertung > 0 ? 'text-emerald-500' : s.deltaWertung < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                          {s.deltaWertung > 0 ? '+' : ''}{zahl(s.deltaWertung)}
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>

              {seitenZahl > 1 && (
                <div data-tour="rankingsFooter" className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-4 sm:px-6">
                  <span className="text-xs text-slate-500">
                    <T>Platz</T> {zahl((seiteJetzt - 1) * proSeite + 1)} <T>bis</T> {zahl(Math.min(seiteJetzt * proSeite, daten?.matched ?? 0))} <T>von</T> {zahl(daten?.matched ?? 0)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => setSeite(seiteJetzt - 1)} disabled={seiteJetzt <= 1} className="rounded-full border border-zinc-800 px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-30">‹</button>
                    {leiste.map((n, i) => (n === 'luecke' ? <span key={`l${i}`} className="px-1 text-xs text-slate-600">…</span> : (
                      <button key={n} onClick={() => setSeite(n)} className={`min-w-9 rounded-full border px-3 py-1.5 text-xs tabular-nums transition ${n === seiteJetzt ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-800 text-slate-300 hover:border-sky-500'}`}>{n}</button>
                    )))}
                    <button onClick={() => setSeite(seiteJetzt + 1)} disabled={seiteJetzt >= seitenZahl} className="rounded-full border border-zinc-800 px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-30">›</button>
                  </div>
                  {seitenZahl > 5 && (
                    <form className="flex items-center gap-1.5" onSubmit={(e) => {
                      e.preventDefault();
                      const n = parseInt(String(new FormData(e.currentTarget).get('zuSeite') ?? ''), 10);
                      if (Number.isFinite(n)) setSeite(Math.min(Math.max(1, n), seitenZahl));
                    }}>
                      <span className="text-xs text-slate-500"><T>Zu Seite</T></span>
                      <input name="zuSeite" inputMode="numeric" placeholder={String(seiteJetzt)} className="w-16 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-center text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                      <button type="submit" className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-500"><T>Los</T></button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
      </section>
    </div>
  );
}
