import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Kennzahl, Laedt, Segment } from '../../ds/Bausteine';
import MvSeite from '../streamer/mv/Seite';
import type { BuehnenGriff } from '../streamer/mv/Multiview';
import { Kanalbild, Zeichen, Zuschauer } from '../streamer/Teile';
import { kurzZahl, vorschaubild } from '../streamer/live';

/*
 * Live Streams - neu gebaut auf dem Design-System 3.0 (28.11.2026). Betreiber: "Live Streams und Multiview in EINER Seite".
 *
 * Die Seite IST die Multiview (src/seiten/streamer/mv, die der echten Seite app/streams/**): links die Seitenleiste (Strg + B) mit "Add stream",
 * Liste zum Ziehen, Ordnern, Titelfiltern, "Save wall as folder", Qualitaet, Steuerung, Einstellungen und Einzelansicht; rechts die Wand.
 * Ist die Wand leer, steht auf ihr die Buehne: wer gerade live ist - der meistgesehene Stream gross, die anderen als Bildkarten, Regionen und
 * Suche, Offline-Kanaele eingeklappt. Ein Klick legt einen Kanal auf die Wand (oder nimmt ihn herunter). Laufen Streams, liegt dieselbe
 * Uebersicht als Schublade "Live now" rechts auf der Wand.
 *
 * Daten wie /streams der echten Seite: die Ordner des Admins (/api/dashboard: Fortnite Pros EU, NA, Streamer) und ihr Live-Stand
 * (POST /api/live-status: isLive, viewers, title, bild = Twitch-Profilbild), jede Minute neu. Vorschaubilder von static-cdn.jtvnw.net.
 */

interface Streamer { twitch: string; twitter?: string; anzeige?: string }
interface Ordner { id: string; name: string; streamers: Streamer[] }
interface Stand { isLive: boolean; viewers: number; title?: string; bild?: string | null; unbekannt?: boolean }
interface Kanal { twitch: string; name: string; ordner: string[]; stand?: Stand }

const TAKT = 60_000;
const SANFT = [0.22, 1, 0.36, 1] as const;

/** Kurzer Regionsname: "Fortnite Pros EU" -> "EU". */
const kurz = (name: string) => name.replace(/^Fortnite Pros\s*/i, '') || name;

/** Laedt Ordner und Live-Stand - einmal fuer die ganze Seite (Buehne und Schublade lesen dasselbe). */
function useUebersicht() {
  const [ordner, setOrdner] = useState<Ordner[] | null>(null);
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [takt, setTakt] = useState(() => Math.floor(Date.now() / TAKT));
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then((j) => setOrdner(Array.isArray(j?.folders) ? j.folders : []))
      .catch(() => { setOrdner([]); setFehler('The stream folders could not be loaded.'); });
  }, []);

  // Alle Kanaele aus allen Ordnern, Doppeltes zusammengelegt (ein Kanal kann in mehreren Ordnern stehen).
  const kanaele = useMemo(() => {
    const m = new Map<string, Kanal>();
    for (const o of ordner ?? []) {
      for (const s of o.streamers ?? []) {
        const t = String(s.twitch || '').trim().toLowerCase();
        if (!t || t === 'darmfn_') continue;
        const k = m.get(t) ?? { twitch: t, name: s.anzeige || t, ordner: [] };
        if (!k.ordner.includes(o.name)) k.ordner.push(o.name);
        m.set(t, k);
      }
    }
    return [...m.values()];
  }, [ordner]);

  const ladeStand = useCallback(() => {
    if (!kanaele.length) return;
    fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: kanaele.map((k) => k.twitch) }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Record<string, Stand>) => {
        // Unbekannt (Twitch nicht erreichbar): den letzten Stand behalten statt "offline" zu raten.
        setStaende((alt) => { const n = { ...alt }; for (const [k, v] of Object.entries(j)) if (!v?.unbekannt) n[k.toLowerCase()] = v; return n; });
        setTakt(Math.floor(Date.now() / TAKT));
        setFehler('');
      })
      .catch(() => setFehler('Live status is not available right now – the list tries again every minute.'));
  }, [kanaele]);
  useEffect(() => { ladeStand(); const id = window.setInterval(ladeStand, TAKT); return () => window.clearInterval(id); }, [ladeStand]);

  const mitStand = useMemo(() => kanaele.map((k) => ({ ...k, stand: staende[k.twitch] })), [kanaele, staende]);
  return { ordner, kanaele: mitStand, takt, fehler, geladen: Object.keys(staende).length > 0 };
}
type Uebersicht = ReturnType<typeof useUebersicht>;

/* ------------------------------------------------------------------ Teile */

/** Vorschaubild eines laufenden Streams - laedt es nicht, bleibt eine ruhige dunkle Flaeche (nie ein kaputtes Bild). */
function Vorschau({ login, takt, gross = false }: { login: string; takt: number; gross?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [login]);
  if (kaputt) return <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_120%,rgb(var(--akz)/0.25),transparent_60%),linear-gradient(180deg,#121520,#06070c)]" aria-hidden />;
  return <img src={vorschaubild(login, takt, gross ? 1280 : 640, gross ? 720 : 360)} alt="" loading="lazy" draggable={false} onError={() => setKaputt(true)}
    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" />;
}

/** Ruhige LIVE-Marke (ohne Dauer-Animation - viele Karten auf einer Seite). */
const Live = ({ gross = false }: { gross?: boolean }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-md bg-red-600 font-extrabold uppercase tracking-[0.16em] text-white ${gross ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[9px]'}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-white" />Live
  </span>
);

/** Auf der Wand oder nicht - die Ecke unten rechts auf dem Bild. */
function WandKnopf({ an, gross = false }: { an: boolean; gross?: boolean }) {
  return (
    <span className={`absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg font-bold transition ${gross ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-[11px]'}
      ${an ? 'bg-akz text-[#04050a]' : `bg-black/70 text-white backdrop-blur ${gross ? '' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}`}>
      <Zeichen name={an ? 'haken' : 'plus'} className={gross ? 'h-4 w-4' : 'h-3.5 w-3.5'} />{an ? 'On your wall' : 'Add to wall'}
    </span>
  );
}

function Regionen({ k }: { k: Kanal }) {
  return <>{k.ordner.map((o) => <span key={o} className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{kurz(o)}</span>)}</>;
}

/** Der meistgesehene Stream: gross, Titel in zwei Zeilen, Knopf zum Hinlegen gut sichtbar. */
function Hauptstream({ k, takt, an, klick }: { k: Kanal; takt: number; an: boolean; klick: () => void }) {
  return (
    <motion.article initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: SANFT }}
      className={`fl-fest group relative overflow-hidden sm:col-span-2 lg:row-span-2 ${an ? '!border-akz/50' : ''}`}>
      <button type="button" onClick={klick} className="relative block aspect-video w-full overflow-hidden bg-black text-left lg:aspect-auto lg:h-full lg:min-h-[22rem]">
        <Vorschau login={k.twitch} takt={takt} gross />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
        <div className="absolute left-4 top-4 flex items-center gap-2"><Live gross /><span className="hidden rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 backdrop-blur sm:inline">Most watched</span></div>
        <div className="absolute right-4 top-4"><Zuschauer n={k.stand?.viewers ?? 0} /></div>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4 pb-14 sm:p-5 sm:pr-48">
          <Kanalbild src={k.stand?.bild} className="hidden h-14 w-14 rounded-xl ring-1 ring-white/15 sm:block" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-3"><span className="titel truncate text-3xl sm:text-4xl lg:text-5xl">{k.name}</span><Regionen k={k} /></div>
            <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-white/65">{k.stand?.title || 'Live on Twitch'}</p>
          </div>
        </div>
        <WandKnopf an={an} gross />
      </button>
    </motion.article>
  );
}

function StreamKachel({ k, i, takt, an, klick }: { k: Kanal; i: number; takt: number; an: boolean; klick: () => void }) {
  return (
    <motion.article layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: Math.min(i, 14) * 0.03, duration: 0.4, ease: SANFT }}
      className={`fl-fest fl-klick group flex flex-col overflow-hidden ${an ? '!border-akz/50' : ''}`}>
      <button type="button" onClick={klick} className="relative block aspect-video w-full overflow-hidden bg-black text-left">
        <Vorschau login={k.twitch} takt={takt} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-3 top-3"><Live /></span>
        <span className="absolute right-3 top-3"><Zuschauer n={k.stand?.viewers ?? 0} /></span>
        <WandKnopf an={an} />
      </button>
      <div className="flex flex-1 items-start gap-3 px-4 pb-4 pt-3">
        <Kanalbild src={k.stand?.bild} className="h-10 w-10 rounded-xl ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a href={`https://twitch.tv/${k.twitch}`} target="_blank" rel="noreferrer" className="truncate text-[15px] font-bold text-white transition hover:text-akz">{k.name}</a>
            <Regionen k={k} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/50" title={k.stand?.title}>{k.stand?.title || 'Live on Twitch'}</p>
        </div>
      </div>
    </motion.article>
  );
}

/** Eine Zeile in der Schublade: Bild klein, Name, Zuschauer, Titel; ein Klick legt hin oder nimmt herunter. */
function SchubladenZeile({ k, takt, an, klick }: { k: Kanal; takt: number; an: boolean; klick: () => void }) {
  return (
    <button type="button" onClick={klick} className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.05] ${an ? 'bg-akz/10' : ''}`}>
      <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black">
        <Vorschau login={k.twitch} takt={takt} />
        <span className="zahl absolute bottom-1 right-1 rounded bg-black/75 px-1.5 text-[10px] font-bold text-white">{kurzZahl(k.stand?.viewers ?? 0)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><span className="truncate text-sm font-bold text-white">{k.name}</span><Regionen k={k} /></span>
        <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/45">{k.stand?.title || 'Live on Twitch'}</span>
      </span>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition ${an ? 'bg-akz text-[#04050a]' : 'bg-white/[0.06] text-white/60 group-hover:text-white'}`}>
        <Zeichen name={an ? 'haken' : 'plus'} className="h-4 w-4" />
      </span>
    </button>
  );
}

/** Offline-Kanaele: eingeklappt, dicht; Profilbild oder nichts. */
function Offline({ liste, aufWand, umschalten, schmal = false }: { liste: Kanal[]; aufWand: Set<string>; umschalten: (k: string) => void; schmal?: boolean }) {
  const [auf, setAuf] = useState(false);
  if (!liste.length) return null;
  return (
    <section className={schmal ? 'px-2 py-2' : 'fl-fest p-4'}>
      <button type="button" onClick={() => setAuf(!auf)} className="flex w-full items-center gap-3 text-left">
        <span className={`titel ${schmal ? 'text-xl' : 'text-2xl'}`}>Offline</span>
        <span className="zahl text-xs text-white/40">{liste.length} channels</span>
        <span className="ml-auto text-xs text-white/40">{auf ? 'Hide' : 'Show all'}</span>
        <motion.span animate={{ rotate: auf ? 180 : 0 }} className="text-white/40">▾</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {auf && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`mt-3 grid gap-1 ${schmal ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'}`}>
              {liste.map((k) => {
                const an = aufWand.has(k.twitch);
                return (
                  <div key={k.twitch} className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.04] ${an ? 'bg-akz/10' : ''}`}>
                    <Kanalbild src={k.stand?.bild} className="h-7 w-7 rounded-lg opacity-60 grayscale" />
                    <a href={`https://twitch.tv/${k.twitch}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-white/60 hover:text-white">{k.name}</a>
                    <button type="button" title={an ? 'Remove from your wall' : 'Add to your wall anyway'} onClick={() => umschalten(k.twitch)}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition ${an ? 'text-akz' : 'text-white/30 hover:text-white sm:opacity-0 sm:group-hover:opacity-100'}`}>
                      <Zeichen name={an ? 'haken' : 'plus'} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ------------------------------------------------------------------ Buehne */

function Buehne({ u, g }: { u: Uebersicht; g: BuehnenGriff }) {
  const [region, setRegion] = useState<string>('alle');
  const [suche, setSuche] = useState('');
  const q = suche.trim().toLowerCase();
  const gefiltert = u.kanaele.filter((k) => (region === 'alle' || k.ordner.includes(region)) && (!q || k.name.toLowerCase().includes(q) || k.twitch.includes(q) || (k.stand?.title ?? '').toLowerCase().includes(q)));
  const live = gefiltert.filter((k) => k.stand?.isLive).sort((a, b) => (b.stand?.viewers ?? 0) - (a.stand?.viewers ?? 0));
  const offline = gefiltert.filter((k) => !k.stand?.isLive).sort((a, b) => a.name.localeCompare(b.name));
  const zuschauer = live.reduce((s, k) => s + (k.stand?.viewers ?? 0), 0);
  const regionen = [{ k: 'alle', titel: 'All' }, ...(u.ordner ?? []).map((o) => ({ k: o.name, titel: kurz(o.name) }))];
  const keiner = <p className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">Nobody{region !== 'alle' ? ` in ${kurz(region)}` : ''} is live right now{q ? ' for this search' : ''}.</p>;

  const suchfeld = (
    <label className="relative block min-w-0 flex-1">
      <Zeichen name="finder" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
      <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name or stream title (e.g. “finals”)" className="eingabe w-full !py-2 !pl-9" />
    </label>
  );

  /* ---- Schublade auf der laufenden Wand */
  if (g.kompakt) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-3 border-b border-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <span className="h-5 w-1 rounded-full bg-red-500" />
            <h2 className="titel text-3xl">Live now</h2>
            <span className="zahl text-sm font-bold text-red-300">{live.length}</span>
            <button type="button" onClick={g.zu} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/[0.06] hover:text-white">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {regionen.map((r) => <button key={r.k} type="button" onClick={() => setRegion(r.k)} className={`chip ${region === r.k ? 'chip-an' : ''}`}>{r.titel}</button>)}
          </div>
          {suchfeld}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {u.fehler && <p className="px-2 py-2 text-xs text-amber-200/80">{u.fehler}</p>}
          {!u.geladen ? <Laedt text="Checking who's live" /> : live.length ? live.map((k) => <SchubladenZeile key={k.twitch} k={k} takt={u.takt} an={g.aufWand.has(k.twitch)} klick={() => g.umschalten(k.twitch)} />) : <div className="p-2">{keiner}</div>}
          {offline.length > 0 && <div className="mt-2 border-t border-white/[0.06] pt-1"><Offline liste={offline} aufWand={g.aufWand} umschalten={g.umschalten} schmal /></div>}
        </div>
      </div>
    );
  }

  /* ---- Buehne auf der leeren Wand */
  const [erster, ...rest] = live;
  return (
    <div className="space-y-5 px-4 pb-10 pt-6 lg:px-8">
      {/* Kopf: Titel links, Kennzahlen rechts - eine Zeile */}
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: SANFT }} className="min-w-0">
          <p className="ueber">Watch · Multiview</p>
          <h1 className="titel mt-1 text-6xl lg:text-7xl">Live streams</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/55">Pros, creators and watch parties on Twitch. Click a stream to put it on your wall – the panel on the left (<kbd className="rounded border border-white/15 px-1 font-mono text-[11px]">Ctrl</kbd>+<kbd className="rounded border border-white/15 px-1 font-mono text-[11px]">B</kbd>) has folders, filters, quality and the single view.</p>
        </motion.div>
        {u.geladen && (
          <div className="flex gap-8 sm:gap-10">
            <Kennzahl label="Live" wert={live.length} ton="rot" />
            <Kennzahl label="Watching" wert={zuschauer} format={(n) => kurzZahl(Math.round(n))} />
            <Kennzahl label="Tracked" wert={gefiltert.length} />
          </div>
        )}
      </header>

      {/* Filter: Regionen und Suche */}
      <div className="flex flex-wrap items-center gap-3">
        <Segment id="st-region" wert={region} wahl={regionen} onWahl={setRegion} />
        <div className="flex min-w-[14rem] flex-1 sm:max-w-md">{suchfeld}</div>
        {g.aufWand.size > 0 && <span className="text-xs text-white/45"><span className="zahl font-bold text-akz">{g.aufWand.size}</span> on your wall, offline or hidden</span>}
      </div>

      {u.fehler && <p className="text-xs text-amber-200/80">{u.fehler}</p>}
      {!u.ordner || (!u.geladen && !u.fehler) ? <Laedt text="Checking who's live" /> : !live.length ? keiner : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
          <Hauptstream k={erster} takt={u.takt} an={g.aufWand.has(erster.twitch)} klick={() => g.umschalten(erster.twitch)} />
          <AnimatePresence>
            {rest.map((k, i) => <StreamKachel key={k.twitch} k={k} i={i} takt={u.takt} an={g.aufWand.has(k.twitch)} klick={() => g.umschalten(k.twitch)} />)}
          </AnimatePresence>
        </div>
      )}

      {u.geladen && <Offline liste={offline} aufWand={g.aufWand} umschalten={g.umschalten} />}
    </div>
  );
}

export default function Streams() {
  const u = useUebersicht();
  return <MvSeite buehne={(g) => <Buehne u={u} g={g} />} />;
}
