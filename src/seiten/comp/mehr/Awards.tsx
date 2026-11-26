import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt, SEITE, flaggenPfad, useDaten, useJetzt } from './teile';

/*
 * CompHub Awards 2026 im Hub (wie /awards und /awards/[kategorie]): Phasen (Nominierung, Abstimmung, Sieger) mit Countdown, Kategorien und
 * Sonderpreise, je Kategorie die Nominierten mit Foto, Flagge, Team, Statistikzeile, X und Clip; Abstimmen mit dem Epic-Konto (eine Stimme je Konto,
 * zweimal tippen = endgueltig, /api/awards/stimme), nach dem Ergebnis Sieger und Anteile. Noch nicht oeffentlich: die Daten liefert nur /api/awards
 * fuer den Admin (sonst 404) - dann steht die Anmeldekarte da, wie die Vorschau auf der Seite.
 */

interface Nominierter { id: string; art: 'spieler' | 'person' | 'clip'; name: string; epicId?: string | null; team?: string | null; teamLogo?: string | null; land?: string | null; bild?: string | null; statZeile?: string | null; x?: string | null; link?: string | null }
interface Kategorie { id: string; name: string; beschreibung: string; art: 'community' | 'panel' | 'beide'; sonderpreis: boolean; nominierte: Nominierter[]; sieger?: string | null }
interface Awards { titel: string; phasen: { nominierung: { start: string | null; ende: string | null }; abstimmung: { start: string | null; ende: string | null }; ergebnis: { datum: string | null } }; kategorien: Kategorie[] }
type Phase = 'vorher' | 'nominierung' | 'zwischen' | 'abstimmung' | 'auswertung' | 'ergebnis';
interface Antwort { ok: boolean; awards: Awards; phase: Phase; zaehlung?: Record<string, Record<string, number>>; waehler?: number }

const PHASE_TEXT: Record<Phase, string> = { vorher: 'Coming soon', nominierung: 'Nominations', zwischen: 'Nominations closed', abstimmung: 'Voting open', auswertung: 'Counting votes', ergebnis: 'Winners' };
const DATUM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const datum = (s: string | null | undefined) => (s && Number.isFinite(Date.parse(s)) ? DATUM.format(new Date(s)) : 'TBA');
const zeitraum = (a: string | null, b: string | null) => (a || b ? `${datum(a)} – ${datum(b)}` : 'TBA');
const ms = (s: string | null | undefined) => (s && Number.isFinite(Date.parse(s)) ? Date.parse(s) : Infinity);
const stimmtAb = (k: Kategorie) => k.art === 'community' || k.art === 'beide';

function naechster(a: Awards, jetzt: number) {
  const reihe: Array<[string | null, string]> = [[a.phasen.nominierung.start, 'Nominations open'], [a.phasen.nominierung.ende, 'Nominations close'], [a.phasen.abstimmung.start, 'Voting opens'], [a.phasen.abstimmung.ende, 'Voting closes'], [a.phasen.ergebnis.datum, 'Winners revealed']];
  for (const [z, was] of reihe) if (z && ms(z) > jetzt) return { ziel: z, was };
  return null;
}

function Countdown({ ziel, was }: { ziel: string; was: string }) {
  const jetzt = useJetzt(1000);
  const r = Math.max(0, Date.parse(ziel) - jetzt);
  const teile: Array<[string, number]> = [['days', Math.floor(r / 86_400_000)], ['hrs', Math.floor(r / 3_600_000) % 24], ['min', Math.floor(r / 60_000) % 60], ['sec', Math.floor(r / 1000) % 60]];
  return (
    <Glas className="px-6 py-5">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400">{was}</p>
      <div className="mt-3 flex gap-4 sm:gap-6">
        {teile.map(([e, n]) => <div key={e} className="min-w-[3.4rem] text-center"><div className="text-4xl font-black tabular-nums text-white sm:text-5xl">{String(n).padStart(2, '0')}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{e}</div></div>)}
      </div>
    </Glas>
  );
}

function useAwards() {
  const [s] = useDaten<Antwort>('/api/awards');
  return s;
}
function Gesperrt() {
  return <AnmeldeKarte titel="The Awards are not public yet" text="The CompHub Awards 2026 are still in preview — sign in with the admin account to see and edit them, everyone else sees them once they go live." />;
}

/* ---------------------------------------------------------------- Uebersicht */

export function AwardsUebersicht() {
  const s = useAwards();
  const jetzt = useJetzt(60_000);
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok' || !s.d.ok) return <Gesperrt />;
  const { awards: a, phase } = s.d;
  const n = naechster(a, jetzt);
  const schritte = [
    { titel: 'Nominations', wann: zeitraum(a.phasen.nominierung.start, a.phasen.nominierung.ende), aktiv: phase === 'nominierung', vorbei: ['zwischen', 'abstimmung', 'auswertung', 'ergebnis'].includes(phase) },
    { titel: 'Community vote', wann: zeitraum(a.phasen.abstimmung.start, a.phasen.abstimmung.ende), aktiv: phase === 'abstimmung', vorbei: ['auswertung', 'ergebnis'].includes(phase) },
    { titel: 'Winners', wann: datum(a.phasen.ergebnis.datum), aktiv: phase === 'ergebnis', vorbei: false },
  ];
  const karte = (k: Kategorie, i: number) => {
    const sieger = phase === 'ergebnis' ? k.nominierte.find((x) => x.id === k.sieger) : undefined;
    const fotos = k.nominierte.filter((x) => x.bild).slice(0, 5);
    return (
      <motion.div key={k.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }} whileHover={{ y: -4 }}>
        <Link to={`/competitive/awards/${k.id}`} className="group flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl transition hover:border-sky-400/50 hover:shadow-[0_0_34px_rgba(14,165,233,.18)]">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">Community vote</span>
            <span className="text-xs font-semibold text-white/40">{k.nominierte.length ? `${k.nominierte.length} nominee${k.nominierte.length === 1 ? '' : 's'}` : 'Nominees TBA'}</span>
          </div>
          <h3 className="mt-4 text-2xl font-black uppercase leading-none tracking-tight text-white">{k.name}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-white/50">{k.beschreibung}</p>
          {sieger ? <p className="mt-4 text-sm font-bold text-white"><span className="text-amber-300">★ Winner:</span> {sieger.name}</p>
            : fotos.length > 0 ? <div className="mt-4 flex gap-1.5">{fotos.map((x) => <img key={x.id} src={x.bild!} alt="" className="h-12 w-9 rounded-lg object-cover object-top ring-1 ring-white/15" />)}</div> : null}
          <span className="mt-4 text-sm font-semibold text-sky-400 group-hover:text-sky-300">View category →</span>
        </Link>
      </motion.div>
    );
  };
  const haupt = a.kategorien.filter((k) => !k.sonderpreis), sonder = a.kategorien.filter((k) => k.sonderpreis);
  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-400">Competitive Fortnite · Season 2026</p>
          <h1 className="mt-3 text-6xl font-black uppercase leading-[0.92] tracking-tight text-white sm:text-8xl">CompHub<br />Awards <span className="text-sky-400">2026</span></h1>
          <p className="mt-5 max-w-xl text-white/60">The year in competitive Fortnite, honoured. Every award is a <b className="text-sky-300">fan vote</b>: the community decides every category, one vote per Epic account.</p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-sky-300"><span className="h-2 w-2 rounded-full bg-sky-400" />{PHASE_TEXT[phase]}</span>
          {typeof s.d.waehler === 'number' && <span className="ml-2 text-xs text-white/40">{s.d.waehler} voters so far</span>}
        </motion.div>
        {n && <Countdown ziel={n.ziel} was={n.was} />}
      </header>
      <ol className="grid gap-3 sm:grid-cols-3">
        {schritte.map((x, i) => (
          <li key={x.titel} className={`rounded-3xl border bg-white/[0.035] px-5 py-4 backdrop-blur-xl ${x.aktiv ? 'border-sky-400/70 shadow-[0_0_30px_rgba(14,165,233,.22)]' : 'border-white/10'}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/45">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${x.aktiv ? 'bg-sky-400 text-[#06080f]' : x.vorbei ? 'bg-sky-900 text-sky-300' : 'bg-white/10 text-white/60'}`}>{x.vorbei ? '✓' : i + 1}</span>
              {x.aktiv ? <span className="text-sky-300">Now</span> : x.vorbei ? 'Done' : 'Upcoming'}
            </div>
            <div className="mt-2 text-2xl font-black uppercase text-white">{x.titel}</div>
            <div className="mt-1 text-sm text-white/45">{x.wann}</div>
          </li>
        ))}
      </ol>
      <section><h2 className="text-xs font-bold uppercase tracking-[0.3em] text-sky-400">Categories</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{haupt.map(karte)}</div></section>
      {sonder.length > 0 && <section><h2 className="text-xs font-bold uppercase tracking-[0.3em] text-sky-400">Special prizes</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{sonder.map(karte)}</div></section>}
    </div>
  );
}

/* ---------------------------------------------------------------- Kategorie */

export function AwardsKategorie() {
  const { kategorie = '' } = useParams();
  const s = useAwards();
  const jetzt = useJetzt(60_000);
  const [stand, setStand] = useState<{ laedt: boolean; angemeldet: boolean; meine: string | null; fehler?: string }>({ laedt: true, angemeldet: false, meine: null });
  const [wahl, setWahl] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState('');
  const k = s.art === 'ok' && s.d.ok ? s.d.awards.kategorien.find((x) => x.id === kategorie) : undefined;
  const abstimmbar = !!k && stimmtAb(k);
  useEffect(() => {
    if (!abstimmbar) return undefined;
    let weg = false;
    fetch('/api/awards/stimme', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (!weg) setStand({ laedt: false, angemeldet: !!j?.angemeldet, meine: j?.meine?.[kategorie] ?? null, fehler: j?.ok === false ? j.error : undefined }); })
      .catch(() => { if (!weg) setStand({ laedt: false, angemeldet: false, meine: null, fehler: 'Votes are unavailable right now.' }); });
    return () => { weg = true; };
  }, [abstimmbar, kategorie]);

  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok' || !s.d.ok) return <Gesperrt />;
  if (!k) return <FehlerZeile text="This category does not exist." />;
  const { awards: a, phase } = s.d;
  const offen = phase === 'abstimmung';
  const sieger = phase === 'ergebnis' ? k.sieger ?? null : null;
  const zahlen = phase === 'ergebnis' && abstimmbar ? s.d.zaehlung?.[k.id] ?? {} : null;
  const gesamt = zahlen ? Object.values(zahlen).reduce((x, y) => x + y, 0) : 0;
  const darf = abstimmbar && offen && !stand.laedt && stand.angemeldet && !stand.meine;
  const i = a.kategorien.findIndex((x) => x.id === k.id);
  const vor = a.kategorien[i - 1], nach = a.kategorien[i + 1];
  const n = naechster(a, jetzt);

  const abstimmen = async (x: Nominierter) => {
    if (wahl !== x.id) { setWahl(x.id); setMeldung(''); return; }
    setSendet(true); setMeldung('');
    try {
      const r = await fetch('/api/awards/stimme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kategorie: k.id, nominierter: x.id }) });
      const j = await r.json().catch(() => null);
      if (j?.ok) setStand({ laedt: false, angemeldet: true, meine: x.id }); else setMeldung(j?.error || 'Your vote could not be saved - please try again.');
    } catch { setMeldung('Your vote could not be saved - please try again.'); }
    setSendet(false); setWahl(null);
  };

  return (
    <div className="space-y-8">
      <Link to="/competitive/awards" className="text-sm font-semibold text-sky-400 hover:text-sky-300">← CompHub Awards 2026</Link>
      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-400">{k.sonderpreis ? 'Special prize' : 'Category'} · Community vote</p>
          <h1 className="mt-3 text-5xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-7xl">{k.name}</h1>
          <p className="mt-4 max-w-2xl text-white/60">{k.beschreibung}</p>
          <p className="mt-4 text-sm text-white/45">Community vote {zeitraum(a.phasen.abstimmung.start, a.phasen.abstimmung.ende)} · one vote per Epic account
            <span className="ml-2 inline-block rounded-full border border-sky-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">{PHASE_TEXT[phase]}</span></p>
        </motion.div>
        {n && <Countdown ziel={n.ziel} was={n.was} />}
      </header>

      {abstimmbar && offen && !stand.laedt && !stand.angemeldet && (
        <Glas className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/70">Voting is open. Sign in with your Epic Games account to cast your vote — one vote per account.</p>
          <a href={`${SEITE}/api/auth/epic/authorize?zurueck=${encodeURIComponent(`/awards/${k.id}`)}`} className="shrink-0 rounded-xl bg-sky-400 px-5 py-2.5 text-center text-sm font-bold text-[#06080f] transition hover:bg-sky-300">Sign in with Epic Games</a>
        </Glas>
      )}
      {stand.meine && <p className="rounded-2xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-200">Your vote is in. Results are revealed when voting has closed.</p>}
      {meldung && <FehlerZeile text={meldung} />}
      {stand.fehler && stand.fehler !== 'Not found' && <FehlerZeile text={stand.fehler} />}

      {!k.nominierte.length ? (
        <Glas className="px-6 py-16 text-center"><p className="text-3xl font-black uppercase text-white/80">Nominees TBA</p><p className="mt-2 text-sm text-white/45">The shortlist is still being put together.</p></Glas>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {k.nominierte.map((x, j) => {
            const gewaehlt = stand.meine === x.id, gewinner = sieger === x.id;
            const anteil = zahlen && gesamt ? Math.round(((zahlen[x.id] ?? 0) / gesamt) * 1000) / 10 : null;
            return (
              <motion.article key={x.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(j, 12) * 0.04 }}
                className={`relative flex flex-col overflow-hidden rounded-3xl border bg-white/[0.035] backdrop-blur-xl ${gewinner ? 'border-amber-300/80 shadow-[0_0_40px_rgba(252,211,77,.25)]' : gewaehlt ? 'border-sky-400/80 shadow-[0_0_34px_rgba(14,165,233,.3)]' : 'border-white/10'}`}>
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#0a0e18]">
                  {x.bild ? <><img src={x.bild} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl" /><img src={x.bild} alt={x.name} className="absolute inset-0 h-full w-full object-cover object-top" /></>
                    : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky-950/60 to-[#06080f] text-6xl font-black text-white/10">{x.name.slice(0, 1).toUpperCase()}</div>}
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#06080f] via-[#06080f]/60 to-transparent" />
                  {gewinner && <span className="absolute left-3 top-3 rounded-full bg-amber-300 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#06080f]">★ Winner</span>}
                  {gewaehlt && !gewinner && <span className="absolute left-3 top-3 rounded-full bg-sky-400 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#06080f]">Your vote</span>}
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <div className="flex items-center gap-2">{x.land && <img src={flaggenPfad(x.land)} alt="" className="h-[18px] w-[26px] rounded-[3px] object-cover" />}<h3 className="truncate text-2xl font-black uppercase leading-none text-white">{x.name}</h3></div>
                    {(x.team || x.teamLogo) && <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-white/65">{x.teamLogo && <img src={x.teamLogo} alt="" className="h-4 w-4 rounded-sm object-contain" />}<span className="truncate">{x.team}</span></div>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  {x.statZeile && <p className="text-xs font-semibold leading-snug text-sky-200/90">{x.statZeile}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                    {x.x && <a href={`https://x.com/${x.x}`} target="_blank" rel="noreferrer" className="text-white/45 hover:text-sky-300">@{x.x}</a>}
                    {x.link && <a href={x.link} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">{x.art === 'clip' ? '▶ Watch the play' : 'Link'}</a>}
                    {x.epicId && <Link to={`/competitive/player/${x.epicId}`} className="text-white/45 hover:text-sky-300">Profile</Link>}
                  </div>
                  {anteil !== null && (
                    <div className="mt-auto pt-2">
                      <div className="flex justify-between text-xs font-bold text-white/70"><span>Community</span><span>{anteil}%</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-sky-400" initial={{ width: 0 }} animate={{ width: `${anteil}%` }} transition={{ duration: 0.8 }} /></div>
                    </div>
                  )}
                  {darf && (
                    <button type="button" disabled={sendet} onClick={() => void abstimmen(x)}
                      className={`mt-auto rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:opacity-60 ${wahl === x.id ? 'bg-sky-400 text-[#06080f] hover:bg-sky-300' : 'border border-sky-400/50 text-sky-300 hover:bg-sky-400/10'}`}>
                      {wahl === x.id ? (sendet ? 'Saving…' : 'Confirm — final') : 'Vote'}
                    </button>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
      <nav className="flex flex-wrap justify-between gap-3 text-sm font-semibold">
        {vor ? <Link to={`/competitive/awards/${vor.id}`} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-white/80 hover:border-sky-400/50">← {vor.name}</Link> : <span />}
        {nach ? <Link to={`/competitive/awards/${nach.id}`} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-white/80 hover:border-sky-400/50">{nach.name} →</Link> : <span />}
      </nav>
    </div>
  );
}
