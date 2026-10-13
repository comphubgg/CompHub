'use client';

/*
 * "Player Stats" eines Cups wie bei Osirion: oben ein Konto-Auswahlfeld (das eigene, verifizierte Epic-Konto - oder die Karte "Verify
 * with Epic Games") und eine Spielersuche; darunter die Werte des gewaehlten Spielers - Name, Platz, Top-Prozent, Punkte, getrennt nach
 * Platzierung und Eliminierungen, die Tabelle der Werte und rechts je Wert eine Kurve ueber die Spiele.
 *
 * Der Betreiber (13.10.2026): "genau eins zu eins, nur mit meinen Farben ... alles, was in dem Screenshot ist". Woher die Werte kommen
 * (app/api/spieler-detail): Epics Bestenliste fuer jeden Cup (Platz, Punkte, je Spiel Platz, Eliminierungen, Ueberlebenszeit) und die
 * Szene-Quelle fuer die Spieltage, die sie fuehrt (Schaden, Treffer, Schuesse, Heilung, Material, Sturm, Strecke - je Spieltag, nicht je
 * Spiel). Was eine Quelle nicht kennt, steht mit einem Strich da und einem Hinweis - es wird nichts erfunden.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';

interface Match {
  placement?: number; elims?: number; timeAlive?: number; wins?: number;
  damage?: number; damageTaken?: number; headshots?: number; heilung?: number; schild?: number; strecke?: number;
  holzGefarmt?: number; steinGefarmt?: number; metallGefarmt?: number;
  punktePlatz?: number; punkteElim?: number;
}
interface Eintrag {
  players?: unknown[];
  rank: number; points: number; elims: number; games: number; wins: number; kd: number; timeAlive: number;
  damage: number; damageTaken: number; headshots: number; matsGefarmt: number; strecke: number;
  punktePlatz?: number; punkteElims?: number; matches: Match[];
}
interface Antwort {
  ok: boolean; error?: string; id: string; name: string; dabei: boolean;
  rank: number | null; gesamt: number; top: number | null; eintrag: Eintrag | null;
  aktualisiert: string | null; szene: Record<string, number> | null; szeneStand: string | null; szeneMatches: number;
}
interface Treffer { id: string; name: string; rank: number; points: number }

const num = (v: number) => Math.round(v).toLocaleString('en-US');
const pct = (v: number) => `${v.toFixed(2)}%`;
function dauer(s: number): string {
  const st = Math.floor(s / 3600); const mi = Math.floor((s % 3600) / 60);
  return st ? `${st}h ${mi}m` : `${mi}m ${Math.round(s % 60)}s`;
}
const km = (cm: number) => `${(cm / 100000).toFixed(1)}km`;

type Wert = number | null;
interface Zeile {
  titel: string;
  /** Der Gesamtwert - null, wo keine Quelle ihn kennt. */
  wert: (e: Eintrag | null, s: Record<string, number> | null) => Wert;
  zeige: (v: number) => string;
  /** Der Wert je Spiel fuer die Kurve - nur dort, wo Epic ihn je Spiel liefert. */
  je?: (m: Match) => number | undefined;
  /** Rot statt blau: Schaden, den man genommen hat, Sturm. */
  rot?: boolean;
}
const pos = (v: number | undefined) => (typeof v === 'number' && v > 0 ? v : null);
const ZEILEN: Zeile[] = [
  { titel: 'Eliminations', wert: (e, s) => (s ? s.eliminations : e ? e.elims : null), zeige: num, je: (m) => m.elims },
  { titel: 'Damage To Players', wert: (e, s) => (s ? s.damageDealt : pos(e?.damage)), zeige: num, je: (m) => m.damage },
  { titel: 'Damage From Players', wert: (e, s) => (s ? s.damageTakenFromPlayers : pos(e?.damageTaken)), zeige: num, je: (m) => m.damageTaken, rot: true },
  { titel: 'Damage Ratio', wert: (e, s) => { const a = s ? s.damageDealt : pos(e?.damage); const b = s ? s.damageTakenFromPlayers : pos(e?.damageTaken); return a !== null && b ? a / b : null; }, zeige: (v) => v.toFixed(2) },
  { titel: 'K/D Ratio', wert: (e) => (e && e.games ? e.kd : null), zeige: (v) => v.toFixed(2) },
  { titel: 'Health Healed', wert: (_e, s) => (s ? s.healthHealed : null), zeige: num },
  { titel: 'Shield Healed', wert: (_e, s) => (s ? s.shieldHealed : null), zeige: num },
  { titel: 'Player Accuracy', wert: (_e, s) => (s && s.shots ? (s.hitsToPlayers / s.shots) * 100 : null), zeige: pct },
  { titel: 'Headshots', wert: (e, s) => (s ? s.headshots : pos(e?.headshots)), zeige: num, je: (m) => m.headshots },
  { titel: 'Edit Accuracy', wert: () => null, zeige: pct },
  { titel: 'Avg Edit Time', wert: () => null, zeige: (v) => `${Math.round(v)}ms` },
  { titel: 'Mats Farmed', wert: (e, s) => (s ? s.woodFarmed + s.stoneFarmed + s.metalFarmed : pos(e?.matsGefarmt)), zeige: num, je: (m) => (m.holzGefarmt ?? 0) + (m.steinGefarmt ?? 0) + (m.metallGefarmt ?? 0) || undefined },
  { titel: 'Time Alive', wert: (e, s) => (e && e.timeAlive ? e.timeAlive : s ? s.timeAlive : null), zeige: dauer, je: (m) => m.timeAlive },
  { titel: 'Assists', wert: (_e, s) => (s ? s.assists : null), zeige: num },
  { titel: 'Overshield Healed', wert: () => null, zeige: num },
  { titel: 'Hits To Players', wert: (_e, s) => (s ? s.hitsToPlayers : null), zeige: num },
  { titel: 'Shots', wert: (_e, s) => (s ? s.shots : null), zeige: num },
  { titel: 'Overall Accuracy', wert: (_e, s) => (s && s.shots ? (s.hitsToPlayers / s.shots) * 100 : null), zeige: pct },
  { titel: 'Weakpoint Accuracy', wert: (_e, s) => (s && s.hitsToPlayers ? (s.headshots / s.hitsToPlayers) * 100 : null), zeige: pct },
  { titel: 'Players Revived', wert: () => null, zeige: num },
  { titel: 'Got Revived', wert: () => null, zeige: num },
  { titel: 'Players Rebooted', wert: () => null, zeige: num },
  { titel: 'Got Rebooted', wert: () => null, zeige: num },
  { titel: 'Wood Farmed', wert: (e, s) => (s ? s.woodFarmed : pos(e?.matches.reduce((a, m) => a + (m.holzGefarmt ?? 0), 0))), zeige: num, je: (m) => m.holzGefarmt },
  { titel: 'Stone Farmed', wert: (e, s) => (s ? s.stoneFarmed : pos(e?.matches.reduce((a, m) => a + (m.steinGefarmt ?? 0), 0))), zeige: num, je: (m) => m.steinGefarmt },
  { titel: 'Metal Farmed', wert: (e, s) => (s ? s.metalFarmed : pos(e?.matches.reduce((a, m) => a + (m.metallGefarmt ?? 0), 0))), zeige: num, je: (m) => m.metallGefarmt },
  { titel: 'Mats Collected', wert: () => null, zeige: num },
  { titel: 'Wood Collected', wert: () => null, zeige: num },
  { titel: 'Stone Collected', wert: () => null, zeige: num },
  { titel: 'Metal Collected', wert: () => null, zeige: num },
  { titel: 'Time in Storm', wert: (_e, s) => (s ? s.timeInStorm : null), zeige: dauer, rot: true },
  { titel: 'Storm Damage Taken', wert: (_e, s) => (s ? s.stormDamage : null), zeige: num, rot: true },
  { titel: 'Surge Hits', wert: () => null, zeige: num },
  { titel: 'Distance Traveled', wert: (e, s) => (s ? s.distanceOnFoot + s.distanceSkydiving : pos(e?.strecke)), zeige: km, je: (m) => m.strecke },
];

/** Eine Kurve ueber die Spiele - gefuellte Flaeche wie bei Osirion; ohne Werte nur die Grundlinie. */
function Welle({ werte, rot, kumuliert }: { werte: number[]; rot?: boolean; kumuliert: boolean }) {
  const farbe = rot ? '#f87171' : '#38bdf8';
  if (werte.length < 2 || werte.every((v) => !v)) return <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full"><line x1="0" x2="300" y1="25" y2="25" stroke="#3f3f46" strokeWidth="1" /></svg>;
  let reihe = werte;
  if (kumuliert) { let a = 0; reihe = werte.map((v) => (a += v)); }
  const max = Math.max(...reihe, 1); const min = kumuliert ? 0 : Math.min(...reihe, 0);
  const x = (i: number) => (i / (reihe.length - 1)) * 300;
  const y = (v: number) => 24 - ((v - min) / Math.max(1e-9, max - min)) * 22;
  // Geglaettet: eine Kurve durch die Punkte, damit es wie ein Bergzug aussieht und nicht wie eine Zickzacklinie.
  let d = `M${x(0)},${y(reihe[0])}`;
  for (let i = 1; i < reihe.length; i += 1) { const cx = (x(i - 1) + x(i)) / 2; d += ` C${cx},${y(reihe[i - 1])} ${cx},${y(reihe[i])} ${x(i)},${y(reihe[i])}`; }
  return (
    <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full">
      <path d={`${d} L300,25 L0,25 Z`} fill={farbe} fillOpacity={0.22} />
      <path d={d} fill="none" stroke={farbe} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <line x1="0" x2="300" y1="25" y2="25" stroke="#3f3f46" strokeWidth="1" />
    </svg>
  );
}

function vorMinuten(iso: string | null, jetzt: number): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null;
  const m = Math.max(0, Math.round((jetzt - ms) / 60000));
  return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : m < 90 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
}

const TAKT_MS = 5 * 60_000;

export default function SpielerDetail({ eventId, windowId, rueckPfad }: { eventId: string; windowId: string; rueckPfad: string }) {
  const t = useT();
  const zugang = useZugang();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [sucht, setSucht] = useState(false);
  const [wahl, setWahl] = useState<{ id: string; name: string } | null>(null);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [kumuliert, setKumuliert] = useState(false);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [geholt, setGeholt] = useState(0);
  const [eigenerName, setEigenerName] = useState('');
  const rahmen = useRef<HTMLDivElement | null>(null);

  // Draussen klicken schliesst die Liste.
  useEffect(() => {
    const zu = (e: MouseEvent) => { if (rahmen.current && !rahmen.current.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('mousedown', zu);
    return () => document.removeEventListener('mousedown', zu);
  }, []);

  // Der Name des eigenen, verifizierten Kontos - fuer den Eintrag in der Liste.
  useEffect(() => {
    if (!zugang.epicId || !eventId || !windowId) return undefined;
    let weg = false;
    fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&id=${zugang.epicId}`)
      .then((r) => r.json()).then((j: Antwort) => { if (!weg && j?.ok && j.name) setEigenerName(j.name); }).catch(() => { /* ohne Namen bleibt die Kurzform */ });
    return () => { weg = true; };
  }, [zugang.epicId, eventId, windowId]);

  // Die Suche - erst nach einer kurzen Tipppause.
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) { setTreffer(null); return undefined; }
    let weg = false; setSucht(true);
    const uhr = setTimeout(() => {
      fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((j) => { if (!weg) setTreffer(j?.ok ? j.treffer : []); })
        .catch(() => { if (!weg) setTreffer([]); })
        .finally(() => { if (!weg) setSucht(false); });
    }, 350);
    return () => { weg = true; clearTimeout(uhr); setSucht(false); };
  }, [suche, eventId, windowId]);

  const laden = useCallback((id: string, still = false) => {
    if (!still) { setLaedt(true); setDaten(null); }
    setFehler('');
    return fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&id=${id}`)
      .then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setDaten(j); setGeholt(Date.now()); } else setFehler(j?.error ?? 'Epic liefert gerade nichts.'); })
      .catch(() => setFehler('Epic liefert gerade nichts.'))
      .finally(() => setLaedt(false));
  }, [eventId, windowId]);

  useEffect(() => { if (wahl) void laden(wahl.id); }, [wahl, laden]);
  // Erneuern im Takt, solange der Spieler offen ist - Epic zaehlt waehrend eines Cups weiter.
  useEffect(() => {
    if (!wahl) return undefined;
    const uhr = setInterval(() => { void laden(wahl.id, true); }, TAKT_MS);
    return () => clearInterval(uhr);
  }, [wahl, laden]);
  useEffect(() => { const u = setInterval(() => setJetzt(Date.now()), 15_000); return () => clearInterval(u); }, []);
  // Anderer Cup oder Spieltag: die Auswahl faellt weg.
  useEffect(() => { setWahl(null); setDaten(null); setTreffer(null); setSuche(''); }, [eventId, windowId]);

  const e = daten?.eintrag ?? null;
  const spiele = e?.matches ?? [];
  const nr = useMemo(() => spiele.map((_m, i) => i + 1), [spiele]);
  const verifizieren = `/api/auth/epic/authorize?zurueck=${encodeURIComponent(rueckPfad)}`;
  const naechste = geholt ? Math.max(0, Math.ceil((geholt + TAKT_MS - jetzt) / 60000)) : null;
  const letzte = vorMinuten(daten?.aktualisiert ?? null, jetzt);

  const kumPlatz = useMemo(() => { let a = 0; return spiele.map((m) => (a += m.punktePlatz ?? 0)); }, [spiele]);
  const kumElim = useMemo(() => { let a = 0; return spiele.map((m) => (a += m.punkteElim ?? 0)); }, [spiele]);
  const kopfMax = Math.max(1, ...kumPlatz, ...kumElim);
  const kx = (i: number) => (spiele.length > 1 ? (i / (spiele.length - 1)) * 300 : 0);
  const ky = (v: number) => 58 - (v / kopfMax) * 52;
  const linie = (w: number[]) => w.map((v, i) => `${kx(i)},${ky(v)}`).join(' ');

  return (
    <div className="mb-6">
      {/* ------------------------------------------------ Auswahl und Suche */}
      <div className="flex flex-wrap items-start gap-3" ref={rahmen}>
        <div className="relative w-64">
          <button type="button" onClick={() => setOffen((o) => !o)}
            className={`flex w-full items-center justify-between rounded-lg border bg-zinc-900/80 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition ${offen ? 'border-sky-400' : 'border-zinc-700 hover:border-sky-500/60'}`}>
            <span className="truncate">{wahl ? wahl.name : t('Konto auswählen')}</span>
            <span className="ml-2 text-slate-500">▾</span>
          </button>
          {offen && (
            <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
              <p className="bg-sky-600 px-3 py-2 text-sm font-semibold text-white">{t('Konto auswählen')}</p>
              {zugang.epicId ? (
                <button type="button" onClick={() => { setWahl({ id: zugang.epicId, name: eigenerName || zugang.name || zugang.epicId.slice(0, 8) }); setOffen(false); }}
                  className="block w-full px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-sky-500/10">
                  {eigenerName || zugang.name || zugang.epicId.slice(0, 8)}
                </button>
              ) : zugang.nutzer ? (
                <a href={verifizieren} className="flex items-center gap-3 px-3 py-3 transition hover:bg-sky-500/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/epic.svg" alt="" className="h-7 w-7 shrink-0" />
                  <span>
                    <span className="block text-sm font-bold text-slate-100"><T>Epic-Games-Konto verifizieren</T></span>
                    <span className="block text-[11px] text-slate-400"><T>Melde dich mit Epic Games an, um hier deine eigenen Stats zu sehen.</T></span>
                  </span>
                </a>
              ) : (
                <a href={`/sign-in?weiter=${encodeURIComponent(rueckPfad)}`} className="flex items-center gap-3 px-3 py-3 transition hover:bg-sky-500/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/epic.svg" alt="" className="h-7 w-7 shrink-0" />
                  <span>
                    <span className="block text-sm font-bold text-slate-100"><T>Epic-Games-Konto verifizieren</T></span>
                    <span className="block text-[11px] text-slate-400"><T>Melde dich erst bei CompHub an, danach verifizierst du dich mit Epic Games.</T></span>
                  </span>
                </a>
              )}
            </div>
          )}
        </div>

        <div className="relative w-64">
          <input value={suche} onChange={(ev) => setSuche(ev.target.value)} placeholder={t('Spieler suchen …')}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" />
          {suche.trim().length >= 2 && (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
              {sucht && <p className="px-3 py-2 text-xs text-slate-400"><T>Wird durchsucht …</T></p>}
              {!sucht && treffer && treffer.length === 0 && <p className="px-3 py-2 text-xs text-slate-400"><T>Kein Spieler gefunden.</T></p>}
              {(treffer ?? []).map((x) => (
                <button key={`${x.id}-${x.rank}`} type="button" onClick={() => { setWahl({ id: x.id, name: x.name }); setSuche(''); setTreffer(null); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-sky-500/10">
                  <span className="truncate font-semibold text-slate-100">{x.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">#{x.rank} · {x.points} {t('Punkte')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ Der Spieler */}
      {!wahl && <p className="mt-4 text-sm text-slate-500"><T>Wähle ein Konto oder suche einen Spieler, um seine Werte in diesem Cup zu sehen.</T></p>}
      {wahl && laedt && <div className="mt-4"><LadeSchirm /></div>}
      {wahl && fehler && !laedt && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
      {wahl && daten && !laedt && !daten.dabei && (
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3 text-sm text-slate-300">
          <b className="text-slate-100">{daten.name || wahl.name}</b> <T>war in diesem Cup nicht dabei.</T>
        </p>
      )}

      {wahl && daten && !laedt && daten.dabei && e && (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
            <div>
              <p className="text-xl font-black tracking-tight text-slate-50">{daten.name}</p>
              <p className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-black text-slate-50">Rank #{daten.rank}</span>
                {daten.top !== null && <span className="text-[11px] font-semibold text-slate-500">Top {daten.top}%</span>}
              </p>
              <p className="mt-1 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Punkte</T></span>
                <span className="text-xl font-black tabular-nums text-slate-50">{num(e.points)} points</span>
              </p>
              <div className="mt-2 space-y-1 text-[12px]">
                {e.punktePlatz !== undefined && <p className="flex justify-between"><span className="font-semibold text-slate-400">Placement</span><span className="tabular-nums text-slate-300">{num(e.punktePlatz)} points</span></p>}
                {e.punkteElims !== undefined && <p className="flex justify-between"><span className="font-bold text-sky-300">Elimination</span><span className="tabular-nums text-slate-300">{num(e.punkteElims)} points</span></p>}
              </div>
              <p className="mt-3 flex justify-between text-[11px] text-slate-500">
                <span>Last update {letzte ?? '–'}</span>
                <span>Next update in {naechste ?? '–'} {naechste === 1 ? 'minute' : 'minutes'}</span>
              </p>
            </div>
            <div>
              {spiele.length > 1 && (e.punktePlatz !== undefined || e.punkteElims !== undefined) ? (
                <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 px-3 py-2">
                  <svg viewBox="0 0 300 62" preserveAspectRatio="none" className="h-24 w-full">
                    <polyline points={linie(kumPlatz)} fill="none" stroke="#a1a1aa" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
                    <polyline points={linie(kumElim)} fill="none" stroke="#38bdf8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  </svg>
                  <p className="flex justify-between text-[10px] tabular-nums text-slate-600">{nr.map((n) => <span key={n}>{n}</span>)}</p>
                  <p className="mt-0.5 text-center text-[10px] text-slate-600">Match number</p>
                </div>
              ) : <p className="text-[11px] text-slate-600"><T>Der Verlauf der Punkte braucht mindestens zwei gespielte Matches.</T></p>}
            </div>
          </div>

          {/* ------------------------------------------------ Tabelle und Kurven */}
          <div className="mt-4 grid gap-0 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
            <div className="rounded-xl border border-sky-500/60">
              <p className="border-b border-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stat</p>
              <ul>
                {ZEILEN.map((z) => {
                  const w = z.wert(e, daten.szene);
                  return (
                    <li key={z.titel} className="flex h-[34px] items-center justify-between border-b border-white/[0.04] px-4 text-[12px] last:border-b-0">
                      <span className="font-semibold text-slate-300">{z.titel}</span>
                      {w === null
                        ? <span className="text-slate-600" title={t('Zu diesem Wert liefert keine Quelle Zahlen für diesen Cup.')}>–</span>
                        : <span className={`font-bold tabular-nums ${z.rot ? 'text-rose-300' : 'text-slate-50'}`}>{z.zeige(w)}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="min-w-0 px-2 lg:px-4">
              <div className="flex h-[26px] items-center justify-between text-[10px] tabular-nums text-slate-600">
                <span>Match number</span>
                <label className="flex cursor-pointer items-center gap-1.5 text-slate-400"><input type="checkbox" checked={kumuliert} onChange={(ev) => setKumuliert(ev.target.checked)} className="accent-sky-400" /> Cumulative</label>
              </div>
              <div className="flex justify-between px-0.5 text-[10px] tabular-nums text-slate-600">{nr.map((n) => <span key={n}>{n}</span>)}</div>
              <div>
                {ZEILEN.map((z) => (
                  <div key={z.titel} className="flex h-[34px] items-end border-b border-white/[0.03]">
                    <Welle werte={z.je ? spiele.map((m) => z.je?.(m) ?? 0) : []} rot={z.rot} kumuliert={kumuliert} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            {daten.szene
              ? <><T>Schaden, Treffer, Material, Sturm und Strecke stammen aus der Szene-Quelle und gelten je Spieltag zusammen, nicht je Match.</T> </>
              : <><T>Für diesen Cup liefert Epic Platz, Punkte, Eliminierungen und Überlebenszeit je Match; die übrigen Werte gibt es hier nur, wenn eine Quelle sie für diesen Spieltag führt.</T> </>}
            {!soloHinweis(e) && <T>Epic zählt Eliminierungen und Zeit je Team.</T>}
          </p>
        </div>
      )}
    </div>
  );
}

/** Bei einem Solo-Cup hat der Eintrag genau einen Spieler - dort stimmen die Teamwerte mit den Spielerwerten ueberein. */
function soloHinweis(e: Eintrag & { players?: unknown[] }): boolean {
  return !e.players || (e.players as unknown[]).length <= 1;
}
