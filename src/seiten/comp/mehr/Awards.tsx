import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Flaeche, Marke } from '../../../ds/Bausteine';
import { AnmeldeKarte } from '../tools/Gemeinsam';
import { FehlerZeile, Laedt, SEITE, flaggenPfad, useDaten, useJetzt } from './teile';

/*
 * CompHub Awards 2026 im Hub (wie /awards und /awards/[kategorie]): Phasen (Nominierung, Abstimmung, Sieger) mit Countdown, Kategorien und
 * Sonderpreise, je Kategorie die Nominierten mit Foto, Flagge, Team, Statistikzeile, X und Clip; Abstimmen mit dem Epic-Konto (eine Stimme je Konto,
 * zweimal tippen = endgueltig, /api/awards/stimme), nach dem Ergebnis Sieger und Anteile. Noch nicht oeffentlich: die Daten liefert nur /api/awards
 * fuer den Admin (sonst 404) - dann steht die Anmeldekarte da, wie die Vorschau auf der Seite.
 * Aufbau (Design-System 3.0, 27.11.2026): eine goldene Buehne (Titel, Stand, Countdown in grossen Ziffern, die drei Phasen als Zeitstrahl);
 * jede Kategorie ist eine Karte mit den Hochkant-Fotos ihrer Nominierten oben. Die Kategorie-Seite: schmaler Kopf, alle Kategorien als Chips
 * zum Umschalten, die Nominierten als Fotokarten - steht das Ergebnis fest, der Sieger gross links und die Anteile als Balken daneben.
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

function Countdown({ ziel, was, klein }: { ziel: string; was: string; klein?: boolean }) {
  const jetzt = useJetzt(1000);
  const r = Math.max(0, Date.parse(ziel) - jetzt);
  const teile: Array<[string, number]> = [['days', Math.floor(r / 86_400_000)], ['hrs', Math.floor(r / 3_600_000) % 24], ['min', Math.floor(r / 60_000) % 60], ['sec', Math.floor(r / 1000) % 60]];
  return (
    <div>
      <p className="ueber !text-amber-300">{was}</p>
      <div className={`mt-2 flex ${klein ? 'gap-3' : 'gap-4 sm:gap-6'}`}>
        {teile.map(([e, n]) => <div key={e} className="text-center"><div className={`titel zahl ${klein ? 'text-4xl' : 'text-6xl sm:text-8xl'}`}>{String(n).padStart(2, '0')}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{e}</div></div>)}
      </div>
    </div>
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
    const fotos = k.nominierte.filter((x) => x.bild).slice(0, 6);
    return (
      <motion.div key={k.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ delay: Math.min(i % 4, 4) * 0.05, duration: 0.45 }} className="h-full">
        <Link to={`/competitive/awards/${k.id}`} className="fl-fest fl-klick group flex h-full flex-col overflow-hidden hover:!border-amber-300/40">
          {fotos.length > 0 && (
            <div className="relative flex h-44 gap-px overflow-hidden bg-black">
              {fotos.map((x) => <img key={x.id} src={x.bild!} alt="" loading="lazy" className={`h-full min-w-0 flex-1 object-cover object-top transition duration-700 group-hover:scale-[1.05] ${sieger && sieger.id !== x.id ? 'opacity-35 grayscale' : ''}`} />)}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
              {sieger && <span className="absolute left-3 top-3"><Marke ton="gold">★ Winner: {sieger.name}</Marke></span>}
            </div>
          )}
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300">{k.sonderpreis ? 'Special prize' : 'Community vote'}</span>
              <span className="zahl text-xs font-semibold text-white/40">{k.nominierte.length ? `${k.nominierte.length} nominee${k.nominierte.length === 1 ? '' : 's'}` : 'Nominees TBA'}</span>
            </div>
            <h3 className="titel mt-2 text-4xl">{k.name}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-white/50">{k.beschreibung}</p>
            {sieger && !fotos.length && <p className="mt-3 text-sm font-bold text-white"><span className="text-amber-300">★ Winner:</span> {sieger.name}</p>}
            <span className="knopf-leer mt-4 !text-amber-300">{phase === 'abstimmung' ? 'Vote now' : 'View category'} <span aria-hidden>→</span></span>
          </div>
        </Link>
      </motion.div>
    );
  };
  const haupt = a.kategorien.filter((k) => !k.sonderpreis), sonder = a.kategorien.filter((k) => k.sonderpreis);
  const nominiert = a.kategorien.reduce((x, k) => x + k.nominierte.length, 0);
  return (
    <div className="space-y-8">
      {/* Die Buehne: Titel, Stand, Countdown, Zeitstrahl */}
      <header className="fl-fest relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(70% 120% at 85% 0%, rgba(251,191,36,.16), transparent 60%)' }} />
        <div className="flex flex-col gap-8 px-6 pb-6 pt-10 sm:px-9 lg:flex-row lg:items-end lg:justify-between lg:pt-14">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="min-w-0">
            <p className="ueber !text-amber-300">Competitive Fortnite · Season 2026</p>
            <h1 className="titel mt-2 text-7xl sm:text-8xl xl:text-9xl">CompHub Awards <span className="text-amber-300">2026</span></h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/55">The year in competitive Fortnite, honoured. Every award is a <b className="text-amber-200">fan vote</b>: the community decides every category, one vote per Epic account.</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Marke ton="gold" puls={phase === 'abstimmung' || phase === 'nominierung'}>{PHASE_TEXT[phase]}</Marke>
              {([['Categories', a.kategorien.length], ['Nominees', nominiert], ...(typeof s.d.waehler === 'number' ? [['Voters so far', s.d.waehler]] : [])] as Array<[string, number]>).map(([l, v]) => (
                <p key={l} className="flex items-baseline gap-1.5"><span className="titel zahl text-3xl !text-amber-300">{v.toLocaleString('en')}</span><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{l}</span></p>
              ))}
            </div>
          </motion.div>
          {n && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="shrink-0"><Countdown ziel={n.ziel} was={n.was} /></motion.div>}
        </div>
        <ol className="grid border-t border-white/[0.06] sm:grid-cols-3">
          {schritte.map((x, i) => (
            <li key={x.titel} className={`relative flex items-center gap-4 border-b border-white/[0.06] px-6 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-9 ${x.aktiv ? 'bg-amber-300/[0.07]' : ''}`}>
              {x.aktiv && <span className="absolute inset-x-0 top-0 h-[3px] bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,.8)]" />}
              <span className={`titel text-5xl ${x.aktiv ? '!text-amber-300' : x.vorbei ? '!text-emerald-400/70' : '!text-white/20'}`}>{x.vorbei ? '✓' : i + 1}</span>
              <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{x.aktiv ? <span className="text-amber-300">Now</span> : x.vorbei ? 'Done' : 'Upcoming'}</span><span className="titel block truncate text-2xl">{x.titel}</span><span className="zahl block text-xs text-white/45">{x.wann}</span></span>
            </li>
          ))}
        </ol>
      </header>
      <section>
        <div className="mb-4 flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-amber-300" /><h2 className="titel text-3xl">Categories</h2><span className="zahl text-sm font-semibold text-white/35">{haupt.length}</span><span className="h-px flex-1 bg-white/[0.07]" /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{haupt.map(karte)}</div>
      </section>
      {sonder.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3"><span className="h-6 w-1 rounded-full bg-amber-300" /><h2 className="titel text-3xl">Special prizes</h2><span className="zahl text-sm font-semibold text-white/35">{sonder.length}</span><span className="h-px flex-1 bg-white/[0.07]" /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{sonder.map(karte)}</div>
        </section>
      )}
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
  const anteilVon = (x: Nominierter) => (zahlen && gesamt ? Math.round(((zahlen[x.id] ?? 0) / gesamt) * 1000) / 10 : null);
  const verweise = (x: Nominierter) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
      {x.x && <a href={`https://x.com/${x.x}`} target="_blank" rel="noreferrer" className="text-white/45 hover:text-amber-200">@{x.x}</a>}
      {x.link && <a href={x.link} target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200">{x.art === 'clip' ? '▶ Watch the play' : 'Link'}</a>}
      {x.epicId && <Link to={`/competitive/player/${x.epicId}`} className="text-white/45 hover:text-amber-200">Profile</Link>}
    </div>
  );
  const team = (x: Nominierter) => ((x.team || x.teamLogo) ? <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-white/60">{x.teamLogo && <img src={x.teamLogo} alt="" className="h-4 w-4 rounded-sm object-contain" />}<span className="truncate">{x.team}</span></div> : null);
  // Wer ein Foto hat, zuerst - Karten ohne Foto haben denselben Aufbau, nur ohne das Bild (kein Ersatzbild).
  const reihe = sieger && zahlen ? [...k.nominierte].sort((x, y) => (zahlen[y.id] ?? 0) - (zahlen[x.id] ?? 0)) : [...k.nominierte.filter((x) => x.bild), ...k.nominierte.filter((x) => !x.bild)];
  const gewinner = sieger ? k.nominierte.find((x) => x.id === sieger) ?? null : null;

  const fotoKarte = (x: Nominierter, j: number) => {
    const gewaehlt = stand.meine === x.id, gewinnt = sieger === x.id; const anteil = anteilVon(x);
    return (
      <motion.article key={x.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(j, 12) * 0.04 }}
        className={`fl-fest group relative flex flex-col overflow-hidden ${gewinnt ? '!border-amber-300/70 shadow-[0_0_40px_-10px_rgba(252,211,77,.6)]' : gewaehlt ? '!border-amber-300/50' : wahl === x.id ? '!border-amber-300/40' : ''}`}>
        {x.bild && (
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/60">
            <img src={x.bild} alt={x.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top transition duration-700 group-hover:scale-[1.05]" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-fl to-transparent" />
            <span className="absolute left-3 top-3 flex gap-1.5">{gewinnt && <Marke ton="gold">★ Winner</Marke>}{gewaehlt && !gewinnt && <Marke ton="gold">Your vote</Marke>}</span>
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2 p-4">
          {!x.bild && (gewinnt || gewaehlt) && <span>{gewinnt ? <Marke ton="gold">★ Winner</Marke> : <Marke ton="gold">Your vote</Marke>}</span>}
          <div>
            <div className="flex items-center gap-2">{x.land && <img src={flaggenPfad(x.land)} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />}<h3 className="titel truncate text-3xl">{x.name}</h3></div>
            {team(x)}
          </div>
          {x.statZeile && <p className="text-xs font-semibold leading-snug text-white/70">{x.statZeile}</p>}
          {verweise(x)}
          {anteil !== null && (
            <div className="mt-auto pt-2">
              <div className="flex justify-between text-xs font-bold text-white/70"><span>Community</span><span className="zahl">{anteil}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-amber-300" initial={{ width: 0 }} animate={{ width: `${anteil}%` }} transition={{ duration: 0.8 }} /></div>
            </div>
          )}
          {darf && (
            <button type="button" disabled={sendet} onClick={() => void abstimmen(x)}
              className={`mt-auto rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:opacity-60 ${wahl === x.id ? 'bg-amber-300 text-[#04050a] hover:brightness-110' : 'border border-amber-300/50 text-amber-200 hover:bg-amber-300/10'}`}>
              {wahl === x.id ? (sendet ? 'Saving…' : 'Confirm — final') : 'Vote'}
            </button>
          )}
        </div>
      </motion.article>
    );
  };

  return (
    <div className="space-y-4">
      {/* Kopf: Kategorie, Stand, Countdown */}
      <header className="fl-fest relative isolate flex flex-wrap items-end justify-between gap-x-8 gap-y-5 overflow-hidden px-6 py-6 sm:px-8">
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(60% 140% at 90% 0%, rgba(251,191,36,.14), transparent 60%)' }} />
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className="min-w-0">
          <Link to="/competitive/awards" className="knopf-leer !text-xs !text-amber-300">← CompHub Awards 2026</Link>
          <p className="ueber mt-3 !text-amber-300">{k.sonderpreis ? 'Special prize' : 'Category'} · Community vote</p>
          <h1 className="titel mt-1 text-6xl sm:text-7xl">{k.name}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-white/55">{k.beschreibung}</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/45"><Marke ton="gold" puls={offen}>{PHASE_TEXT[phase]}</Marke><span className="zahl">Community vote {zeitraum(a.phasen.abstimmung.start, a.phasen.abstimmung.ende)} · one vote per Epic account</span></p>
        </motion.div>
        {n && <div className="shrink-0"><Countdown klein ziel={n.ziel} was={n.was} /></div>}
      </header>

      {/* Alle Kategorien zum Umschalten */}
      <div className="ohne-leiste flex items-center gap-1.5 overflow-x-auto">
        {a.kategorien.map((x) => <Link key={x.id} to={`/competitive/awards/${x.id}`} className={`chip ${x.id === k.id ? '!border-amber-300/60 !bg-amber-300/15 !text-white' : ''}`}>{x.name}</Link>)}
      </div>

      {abstimmbar && offen && !stand.laedt && !stand.angemeldet && (
        <div className="fl-fest flex flex-col gap-3 !rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/70">Voting is open. Sign in with your Epic Games account to cast your vote — one vote per account.</p>
          <a href={`${SEITE}/api/auth/epic/authorize?zurueck=${encodeURIComponent(`/awards/${k.id}`)}`} className="knopf-prim shrink-0 !bg-amber-300">Sign in with Epic Games</a>
        </div>
      )}
      {stand.meine && <p className="rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">Your vote is in. Results are revealed when voting has closed.</p>}
      {meldung && <FehlerZeile text={meldung} />}
      {stand.fehler && stand.fehler !== 'Not found' && <FehlerZeile text={stand.fehler} />}

      {!k.nominierte.length ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-5 py-6 text-center text-sm text-white/50">The shortlist for this category is still being put together — nominees appear here as soon as they are set.</p>
      ) : gewinner ? (
        /* Ergebnis: Sieger gross, daneben alle mit ihrem Anteil */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-[7.5rem]">{fotoKarte(gewinner, 0)}</div>
          <Flaeche fest className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3"><span className="h-4 w-1 rounded-full bg-amber-300" /><h2 className="titel text-xl">The vote</h2>{gesamt > 0 && <span className="zahl text-xs font-semibold text-white/40">{gesamt.toLocaleString('en')} votes</span>}</div>
            <ul>
              {reihe.map((x, j) => { const anteil = anteilVon(x); return (
                <li key={x.id} className={`flex items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 last:border-b-0 ${x.id === sieger ? 'bg-amber-300/[0.06]' : ''}`}>
                  <span className={`titel w-8 shrink-0 text-3xl ${x.id === sieger ? '!text-amber-300' : '!text-white/30'}`}>{j + 1}</span>
                  {x.bild && <img src={x.bild} alt="" loading="lazy" className="h-14 w-[42px] shrink-0 rounded-lg object-cover object-top" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">{x.land && <img src={flaggenPfad(x.land)} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />}<span className="titel truncate text-2xl">{x.name}</span>{stand.meine === x.id && <Marke ton="gold">Your vote</Marke>}</div>
                    {anteil !== null && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><motion.div className={`h-full rounded-full ${x.id === sieger ? 'bg-amber-300' : 'bg-white/35'}`} initial={{ width: 0 }} whileInView={{ width: `${anteil}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: Math.min(j, 10) * 0.04 }} /></div>}
                    <div className="mt-1">{verweise(x)}</div>
                  </div>
                  {anteil !== null && <span className="titel zahl w-20 shrink-0 text-right text-3xl">{anteil}%</span>}
                </li>); })}
            </ul>
          </Flaeche>
        </div>
      ) : (
        <div className="grid grid-cols-2 items-start gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{reihe.map(fotoKarte)}</div>
      )}
      <nav className="flex flex-wrap justify-between gap-3">
        {vor ? <Link to={`/competitive/awards/${vor.id}`} className="knopf">← {vor.name}</Link> : <span />}
        {nach ? <Link to={`/competitive/awards/${nach.id}`} className="knopf">{nach.name} →</Link> : <span />}
      </nav>
    </div>
  );
}
