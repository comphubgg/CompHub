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
 * Die Karte ist die Insel des Spieltags (lib/zonenKarte: die grosse Karte der
 * Saison oder die Reload-Insel aus der Playlist), mit dem an echten Replays
 * gemessenen Weltausschnitt (Truhen auf Land und auf den Gebaeuden). Die alte
 * feste Spanne -135.000..+135.000 lag rund 10 % zu eng (16.11.2026).
 */

import { useEffect, useMemo, useState } from 'react';
import T from '../port/app/components/T';
import { Laedt, NurAdmins } from '../teile';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { useT } from '../port/app/components/SprachProvider';
import { zonenKarte, rahmenUmZonen, type Rahmen, type ZonenKarte } from '../port/lib/zonenKarte';
import { inselAusschnitt, GANZES_BILD } from '../port/lib/inselAusschnitt';
import ZonenBild from './ZonenBild';
import { zonenGruppe } from '../port/lib/zonenTeile';

interface MatchKurz {
  id: string; nr: number; beginn?: string; ende?: number; sieger?: string[]; spieler?: number; zonen?: number;
}
interface Tag { windowId: string; eventId?: string; titel: string; region: string; season: string; matches: MatchKurz[] }
interface Spieler {
  id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number;
  kills?: number; teamKills?: number; tod?: number; todX?: number; todY?: number;
}
interface Ereignis { t?: number; opfer?: number; taeter?: number; art: 'auf' | 'unten' | 'tot'; x?: number; y?: number; abstand?: number }
interface Zone { radius?: number; naechsterRadius?: number; x?: number; y?: number; schrumpftAb?: number; schrumpftBis?: number }
interface Match { spieler: Spieler[]; feed: Ereignis[]; zonen: Zone[]; sieger?: number; ende?: number; playlist?: string; info?: MatchKurz & { titel?: string } }

const FARBEN = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa'];
const ohneVorsatz = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '');
const uhr = (s?: number) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–');

/** Die Karte mit Kreisen und Punkten - alles in einem SVG ueber dem Bild. */
function Karte({ karte, kreise, punkte, beschriftung }: {
  /** Bild und Weltausschnitt der Insel (lib/zonenKarte). */
  karte: ZonenKarte;
  kreise: Array<{ x: number; y: number; r: number; farbe: string; staerke: number; text?: string }>;
  punkte: Array<{ x: number; y: number; farbe: string; art: 'tot' | 'unten'; titel: string }>;
  beschriftung?: string;
}) {
  // Ohne geeichtes Bild (Reload-Insel, die noch nicht gemessen ist): keine Karte, der Ausschnitt um Zonen und Kaempfe.
  const rahmen: Rahmen = karte.bild ? karte.rahmen
    : rahmenUmZonen([...kreise, ...punkte.map((p) => ({ x: p.x, y: p.y, r: 0 }))]);
  /** Weltkoordinate -> Punkt im 1000er-Bild der Karte. */
  const px = (v: number) => ((v - rahmen.x0) / rahmen.spanne) * 1000;
  const py = (v: number) => ((v - rahmen.y0) / rahmen.spanne) * 1000;
  const pr = (r: number) => (r / rahmen.spanne) * 1000;
  // Bild und Kreise liegen in derselben Ebene: sie wird so vergroessert, dass die Insel den Rahmen fuellt (Betreiber, 6.11.2026: "zu viel blauer Rand").
  const [gemessen, setInsel] = useState(GANZES_BILD);
  const insel = karte.bild ? gemessen : GANZES_BILD;
  const faktor = 1 / insel.seite;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-sky-950">
      <div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${faktor}) translate(${-insel.x * 100}%, ${-insel.y * 100}%)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {karte.bild && <img src={karte.bild} alt="" crossOrigin="anonymous" onLoad={(e) => setInsel(inselAusschnitt(e.currentTarget))} className="absolute inset-0 h-full w-full object-cover" />}
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full">
        {kreise.map((k, i) => (
          <g key={i}>
            <circle cx={px(k.x)} cy={py(k.y)} r={pr(k.r)} fill={k.farbe} fillOpacity={0.12 * k.staerke}
              stroke={k.farbe} strokeOpacity={Math.min(1, 0.35 + 0.5 * k.staerke)} strokeWidth={2.5} />
            {k.text && (
              <text x={px(k.x)} y={py(k.y)} textAnchor="middle" dominantBaseline="middle" fontSize={26}
                fontWeight={800} fill="#fff" stroke="#000" strokeWidth={4} paintOrder="stroke">{k.text}</text>
            )}
          </g>
        ))}
        {punkte.map((p, i) => (
          p.art === 'tot'
            ? <g key={i}><title>{p.titel}</title>
              <path d={`M${px(p.x) - 7},${py(p.y) - 7} L${px(p.x) + 7},${py(p.y) + 7} M${px(p.x) + 7},${py(p.y) - 7} L${px(p.x) - 7},${py(p.y) + 7}`}
                stroke="#000" strokeWidth={6} /><path d={`M${px(p.x) - 7},${py(p.y) - 7} L${px(p.x) + 7},${py(p.y) + 7} M${px(p.x) + 7},${py(p.y) - 7} L${px(p.x) - 7},${py(p.y) + 7}`}
                stroke={p.farbe} strokeWidth={3} /></g>
            : <circle key={i} cx={px(p.x)} cy={py(p.y)} r={5} fill={p.farbe} stroke="#000" strokeWidth={2}><title>{p.titel}</title></circle>
        ))}
      </svg>
      </div>
      {beschriftung && (
        <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-white">
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
  /*
   * Nur die wichtigen Cups, mit Suche (Betreiber, 19.10.2026: "Zonen und Auswertungen nur fuer die wichtigen Cups - Division, Performance, Finals, FNCS -, mit einer Suche,
   * nicht fuer den Reload Duo Cash Cup"). Der Schalter hebt die Auswahl auf.
   */
  const [nurWichtige, setNurWichtige] = useState(true);
  // Die Games eines Cups in einem Fenster (Betreiber, 5.11.2026): bei 532 Games musste man sonst ganz nach unten scrollen, um einen anderen Cup zu finden.
  const [gamesOffen, setGamesOffen] = useState(false);
  const [cupSuche, setCupSuche] = useState('');
  const [matchWahl, setMatchWahl] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [tagMatches, setTagMatches] = useState<Record<string, Match>>({});
  const [phase, setPhase] = useState<number>(20000);
  const [mitKnocks, setMitKnocks] = useState(true);
  /** Die Cups, deren Zonen-Uebersicht VIPs sehen duerfen (Betreiber, 19.10.2026: "jeweils freischalten fuer die VIPs"). */
  const [frei, setFrei] = useState<string[]>([]);
  const [freiMeldung, setFreiMeldung] = useState('');

  const freigabeSetzen = async (eventId: string, an: boolean) => {
    setFreiMeldung('');
    try {
      const r = await fetch('/api/replay-zonen-frei', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, frei: an }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(j?.frei)) { setFreiMeldung(j?.error ?? t('No connection to the server.')); return; }
      setFrei(j.frei);
    } catch { setFreiMeldung(t('No connection to the server.')); }
  };

  useEffect(() => {
    fetch('/api/replay-zonen-frei').then((r) => r.json()).then((j) => { if (Array.isArray(j?.frei)) setFrei(j.frei); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json()).then((j) => setErlaubt(j?.isAdmin === true)).catch(() => setErlaubt(false));
    fetch('/api/replay').then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!r.ok) { setFehler(j?.error ?? `HTTP ${r.status}`); setTage([]); return; }
      setTage(j.tage ?? []);
      if (j.tage?.[0]) setTagWahl(j.tage[0].windowId);
    }).catch(() => { setFehler(t('No connection to the server.')); setTage([]); });
  }, [t]);

  const sichtbareTage = useMemo(() => {
    const q = cupSuche.trim().toLowerCase();
    return (tage ?? []).filter((x) => {
      if (nurWichtige && !(/fncs|division|performance|grand|global|championship/i.test(x.titel) || (/finals?/i.test(x.titel) && !/reload|cash|ranked|victory/i.test(x.titel)))) return false;
      return !q || `${x.titel} ${x.region}`.toLowerCase().includes(q);
    });
  }, [tage, nurWichtige, cupSuche]);
  const tag = tage?.find((x) => x.windowId === tagWahl) ?? null;
  // Die Teile derselben Stufe, der Reihe nach - fuer das Zonen-Bild (Heat 1 + Heat 2, Day 1 + Day 2 einer Runde; getrennte Cups mit
  // gleicher eventId wie Performance Evaluation Event1Round2/Event2Round2 nicht - lib/zonenTeile).
  const turnierTage = useMemo(() => (tag && tage ? zonenGruppe(tage, tag) : []), [tag, tage]);

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
    return <NurAdmins />;
  }

  const nachId = new Map((match?.spieler ?? []).map((s) => [s.id, s]));
  // Die Insel des Spieltags: aus der Playlist des ersten geladenen Games und der Saison der Kennung (lib/zonenKarte).
  const tagKarte = zonenKarte(tag?.matches.map((m) => tagMatches[m.id]?.playlist).find(Boolean), tag?.windowId ?? '');

  return (
    <main className="text-white">
      <div className="">
        <SeitenKopf className="mb-6" marke={<T>Replays</T>} titel={<T>Replay analysis</T>}
          text={<T>Every game of the finals and LANs from Epic's server replays: the zones, every elim and every knock with place and time, the teams. The server reads new games every hour and keeps them, even after Epic deletes the replay after 31 days.</T>} />

        {fehler && <p className="mb-4 rounded-xl border border-rose-700/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{fehler}</p>}
        {tage && !tage.length && !fehler && (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/55">
            <T>No games analysed yet. The hourly run reads the replays of the finals and LANs of the last 31 days bit by bit.</T>
          </p>
        )}

        {tage && tage.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            {/* Die Spieltage, darunter die Games des gewaehlten. */}
            <aside className="space-y-2">
              <input value={cupSuche} onChange={(e) => setCupSuche(e.target.value)} spellCheck={false}
                placeholder={t('Search cup …')}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-500" />
              <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-white/55">
                <input type="checkbox" checked={nurWichtige} onChange={(e) => setNurWichtige(e.target.checked)} className="accent-sky-500" />
                <T>only Division, Performance, Finals and FNCS</T>
              </label>
              {sichtbareTage.length === 0 && (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-xs text-white/40"><T>Nothing found.</T></p>
              )}
              {sichtbareTage.map((x) => (
                <div key={x.windowId} className={`rounded-xl border ${x.windowId === tagWahl ? 'border-sky-500/70 bg-sky-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <button onClick={() => { setTagWahl(x.windowId); setMatchWahl(null); setGamesOffen(true); }} className="w-full px-4 py-3 text-left">
                    <span className="block text-sm font-bold text-white">{x.titel}</span>
                    <span className="text-xs text-white/40">{x.region} · {x.matches.length} Games · {x.matches[0]?.beginn ? new Date(x.matches[0].beginn).toLocaleDateString() : ''}</span>
                  </button>
                  {x.windowId === tagWahl && gamesOffen && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => setGamesOffen(false)}>
                    <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-white/15 bg-white/[0.035] backdrop-blur-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-white">{x.titel}</p>
                          <p className="text-xs text-white/40">{x.region} · {x.matches.length} Games</p>
                        </div>
                        <button onClick={() => setGamesOffen(false)} className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/70 transition hover:border-sky-500 hover:text-sky-300"><T>Schließen</T></button>
                      </div>
                    <div className="grid gap-1 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
                      <button onClick={() => { setMatchWahl(null); setGamesOffen(false); }}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${!matchWahl ? 'bg-sky-500/20 text-sky-300' : 'text-white/55 hover:bg-white/[0.06]'}`}>
                        <T>Zones of all games</T>
                      </button>
                      {x.matches.map((m) => (
                        <button key={m.id} onClick={() => { setMatchWahl(m.id); setGamesOffen(false); }}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${matchWahl === m.id ? 'bg-sky-500/20 text-sky-300' : 'text-white/70 hover:bg-white/[0.06]'}`}>
                          <b>Game {m.nr}</b>
                          <span className="block truncate text-xs text-white/40">🏆 {(m.sieger ?? []).map(ohneVorsatz).join(' + ') || '–'}</span>
                        </button>
                      ))}
                    </div>
                    </div>
                    </div>
                  )}
                  {x.windowId === tagWahl && !gamesOffen && (
                    <button onClick={() => setGamesOffen(true)} className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-lg bg-sky-500/15 px-3 py-2 text-left text-sm font-semibold text-sky-300 transition hover:bg-sky-500/25">
                      {matchWahl ? `Game ${x.matches.find((m) => m.id === matchWahl)?.nr ?? ''}` : <T>Zones of all games</T>} · <T>Pick another</T>
                    </button>
                  )}
                </div>
              ))}
            </aside>

            <section className="min-w-0 space-y-5">
              {/* ---- Zonen eines ganzen Tages ---- */}
              {tag?.eventId && !matchWahl && turnierTage.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-white/85">
                    <input type="checkbox" checked={frei.includes(tag.eventId)} onChange={(e) => void freigabeSetzen(tag.eventId!, e.target.checked)} className="h-4 w-4 accent-sky-500" />
                    <T>Share the zone overview of this cup with VIPs</T>
                  </label>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${frei.includes(tag.eventId) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.07] text-white/55'}`}>
                    {frei.includes(tag.eventId) ? <T>Visible to VIPs</T> : <T>Only visible to you</T>}
                  </span>
                  {freiMeldung && <span className="text-xs font-semibold text-rose-300">{freiMeldung}</span>}
                </div>
              )}
              {tag && !matchWahl && turnierTage.length > 0 && <ZonenBild key={turnierTage.map((x) => x.windowId).join('|')} tage={turnierTage} />}
              {tag && !matchWahl && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40"><T>Zone with radius</T></span>
                    {stufen.map((r) => (
                      <button key={r} onClick={() => setPhase(r)}
                        className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${phase === r ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-white/10 text-white/55 hover:text-white/85'}`}>
                        {(r / 100).toLocaleString()} m
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                    <Karte beschriftung={`${tag.titel} · Zones`} karte={tagKarte}
                      kreise={tag.matches.flatMap((m, i) => {
                        const z = (tagMatches[m.id]?.zonen ?? []).find((x) => Math.round(x.naechsterRadius ?? 0) === phase);
                        return z && typeof z.x === 'number' && typeof z.y === 'number'
                          ? [{ x: z.x, y: z.y, r: phase, farbe: FARBEN[i % FARBEN.length], staerke: 1, text: `GAME ${m.nr}` }] : [];
                      })}
                      punkte={[]} />
                    <div className="space-y-2">
                      {tag.matches.map((m, i) => (
                        <button key={m.id} onClick={() => setMatchWahl(m.id)}
                          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-sky-500/60">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: FARBEN[i % FARBEN.length] }} />
                          <span className="min-w-0 flex-1">
                            <b className="text-sm">Game {m.nr}</b>
                            <span className="block truncate text-xs text-white/40">🏆 {(m.sieger ?? []).map(ohneVorsatz).join(' + ') || '–'}</span>
                          </span>
                          {!tagMatches[m.id] && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-sky-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ---- Ein Game ---- */}
              {matchWahl && !match && <div className="aspect-video animate-pulse rounded-2xl bg-white/[0.03]" />}
              {matchWahl && match && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-black">Game {tag?.matches.find((m) => m.id === matchWahl)?.nr}</h2>
                    <span className="text-sm text-white/55">{tag?.titel}</span>
                    <label className="ml-auto flex items-center gap-2 text-sm text-white/55">
                      <input type="checkbox" checked={mitKnocks} onChange={(e) => setMitKnocks(e.target.checked)} className="accent-sky-500" />
                      <T>Show knocks</T>
                    </label>
                  </div>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
                    <div>
                      <Karte karte={zonenKarte(match.playlist, tag?.windowId ?? '')}
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
                      <p className="mt-2 text-xs text-white/40">
                        <T>White rings: the zones of the game, the later the stronger. ✖ elim, ● knock - in the colour of the team that got it (top 8 coloured). Hovering shows time, attacker, victim and distance.</T>
                      </p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      <p className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/40"><T>Teams</T></p>
                      <div className="max-h-[36rem] overflow-y-auto">
                        {teams.map((x) => (
                          <div key={x.team} className="flex items-center gap-3 border-b border-white/5 px-4 py-2 text-sm last:border-0">
                            <span className="w-7 text-right font-bold tabular-nums text-white/55">#{x.platz ?? '–'}</span>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: farbeVonTeam.get(x.team) }} />
                            <span className="min-w-0 flex-1 truncate text-white/85">{x.spieler.map((s) => ohneVorsatz(s.name)).join(' + ')}</span>
                            <span className="shrink-0 text-xs tabular-nums text-white/55" title={t('Elims / Knocks')}>{x.elims} / {x.knocks}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <p className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/40"><T>Kill-Feed</T></p>
                    <div className="max-h-[28rem] overflow-y-auto">
                      {match.feed.filter((k) => k.art !== 'auf').map((k, i) => {
                        const taeter = nachId.get(k.taeter ?? -1); const opfer = nachId.get(k.opfer ?? -1);
                        if (opfer?.bot) return null;
                        return (
                          <div key={i} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 border-b border-white/5 px-4 py-1.5 text-sm last:border-0">
                            <span className="tabular-nums text-white/40">{uhr(k.t)}</span>
                            <span className="truncate">
                              <b style={{ color: farbeVonTeam.get(taeter?.team ?? -1) ?? '#e2e8f0' }}>{taeter?.bot ? 'AI' : ohneVorsatz(taeter?.name)}</b>
                              <span className="mx-2 text-white/40">{k.art === 'tot' ? '✖' : '↓'}</span>
                              <span className="text-white/70">{ohneVorsatz(opfer?.name)}</span>
                            </span>
                            <span className="text-xs tabular-nums text-white/40">{k.abstand ? `${Math.round(k.abstand / 100)} m` : ''}</span>
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
