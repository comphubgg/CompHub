'use client';

/*
 * Deep Stats - Auswertungen je Spieltag, die nur das voll gelesene Server-Replay hergibt (Betreiber, 26.11.2026: eine eigene Seite, NICHT unter
 * /statistics; "Schaden je Waffe" zuerst). Gerechnet wird auf dem Server (lib/tiefeStats, lib/tiefeWerte); hier nur Anzeige.
 *
 *   1. Schaden je Waffe   die staerksten Waffen des Spieltags, die Besten je Waffenart, je Spieler die Aufteilung
 *   2. Treffer            Treffer, Kopftreffer und - wo das Inventar die Schuesse fuehrt - die Trefferquote
 *   3. Third Partys       wer in fremde Kaempfe eingreift und wer dabei selbst dazwischen geraet (die Regel steht im Abschnitt)
 *   4. Waermebilder       Lande- und Todesorte auf der geeichten Karte (lib/zonenKarte)
 *
 * Adresse: /deep-stats?window=<Fenster-Kennung> - der gewaehlte Spieltag steht in der Adresse.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import SeitenKopf from '@/app/components/SeitenKopf';
import { Fach, artVon, bildVon } from '@/app/replays/SpielerEbene';
import { replayDatum, schoenerTitel, tagName } from '@/lib/replayNamen';
import type { TiefCup, TiefKarte, TiefSpieler, TiefeAnsicht } from '@/lib/tiefeStats';

/* ------------------------------------------------------------------ Waffenarten */

const ARTEN: Record<string, { name: string; farbe: string }> = {
  shotgun: { name: 'Shotguns', farbe: '#f97316' },
  ar: { name: 'Assault Rifles', farbe: '#38bdf8' },
  smg: { name: 'SMGs', farbe: '#a78bfa' },
  pistol: { name: 'Pistols', farbe: '#facc15' },
  sniper: { name: 'Snipers', farbe: '#34d399' },
  hacke: { name: 'Pickaxe', farbe: '#94a3b8' },
  sonst: { name: 'Other weapons', farbe: '#f472b6' },
  '?': { name: 'Unknown', farbe: '#475569' },
};
const artInfo = (art: string) => ARTEN[art] ?? ARTEN['?'];
const waffenName = (roh: string) => (roh === '?' ? null : bildVon(roh)?.name ?? artVon(roh).name);

const zahl = (n: number) => Math.round(n).toLocaleString('en-US');
const prozent = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–');

/* ------------------------------------------------------------------ Bausteine */

function Abschnitt({ nr, titel, text, children, rechts }: { nr: number; titel: string; text?: ReactNode; children: ReactNode; rechts?: ReactNode }) {
  return (
    <section className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_10px_30px_rgba(15,23,42,.14)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500">{String(nr).padStart(2, '0')}</p>
          <h2 className="mt-0.5 text-2xl font-extrabold text-white"><T>{titel}</T></h2>
          {text && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>}
        </div>
        {rechts}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Chip({ an, onClick, children, farbe }: { an: boolean; onClick: () => void; children: ReactNode; farbe?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition ${an ? 'bg-sky-500 text-white shadow' : 'border border-zinc-700 text-slate-400 hover:border-zinc-500 hover:text-slate-100'}`}>
      {farbe && <span className="h-2 w-2 rounded-full" style={{ background: farbe }} />}
      {children}
    </button>
  );
}

function WaffenSymbol({ roh, gross = 34 }: { roh: string; gross?: number }) {
  if (roh === '?') return <span className="grid shrink-0 place-items-center rounded-md bg-zinc-800 text-xs font-bold text-slate-500" style={{ width: gross, height: gross }}>?</span>;
  return <span className="shrink-0"><Fach roh={roh} gross={gross} /></span>;
}

/** Ein Balken mit Wert - die Breite relativ zum groessten der Liste. */
function Balken({ wert, max, farbe }: { wert: number; max: number; farbe: string }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (wert / Math.max(1, max)) * 100)}%`, background: farbe }} />
    </span>
  );
}

/* ------------------------------------------------------------------ 1. Schaden je Waffe */

function Waffenliste({ a }: { a: TiefeAnsicht }) {
  const t = useT();
  const [alle, setAlle] = useState(false);
  const liste = a.waffen.filter((w) => w.dmg > 0).slice(0, alle ? 60 : 12);
  const max = liste[0]?.dmg ?? 1;
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-200"><T>Top weapons by total damage</T></h3>
      <ul className="mt-3 space-y-2">
        {liste.map((w, i) => (
          <li key={w.roh} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
            <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-slate-500">{i + 1}</span>
            <WaffenSymbol roh={w.roh} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-100">{waffenName(w.roh) ?? t('Unknown')}</span>
                <span className="shrink-0 text-sm font-black tabular-nums text-white">{zahl(w.dmg)}</span>
              </p>
              <div className="mt-1"><Balken wert={w.dmg} max={max} farbe={artInfo(w.art).farbe} /></div>
              <p className="mt-1 text-[11px] text-slate-500">
                <span style={{ color: artInfo(w.art).farbe }}>{t(artInfo(w.art).name)}</span>
                {' · '}{zahl(w.hits)} {t('hits')} · {prozent(w.krit, w.hits)} {t('headshots')} · {prozent(w.dmg, a.summe.dmg)} {t('of all damage')}
                {typeof w.spieler === 'number' ? <> · {w.spieler} {t('players')}</> : null}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {a.waffen.filter((w) => w.dmg > 0).length > 12 && (
        <button type="button" onClick={() => setAlle(!alle)} className="mt-3 text-xs font-semibold text-sky-400 hover:underline">{alle ? t('Show fewer') : t('Show all weapons')}</button>
      )}
    </div>
  );
}

function ArtBeste({ a }: { a: TiefeAnsicht }) {
  const t = useT();
  const arten = a.arten.filter((x) => x.dmg > 0 && x.art !== '?' && a.artBeste[x.art]?.length);
  const [art, setArt] = useState<string>(arten[0]?.art ?? 'shotgun');
  const gewaehlt = arten.some((x) => x.art === art) ? art : arten[0]?.art;
  const liste = gewaehlt ? a.artBeste[gewaehlt] ?? [] : [];
  const max = liste[0]?.dmg ?? 1;
  const gesamt = a.arten.reduce((s, x) => s + x.dmg, 0);
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-200"><T>Damage by weapon class</T></h3>
      {/* Anteil je Art als ein Band */}
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-zinc-800">
        {a.arten.filter((x) => x.dmg > 0).map((x) => (
          <span key={x.art} title={`${t(artInfo(x.art).name)} ${prozent(x.dmg, gesamt)}`} style={{ width: `${(x.dmg / Math.max(1, gesamt)) * 100}%`, background: artInfo(x.art).farbe }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {arten.map((x) => (
          <Chip key={x.art} an={x.art === gewaehlt} onClick={() => setArt(x.art)} farbe={artInfo(x.art).farbe}>
            {t(artInfo(x.art).name)} <span className="font-semibold normal-case tracking-normal opacity-80">{prozent(x.dmg, gesamt)}</span>
          </Chip>
        ))}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('Most damage with')} {t(artInfo(gewaehlt ?? '?').name)}</p>
      <ol className="mt-2 space-y-1.5">
        {liste.map((s, i) => (
          <li key={s.epic} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2 py-1.5 odd:bg-zinc-950/50">
            <span className={`text-right text-xs font-black tabular-nums ${i === 0 ? 'text-amber-300' : 'text-slate-500'}`}>{i + 1}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{s.name || s.epic.slice(0, 8)}</p>
              <div className="mt-1"><Balken wert={s.dmg} max={max} farbe={artInfo(gewaehlt ?? '?').farbe} /></div>
            </div>
            <span className="text-right">
              <span className="block text-sm font-black tabular-nums text-white">{zahl(s.dmg)}</span>
              <span className="block text-[10px] text-slate-500">{zahl(s.hits)} {t('hits')} · {s.spiele} {t('games')}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SpielerZeile({ s, rang, max }: { s: TiefSpieler; rang: number; max: number }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const jeArt = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of s.waffen) m.set(w.art, (m.get(w.art) ?? 0) + w.dmg);
    return [...m.entries()].filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);
  }, [s.waffen]);
  const wMax = Math.max(1, ...s.waffen.map((w) => w.dmg));
  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <button type="button" onClick={() => setOffen(!offen)} className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left">
        <span className="text-right text-xs font-bold tabular-nums text-slate-500">{rang}</span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">{s.name || s.epic.slice(0, 8)}</span>
            <span className="shrink-0 text-[10px] text-slate-500">{s.spiele} {t('games')}</span>
          </span>
          {/* Aufteilung nach Art - Breite relativ zum Spieler mit dem meisten Schaden */}
          <span className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-zinc-800" style={{ width: `${Math.max(4, (s.dmg / Math.max(1, max)) * 100)}%` }}>
            {jeArt.map(([art, d]) => <span key={art} style={{ width: `${(d / Math.max(1, s.dmg)) * 100}%`, background: artInfo(art).farbe }} />)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-black tabular-nums text-white">{zahl(s.dmg)}</span>
          <span className={`text-xs text-slate-500 transition ${offen ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>
      {offen && (
        <ul className="space-y-1.5 border-t border-zinc-800 px-3 py-3 sm:pl-14">
          {s.waffen.filter((w) => w.dmg > 0 || w.hits > 0).map((w) => (
            <li key={w.roh} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3">
              <WaffenSymbol roh={w.roh} gross={28} />
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-slate-200">{waffenName(w.roh) ?? t('Unknown')}</span>
                  <span className="shrink-0 text-slate-500">{zahl(w.hits)} {t('hits')} · {prozent(w.krit, w.hits)} HS</span>
                </span>
                <span className="mt-1 block"><Balken wert={w.dmg} max={wMax} farbe={artInfo(w.art).farbe} /></span>
              </span>
              <span className="w-14 text-right text-xs font-bold tabular-nums text-slate-100">{zahl(w.dmg)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function JeSpieler({ a, suche, setSuche }: { a: TiefeAnsicht; suche: string; setSuche: (s: string) => void }) {
  const t = useT();
  const [zahlZeigen, setZahlZeigen] = useState(25);
  const q = suche.trim().toLowerCase();
  const liste = useMemo(() => {
    const mitRang = a.spieler.map((s, i) => ({ s, rang: i + 1 }));
    return q ? mitRang.filter(({ s }) => s.name.toLowerCase().includes(q)) : mitRang;
  }, [a.spieler, q]);
  const max = a.spieler[0]?.dmg ?? 1;
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-200"><T>Per player: damage split by weapon</T></h3>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Search player …')}
          className="w-full max-w-xs rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(ARTEN).filter(([k]) => k !== '?').map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><span className="h-2 w-2 rounded-full" style={{ background: v.farbe }} />{t(v.name)}</span>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {liste.slice(0, zahlZeigen).map(({ s, rang }) => <SpielerZeile key={s.epic} s={s} rang={rang} max={max} />)}
      </ul>
      {!liste.length && <p className="mt-3 text-sm text-slate-500"><T>No player found.</T></p>}
      {liste.length > zahlZeigen && (
        <button type="button" onClick={() => setZahlZeigen(zahlZeigen + 50)} className="mt-3 text-xs font-semibold text-sky-400 hover:underline">{t('Show more')} ({liste.length - zahlZeigen})</button>
      )}
      {a.spielerGesamt > a.spieler.length && !q && (
        <p className="mt-2 text-[11px] text-slate-500">{t('Showing the top {n} of {m} players by damage - search to find anyone else.').replace('{n}', String(Math.min(a.spieler.length, 400))).replace('{m}', zahl(a.spielerGesamt))}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Treffer */

type Sortierung = 'hits' | 'krit' | 'kopfQuote' | 'genau' | 'dmg';
function Treffer({ a }: { a: TiefeAnsicht }) {
  const t = useT();
  const [sort, setSort] = useState<Sortierung>('hits');
  const mitSchuss = a.spieler.some((s) => s.schuss);
  // Quoten erst ab 50 Treffern (bzw. 150 Schuessen) - sonst fuehrt ein Spieler mit drei Treffern die Liste an.
  const zeilen = useMemo(() => {
    const wert = (s: TiefSpieler) => sort === 'hits' ? s.hits : sort === 'krit' ? s.krit : sort === 'dmg' ? s.dmg
      : sort === 'kopfQuote' ? (s.hits >= 50 ? s.krit / s.hits : -1) : (s.schuss && s.schuss >= 150 ? s.hits / s.schuss : -1);
    return [...a.spieler].filter((s) => wert(s) >= 0).sort((x, y) => wert(y) - wert(x)).slice(0, 25);
  }, [a.spieler, sort]);
  const kopf = (k: Sortierung, text: string) => (
    <th className="px-2 py-2 text-right">
      <button type="button" onClick={() => setSort(k)} className={`text-[10px] font-bold uppercase tracking-[0.12em] ${sort === k ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}>{t(text)}{sort === k ? ' ▾' : ''}</button>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Hits on players', zahl(a.summe.hits)],
          ['Headshots', zahl(a.summe.krit)],
          ['Headshot rate', prozent(a.summe.krit, a.summe.hits)],
          ['Damage per hit', a.summe.hits ? (a.summe.dmg / a.summe.hits).toFixed(1) : '–'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t(k)}</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-white">{v}</p>
          </div>
        ))}
      </div>
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-zinc-800">
          <tr>
            <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">#</th>
            <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{t('Player')}</th>
            {kopf('dmg', 'Damage')}{kopf('hits', 'Hits')}{kopf('krit', 'Headshots')}{kopf('kopfQuote', 'HS %')}
            {mitSchuss && kopf('genau', 'Accuracy')}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((s, i) => (
            <tr key={s.epic} className="border-b border-zinc-800/60 last:border-0">
              <td className="px-2 py-1.5 text-xs font-bold tabular-nums text-slate-500">{i + 1}</td>
              <td className="max-w-[220px] truncate px-2 py-1.5 font-semibold text-slate-100">{s.name || s.epic.slice(0, 8)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{zahl(s.dmg)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{zahl(s.hits)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{zahl(s.krit)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{prozent(s.krit, s.hits)}</td>
              {mitSchuss && <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{s.schuss ? <>{prozent(s.hits, s.schuss)} <span className="text-[10px] text-slate-600">/ {zahl(s.schuss)}</span></> : '–'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <T>Hits and headshots count every hit on an enemy player in the replay, including hits on knocked players. Rates only for players with at least 50 hits.</T>{' '}
        {mitSchuss ? <T>Accuracy is hits divided by shots fired, from the ammo the replay records - only for players whose every game records it (at least 150 shots).</T> : <T>Shots fired are not recorded for this match day, so there is no accuracy.</T>}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Third Partys */

function ThirdPartys({ a }: { a: TiefeAnsicht }) {
  const t = useT();
  const [art, setArt] = useState<'eingegriffen' | 'dazwischen'>('eingegriffen');
  const liste = useMemo(() => [...a.teams].sort((x, y) => (art === 'eingegriffen' ? y.eingegriffen - x.eingegriffen || x.dazwischen - y.dazwischen : y.dazwischen - x.dazwischen || y.eingegriffen - x.eingegriffen)).slice(0, 20), [a.teams, art]);
  const summe = a.teams.reduce((s, x) => s + x.eingegriffen, 0);
  const max = Math.max(1, ...liste.map((x) => Math.max(x.eingegriffen, x.dazwischen)));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip an={art === 'eingegriffen'} onClick={() => setArt('eingegriffen')}><T>Third-partied others</T></Chip>
        <Chip an={art === 'dazwischen'} onClick={() => setArt('dazwischen')}><T>Got third-partied</T></Chip>
        <span className="ml-auto text-xs text-slate-500">{zahl(summe)} {t('third parties in')} {a.matches} {t('games')}</span>
      </div>
      <ol className="mt-4 space-y-1.5">
        {liste.map((x, i) => (
          <li key={x.namen.join('|') + i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2 py-2 odd:bg-zinc-950/50">
            <span className="text-right text-xs font-black tabular-nums text-slate-500">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-100">{x.namen.join(' · ')}</span>
              <span className="mt-1 grid grid-cols-2 gap-2">
                <Balken wert={x.eingegriffen} max={max} farbe="#38bdf8" />
                <Balken wert={x.dazwischen} max={max} farbe="#f43f5e" />
              </span>
            </span>
            <span className="text-right text-[11px] leading-tight text-slate-400">
              <span className="block"><b className="text-sm tabular-nums text-sky-300">{x.eingegriffen}</b> {t('made')}</span>
              <span className="block"><b className="tabular-nums text-rose-300">{x.dazwischen}</b> {t('suffered')} · {x.kaempfe} {t('fights')}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ 4. Waermebilder */

function Waermebild({ k, art }: { k: TiefKarte; art: 'landung' | 'tode' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [bildDa, setBildDa] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const b = new Image();
    b.onload = () => setBildDa(b);
    b.src = k.bild;
  }, [k.bild]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const N = 900;
    c.width = N; c.height = N;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, N, N);
    const r = k.rahmen; const br = k.bildRahmen;
    if (bildDa) {
      const w = bildDa.naturalWidth; const h = bildDa.naturalHeight;
      g.globalAlpha = 0.78;
      g.drawImage(bildDa, ((r.x0 - br.x0) / br.spanne) * w, ((r.y0 - br.y0) / br.spanne) * h, (r.spanne / br.spanne) * w, (r.spanne / br.spanne) * h, 0, 0, N, N);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(2,6,23,.35)'; g.fillRect(0, 0, N, N);
    }
    // Die Felder auf ein kleines Bild, weich hochgezogen: so entsteht das Waermebild ohne harte Kaesten.
    const werte = art === 'landung' ? k.landung : k.tode;
    const max = Math.max(1, ...werte);
    const klein = document.createElement('canvas');
    klein.width = k.raster; klein.height = k.raster;
    const kg = klein.getContext('2d');
    if (!kg) return;
    const bild = kg.createImageData(k.raster, k.raster);
    // Verlauf: Blau (wenig) -> Gelb -> Rot (viel); Wurzel, damit auch einzelne Orte sichtbar bleiben.
    const farbe = (f: number): [number, number, number] => (f < 0.5 ? [56 + (250 - 56) * f * 2, 189 + (204 - 189) * f * 2, 248 - (248 - 21) * f * 2] : [250 - (250 - 239) * (f - 0.5) * 2, 204 - (204 - 68) * (f - 0.5) * 2, 21 + (68 - 21) * (f - 0.5) * 2]);
    for (let i = 0; i < werte.length; i += 1) {
      if (!werte[i]) continue;
      const f = Math.sqrt(werte[i] / max);
      const [rr, gg, bb] = farbe(f);
      bild.data[i * 4] = rr; bild.data[i * 4 + 1] = gg; bild.data[i * 4 + 2] = bb; bild.data[i * 4 + 3] = Math.round(170 + 85 * f);
    }
    kg.putImageData(bild, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.filter = 'blur(10px)';
    g.drawImage(klein, 0, 0, N, N);
    g.drawImage(klein, 0, 0, N, N);
    g.filter = 'blur(2px)';
    g.globalAlpha = 0.85;
    g.drawImage(klein, 0, 0, N, N);
    g.filter = 'none';
    g.globalAlpha = 1;
  }, [k, art, bildDa]);
  return <canvas ref={ref} className="aspect-square w-full max-w-[720px] rounded-2xl border border-zinc-800" />;
}

function Karten({ a }: { a: TiefeAnsicht }) {
  const t = useT();
  const [art, setArt] = useState<'landung' | 'tode'>('landung');
  const [nr, setNr] = useState(0);
  const k = a.karten[Math.min(nr, a.karten.length - 1)];
  if (!k) return <p className="text-sm text-slate-500"><T>No calibrated map for this match day.</T></p>;
  // Ohne Landungen (Replays, die vor dem 18.11.2026 gelesen wurden, fuehren sie nicht) gleich die Tode.
  const zeige = art === 'landung' && !k.nLandung && k.nTode ? 'tode' : art;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)]">
      <Waermebild k={k} art={zeige} />
      <div>
        <div className="flex flex-wrap gap-2">
          {k.nLandung > 0 && <Chip an={zeige === 'landung'} onClick={() => setArt('landung')}><T>Landings</T></Chip>}
          <Chip an={zeige === 'tode'} onClick={() => setArt('tode')}><T>Deaths</T></Chip>
        </div>
        {a.karten.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {a.karten.map((x, i) => <Chip key={x.bild} an={i === nr} onClick={() => setNr(i)}>{x.art === 'reload' ? 'Reload' : 'Battle Royale'} · {x.matches}</Chip>)}
          </div>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-2">
          {[
            ['Games', zahl(k.matches)],
            [zeige === 'landung' ? 'Landings' : 'Deaths', zahl(zeige === 'landung' ? k.nLandung : k.nTode)],
          ].map(([x, v]) => (
            <div key={x} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t(x)}</dt>
              <dd className="mt-0.5 text-xl font-black tabular-nums text-white">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-400">
          <span><T>few</T></span>
          <span className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg,#38bdf8,#facc15,#ef4444)' }} />
          <span><T>many</T></span>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          {!k.nLandung && <><T>The replays of this match day were read before landing spots were recorded, so there is no landing map.</T>{' '}</>}
          {zeige === 'landung'
            ? <T>Where each player first touched the ground after the bus, glide and parachute - every player of every game of the match day.</T>
            : <T>Where players were eliminated (knocked players who were revived do not count; in Reload every elimination counts, also before a respawn).</T>}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function DeepStatsSeite() {
  const t = useT();
  const [cups, setCups] = useState<TiefCup[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [fenster, setFenster] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<TiefeAnsicht | null>(null);
  const [suche, setSuche] = useState('');
  const [sucheServer, setSucheServer] = useState('');

  useEffect(() => {
    let weg = false;
    fetch('/api/deep-stats').then((r) => r.json())
      .then((j) => {
        if (weg) return;
        if (!Array.isArray(j?.cups)) { setFehler(true); return; }
        setCups(j.cups);
        const ausAdresse = new URLSearchParams(window.location.search).get('window');
        const erster = (j.cups as TiefCup[])[0];
        setFenster(ausAdresse || erster?.tage.find((d) => d.region === 'EU')?.windowId || erster?.tage[0]?.windowId || null);
      })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);

  // Suche beim Server erst nach einer kurzen Pause - wer nicht unter den ersten 400 steht, wird so trotzdem gefunden.
  useEffect(() => { const z = setTimeout(() => setSucheServer(suche.trim()), 400); return () => clearTimeout(z); }, [suche]);

  // Laden, und solange noch gelesen wird (liest), alle 2,5 s noch einmal - bis alles da ist. Zustand nur nach dem ersten await (Regel set-state-in-effect).
  useEffect(() => {
    if (!fenster) return undefined;
    const signal = { weg: false };
    (async () => {
      try {
        for (let runde = 0; runde < 200 && !signal.weg; runde += 1) {
          const r = await fetch(`/api/deep-stats?window=${encodeURIComponent(fenster)}${sucheServer ? `&suche=${encodeURIComponent(sucheServer)}` : ''}`);
          const j = await r.json() as TiefeAnsicht & { error?: string };
          if (signal.weg) return;
          if (!r.ok || j.error) { setFehler(true); return; }
          setFehler(false);
          setAnsicht(j);
          if (!j.liest) return;
          await new Promise((ok) => setTimeout(ok, 2500));
        }
      } catch { if (!signal.weg) setFehler(true); }
    })();
    return () => { signal.weg = true; };
  }, [fenster, sucheServer]);

  const waehle = (w: string) => {
    setFenster(w); setAnsicht(null); setSuche(''); setFehler(false);
    const u = new URL(window.location.href); u.searchParams.set('window', w); window.history.replaceState(null, '', u.toString());
  };

  const cup = useMemo(() => cups?.find((c) => c.tage.some((d) => d.windowId === fenster)) ?? null, [cups, fenster]);
  const a = ansicht && ansicht.windowId === fenster ? ansicht : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <SeitenKopf marke={<T>From the server replays</T>} titel="Deep Stats"
          text={<T>What only a fully read replay can tell: damage per weapon, hits and headshots, third parties, and where the lobby landed and died - for every analysed match day.</T>} />

        {/* Auswahl: Cup, dann Spieltag */}
        <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500" htmlFor="tief-cup"><T>Cup</T></label>
            <select id="tief-cup" value={cup?.eventId ?? ''} onChange={(e) => { const c = cups?.find((x) => x.eventId === e.target.value); const d = c?.tage.find((x) => x.region === 'EU') ?? c?.tage[0]; if (d) waehle(d.windowId); }}
              className="min-w-0 max-w-full flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 sm:max-w-md">
              {!cup && <option value="">{t('Choose a cup …')}</option>}
              {(cups ?? []).map((c) => <option key={c.eventId} value={c.eventId}>{schoenerTitel(c.titel)} · {c.season} · {replayDatum(c.beginn)}</option>)}
            </select>
          </div>
          {cup && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cup.tage.map((d, i) => (
                <Chip key={d.windowId} an={d.windowId === fenster} onClick={() => waehle(d.windowId)}>
                  {d.region} · {tagName(d.windowId, i)} <span className="font-semibold normal-case tracking-normal opacity-70">{d.matches} {t('games')}</span>
                </Chip>
              ))}
            </div>
          )}
        </div>

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>Deep Stats could not be loaded right now. Please try again in a moment.</T></p>}
        {((!cups && !fehler) || (!!fenster && !a && !fehler)) && <LadeSchirm />}
        {cups && !cups.length && <p className="mt-6 text-sm text-slate-500"><T>No match day has been analysed yet.</T></p>}

        {a && (
          <>
            {/* Stand: wie viel gelesen ist */}
            <div className={`mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-3 text-sm ${a.fertig && !a.teilweise ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-200'}`}>
              <b className="font-semibold">{a.titel ? schoenerTitel(a.titel) : schoenerTitel(a.windowId)}{a.region ? ` · ${a.region}` : ''}</b>
              <span>
                {a.fertig
                  ? t('All {n} games read from the replays.').replace('{n}', String(a.matches))
                  : t('{n} of {m} games read so far - the numbers below are partial and grow as the rest is read.').replace('{n}', String(a.matches)).replace('{m}', String(a.erwartet ?? '?'))}
                {a.ohne > 0 && <> {t('{n} games have no readable replay.').replace('{n}', String(a.ohne))}</>}
                {a.teilweise > 0 && <> {t('{n} replays were stored incomplete.').replace('{n}', String(a.teilweise))}</>}
                {a.alteLeser > 0 && <> {t('{n} games were read with an older reader that missed damage from explosions and bolts - damage there is about 2% lower than in Player Stats.').replace('{n}', String(a.alteLeser))}</>}
              </span>
              {a.liest && <span className="inline-flex items-center gap-2 text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" /><T>reading …</T></span>}
            </div>

            {a.matches === 0 ? (
              <p className="mt-6 text-sm text-slate-500"><T>No game of this match day has been read yet.</T></p>
            ) : (
              <>
                <Abschnitt nr={1} titel="Damage per weapon"
                  text={<T>Every hit is credited to the weapon the shooter was holding when it landed. If he had already switched to building or healing, it counts for the weapon held just before (up to 3 seconds). Damage as in Player Stats: effective damage, nothing on knocked players.</T>}
                  rechts={<span className="text-right text-xs text-slate-500"><b className="block text-2xl font-black tabular-nums text-white">{zahl(a.summe.dmg)}</b><T>damage in total</T></span>}>
                  <div className="grid gap-8 lg:grid-cols-2">
                    <Waffenliste a={a} />
                    <ArtBeste a={a} />
                  </div>
                  <JeSpieler a={a} suche={suche} setSuche={setSuche} />
                </Abschnitt>

                <Abschnitt nr={2} titel="Hits & accuracy">
                  <Treffer a={a} />
                </Abschnitt>

                <Abschnitt nr={3} titel="Third parties"
                  text={<T>How it is counted: a fight is two teams trading damage (hits both ways, no pause over 15 seconds); a third party is another team that starts hitting either of them during the fight or within 10 seconds after its last hit, without having hit them in the 15 seconds before.</T>}>
                  <ThirdPartys a={a} />
                </Abschnitt>

                <Abschnitt nr={4} titel="Landing & death heatmaps">
                  <Karten a={a} />
                </Abschnitt>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
