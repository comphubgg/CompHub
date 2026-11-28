import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Flaeche, Laedt, Marke, Segment, SeitenKopf } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import { AnmeldeKarte, Fehler } from './tools/Gemeinsam';
import { Klein, Portraet } from './stats/teile';
import { apiText } from '../admin/port/app/components/SprachProvider';

/*
 * Match-ID-Finder im Hub - wie /match-finder der echten Seite (/api/match-finder): Favoriten (am Konto, /api/user-storage), je Favorit das laufende
 * Match mit Match-ID zum Kopieren, Verlauf (LIVE · seit X / Ended · vor X), gespielte Cup-Matches, Scrims. Admin: alle Epic-Freunde des Bot-Kontos und die
 * Freigaben. Nur VIP (Recht "matchfinder") und Admin - sonst 403, dann die Anmelde-Karte.
 *
 * Aufbau (Design-System 3.0; Betreiber: die alte Seite war "unuebersichtlich"): die Seite beantwortet EINE Frage zuerst - wer ist JETZT im Match?
 *   1. LIVE NOW   ganz oben, gross: Foto, Name, seit wann, Cup, die Match-ID und ein grosser Kopierknopf. Niemand live -> eine ruhige Zeile.
 *   2. Favourites darunter als gleich grosse Karten (Foto, Name, Stand in einem Satz); rechts daneben das Hinzufuegen.
 *   3. History    je Favorit eingeklappt (ein Klick klappt Verlauf und gespielte Cup-Matches auf).
 * Die Fotos kommen ueber POST /api/spielerbild (Name -> Bild); ohne Foto steht nichts (keine Buchstaben-Kaesten).
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

/* Fotos der Favoriten: einmal je Name holen (wie auf der Tierlist), fuer alle Karten gemeinsam. */
const FOTOS = new Map<string, string | null>();
function useFotos(namen: string[]): (name: string) => string | null {
  const [, neu] = useState(0);
  const schluessel = namen.join('|');
  useEffect(() => {
    const offen = [...new Set(namen)].filter((n) => n && !FOTOS.has(n));
    if (!offen.length) return;
    fetch('/api/spielerbild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen: offen.slice(0, 150) }) })
      .then((r) => r.json()).then((j: { bilder?: Record<string, string | null> }) => { for (const n of offen) FOTOS.set(n, j.bilder?.[n] ?? null); neu((x) => x + 1); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);
  return (name) => FOTOS.get(name) ?? null;
}

function KopierKnopf({ id, kopiert, kopieren, text = 'Copy', gross = false, gold = false }: { id: string; kopiert: string; kopieren: (t: string) => void; text?: string; gross?: boolean; gold?: boolean }) {
  const ok = kopiert === id;
  return (
    <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => kopieren(id)}
      className={gross
        ? `inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${ok ? 'bg-emerald-400 text-[#04050a]' : gold ? 'bg-amber-400 text-[#04050a] hover:bg-amber-300' : 'bg-red-500 text-white shadow-[0_12px_30px_-12px_rgba(239,68,68,0.9)] hover:bg-red-400'}`
        : `shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${ok ? 'border-emerald-400/50 text-emerald-300' : 'border-white/10 text-white/70 hover:border-akz/60 hover:text-akz'}`}>
      {gross && !ok && <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>}
      {ok ? 'Copied ✓' : text}
    </motion.button>
  );
}

function SitzungsStatus({ live, von, bis }: { live: boolean; von: string; bis: string }) {
  return live
    ? <span className="zahl whitespace-nowrap font-semibold text-red-400" title={`In game since ${uhrzeit(von)}`}>LIVE · since {bisJetzt(von)}</span>
    : <span className="zahl whitespace-nowrap text-white/40" title={`Seen for ${dauer(von, bis)}`}>Ended · {bisJetzt(bis)} ago</span>;
}

/** Kopf eines Seitenteils: Titel in der Schrift der Seite, rechts Platz fuer Zahlen oder ein Feld. */
function TeilKopf({ titel, zusatz, rechts, live = false }: { titel: string; zusatz?: ReactNode; rechts?: ReactNode; live?: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {live ? <span className="relative flex h-3 w-3"><span className="absolute h-full w-full animate-ping rounded-full bg-red-500 opacity-70" /><span className="relative h-3 w-3 rounded-full bg-red-500" /></span>
          : <span className="h-6 w-1 rounded-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.8)]" />}
        <h2 className="titel whitespace-nowrap text-3xl">{titel}</h2>
        {zusatz && <span className="pt-1 text-sm text-white/45">{zusatz}</span>}
      </div>
      {rechts}
    </div>
  );
}

/** GROSS: jemand ist gerade im Match - Foto, Name, seit wann, die Match-ID und der Kopierknopf. */
function LiveKarte({ name, bild, live, seit, unter, kopiert, kopieren, breit = false }: { name: string; bild?: string | null; live: FLive; seit?: string | null; unter?: ReactNode; kopiert: string; kopieren: (t: string) => void; breit?: boolean }) {
  return (
    <motion.article layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fl-fest relative flex flex-wrap items-center gap-x-5 gap-y-4 overflow-hidden !border-red-500/35 p-4 shadow-[0_0_60px_-24px_rgba(239,68,68,0.7)] sm:p-5 ${breit ? '2xl:col-span-2' : ''}`}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-red-500/[0.13] to-transparent" />
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-red-500" />
      <Portraet bild={bild} gross={104} />
      <div className="relative min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <Marke ton="rot" puls>{seit ? `Live · since ${bisJetzt(seit)}` : 'Live'}</Marke>
          <span className="truncate text-xs font-medium text-white/70">{live.titel ?? spielart(live.playlist) ?? 'In a match'}</span>
        </div>
        <p className="titel mt-2 truncate text-5xl">{name}</p>
        <p className="mt-1 truncate text-xs text-white/45">found via <span className="font-semibold text-white/75">{QUELLE[live.quelle]}</span>{unter ? <> · {unter}</> : null}</p>
      </div>
      <div className="relative flex w-full flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/50 p-2 pl-4 lg:w-auto">
        <div className="min-w-[13rem] flex-1"><Klein>Match ID</Klein><code className="block break-all font-mono text-sm text-white sm:text-base">{live.matchId}</code></div>
        <KopierKnopf id={live.matchId} kopiert={kopiert} kopieren={kopieren} text="Copy match ID" gross />
      </div>
    </motion.article>
  );
}

/** Verlauf und gespielte Cup-Matches - steht eingeklappt in der Karte des Favoriten. */
function Verlauf({ eintraege, liveId, kopiert, kopieren }: { eintraege: FVerlauf[]; liveId: string | null; kopiert: string; kopieren: (t: string) => void }) {
  const [alle, setAlle] = useState(false);
  if (!eintraege.length) return null;
  const zeigen = alle ? eintraege : eintraege.slice(0, 5);
  return (
    <div>
      <Klein>Sessions</Klein>
      <ul className="mt-1 divide-y divide-white/[0.05]">
        {zeigen.map((e) => (
          <li key={e.matchId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
            <span className="min-w-0 flex-1 basis-32 truncate font-medium text-white/90" title={e.playlist ?? undefined}>
              {e.matchId === liveId && <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-red-500 align-middle" />}
              {e.titel || spielart(e.playlist) || e.zeile || 'Match'}
            </span>
            <span className="zahl text-white/40">{datumZeit(e.von)}</span>
            <SitzungsStatus live={e.matchId === liveId} von={e.von} bis={e.bis} />
            <KopierKnopf id={e.matchId} kopiert={kopiert} kopieren={kopieren} text={`${e.matchId.slice(0, 8)}…`} />
          </li>
        ))}
      </ul>
      {eintraege.length > 5 && <button type="button" onClick={() => setAlle(!alle)} className="knopf-leer mt-1 !text-[11px]">{alle ? 'Show less' : `Show all (${eintraege.length})`}</button>}
    </div>
  );
}

/** Der aufklappbare Fuss einer Karte: "History (n)". */
function Klappe({ zahl, children }: { zahl: number; children: ReactNode }) {
  const [auf, setAuf] = useState(false);
  // Immer vorhanden, damit alle Karten gleich hoch sind (Betreiber: gleichfoermige Kacheln) - ohne Eintraege nur ausgegraut.
  return (
    <div className="border-t border-white/[0.06]">
      <button type="button" disabled={!zahl} onClick={() => setAuf(!auf)} aria-expanded={auf} className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 transition enabled:hover:text-white disabled:text-white/20">
        <span>History <span className="zahl opacity-70">({zahl})</span></span>
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition ${auf ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
      </button>
      <AnimatePresence initial={false}>
        {auf && zahl > 0 && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="space-y-3 px-4 pb-3">{children}</div></motion.div>}
      </AnimatePresence>
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
      if (j?.ok) { setDaten(j); setFehler(''); } else setFehler(j?.error ? apiText(j.error) : 'Could not load');
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
  const foto = useFotos(favoriten.map((f) => f.name));
  const live = favoriten.filter((f) => daten?.spieler[f.id]?.live);
  const scrims = favoriten.filter((f) => { const sc = daten?.spieler[f.id]?.scrim; return sc && !sc.beendet && !sc.nurAngemeldet && !daten?.spieler[f.id]?.live; });
  const voll = favoriten.length >= 12;

  return (
    <div className="space-y-7">
      {fehler && <Fehler text={fehler} />}

      {/* 1. Wer ist JETZT im Match */}
      <section>
        <TeilKopf titel="Live now" live={live.length > 0} zusatz={live.length ? `${live.length} of your ${favoriten.length} favourites ${live.length === 1 ? 'is' : 'are'} in a match` : undefined}
          rechts={(
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
              {liveCups.length > 0 && <Marke ton="rot" puls>{liveCups.length} {liveCups.length === 1 ? 'cup running' : 'cups running'}</Marke>}
              {liveCups.slice(0, 4).map((c) => <span key={c.windowId} className="chip !cursor-default !py-1">{c.titel}<span className="text-white/40">{c.region}</span></span>)}
              <span>refreshes every {liveCup ? '5 s' : 'minute'}</span>
            </div>
          )} />
        {live.length + scrims.length === 0 ? (
          <div className="fl flex flex-wrap items-center gap-3 px-5 py-4 text-sm text-white/55">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            {!favoriten.length ? 'Add a favourite below – as soon as they are in a match, their match ID shows up here.'
              : !daten ? 'Checking your favourites …'
                : liveCups.length ? 'None of your favourites is in a match right now.' : 'Nobody is in a match and no cup is running right now – match IDs appear here as soon as one starts.'}
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-3 ${live.length + scrims.length > 1 ? '2xl:grid-cols-2' : ''}`}>
            <AnimatePresence initial={false}>
              {live.map((f) => {
                const s = daten!.spieler[f.id]; const verlauf = daten?.verlauf?.[f.id] ?? [];
                return <LiveKarte key={f.id} breit={(live.length + scrims.length) % 2 === 1 && f === live[0]} name={f.name} bild={foto(f.name)} live={s.live!} seit={verlauf.find((v) => v.matchId === s.live?.matchId)?.von}
                  unter={s.rang ? `#${s.rang} · ${s.punkte ?? 0} points` : undefined} kopiert={kopiert} kopieren={kopieren} />;
              })}
              {scrims.map((f) => {
                const sc = daten!.spieler[f.id].scrim!;
                return (
                  <motion.article key={`scrim-${f.id}`} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="fl-fest relative flex flex-wrap items-center gap-x-5 gap-y-4 overflow-hidden !border-amber-400/35 p-4 sm:p-5">
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
                    <Portraet bild={foto(f.name)} gross={104} />
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex flex-wrap items-center gap-2"><Marke ton="gold" puls>Scrim live</Marke><span className="truncate text-xs text-white/70">{sc.session} · {sc.server}</span></div>
                      <p className="titel mt-2 truncate text-5xl">{f.name}</p>
                      <p className="zahl mt-1 text-xs text-white/50">#{sc.platz} · {sc.punkte} pts · {sc.spiele} games{sc.kills != null ? ` · ${sc.kills} elims` : ''}</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/50 p-2 pl-4 lg:w-auto">
                      {sc.letztesSpiel ? <><div className="min-w-[13rem] flex-1"><Klein>Last game · Yunite code · {uhrzeit(sc.letztesSpiel.ende)}</Klein><code className="block font-mono text-base text-white">{sc.letztesSpiel.code}</code></div>
                        <KopierKnopf id={sc.letztesSpiel.code} kopiert={kopiert} kopieren={kopieren} text="Copy code" gross gold /></> : <span className="py-2 text-xs text-white/45">No game played yet</span>}
                      <a href={sc.link} target="_blank" rel="noreferrer" className="knopf-leer !text-xs !text-amber-300">Noble leaderboard <span aria-hidden>→</span></a>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* 2. Favoriten als gleich grosse Karten, rechts das Hinzufuegen */}
      <section>
        <TeilKopf titel="Favourites" zusatz={<span className="zahl">{favoriten.length}/12</span>} />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {favoriten.length === 0 && <div className="fl px-5 py-8 text-center text-sm text-white/45 md:col-span-2 2xl:col-span-3">No favourites yet – search a player and add them. Up to 12, saved to your account.</div>}
            <AnimatePresence initial={false}>
              {favoriten.map((f, i) => {
                const s = daten?.spieler[f.id];
                const verlauf = daten?.verlauf?.[f.id] ?? [];
                const letzter = verlauf.find((v) => v.matchId !== s?.live?.matchId);
                const sc = s?.scrim;
                return (
                  <motion.article key={f.id} layout="position" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }} exit={{ opacity: 0, scale: 0.97 }}
                    className={`fl-fest overflow-hidden ${s?.live ? '!border-red-500/30' : ''}`}>
                    <div className="flex items-center gap-3 p-3">
                      <Portraet bild={foto(f.name)} gross={64} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-extrabold text-white">{f.name}</p>
                        <p className="zahl truncate text-[11px] text-white/40">{s?.rang ? `#${s.rang} · ${s.punkte ?? 0} points` : letzter ? `last seen ${bisJetzt(letzter.bis)} ago` : 'no match recorded yet'}</p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-xs">
                          {s?.live ? <span className="flex items-center gap-1.5 font-bold text-red-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />In a match – ID above</span>
                            : sc && !sc.beendet ? <span className="font-semibold text-amber-300">{sc.nurAngemeldet ? `Registered · ${sc.session}` : 'Scrim live – see above'}</span>
                              : !daten ? <span className="text-white/45">Checking …</span>
                                : s?.freund === false ? <span className="truncate text-white/45" title="Before the first kill Epic only shows the running session to friends – this player is not friends with the CompHub Epic account. After the first scored event the match ID appears here from the cup leaderboard.">Not in a match · <span className="text-amber-300/80">not a friend: ID only after the first kill</span></span>
                                  : <span className="text-white/45">Not in a match{sc?.beendet ? ' · scrim ended' : ''}</span>}
                        </p>
                      </div>
                      <button type="button" onClick={() => speichern(favoriten.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`} title="Remove"
                        className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-lg text-white/30 transition hover:bg-rose-500/10 hover:text-rose-400">
                        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
                      </button>
                    </div>
                    <Klappe zahl={verlauf.length + (s?.matches.length ?? 0) + (sc && (sc.beendet || sc.nurAngemeldet) && sc.letztesSpiel ? 1 : 0)}>
                      {sc && (sc.beendet || sc.nurAngemeldet) && sc.letztesSpiel && (
                        <p className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">Last scrim game ({sc.session}) · Yunite code <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-white/80">{sc.letztesSpiel.code}</code>
                          <KopierKnopf id={sc.letztesSpiel.code} kopiert={kopiert} kopieren={kopieren} /><a href={sc.link} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-amber-300 hover:text-amber-200">Noble →</a></p>
                      )}
                      <Verlauf eintraege={verlauf} liveId={s?.live?.matchId ?? null} kopiert={kopiert} kopieren={kopieren} />
                      {s && s.matches.length > 0 && (
                        <div>
                          <Klein>Played cup matches</Klein>
                          <ul className="mt-1 divide-y divide-white/[0.05]">
                            {s.matches.map((m) => (
                              <li key={m.matchId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
                                <span className="zahl text-white/40">{uhrzeit(m.ende)}</span>
                                <span className="min-w-0 flex-1 basis-24 truncate text-white/70">{m.titel}</span>
                                <span className="zahl font-semibold text-white/85">{m.platz ? `#${m.platz}` : ''}</span>
                                <span className="zahl text-white/55">{m.elims != null ? `${m.elims} elims` : ''}</span>
                                <KopierKnopf id={m.matchId} kopiert={kopiert} kopieren={kopieren} text={`${m.matchId.slice(0, 8)}…`} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Klappe>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>

          <Flaeche className="h-fit p-4 xl:sticky xl:top-28" verz={0.08}>
            <p className="ueber">Add a player</p>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={voll ? 'All 12 slots are taken' : 'Player name…'} disabled={voll} className="eingabe mt-2 w-full" />
            {epicFehler && (
              <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">{epicFehler}
                <button type="button" onClick={() => setNochmal((n) => n + 1)} className="ml-2 font-semibold text-akz hover:brightness-125">Try again</button></div>
            )}
            {treffer && treffer.length === 0 && !epicFehler && <p className="mt-3 text-xs text-white/40">Nobody found. For players from open cups type the exact Epic name.</p>}
            {treffer && treffer.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {treffer.map((x, i) => {
                  const da = favoriten.some((f) => f.id === x.id);
                  return (
                    <motion.li key={x.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/30 px-2.5 py-2">
                      <Portraet bild={x.bild} gross={48} platz />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{x.name}</span>
                        {x.ingame && x.ingame !== x.name && <span className="block truncate text-[11px] text-white/40">{x.ingame}</span>}
                      </span>
                      <button type="button" disabled={da || voll} onClick={() => { speichern([...favoriten, { id: x.id, name: x.name }]); setSuche(''); setTreffer(null); }}
                        className="knopf-prim shrink-0 !px-3 !py-1.5 !text-xs">{da ? 'Added' : 'Add'}</button>
                    </motion.li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-white/35">Up to 12 favourites, saved to your account. The match ID of a running game comes from Epic's leaderboard and session data; played matches are listed with their ID under History.</p>
          </Flaeche>
        </div>
      </section>
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
    if (!j?.ok) { setFehler(j?.error ? apiText(j.error) : 'Error'); return; }
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
    <Flaeche className="p-4">
      <p className="ueber">Approvals</p>
      <h3 className="mt-1 text-base font-bold text-white">Bot account “comphub.”</h3>
      <p className="mt-1 text-xs leading-relaxed text-white/45">Anyone listed here who sends “comphub.” a friend request is accepted automatically (every 2 min). After that their match ID shows up already on the spawn island. The bot never sends requests.</p>
      <div className="mt-3 flex gap-2">
        <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void dazu(); }} maxLength={60} placeholder="Epic name or account ID" className="eingabe min-w-0 flex-1 !py-2" />
        <button type="button" onClick={() => void dazu()} disabled={laeuft || !eingabe.trim()} className="knopf-prim !px-4 !py-2">Add</button>
      </div>
      {fehler && <p className="mt-2 text-xs text-rose-400">{fehler}</p>}
      {liste === null ? <p className="mt-3 text-xs text-white/40">Loading …</p> : !liste.length ? <p className="mt-3 text-xs text-white/40">Nobody approved yet.</p> : (
        <ul className="mt-3 max-h-80 divide-y divide-white/[0.05] overflow-auto text-sm">
          {liste.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <span className="truncate font-semibold text-white">{f.name || f.id.slice(0, 8)}</span>
              {dienst && !dienst.includes(f.id) && <span className="shrink-0 text-[11px] text-amber-400">not yet at the service</span>}
              <span className="zahl ml-auto shrink-0 text-[11px] text-white/35">{datumZeit(f.seit)}</span>
              <button type="button" onClick={() => void weg(f.id)} disabled={laeuft} className="shrink-0 rounded-lg border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:border-rose-500 hover:text-rose-300">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Flaeche>
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
      if (j?.ok) { setFreunde(j.freunde ?? []); setFehler(''); } else setFehler(j?.error ? apiText(j.error) : 'Could not load');
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
  const liveListe = liste.filter((f) => f.live);
  const rest = liste.filter((f) => !f.live);
  return (
    <div className="space-y-7">
      {fehler && <Fehler text={fehler} />}
      <section>
        <TeilKopf titel="Live now" live={live > 0} zusatz={freunde ? `${live} of ${freunde.length} friends in a match` : undefined} rechts={<span className="text-xs text-white/45">refreshes every 5 s</span>} />
        {!freunde && !fehler ? <Laedt /> : liveListe.length === 0 ? (
          <div className="fl flex items-center gap-3 px-5 py-4 text-sm text-white/55"><span className="h-2.5 w-2.5 rounded-full bg-white/20" />{q ? 'No live friend matches this filter.' : 'No friend of the bot account is in a match right now.'}</div>
        ) : (
          <div className={`grid grid-cols-1 gap-3 ${liveListe.length > 1 ? '2xl:grid-cols-2' : ''}`}>
            {liveListe.map((f) => <LiveKarte key={f.id} name={f.name} live={f.live!} seit={f.verlauf.find((v) => v.matchId === f.live?.matchId)?.von} unter={f.zeile ?? undefined} kopiert={kopiert} kopieren={kopieren} />)}
          </div>
        )}
      </section>
      <section>
        <TeilKopf titel="All friends" zusatz={freunde ? <span className="zahl">{freunde.length} · <span className="text-emerald-400">{online} online</span></span> : undefined}
          rechts={<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name…" className="eingabe w-full !py-2 sm:w-72" />} />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rest.map((f, i) => (
              <motion.article key={f.id} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * 0.02 } }} className="fl-fest overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Punkt an={!!f.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{f.name}</p>
                    <p className={`truncate text-[11px] ${f.online ? 'text-emerald-300/80' : 'text-white/35'}`}>{f.online ? f.zeile || 'Online' : f.verlauf[0] ? `Offline · last seen ${bisJetzt(f.verlauf[0].bis)} ago` : 'Offline'}</p>
                  </div>
                </div>
                <Klappe zahl={f.verlauf.length}><Verlauf eintraege={f.verlauf} liveId={null} kopiert={kopiert} kopieren={kopieren} /></Klappe>
              </motion.article>
            ))}
            {freunde && rest.length === 0 && liveListe.length === 0 && <div className="fl px-5 py-8 text-center text-sm text-white/45 md:col-span-2 2xl:col-span-3">No friend matches this filter.</div>}
          </div>
          <div className="h-fit xl:sticky xl:top-28"><Freigaben /></div>
        </div>
      </section>
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
    <div>
      <SeitenKopf klein ueber="VIP tool" titel="Match Finder"
        text="See which match your favourite players are in while a cup runs – copy the match ID and spectate in game."
        rechts={admin && verboten === false && <Segment id="mf-ansicht" wert={ansicht} onWahl={wechsle} wahl={[{ k: 'favoriten', titel: 'Favourites' }, { k: 'freunde', titel: 'All friends (admin)' }]} />} />
      {verboten === null ? <Laedt /> : verboten
        ? <AnmeldeKarte text="The Match-ID Finder is for CompHub VIPs and admins. Sign in with your thecomphub.com account or VIP access key." />
        : admin && ansicht === 'freunde' ? <AlleFreunde kopiert={kopiert} kopieren={kopieren} setVerboten={merkeVerboten} />
          : <Favoriten kopiert={kopiert} kopieren={kopieren} setVerboten={merkeVerboten} />}
    </div>
  );
}
