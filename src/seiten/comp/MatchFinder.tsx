import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Glas, Titel } from '../../teile/Glas';
import { useWer } from '../../teile/Anmeldung';
import { AnmeldeKarte, Fehler, Laedt } from './tools/Gemeinsam';

/*
 * Match-ID-Finder im Hub - wie /match-finder der echten Seite (/api/match-finder): Favoriten (am Konto, /api/user-storage), je Favorit das laufende
 * Match mit Match-ID zum Kopieren, Verlauf (LIVE · seit X / Ended · vor X), gespielte Cup-Matches, Scrims. Admin: alle Epic-Freunde des Bot-Kontos und die
 * Freigaben. Nur VIP (Recht "matchfinder") und Admin - sonst 403, dann die Anmelde-Karte.
 */

interface Favorit { id: string; name: string }
interface Treffer extends Favorit { ingame?: string | null; bild?: string | null }
interface FMatch { matchId: string; ende: string | null; platz: number | null; elims: number | null; windowId: string; titel: string }
interface FLive { matchId: string; quelle: 'bestenliste' | 'sitzung' | 'freund' | 'rangliste'; windowId: string | null; titel: string | null; playlist: string | null }
interface FScrim { beendet?: boolean; session: string; server: string; platz: number | null; punkte: number | null; spiele: number; kills: number | null; letztesSpiel: { code: string; ende: string | null; platz: number | null } | null; nurAngemeldet: boolean; link: string }
interface FSpieler { live: FLive | null; matches: FMatch[]; rang: number | null; punkte: number | null; scrim?: FScrim | null; freund?: boolean }
interface FCup { windowId: string; titel: string; region: string; live: boolean }
interface FVerlauf { matchId: string; von: string; bis: string; playlist: string | null; zeile?: string; titel?: string | null }
interface Antwort { ok: boolean; error?: string; cups: FCup[]; spieler: Record<string, FSpieler>; verlauf?: Record<string, FVerlauf[]> }
interface FFreund { id: string; name: string; live: FLive | null; verlauf: FVerlauf[]; online?: boolean; zeile?: string | null }
interface FFreigabe { id: string; name: string; seit: string }

const SPEICHER = 'match-finder-favoriten';
const LOKAL = `hub:${SPEICHER}`;
// Abruf-Takt wie auf der echten Seite: 5 s waehrend Cup/Scrim, sonst 60 s.
const TAKT_LIVE = 5_000;
const TAKT_RUHE = 60_000;
const QUELLE: Record<FLive['quelle'], string> = { freund: 'Friend', bestenliste: 'Live list', sitzung: 'Session search', rangliste: 'Leaderboard' };

/** Epics Playlist-Kennung lesbar: "Playlist_ShowdownAlt_Duos" -> "Tournament · Duos". */
function spielart(p: string | null): string | null {
  if (!p) return null;
  const k = p.replace(/^Playlist_/i, '');
  const g = /solo/i.test(k) ? 'Solo' : /duo/i.test(k) ? 'Duos' : /trio/i.test(k) ? 'Trios' : /squad/i.test(k) ? 'Squads' : '';
  const a = /habanero|ranked/i.test(k) ? 'Ranked' : /showdown|tournament|arena/i.test(k) ? 'Tournament' : /playground|creative|custom|private/i.test(k) ? 'Custom lobby / scrim'
    : /respawn|reload|blastberry|punchberry/i.test(k) ? 'Reload' : /nobuild/i.test(k) ? 'Zero Build' : 'Match';
  return [a, g].filter(Boolean).join(' · ');
}
const uhrzeit = (iso: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(+d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; };
const datumZeit = (iso: string) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
function dauer(von: string, bis: string) {
  const min = Math.round(((Date.parse(bis) || 0) - (Date.parse(von) || 0)) / 60_000);
  if (min < 1) return '<1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
const bisJetzt = (iso?: string | null) => (iso ? dauer(iso, new Date().toISOString()) : '');

/** Tickt jede halbe Minute, damit "seit X min" mitlaeuft. */
function useUhr() {
  const [, setN] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setN((n) => n + 1), 30_000); return () => window.clearInterval(id); }, []);
}

function KopierKnopf({ id, kopiert, kopieren, text = 'Copy', gross = false }: { id: string; kopiert: string; kopieren: (t: string) => void; text?: string; gross?: boolean }) {
  const ok = kopiert === id;
  return (
    <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => kopieren(id)}
      className={gross
        ? `rounded-xl px-4 py-2 text-xs font-bold transition ${ok ? 'bg-emerald-400 text-[#06080f]' : 'bg-red-500 text-white hover:bg-red-400'}`
        : `rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${ok ? 'border-emerald-400/50 text-emerald-300' : 'border-white/10 text-white/70 hover:border-sky-400/60 hover:text-sky-300'}`}>
      {ok ? 'Copied ✓' : text}
    </motion.button>
  );
}

function SitzungsStatus({ live, von, bis }: { live: boolean; von: string; bis: string }) {
  return live
    ? <span className="whitespace-nowrap font-semibold tabular-nums text-red-400" title={`In game since ${uhrzeit(von)}`}>LIVE · since {bisJetzt(von)}</span>
    : <span className="whitespace-nowrap tabular-nums text-white/40" title={`Seen for ${dauer(von, bis)}`}>Ended · {bisJetzt(bis)} ago</span>;
}

function LiveKasten({ live, seit, kopiert, kopieren }: { live: FLive; seit?: string | null; kopiert: string; kopieren: (t: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="relative mt-4 flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/15 via-red-500/5 to-transparent px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-extrabold text-red-400">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" /><span className="relative h-2.5 w-2.5 rounded-full bg-red-500" /></span>
        {seit ? `LIVE · since ${bisJetzt(seit)}` : 'LIVE'}
      </span>
      <span className="text-xs text-white/70">{live.titel ?? spielart(live.playlist) ?? 'In a match'}</span>
      <code className="rounded-lg bg-black/50 px-2.5 py-1 font-mono text-xs text-white/90">{live.matchId}</code>
      <KopierKnopf id={live.matchId} kopiert={kopiert} kopieren={kopieren} text="Copy match ID" gross />
      <span className="ml-auto whitespace-nowrap text-[11px] text-white/40">found via <span className="font-semibold text-white/70">{QUELLE[live.quelle]}</span></span>
    </motion.div>
  );
}

function Verlauf({ eintraege, liveId, kopiert, kopieren }: { eintraege: FVerlauf[]; liveId: string | null; kopiert: string; kopieren: (t: string) => void }) {
  const [alle, setAlle] = useState(false);
  if (!eintraege.length) return null;
  const zeigen = alle ? eintraege : eintraege.slice(0, 5);
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">History</p>
      <ul className="mt-1.5 divide-y divide-white/[0.05]">
        {zeigen.map((e) => (
          <li key={e.matchId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium text-white/90" title={e.playlist ?? undefined}>
              {e.matchId === liveId && <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-red-500 align-middle" />}
              {e.titel || spielart(e.playlist) || e.zeile || 'Match'}
            </span>
            <span className="tabular-nums text-white/40">{datumZeit(e.von)}</span>
            <SitzungsStatus live={e.matchId === liveId} von={e.von} bis={e.bis} />
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-white/60" title={e.matchId}>{e.matchId.slice(0, 8)}…</code>
            <KopierKnopf id={e.matchId} kopiert={kopiert} kopieren={kopieren} />
          </li>
        ))}
      </ul>
      {eintraege.length > 5 && (
        <button type="button" onClick={() => setAlle(!alle)} className="mt-1 text-[11px] font-semibold text-sky-300/80 hover:text-sky-300">{alle ? 'Show less' : `Show all (${eintraege.length})`}</button>
      )}
    </div>
  );
}

function Punkt({ an }: { an: boolean }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${an ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white/15'}`} />;
}

/* --- Favoriten --- */
function Favoriten({ kopiert, kopieren, setVerboten }: { kopiert: string; kopieren: (t: string) => void; setVerboten: (v: boolean) => void }) {
  const [favoriten, setFavoriten] = useState<Favorit[]>(() => { try { return JSON.parse(localStorage.getItem(LOKAL) || '[]'); } catch { return []; } });
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [epicFehler, setEpicFehler] = useState('');
  const [nochmal, setNochmal] = useState(0);

  // Favoriten vom Konto (dort gilt der zuletzt gespeicherte Stand).
  useEffect(() => {
    fetch(`/api/user-storage?key=${SPEICHER}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (Array.isArray(j?.value)) { setFavoriten(j.value); try { localStorage.setItem(LOKAL, JSON.stringify(j.value)); } catch { /* egal */ } }
    }).catch(() => {});
  }, []);
  const speichern = (liste: Favorit[]) => {
    setFavoriten(liste);
    try { localStorage.setItem(LOKAL, JSON.stringify(liste)); } catch { /* egal */ }
    void fetch('/api/user-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: SPEICHER, value: liste }) }).catch(() => {});
  };

  const ids = useMemo(() => favoriten.map((f) => f.id).join(','), [favoriten]);
  const namen = useMemo(() => favoriten.map((f) => encodeURIComponent(f.name.replace(/\|/g, ' '))).join('|'), [favoriten]);
  const laden = useCallback(() => {
    if (!ids) { setDaten(null); return; }
    fetch(`/api/match-finder?ids=${ids}&namen=${namen}`, { cache: 'no-store' }).then(async (r) => {
      if (r.status === 401 || r.status === 403) { setVerboten(true); return; }
      const j = await r.json() as Antwort;
      if (j?.ok) { setDaten(j); setFehler(''); } else setFehler(j?.error ?? 'Could not load');
    }).catch(() => setFehler('Could not load'));
  }, [ids, namen, setVerboten]);
  const liveCup = Boolean(daten?.cups.some((c) => c.live) || Object.values(daten?.spieler ?? {}).some((s) => s.scrim));
  useEffect(() => { laden(); const id = window.setInterval(laden, liveCup ? TAKT_LIVE : TAKT_RUHE); return () => window.clearInterval(id); }, [laden, liveCup]);

  // Suche: Szene-Liste (Teilname) und der genaue Epic-Name.
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) { setTreffer(null); setEpicFehler(''); return undefined; }
    let weg = false;
    const uhr = window.setTimeout(async () => {
      const [szene, epic] = await Promise.all([
        fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null) as Promise<{ spieler?: Array<{ epicId: string; name: string; anzeige?: string; aktuell?: string | null; bild?: string | null }> } | null>,
        q.length >= 3 ? fetch(`/api/match-finder?name=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null) as Promise<{ ok?: boolean; error?: string; treffer?: Favorit | null } | null> : Promise.resolve(null),
      ]);
      if (weg) return;
      setEpicFehler(q.length >= 3 && (!epic || epic.ok === false) ? 'Epic is not answering right now' : '');
      const liste: Treffer[] = [];
      for (const s of szene?.spieler ?? []) {
        if (!s.epicId || liste.some((x) => x.id === s.epicId)) continue;
        liste.push({ id: s.epicId, name: s.anzeige || s.name, ingame: s.aktuell ?? s.name, bild: s.bild ?? null });
      }
      if (epic?.treffer?.id && !liste.some((x) => x.id === epic.treffer!.id.toLowerCase())) liste.unshift({ id: epic.treffer.id.toLowerCase(), name: epic.treffer.name, ingame: epic.treffer.name, bild: null });
      setTreffer(liste.slice(0, 8));
    }, 350);
    return () => { weg = true; window.clearTimeout(uhr); };
  }, [suche, nochmal]);

  const liveCups = daten?.cups.filter((c) => c.live) ?? [];
  return (
    <div className="space-y-5">
      <Glas dunkel className="flex flex-wrap items-center gap-3 px-5 py-4">
        {liveCups.length
          ? <><span className="flex items-center gap-2 text-sm font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{liveCups.length} {liveCups.length === 1 ? 'cup running' : 'cups running'}</span>
            {liveCups.map((c) => <span key={c.windowId} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{c.titel} <span className="text-white/40">· {c.region}</span></span>)}</>
          : <span className="text-sm text-white/45">No cup is running right now – match IDs appear as soon as one starts.</span>}
        <span className="ml-auto text-xs text-white/35">{favoriten.length}/12 favourites · refreshes every {liveCup ? '5 s' : 'minute'}</span>
      </Glas>
      {fehler && <Fehler text={fehler} />}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="space-y-4">
          {favoriten.length === 0 && <Glas dunkel className="p-10 text-center text-sm text-white/45">No favourites yet. Search a player on the right and add them.</Glas>}
          <AnimatePresence initial={false}>
            {favoriten.map((f, i) => {
              const s = daten?.spieler[f.id];
              const verlauf = daten?.verlauf?.[f.id] ?? [];
              return (
                <motion.article key={f.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }} exit={{ opacity: 0, x: -20 }}
                  className={`rounded-3xl border bg-[#080b14]/55 p-5 backdrop-blur-xl ${s?.live ? 'border-red-500/30 shadow-[0_0_40px_-12px_rgba(239,68,68,0.45)]' : 'border-white/10'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400/30 to-violet-500/20 text-sm font-extrabold text-white">{f.name.slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-extrabold tracking-tight text-white">{f.name}</p>
                        {s?.rang ? <p className="text-xs text-white/45">#{s.rang} · {s.punkte ?? 0} points</p> : <p className="font-mono text-[10px] text-white/25">{f.id}</p>}
                      </div>
                    </div>
                    <button type="button" onClick={() => speichern(favoriten.filter((x) => x.id !== f.id))} className="text-xs text-white/35 transition hover:text-rose-400">Remove</button>
                  </div>
                  {s?.live ? <LiveKasten live={s.live} seit={verlauf.find((v) => v.matchId === s.live?.matchId)?.von} kopiert={kopiert} kopieren={kopieren} />
                    : !s?.scrim ? (
                      <p className="mt-3 text-xs leading-relaxed text-white/40">{!daten ? 'Loading …'
                        : s?.freund === false ? 'Before the first kill Epic only shows the running session to friends – this player is not friends with the CompHub Epic account. After the first scored event the match ID appears here from the cup leaderboard.'
                          : 'Not in a match right now.'}</p>
                    ) : null}
                  {s?.scrim && (
                    <div className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 ${s.scrim.beendet ? 'border-white/10 bg-white/[0.02]' : 'border-amber-400/30 bg-amber-400/10'}`}>
                      {s.scrim.beendet ? <span className="text-sm font-bold text-white/50">Scrim ended</span>
                        : <span className="flex items-center gap-1.5 text-sm font-bold text-amber-300"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />{s.scrim.nurAngemeldet ? 'Registered' : 'SCRIM LIVE'}</span>}
                      <span className="text-xs text-white/80">{s.scrim.session} <span className="text-white/40">· {s.scrim.server}</span></span>
                      {!s.scrim.nurAngemeldet && <span className="text-xs tabular-nums text-white/60">#{s.scrim.platz} · {s.scrim.punkte} pts · {s.scrim.spiele} games{s.scrim.kills != null ? ` · ${s.scrim.kills} elims` : ''}</span>}
                      {s.scrim.letztesSpiel && (
                        <span className="flex items-center gap-2 text-xs text-white/50">Last game · Yunite code <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-white/80">{s.scrim.letztesSpiel.code}</code>
                          <KopierKnopf id={s.scrim.letztesSpiel.code} kopiert={kopiert} kopieren={kopieren} /> {uhrzeit(s.scrim.letztesSpiel.ende)}</span>
                      )}
                      <a href={s.scrim.link} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-amber-300 hover:text-amber-200">Noble leaderboard →</a>
                    </div>
                  )}
                  <Verlauf eintraege={verlauf} liveId={s?.live?.matchId ?? null} kopiert={kopiert} kopieren={kopieren} />
                  {s && s.matches.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {s.matches.map((m) => (
                            <tr key={m.matchId} className="border-t border-white/[0.05]">
                              <td className="py-2 pr-3 tabular-nums text-white/40">{uhrzeit(m.ende)}</td>
                              <td className="py-2 pr-3 text-white/60">{m.titel}</td>
                              <td className="py-2 pr-3 font-semibold tabular-nums text-white/85">{m.platz ? `#${m.platz}` : ''}</td>
                              <td className="py-2 pr-3 tabular-nums text-white/60">{m.elims != null ? `${m.elims} elims` : ''}</td>
                              <td className="py-2 text-right"><KopierKnopf id={m.matchId} kopiert={kopiert} kopieren={kopieren} text={`${m.matchId.slice(0, 8)}…`} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </section>

        <Glas dunkel className="h-fit p-5 xl:sticky xl:top-24" verzoegerung={0.15}>
          <h3 className="font-bold text-white">Add a player</h3>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Player name…"
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
          {epicFehler && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">{epicFehler}
              <button type="button" onClick={() => setNochmal((n) => n + 1)} className="ml-2 font-semibold text-sky-300 hover:text-sky-200">Try again</button></div>
          )}
          {treffer && treffer.length === 0 && !epicFehler && <p className="mt-3 text-xs text-white/40">Nobody found. For players from open cups type the exact Epic name.</p>}
          {treffer && treffer.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {treffer.map((x, i) => {
                const da = favoriten.some((f) => f.id === x.id);
                return (
                  <motion.li key={x.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
                    {x.bild ? <img src={x.bild} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover object-top" />
                      : <span className="grid h-12 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-sm font-bold text-white/40">{x.name.slice(0, 1).toUpperCase()}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">{x.name}</span>
                      {x.ingame && x.ingame !== x.name && <span className="block truncate text-[11px] text-white/40">{x.ingame}</span>}
                    </span>
                    <button type="button" disabled={da || favoriten.length >= 12} onClick={() => { speichern([...favoriten, { id: x.id, name: x.name }]); setSuche(''); setTreffer(null); }}
                      className="shrink-0 rounded-lg bg-sky-400 px-3 py-1 text-xs font-bold text-[#06080f] transition hover:bg-sky-300 disabled:opacity-40">{da ? 'Added' : 'Add'}</button>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-white/35">Up to 12 favourites, saved to your account. The match ID of a running game comes from Epic's leaderboard and session data; played matches are listed with their ID.</p>
        </Glas>
      </div>
    </div>
  );
}

/* --- Admin: alle Freunde des Bot-Kontos + Freigaben --- */
function Freigaben() {
  const [liste, setListe] = useState<FFreigabe[] | null>(null);
  const [dienst, setDienst] = useState<string[] | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const nimm = (j: { ok?: boolean; error?: string; eintraege?: FFreigabe[]; dienst?: { ids: string[] } | null }) => {
    if (!j?.ok) { setFehler(j?.error ?? 'Error'); return; }
    setFehler(''); setListe(j.eintraege ?? []); setDienst(j.dienst?.ids ?? null);
  };
  useEffect(() => { fetch('/api/admin/matchid-freigaben', { cache: 'no-store' }).then((r) => r.json()).then(nimm).catch(() => setFehler('Could not load')); }, []);
  const dazu = async () => {
    const e = eingabe.trim(); if (!e || laeuft) return; setLaeuft(true);
    try { const j = await fetch('/api/admin/matchid-freigaben', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eingabe: e }) }).then((r) => r.json()); nimm(j); if (j?.ok) setEingabe(''); }
    catch { setFehler('Not saved'); } finally { setLaeuft(false); }
  };
  const weg = async (id: string) => {
    setLaeuft(true);
    try { nimm(await fetch(`/api/admin/matchid-freigaben?id=${id}`, { method: 'DELETE' }).then((r) => r.json())); } catch { setFehler('Not saved'); } finally { setLaeuft(false); }
  };
  return (
    <Glas dunkel className="p-5">
      <h3 className="font-bold text-white">Approvals for the bot account “comphub.”</h3>
      <p className="mt-1 text-xs leading-relaxed text-white/45">Anyone listed here who sends “comphub.” a friend request is accepted automatically (every 2 min). After that their match ID shows up already on the spawn island. The bot never sends requests.</p>
      <div className="mt-3 flex gap-2">
        <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void dazu(); }} maxLength={60} placeholder="Epic name or account ID"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
        <button type="button" onClick={() => void dazu()} disabled={laeuft || !eingabe.trim()} className="rounded-xl bg-sky-400 px-4 text-sm font-bold text-[#06080f] disabled:opacity-40">Add</button>
      </div>
      {fehler && <p className="mt-2 text-xs text-rose-400">{fehler}</p>}
      {liste === null ? <p className="mt-3 text-xs text-white/40">Loading …</p> : !liste.length ? <p className="mt-3 text-xs text-white/40">Nobody approved yet.</p> : (
        <ul className="mt-3 max-h-72 divide-y divide-white/[0.05] overflow-auto text-sm">
          {liste.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <span className="font-semibold text-white">{f.name || f.id.slice(0, 8)}</span>
              {dienst && !dienst.includes(f.id) && <span className="text-[11px] text-amber-400">not yet at the service</span>}
              <span className="ml-auto text-[11px] text-white/35">{datumZeit(f.seit)}</span>
              <button type="button" onClick={() => void weg(f.id)} disabled={laeuft} className="rounded-lg border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:border-rose-500 hover:text-rose-300">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Glas>
  );
}

function AlleFreunde({ kopiert, kopieren, setVerboten }: { kopiert: string; kopieren: (t: string) => void; setVerboten: (v: boolean) => void }) {
  const [freunde, setFreunde] = useState<FFreund[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let weg = false;
    const laden = () => fetch('/api/match-finder?ansicht=freunde', { cache: 'no-store' }).then(async (r) => {
      if (weg) return;
      if (r.status === 401 || r.status === 403) { setVerboten(true); return; }
      const j = await r.json() as { ok?: boolean; error?: string; freunde?: FFreund[] };
      if (j?.ok) { setFreunde(j.freunde ?? []); setFehler(''); } else setFehler(j?.error ?? 'Could not load');
    }).catch(() => { if (!weg) setFehler('Could not load'); });
    laden();
    const id = window.setInterval(laden, TAKT_LIVE);
    return () => { weg = true; window.clearInterval(id); };
  }, [setVerboten]);
  const q = filter.trim().toLowerCase();
  // Live zuerst, dann online, dann nach Namen.
  const liste = (freunde ?? []).filter((f) => !q || f.name.toLowerCase().includes(q) || f.id.includes(q))
    .sort((a, b) => Number(!!b.live) - Number(!!a.live) || Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name));
  const live = (freunde ?? []).filter((f) => f.live).length;
  const online = (freunde ?? []).filter((f) => f.online).length;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-4">
        <Glas dunkel className="flex flex-wrap items-center gap-5 px-5 py-4">
          {freunde ? (
            <div className="flex gap-6">
              <div><p className="text-2xl font-extrabold tabular-nums text-white">{freunde.length}</p><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">friends</p></div>
              <div><p className="text-2xl font-extrabold tabular-nums text-red-400">{live}</p><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">live</p></div>
              <div><p className="text-2xl font-extrabold tabular-nums text-emerald-400">{online}</p><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">online</p></div>
            </div>
          ) : <span className="text-sm text-white/45">Loading …</span>}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name…"
            className="ml-auto w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none sm:w-72" />
        </Glas>
        {fehler && <Fehler text={fehler} />}
        {!freunde && !fehler && <Laedt />}
        <div className="grid gap-4 2xl:grid-cols-2">
          {liste.map((f, i) => (
            <motion.article key={f.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * 0.025 } }}
              className={`rounded-3xl border bg-[#080b14]/55 p-5 backdrop-blur-xl ${f.live ? 'border-red-500/30 shadow-[0_0_40px_-12px_rgba(239,68,68,0.45)] 2xl:col-span-2' : 'border-white/10'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2.5 truncate text-base font-bold text-white"><Punkt an={!!f.online} /><span className="truncate">{f.name}</span></p>
                  {f.online && f.zeile && <p className="mt-0.5 truncate pl-5 text-xs text-emerald-300/80">{f.zeile}</p>}
                </div>
                {f.live ? <span className="flex items-center gap-1.5 text-xs font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>
                  : <span className={`text-xs ${f.online ? 'font-semibold text-emerald-400' : 'text-white/30'}`}>{f.online ? 'Online' : 'Offline'}</span>}
              </div>
              {f.live && <LiveKasten live={f.live} seit={f.verlauf.find((v) => v.matchId === f.live?.matchId)?.von} kopiert={kopiert} kopieren={kopieren} />}
              <Verlauf eintraege={f.verlauf} liveId={f.live?.matchId ?? null} kopiert={kopiert} kopieren={kopieren} />
            </motion.article>
          ))}
        </div>
      </section>
      <div className="h-fit xl:sticky xl:top-24"><Freigaben /></div>
    </div>
  );
}

export default function MatchFinder() {
  useUhr();
  const { wer } = useWer();
  const [verboten, setVerboten] = useState<boolean | null>(null);
  const [kopiert, setKopiert] = useState('');
  const [ansicht, setAnsicht] = useState<'favoriten' | 'freunde'>(() => (new URLSearchParams(window.location.search).get('ansicht') === 'freunde' ? 'freunde' : 'favoriten'));
  // Zugang pruefen: ohne ids antwortet die API nur VIPs/Admins mit 200 (sonst 403). Nach jeder Anmeldung neu.
  useEffect(() => {
    fetch('/api/match-finder', { cache: 'no-store' }).then((r) => setVerboten(r.status === 401 || r.status === 403)).catch(() => setVerboten(true));
  }, [wer?.userName, wer?.isAdmin]);
  const kopieren = (t: string) => { void navigator.clipboard.writeText(t).then(() => { setKopiert(t); window.setTimeout(() => setKopiert(''), 2500); }).catch(() => {}); };
  const wechsle = (a: 'favoriten' | 'freunde') => {
    setAnsicht(a);
    const u = new URL(window.location.href);
    if (a === 'freunde') u.searchParams.set('ansicht', 'freunde'); else u.searchParams.delete('ansicht');
    window.history.replaceState(null, '', u.toString());
  };
  const merkeVerboten = useCallback((v: boolean) => setVerboten(v), []);
  const admin = !!wer?.isAdmin;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <Titel ueber="VIP tool" titel="Match-ID Finder" text="Save players as favourites. While a cup runs you see which match they're in – copy the match ID and spectate in game." />
        {admin && verboten === false && (
          <div className="ml-auto flex rounded-full border border-white/10 bg-[#080b14]/60 p-1 text-sm font-semibold">
            {(['favoriten', 'freunde'] as const).map((a) => (
              <button key={a} type="button" onClick={() => wechsle(a)} className="relative rounded-full px-4 py-2">
                {ansicht === a && <motion.span layoutId="mf-reiter" className="absolute inset-0 rounded-full bg-sky-400" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <span className={`relative ${ansicht === a ? 'text-[#06080f]' : 'text-white/60'}`}>{a === 'favoriten' ? 'Favourites' : 'All friends (admin)'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {verboten === null ? <Laedt /> : verboten
        ? <AnmeldeKarte text="The Match-ID Finder is for CompHub VIPs and admins. Sign in with your thecomphub.com account or VIP access key." />
        : admin && ansicht === 'freunde' ? <AlleFreunde kopiert={kopiert} kopieren={kopieren} setVerboten={merkeVerboten} />
          : <Favoriten kopiert={kopiert} kopieren={kopieren} setVerboten={merkeVerboten} />}
    </div>
  );
}
