'use client';

/*
 * Knoepfe im Team-Panel neben dem Leaderboard (Betreiber, 7.11.2026): Spielverlauf und Vergleich als Fenster mitten im Bildschirm.
 * Alles gilt nur fuer den gewaehlten Cup. Die Match-ID steht nicht da, sie laesst sich je Runde kopieren.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';

export interface AktionMatch { sessionId?: string; placement?: number; elims?: number; timeAlive?: number; endTime?: string }
export interface AktionTeam {
  rank: number; points: number; elims: number; games: number; wins: number;
  avgPlace: number; avgPoints: number; avgElims: number; kd: number;
  bestPlace: number | null; timeAlive: number;
  players: Array<{ id?: string }>; matches: AktionMatch[]; matchesWeg?: boolean;
}
function zeit(sek: number) {
  const m = Math.floor(sek / 60);
  return `${m}:${String(Math.round(sek % 60)).padStart(2, '0')}`;
}
const nachZeit = (l: AktionMatch[]) => l.map((m, k) => ({ m, k }))
  .sort((a, b) => String(a.m.endTime ?? '').localeCompare(String(b.m.endTime ?? '')) || a.k - b.k).map((x) => x.m);

function Fenster({ titel, unter, zu, breit, children }: { titel: ReactNode; unter?: ReactNode; zu: () => void; breit?: boolean; children: ReactNode }) {
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [zu]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={zu}>
      <div role="dialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}
        className={`flex max-h-[85vh] w-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl ${breit ? 'max-w-3xl' : 'max-w-2xl'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-5">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-100">{titel}</h3>
            {unter && <p className="mt-0.5 truncate text-sm text-slate-400">{unter}</p>}
          </div>
          <button type="button" onClick={zu} aria-label="Close" className="text-lg text-slate-500 transition hover:text-slate-200">✕</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function KopierKnopf({ wert }: { wert: string }) {
  const t = useT();
  const [fertig, setFertig] = useState(false);
  return (
    <button type="button"
      onClick={() => { void navigator.clipboard.writeText(wert).then(() => { setFertig(true); setTimeout(() => setFertig(false), 1500); }); }}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${fertig ? 'border-emerald-500/60 text-emerald-300' : 'border-zinc-700 text-slate-300 hover:border-sky-500 hover:text-sky-300'}`}>
      {fertig ? t('Kopiert') : t('Match-ID kopieren')}
    </button>
  );
}

/** Der Spielverlauf eines Teams in diesem Cup: je Runde Platz, Elims, Zeit und die Match-ID zum Kopieren. */
export function MatchHistoryFenster({ team, name, spiele, laedt, zu }: { team: AktionTeam; name: string; spiele: AktionMatch[]; laedt: boolean; zu: () => void }) {
  const { sprache } = useSprache();
  const ort = sprache === 'en' ? 'en-GB' : 'de-DE';
  const liste = nachZeit(spiele);
  return (
    <Fenster titel={<T>Spielverlauf</T>} unter={<>#{team.rank} · {name}</>} zu={zu}>
      {laedt ? <p className="py-6 text-center text-sm text-slate-500"><T>Wird geladen …</T></p>
        : !liste.length ? <p className="py-6 text-center text-sm text-slate-500"><T>Keine Matchdaten.</T></p> : (
          <div className="space-y-2">
            {liste.map((m, i) => (
              <div key={m.sessionId ?? i}
                className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3 ${m.placement === 1 ? 'bg-amber-950/40' : 'bg-zinc-800/50'}`}>
                <div className="w-24">
                  <div className="text-xs text-slate-500"><T>Spiel</T> {i + 1}</div>
                  <div className={`text-lg font-bold tabular-nums ${m.placement === 1 ? 'text-amber-300' : 'text-slate-100'}`}>{m.placement ? `#${m.placement}` : '–'}</div>
                </div>
                <div className="w-16">
                  <div className="text-xs text-slate-500">Elims</div>
                  <div className="text-lg font-bold tabular-nums text-slate-100">{m.elims ?? 0}</div>
                </div>
                <div className="w-16">
                  <div className="text-xs text-slate-500"><T>Zeit</T></div>
                  <div className="text-lg font-bold tabular-nums text-slate-100">{zeit(m.timeAlive ?? 0)}</div>
                </div>
                <div className="min-w-0 flex-1 text-sm tabular-nums text-slate-500">
                  {m.endTime && Number.isFinite(Date.parse(m.endTime)) ? new Date(m.endTime).toLocaleTimeString(ort, { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
                {m.sessionId && <KopierKnopf wert={m.sessionId} />}
              </div>
            ))}
          </div>
        )}
    </Fenster>
  );
}

const REIHEN: Array<{ titel: string; wert: (e: AktionTeam) => number | null; weniger?: boolean; text?: (v: number, ort: string) => string }> = [
  { titel: 'Platz', wert: (e) => e.rank, weniger: true, text: (v) => `#${v}` },
  { titel: 'Punkte', wert: (e) => e.points },
  { titel: 'Spiele', wert: (e) => e.games },
  { titel: 'Siege', wert: (e) => e.wins },
  { titel: 'Bester Platz', wert: (e) => e.bestPlace, weniger: true, text: (v) => `#${v}` },
  { titel: 'Ø Platz', wert: (e) => e.avgPlace, weniger: true, text: (v, o) => v.toLocaleString(o, { maximumFractionDigits: 2 }) },
  { titel: 'Ø Punkte', wert: (e) => e.avgPoints, text: (v, o) => v.toLocaleString(o, { maximumFractionDigits: 2 }) },
  { titel: 'Elims', wert: (e) => e.elims },
  { titel: 'Ø Elims', wert: (e) => e.avgElims, text: (v, o) => v.toLocaleString(o, { maximumFractionDigits: 2 }) },
  { titel: 'K/D', wert: (e) => e.kd, text: (v, o) => v.toLocaleString(o, { maximumFractionDigits: 2 }) },
  { titel: 'Ø Überlebenszeit', wert: (e) => (e.games ? e.timeAlive / e.games : null), text: (v) => zeit(v) },
];

/** Zwei Teams dieses Cups nebeneinander. Das Gegenueber wird mit dem Namen gesucht. */
export function VergleichFenster({ team, alle, nameVon, spieleVon, zu }: {
  team: AktionTeam; alle: AktionTeam[]; nameVon: (e: AktionTeam) => string; spieleVon: (e: AktionTeam) => Promise<AktionMatch[]>; zu: () => void;
}) {
  const t = useT();
  const { sprache } = useSprache();
  const ort = sprache === 'en' ? 'en-GB' : 'de-DE';
  const [suche, setSuche] = useState('');
  const [gegner, setGegner] = useState<AktionTeam | null>(null);
  const [runden, setRunden] = useState<[AktionMatch[], AktionMatch[]] | null>(null);
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    const andere = alle.filter((e) => e.rank !== team.rank);
    if (!s) return andere.filter((e) => Math.abs(e.rank - team.rank) <= 3).slice(0, 6);
    return andere.filter((e) => nameVon(e).toLowerCase().includes(s)).slice(0, 8);
  }, [suche, alle, team, nameVon]);
  useEffect(() => {
    if (!gegner) return undefined;
    let weg = false;
    setRunden(null);
    void Promise.all([spieleVon(team), spieleVon(gegner)]).then(([a, b]) => { if (!weg) setRunden([nachZeit(a), nachZeit(b)]); });
    return () => { weg = true; };
  }, [gegner, team, spieleVon]);
  return (
    <Fenster breit titel={<T>Vergleichen</T>} unter={<>#{team.rank} · {nameVon(team)}</>} zu={zu}>
      {!gegner ? (
        <>
          <input autoFocus value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
          <div className="mt-3 space-y-1.5">
            {treffer.map((e) => (
              <button key={e.rank} type="button" onClick={() => setGegner(e)}
                className="flex w-full items-center gap-3 rounded-xl bg-zinc-800/50 px-4 py-3 text-left transition hover:bg-zinc-800">
                <span className="w-12 shrink-0 font-bold tabular-nums text-sky-400">#{e.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{nameVon(e)}</span>
                <span className="shrink-0 text-sm tabular-nums text-slate-400">{e.points.toLocaleString(ort)} <T>Punkte</T></span>
              </button>
            ))}
            {!treffer.length && <p className="py-4 text-center text-sm text-slate-500"><T>Niemanden gefunden.</T></p>}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="min-w-0 truncate text-right font-bold text-sky-400">{nameVon(team)}</div>
            <button type="button" onClick={() => { setGegner(null); setRunden(null); }}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500"><T>Wechseln</T></button>
            <div className="min-w-0 truncate font-bold text-sky-400">{nameVon(gegner)}</div>
          </div>
          <div className="divide-y divide-zinc-800">
            {REIHEN.map((r) => {
              const a = r.wert(team); const b = r.wert(gegner);
              const besser = a === null || b === null || a === b ? 0 : (a > b) !== !!r.weniger ? 1 : 2;
              const zeige = (v: number | null) => (v === null ? '–' : r.text ? r.text(v, ort) : v.toLocaleString(ort));
              return (
                <div key={r.titel} className="grid grid-cols-[1fr_9rem_1fr] items-center gap-3 py-2">
                  <div className={`text-right text-base tabular-nums ${besser === 1 ? 'font-bold text-sky-300' : 'text-slate-300'}`}>{zeige(a)}</div>
                  <div className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500"><T>{r.titel}</T></div>
                  <div className={`text-base tabular-nums ${besser === 2 ? 'font-bold text-sky-300' : 'text-slate-300'}`}>{zeige(b)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 border-t border-zinc-800 pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><T>Spielverlauf</T></div>
            {!runden ? <p className="text-sm text-slate-500"><T>Wird geladen …</T></p> : (
              <div className="space-y-1">
                {Array.from({ length: Math.max(runden[0].length, runden[1].length) }, (_, i) => {
                  const zelle = (m?: AktionMatch) => (m ? `#${m.placement ?? '–'} · ${m.elims ?? 0} Elims` : '–');
                  return (
                    <div key={i} className="grid grid-cols-[1fr_9rem_1fr] items-center gap-3 rounded-lg bg-zinc-800/40 py-1.5 text-sm">
                      <div className="text-right tabular-nums text-slate-200">{zelle(runden[0][i])}</div>
                      <div className="text-center text-xs text-slate-500"><T>Spiel</T> {i + 1}</div>
                      <div className="tabular-nums text-slate-200">{zelle(runden[1][i])}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Fenster>
  );
}
