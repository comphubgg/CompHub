'use client';

/*
 * Replay-Auswertung - jedes Game eines Finales oder LANs aus dem Server-Replay.
 *
 * Der Betreiber (26./28.9.2026): "/admin/replay ... wie eine echte Seite zu
 * jedem Match eine Seite mit Spieler Stats, Team Stats, Zone Stats", und alles
 * fuer immer gespeichert. Die Daten liest der stuendliche Lauf aus Epics
 * Server-Replays (scripts/replay-voll-holen.mjs, tools/replay-voll): die Zonen
 * jedes Games, jede Eliminierung und jeder Knock mit Ort und Zeit, die Spieler
 * mit Team und Platz. Laufwege gibt der Leser bei aktuellen Replays nicht her -
 * deshalb zeigt die Karte Zonen und die Orte der Kaempfe, keine Wege.
 *
 * Die Karte ist Epics aktuelles Kartenbild (fortnite-api.com). Weltkoordinaten
 * laufen von -135000 bis +135000; geprueft an Globals Day 1, Game 6: die Zone
 * mit Radius 20000 liegt hier bei 75,4 % / 24,0 %, im Zonen-Bild des
 * Betreibers bei 75,7 % / 22,5 %.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { fortniteKarte } from '@/lib/bildAdressen';

interface MatchKurz {
  id: string; nr: number; beginn?: string; ende?: number; sieger?: string[]; spieler?: number; zonen?: number;
}
interface Tag { windowId: string; titel: string; region: string; season: string; matches: MatchKurz[] }
interface Spieler {
  id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number;
  kills?: number; teamKills?: number; tod?: number; todX?: number; todY?: number;
}
interface Ereignis { t?: number; opfer?: number; taeter?: number; art: 'auf' | 'unten' | 'tot'; x?: number; y?: number; abstand?: number }
interface Zone { radius?: number; naechsterRadius?: number; x?: number; y?: number; schrumpftAb?: number; schrumpftBis?: number }
interface Match { spieler: Spieler[]; feed: Ereignis[]; zonen: Zone[]; sieger?: number; ende?: number; info?: MatchKurz & { titel?: string } }

const SPANNE = 135_000;
/** Weltkoordinate -> Punkt im 1000er-Bild der Karte. */
const px = (v: number) => ((v + SPANNE) / (2 * SPANNE)) * 1000;
const pr = (r: number) => (r / (2 * SPANNE)) * 1000;
const FARBEN = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa'];
const ohneVorsatz = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '');
const uhr = (s?: number) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');

/** Die Karte mit Kreisen und Punkten - alles in einem SVG ueber dem Bild. */
function Karte({ kreise, punkte, beschriftung }: {
  kreise: Array<{ x: number; y: number; r: number; farbe: string; staerke: number; text?: string }>;
  punkte: Array<{ x: number; y: number; farbe: string; art: 'tot' | 'unten'; titel: string }>;
  beschriftung?: string;
}) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-sky-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fortniteKarte(false)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full">
        {kreise.map((k, i) => (
          <g key={i}>
            <circle cx={px(k.x)} cy={px(k.y)} r={pr(k.r)} fill={k.farbe} fillOpacity={0.12 * k.staerke}
              stroke={k.farbe} strokeOpacity={Math.min(1, 0.35 + 0.5 * k.staerke)} strokeWidth={2.5} />
            {k.text && (
              <text x={px(k.x)} y={px(k.y)} textAnchor="middle" dominantBaseline="middle" fontSize={26}
                fontWeight={800} fill="#fff" stroke="#000" strokeWidth={4} paintOrder="stroke">{k.text}</text>
            )}
          </g>
        ))}
        {punkte.map((p, i) => (
          p.art === 'tot'
            ? <g key={i}><title>{p.titel}</title>
              <path d={`M${px(p.x) - 7},${px(p.y) - 7} L${px(p.x) + 7},${px(p.y) + 7} M${px(p.x) + 7},${px(p.y) - 7} L${px(p.x) - 7},${px(p.y) + 7}`}
                stroke="#000" strokeWidth={6} /><path d={`M${px(p.x) - 7},${px(p.y) - 7} L${px(p.x) + 7},${px(p.y) + 7} M${px(p.x) + 7},${px(p.y) - 7} L${px(p.x) - 7},${px(p.y) + 7}`}
                stroke={p.farbe} strokeWidth={3} /></g>
            : <circle key={i} cx={px(p.x)} cy={px(p.y)} r={5} fill={p.farbe} stroke="#000" strokeWidth={2}><title>{p.titel}</title></circle>
        ))}
      </svg>
      {beschriftung && (
        <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-slate-100">
          {beschriftung}
        </span>
      )}
    </div>
  );
}

export default function ReplaySeite() {
  const t = useT();
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [tage, setTage] = useState<Tag[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [tagWahl, setTagWahl] = useState<string | null>(null);
  const [matchWahl, setMatchWahl] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [tagMatches, setTagMatches] = useState<Record<string, Match>>({});
  const [phase, setPhase] = useState<number>(20000);
  const [mitKnocks, setMitKnocks] = useState(true);

  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json()).then((j) => setErlaubt(j?.isAdmin === true)).catch(() => setErlaubt(false));
    fetch('/api/replay').then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!r.ok) { setFehler(j?.error ?? `HTTP ${r.status}`); setTage([]); return; }
      setTage(j.tage ?? []);
      if (j.tage?.[0]) setTagWahl(j.tage[0].windowId);
    }).catch(() => { setFehler(t('Keine Verbindung zum Server.')); setTage([]); });
  }, [t]);

  const tag = tage?.find((x) => x.windowId === tagWahl) ?? null;

  // Fuer die Zonen-Uebersicht eines Tages alle seine Games laden.
  useEffect(() => {
    if (!tag) return undefined;
    let weg = false;
    void Promise.all(tag.matches.map(async (m) => {
      if (tagMatches[m.id]) return;
      try {
        const j = await (await fetch(`/api/replay?match=${m.id}`)).json();
        if (!weg && j?.zonen) setTagMatches((v) => ({ ...v, [m.id]: j }));
      } catch { /* dann fehlt dieses Game in der Uebersicht */ }
    }));
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagWahl]);

  useEffect(() => {
    if (!matchWahl) { void Promise.resolve().then(() => setMatch(null)); return undefined; }
    let weg = false;
    const da = tagMatches[matchWahl];
    if (da) { void Promise.resolve().then(() => setMatch(da)); return undefined; }
    fetch(`/api/replay?match=${matchWahl}`).then((r) => r.json()).then((j) => { if (!weg && j?.zonen) setMatch(j); }).catch(() => {});
    return () => { weg = true; };
  }, [matchWahl, tagMatches]);

  // Die Zonen-Stufen, die es an diesem Tag gibt (nach Radius).
  const stufen = useMemo(() => {
    const r = new Set<number>();
    for (const m of Object.values(tagMatches)) for (const z of m.zonen ?? []) if (z.naechsterRadius) r.add(Math.round(z.naechsterRadius));
    return [...r].sort((a, b) => b - a);
  }, [tagMatches]);

  // ---- Auswertung eines Games ------------------------------------------
  const teams = useMemo(() => {
    if (!match) return [];
    const nachId = new Map(match.spieler.map((s) => [s.id, s]));
    const je = new Map<number, { team: number; spieler: Spieler[]; platz: number | null; elims: number; knocks: number; ende: number | null }>();
    for (const s of match.spieler) {
      if (s.bot || s.team === undefined) continue;
      const e = je.get(s.team) ?? { team: s.team, spieler: [], platz: null, elims: 0, knocks: 0, ende: null };
      e.spieler.push(s);
      if (typeof s.platz === 'number' && (e.platz === null || s.platz < e.platz)) e.platz = s.platz;
      if (typeof s.tod === 'number') e.ende = Math.max(e.ende ?? 0, s.tod);
      je.set(s.team, e);
    }
    for (const k of match.feed) {
      const taeter = nachId.get(k.taeter ?? -1); const opfer = nachId.get(k.opfer ?? -1);
      if (!taeter || !opfer || taeter.bot || opfer.bot || taeter.team === opfer.team) continue;
      const e = je.get(taeter.team ?? -1);
      if (!e) continue;
      if (k.art === 'tot') e.elims += 1; else if (k.art === 'unten') e.knocks += 1;
    }
    return [...je.values()].sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999));
  }, [match]);

  const farbeVonTeam = useMemo(() => {
    const m = new Map<number, string>();
    teams.forEach((x, i) => m.set(x.team, i < 8 ? FARBEN[i] : '#94a3b8'));
    return m;
  }, [teams]);

  if (erlaubt === false) {
    return <main className="min-h-screen bg-zinc-950 px-4 py-16 text-center text-sm text-slate-500"><T>Dieser Bereich ist dem Adminkonto vorbehalten.</T></main>;
  }

  const nachId = new Map((match?.spieler ?? []).map((s) => [s.id, s]));

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-wrap items-baseline gap-4">
          <h1 className="text-3xl font-black tracking-tight"><T>Replay-Auswertung</T></h1>
          <Link href="/admin" className="text-sm text-slate-500 transition hover:text-sky-400">← <T>Dashboard</T></Link>
          <p className="w-full max-w-3xl text-sm text-slate-400">
            <T>Jedes Game der Finals und LANs aus Epics Server-Replays: die Zonen, jede Elim und jeder Knock mit Ort und Zeit, die Teams. Der Server liest neue Games stündlich aus und bewahrt sie auf, auch wenn Epic das Replay nach 31 Tagen löscht.</T>
          </p>
        </div>

        {fehler && <p className="mb-4 rounded-xl border border-rose-700/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{fehler}</p>}
        {tage && !tage.length && !fehler && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-slate-400">
            <T>Noch keine Games ausgewertet. Der stündliche Lauf liest die Replays der Finals und LANs der letzten 31 Tage nach und nach aus.</T>
          </p>
        )}

        {tage && tage.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            {/* Die Spieltage, darunter die Games des gewaehlten. */}
            <aside className="space-y-2">
              {tage.map((x) => (
                <div key={x.windowId} className={`rounded-xl border ${x.windowId === tagWahl ? 'border-sky-500/70 bg-sky-500/10' : 'border-zinc-800 bg-zinc-900/40'}`}>
                  <button onClick={() => { setTagWahl(x.windowId); setMatchWahl(null); }} className="w-full px-4 py-3 text-left">
                    <span className="block text-sm font-bold text-slate-100">{x.titel}</span>
                    <span className="text-xs text-slate-500">{x.region} · {x.matches.length} Games · {x.matches[0]?.beginn ? new Date(x.matches[0].beginn).toLocaleDateString() : ''}</span>
                  </button>
                  {x.windowId === tagWahl && (
                    <div className="space-y-1 px-2 pb-2">
                      <button onClick={() => setMatchWahl(null)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${!matchWahl ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:bg-zinc-900'}`}>
                        <T>Zonen aller Games</T>
                      </button>
                      {x.matches.map((m) => (
                        <button key={m.id} onClick={() => setMatchWahl(m.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${matchWahl === m.id ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-zinc-900'}`}>
                          <b>Game {m.nr}</b>
                          <span className="block truncate text-xs text-slate-500">🏆 {(m.sieger ?? []).map(ohneVorsatz).join(' + ') || '–'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </aside>

            <section className="min-w-0 space-y-5">
              {/* ---- Zonen eines ganzen Tages ---- */}
              {tag && !matchWahl && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><T>Zone mit Radius</T></span>
                    {stufen.map((r) => (
                      <button key={r} onClick={() => setPhase(r)}
                        className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${phase === r ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-800 text-slate-400 hover:text-slate-200'}`}>
                        {(r / 100).toLocaleString()} m
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                    <Karte beschriftung={`${tag.titel} · Zones`}
                      kreise={tag.matches.flatMap((m, i) => {
                        const z = (tagMatches[m.id]?.zonen ?? []).find((x) => Math.round(x.naechsterRadius ?? 0) === phase);
                        return z && typeof z.x === 'number' && typeof z.y === 'number'
                          ? [{ x: z.x, y: z.y, r: phase, farbe: FARBEN[i % FARBEN.length], staerke: 1, text: `GAME ${m.nr}` }] : [];
                      })}
                      punkte={[]} />
                    <div className="space-y-2">
                      {tag.matches.map((m, i) => (
                        <button key={m.id} onClick={() => setMatchWahl(m.id)}
                          className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-left transition hover:border-sky-500/60">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: FARBEN[i % FARBEN.length] }} />
                          <span className="min-w-0 flex-1">
                            <b className="text-sm">Game {m.nr}</b>
                            <span className="block truncate text-xs text-slate-500">🏆 {(m.sieger ?? []).map(ohneVorsatz).join(' + ') || '–'}</span>
                          </span>
                          {!tagMatches[m.id] && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ---- Ein Game ---- */}
              {matchWahl && !match && <div className="aspect-video animate-pulse rounded-2xl bg-zinc-900/60" />}
              {matchWahl && match && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-black">Game {tag?.matches.find((m) => m.id === matchWahl)?.nr}</h2>
                    <span className="text-sm text-slate-400">{tag?.titel}</span>
                    <label className="ml-auto flex items-center gap-2 text-sm text-slate-400">
                      <input type="checkbox" checked={mitKnocks} onChange={(e) => setMitKnocks(e.target.checked)} className="accent-sky-500" />
                      <T>Knocks zeigen</T>
                    </label>
                  </div>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
                    <div>
                      <Karte
                        kreise={match.zonen.filter((z) => typeof z.x === 'number' && z.naechsterRadius).map((z, i, alle) => ({
                          x: z.x!, y: z.y!, r: z.naechsterRadius!, farbe: '#ffffff', staerke: (i + 1) / alle.length,
                        }))}
                        punkte={match.feed.filter((k) => k.art !== 'auf' && typeof k.x === 'number' && (mitKnocks || k.art === 'tot')).map((k) => {
                          const taeter = nachId.get(k.taeter ?? -1); const opfer = nachId.get(k.opfer ?? -1);
                          return {
                            x: k.x!, y: k.y!, art: k.art as 'tot' | 'unten',
                            farbe: farbeVonTeam.get(taeter?.team ?? -1) ?? '#e2e8f0',
                            titel: `${uhr(k.t)} · ${ohneVorsatz(taeter?.name)} ${k.art === 'tot' ? '✖' : '↓'} ${ohneVorsatz(opfer?.name)}${k.abstand ? ` · ${Math.round(k.abstand / 100)} m` : ''}`,
                          };
                        })} />
                      <p className="mt-2 text-xs text-slate-500">
                        <T>Weiße Ringe: die Zonen des Games, je später desto kräftiger. ✖ Elim, ● Knock - in der Farbe des Teams, das ihn geholt hat (Top 8 farbig). Zeigen mit der Maus nennt Zeit, Täter, Opfer und Abstand.</T>
                      </p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
                      <p className="border-b border-zinc-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><T>Teams</T></p>
                      <div className="max-h-[36rem] overflow-y-auto">
                        {teams.map((x) => (
                          <div key={x.team} className="flex items-center gap-3 border-b border-zinc-900 px-4 py-2 text-sm last:border-0">
                            <span className="w-7 text-right font-bold tabular-nums text-slate-400">#{x.platz ?? '–'}</span>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: farbeVonTeam.get(x.team) }} />
                            <span className="min-w-0 flex-1 truncate text-slate-200">{x.spieler.map((s) => ohneVorsatz(s.name)).join(' + ')}</span>
                            <span className="shrink-0 text-xs tabular-nums text-slate-400" title={t('Elims / Knocks')}>{x.elims} / {x.knocks}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
                    <p className="border-b border-zinc-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><T>Kill-Feed</T></p>
                    <div className="max-h-[28rem] overflow-y-auto">
                      {match.feed.filter((k) => k.art !== 'auf').map((k, i) => {
                        const taeter = nachId.get(k.taeter ?? -1); const opfer = nachId.get(k.opfer ?? -1);
                        if (opfer?.bot) return null;
                        return (
                          <div key={i} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 border-b border-zinc-900 px-4 py-1.5 text-sm last:border-0">
                            <span className="tabular-nums text-slate-500">{uhr(k.t)}</span>
                            <span className="truncate">
                              <b style={{ color: farbeVonTeam.get(taeter?.team ?? -1) ?? '#e2e8f0' }}>{taeter?.bot ? 'AI' : ohneVorsatz(taeter?.name)}</b>
                              <span className="mx-2 text-slate-500">{k.art === 'tot' ? '✖' : '↓'}</span>
                              <span className="text-slate-300">{ohneVorsatz(opfer?.name)}</span>
                            </span>
                            <span className="text-xs tabular-nums text-slate-500">{k.abstand ? `${Math.round(k.abstand / 100)} m` : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
