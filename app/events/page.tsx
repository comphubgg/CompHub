'use client';

// Turnier-Uebersicht im Aufbau von Fortnite Tracker.
//
// Der Betreiber (24.9.2026): "Der Events-Tab soll optisch neu - wie bei
// Fortnite Tracker. Vor allem die Filterung: ... Katalog, Kalender ...
// Filter druecken oder einfach einen Button fuer Hide Ranked Cups ... Wenn
// ich auf Filter druecke, oeffnet sich unten dran eine Art Ding: filtern nach
// Name, Type, Status, Platform ... normalerweise sind immer alle Cups
// angezeigt, ausser die Ranked Cups und die vergangenen ... Hintergrund so wie
// bei Scrims mit Punkten und dahinter der Cup, der gerade live ist oder als
// naechstes kommt."
//
// Also:
//   - oben ein Kopf mit dem Bild des laufenden oder naechsten Cups, darueber
//     das Punkteraster der Scrims-Seite, rechts die Region, darunter vier
//     hervorgehobene Cups;
//   - zwei Reiter: Katalog und Kalender. "Leaderboard" wollte er nicht, und
//     "News" gibt es nicht: Epics Wettkampf-Blog steht hinter einer
//     Bot-Sperre, und seine offene Inhaltsschnittstelle fuehrt keine
//     Wettkampfmeldungen - erfinden kommt nicht in Frage;
//   - im Katalog "Filter" (klappt Suche, Typ, Status, Plattform auf) und
//     "Ranked Cups ausblenden", von Anfang an an; die Cups in Abschnitten
//     Live, Demnaechst und - auf Wunsch - Beendet.
//
// Ein Klick auf eine Kachel fuehrt wie bisher zur Cup-Seite; bei mehreren
// Regionen klappt erst die Auswahl der Region auf.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import T from '@/app/components/T';
import { regionFarbe } from '@/lib/regionFarbe';
import { useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import type { Sprache } from '@/app/lib/sprache';

interface Fenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number;
  /** Fehlt bei nachgetragenen Turnieren. */
  end?: number;
  eventId: string; windowId: string; region: string;
  istFinale: boolean; matchCap?: number;
}
interface Cup {
  id: string; titel: string; untertitel?: string;
  bild?: string; farbe?: string; kapitel?: string; art: string; global: boolean;
  regionen: Record<string, Fenster[]>;
  naechsterStart: number | null;
  letzterStart: number | null;
  live: boolean; vorbei: boolean;
}

/* ================================================================ Einteilung */

/**
 * Die Zeile unter dem Cupnamen: Epics Untertitel, sonst der Zeitraum.
 */
function unterzeile(c: Cup, sprache: Sprache, t: (s: string) => string): string {
  const fenster = Object.values(c.regionen).flat();
  const teile: string[] = [];
  if (c.untertitel) teile.push(c.untertitel);
  const termine = fenster.map((f) => f.begin).filter(Boolean).sort((a, b) => a - b);
  if (termine.length) {
    const tag = (ms: number) => new Date(ms)
      .toLocaleDateString(sprache === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit' });
    const von = tag(termine[0]);
    const bis = tag(termine[termine.length - 1]);
    teile.push(von === bis ? von : `${von} – ${bis}`);
  }
  if (!c.untertitel && fenster.some((f) => f.istFinale)) teile.push(t('mit Finale'));
  return teile.join(' · ');
}

/** Verlauf je Cup-Art - fuer Kacheln ohne Bild von Epic. */
const ART_FARBE: Record<string, string> = {
  championship: 'from-amber-700 to-amber-950',
  division: 'from-sky-700 to-sky-950',
  finals: 'from-violet-700 to-violet-950',
  cash: 'from-emerald-700 to-emerald-950',
  reload: 'from-orange-700 to-orange-950',
  victory: 'from-yellow-700 to-yellow-950',
  ranked: 'from-lime-800 to-lime-950',
  mobile: 'from-cyan-800 to-cyan-950',
  skin: 'from-fuchsia-800 to-fuchsia-950',
  sonstige: 'from-zinc-700 to-zinc-900',
};

const REGION_TEXT: Record<string, string> = {
  GLOBAL: 'Alle Regionen', EU: 'Europe', NAC: 'NA Central', NAW: 'NA West',
  BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/*
 * Die Typen - wie im Vorbild, mit den Namen des Betreibers: "Workshop Cup"
 * ist der Performance Cup, "Shop Cup" der Skin-Cup. Ein Cup kann mehrere
 * Typen tragen ("Victory Cash Cup" ist beides).
 */
type Typ = 'cash' | 'fncs' | 'performance' | 'ranked' | 'skin' | 'victory' | 'andere';
const TYPEN: Array<[Typ, string]> = [
  ['cash', 'Cash Cup'], ['fncs', 'FNCS'], ['performance', 'Performance Cup'],
  ['ranked', 'Ranked Cup'], ['skin', 'Skin Cup'], ['victory', 'Victory Cup'], ['andere', 'Andere'],
];

function typenVon(c: Cup): Set<Typ> {
  const text = `${c.titel} ${c.untertitel ?? ''}`;
  const t = new Set<Typ>();
  if (c.art === 'ranked' || /\branked\b/i.test(text)) t.add('ranked');
  if (c.art === 'skin') t.add('skin');
  if (c.art === 'victory' || /victory/i.test(text)) t.add('victory');
  if (c.art === 'cash' || /cash cup/i.test(text)) t.add('cash');
  if (/fncs|global championship|division/i.test(text)) t.add('fncs');
  if (/performance/i.test(text)) t.add('performance');
  if (!t.size) t.add('andere');
  return t;
}

type Status = 'aktuell' | 'live' | 'kommt' | 'vorbei' | 'alle';
function statusVon(c: Cup): 'live' | 'kommt' | 'vorbei' {
  if (c.live) return 'live';
  if (c.naechsterStart && c.naechsterStart > Date.now()) return 'kommt';
  return 'vorbei';
}

/*
 * Die Plattform. Epics eigene Plattformliste taugt dafuer nicht - bei den
 * Mobile-Cups fehlen dort ausgerechnet iOS und Android. Verlaesslich ist
 * Epics Benennung: Mobile-Cups tragen "Mobile" in Kennung und Titel. Alle
 * anderen Cups sind fuer PC und Konsole offen.
 */
type Plattform = 'alle' | 'pc' | 'konsole' | 'mobile';
function istMobile(c: Cup): boolean {
  return c.art === 'mobile' || /mobile/i.test(c.titel)
    || Object.values(c.regionen).flat().some((f) => /mobile/i.test(f.eventId));
}

/* ================================================================== Zeiten */

function restzeit(ms: number, t: (s: string) => string) {
  const d = ms - Date.now();
  if (d <= 0) return null;
  const mit = (satz: string, n: number) => t(satz).replace('{n}', String(n));
  const std = Math.floor(d / 3_600_000);
  if (std < 1) return mit('in {n} Min.', Math.max(1, Math.floor(d / 60_000)));
  if (std < 48) return mit('in {n} Std.', std);
  return mit('in {n} Tagen', Math.floor(std / 24));
}

function vergangen(ms: number, t: (s: string) => string) {
  const tage = Math.floor((Date.now() - ms) / 86_400_000);
  if (tage < 1) return t('heute');
  if (tage === 1) return t('gestern');
  return t('vor {n} Tagen').replace('{n}', String(tage));
}

/* ============================================================= Kleine Teile */

/** Der Hintergrund der Scrims-Seite: feine Punkte, ein Schimmer im Blau. */
const PUNKTE = {
  backgroundImage:
    'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px),'
    + 'radial-gradient(60% 50% at 50% 0%, rgba(14,165,233,0.10), transparent 70%)',
  backgroundSize: '22px 22px, 100% 100%',
} as const;

/** Die Marke oben links - Live ohne Rot, mit pulsierendem Punkt im Blau. */
function Marke({ c, t }: { c: Cup; t: (s: string) => string }) {
  const s = statusVon(c);
  const text = s === 'live' ? 'Live'
    : s === 'kommt' && c.naechsterStart ? restzeit(c.naechsterStart, t)
      : c.letzterStart ? vergangen(c.letzterStart, t) : t('beendet');
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[10px]
                      font-bold uppercase tracking-wider ring-1 ring-white/15 backdrop-blur-sm ${
      s === 'live' ? 'text-white' : s === 'kommt' ? 'text-sky-300' : 'text-slate-400'}`}>
      {s === 'live' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75
                           motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
        </span>
      )}
      {text}
    </span>
  );
}

function Bild({ c, klasse }: { c: Cup; klasse: string }) {
  if (c.bild) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.bild} alt="" loading="lazy" className={`${klasse} object-cover`} />;
  }
  return (
    <div className={`${klasse} flex items-center justify-center bg-gradient-to-br px-4 ${
      ART_FARBE[c.art] ?? 'from-zinc-800 to-zinc-900'}`}>
      <span className="text-center text-sm font-bold uppercase tracking-wide text-white/80">{c.titel}</span>
    </div>
  );
}

/** Eine Auswahl im Filterfeld - Beschriftung klein darueber, wie im Vorbild. */
function Wahl<W extends string>({ titel, wert, setzen, optionen }: {
  titel: string; wert: W; setzen: (w: W) => void; optionen: Array<[W, string]>;
}) {
  const { t } = useSprache();
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <T>{titel}</T>
      </span>
      <select value={wert} onChange={(e) => setzen(e.target.value as W)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold
                   text-slate-100 outline-none focus:border-sky-500">
        {optionen.map(([w, text]) => <option key={w} value={w}>{t(text)}</option>)}
      </select>
    </label>
  );
}

/* ================================================================== Seite */

export default function EventsPage() {
  const { sprache, t } = useSprache();
  const router = useRouter();
  const [cups, setCups] = useState<Cup[]>([]);
  const [archiv, setArchiv] = useState({ turniere: 0, tage: 0 });
  const [fehler, setFehler] = useState<string | null>(null);
  const [loginNoetig, setLoginNoetig] = useState(false);
  const [laedt, setLaedt] = useState(true);

  const [reiter, setReiter] = useState<'katalog' | 'kalender'>('katalog');
  const [filterOffen, setFilterOffen] = useState(false);
  /** Von Anfang an an - die Ranked Cups sind die unwichtigsten. */
  const [ohneRanked, setOhneRanked] = useState(true);
  const [suche, setSuche] = useState('');
  const [typ, setTyp] = useState<'alle' | Typ>('alle');
  const [status, setStatus] = useState<Status>('aktuell');
  const [plattform, setPlattform] = useState<Plattform>('alle');
  const [region, setRegion] = useState('alle');
  const [offen, setOffen] = useState<string | null>(null);

  // Einmal alles - gefiltert wird hier, nicht beim Server.
  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const r = await fetch('/api/cup-catalog?modus=alle');
        const d = await r.json();
        if (weg) return;
        if (!r.ok) {
          setLoginNoetig(Boolean(d.needsLogin));
          setFehler(d.error ?? 'nicht ladbar');
        } else {
          setCups(d.cups ?? []);
          setArchiv({ turniere: d.archiv?.turniere ?? 0, tage: d.archiv?.tage ?? 0 });
        }
      } catch (e) { if (!weg) setFehler((e as Error).message); }
      finally { if (!weg) setLaedt(false); }
    })();
    return () => { weg = true; };
  }, []);

  /** Alles ausser dem Status - daraus entstehen die Abschnitte. */
  const gefiltert = useMemo(() => {
    const worte = suche.toLowerCase().split(/\s+/).filter(Boolean);
    return cups.filter((c) => {
      const typen = typenVon(c);
      if (ohneRanked && typen.has('ranked') && typ !== 'ranked') return false;
      if (typ !== 'alle' && !typen.has(typ)) return false;
      if (plattform === 'mobile' && !istMobile(c)) return false;
      if ((plattform === 'pc' || plattform === 'konsole') && istMobile(c)) return false;
      if (region !== 'alle' && !c.global && !c.regionen[region]) return false;
      if (worte.length) {
        const heu = `${c.titel} ${c.untertitel ?? ''} ${c.kapitel ?? ''}`.toLowerCase();
        if (!worte.every((w) => heu.includes(w))) return false;
      }
      return true;
    });
  }, [cups, suche, typ, plattform, region, ohneRanked]);

  const abschnitte = useMemo(() => {
    const live = gefiltert.filter((c) => statusVon(c) === 'live')
      .sort((a, b) => (a.letzterStart ?? 0) - (b.letzterStart ?? 0));
    const kommt = gefiltert.filter((c) => statusVon(c) === 'kommt')
      .sort((a, b) => (a.naechsterStart ?? 0) - (b.naechsterStart ?? 0));
    const vorbei = gefiltert.filter((c) => statusVon(c) === 'vorbei')
      .sort((a, b) => (b.letzterStart ?? 0) - (a.letzterStart ?? 0));
    const zeig = (s: 'live' | 'kommt' | 'vorbei') =>
      status === 'alle' || status === s || (status === 'aktuell' && s !== 'vorbei');
    return [
      { schluessel: 'live', titel: 'Live', cups: zeig('live') ? live : [] },
      { schluessel: 'kommt', titel: 'Demnächst', cups: zeig('kommt') ? kommt : [] },
      { schluessel: 'vorbei', titel: 'Beendet', cups: zeig('vorbei') ? vorbei : [] },
    ].filter((a) => a.cups.length);
  }, [gefiltert, status]);

  /** Der Kopf: was gerade laeuft, dann was als Naechstes kommt. */
  const hervor = useMemo(() => {
    const basis = cups.filter((c) => !typenVon(c).has('ranked')
      && (region === 'alle' || c.global || c.regionen[region]));
    return [
      ...basis.filter((c) => statusVon(c) === 'live'),
      ...basis.filter((c) => statusVon(c) === 'kommt')
        .sort((a, b) => (a.naechsterStart ?? 0) - (b.naechsterStart ?? 0)),
    ].slice(0, 4);
  }, [cups, region]);
  const kopfBild = hervor.find((c) => c.bild)?.bild ?? null;

  const heute = useMemo(() => {
    const tag = new Date().toDateString();
    return new Set(gefiltert.filter((c) => Object.values(c.regionen).flat()
      .some((f) => new Date(f.begin).toDateString() === tag)).map((c) => c.id)).size;
  }, [gefiltert]);

  const filterZahl = [suche.trim(), typ !== 'alle', status !== 'aktuell', plattform !== 'alle']
    .filter(Boolean).length;

  const oeffnen = (c: Cup) => {
    const regionen = Object.keys(c.regionen);
    if (c.global || regionen.length <= 1) router.push(`/events/${c.id}`);
    else if (region !== 'alle' && c.regionen[region]) {
      const liste = c.regionen[region];
      const w = liste.find((x) => x.status === 'live') ?? liste.find((x) => x.status === 'kommt');
      router.push(`/events/${c.id}?region=${region}${w ? `&fenster=${encodeURIComponent(w.windowId)}` : ''}`);
    } else setOffen(offen === c.id ? null : c.id);
  };

  return (
    <main className="relative flex-1 bg-zinc-950 text-slate-200" style={PUNKTE}>
      {/* ---------------------------------------------------------- Kopf */}
      <section className="relative overflow-hidden border-b border-zinc-900">
        {kopfBild && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={kopfBild} alt="" aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-35" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/70 to-zinc-950" />
        <div aria-hidden className="absolute inset-0" style={PUNKTE} />

        <div className="relative mx-auto max-w-[1500px] px-4 pb-6 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                <T>Fortnite Events</T>
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-300">
                <T>Bestenlisten und Statistiken zu allen Fortnite-Turnieren - direkt von Epic.</T>
                {archiv.turniere > 0 && (
                  <span className="font-normal text-slate-400">
                    {' '}<T>Im Archiv liegen</T> {archiv.turniere} <T>Turniere an</T> {archiv.tage} <T>Tagen.</T>
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  <T>Region</T>
                </span>
                <select value={region} onChange={(e) => setRegion(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-sm font-semibold
                             text-slate-100 outline-none focus:border-sky-500">
                  <option value="alle">{t('Alle Regionen')}</option>
                  {REGIONEN.map((r) => <option key={r} value={r}>{REGION_TEXT[r]}</option>)}
                </select>
              </label>
              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 p-1">
                <span className="rounded-md bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white">
                  <T>Fortnite Events</T>
                </span>
                <Link href="/scrims"
                  className="rounded-md px-3.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200">
                  <T>Scrims</T>
                </Link>
              </div>
            </div>
          </div>

          {/* Die vier hervorgehobenen Cups - was live ist, dann was kommt. */}
          {hervor.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {hervor.map((c) => (
                <button key={c.id} type="button" onClick={() => oeffnen(c)}
                  className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 text-left
                             shadow-xl transition hover:border-sky-500/60">
                  <div className="relative aspect-video overflow-hidden">
                    <Bild c={c} klasse="h-full w-full transition duration-300 group-hover:scale-105" />
                    <div className="absolute left-2 top-2"><Marke c={c} t={t} /></div>
                  </div>
                  <p className="truncate px-3 py-2.5 text-sm font-bold text-slate-100">{c.titel}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-4 py-6">
        {/* -------------------------------------------- Filter und Haken */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setFilterOffen((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
              filterOffen ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                : 'border-zinc-700 bg-zinc-900/80 text-slate-200 hover:border-sky-500'}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" />
            </svg>
            <T>Filter</T>{filterZahl > 0 && ` (${filterZahl})`}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-200">
            <input type="checkbox" checked={ohneRanked} onChange={(e) => setOhneRanked(e.target.checked)}
              className="h-4 w-4 accent-sky-500" />
            <T>Ranked Cups ausblenden</T>
          </label>
        </div>

        {filterOffen && (
          <div className="mb-4 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4
                          sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                <T>Suche</T>
              </span>
              <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Name des Turniers')}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-slate-100
                           outline-none placeholder:text-slate-600 focus:border-sky-500" />
            </label>
            <Wahl titel="Typ" wert={typ} setzen={setTyp}
              optionen={[['alle', 'Alle'], ...TYPEN] as Array<['alle' | Typ, string]>} />
            <Wahl titel="Status" wert={status} setzen={setStatus} optionen={[
              ['aktuell', 'Live & demnächst'], ['live', 'Live'], ['kommt', 'Demnächst'],
              ['vorbei', 'Beendet'], ['alle', 'Alle'],
            ]} />
            <Wahl titel="Plattform" wert={plattform} setzen={setPlattform} optionen={[
              ['alle', 'Alle'], ['pc', 'PC'], ['konsole', 'Konsole'], ['mobile', 'Mobile'],
            ]} />
          </div>
        )}

        {/* ------------------------------------------------------ Reiter */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 pl-4">
            <div className="flex">
              {([['katalog', 'Katalog'], ['kalender', 'Kalender']] as const).map(([k, titel]) => (
                <button key={k} type="button" onClick={() => setReiter(k)}
                  className={`border-b-2 px-4 py-3 text-sm font-bold transition ${reiter === k
                    ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-300 hover:text-white'}`}>
                  <T>{titel}</T>
                </button>
              ))}
            </div>
            <span className="mr-3 rounded-md bg-zinc-800 px-3 py-1 text-xs text-slate-300">
              {heute} <T>Turniere heute</T>
            </span>
          </div>

          <div className="p-4">
            {loginNoetig && (
              <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 p-4 text-sm">
                <p className="font-semibold text-amber-300"><T>Epic ist noch nicht verbunden</T></p>
              </div>
            )}
            {fehler && !loginNoetig && <p className="mb-4 text-sm text-rose-400">{fehler}</p>}

            {laedt ? <LadeSchirm /> : reiter === 'katalog' ? (
              abschnitte.length ? (
                <div className="space-y-8">
                  {abschnitte.map((a) => (
                    <Abschnitt key={a.schluessel} titel={a.titel} cups={a.cups} offen={offen}
                      oeffnen={oeffnen} regionWaehlen={(c, r) => {
                        const liste = c.regionen[r];
                        const w = liste.find((x) => x.status === 'live') ?? liste.find((x) => x.status === 'kommt');
                        router.push(`/events/${c.id}?region=${r}${w ? `&fenster=${encodeURIComponent(w.windowId)}` : ''}`);
                      }} />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-500"><T>Keine Cups in dieser Auswahl.</T></p>
              )
            ) : (
              <Kalender cups={gefiltert} sprache={sprache} region={region}
                oeffnen={(c) => router.push(`/events/${c.id}`)} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ============================================================ Abschnitte */

function Abschnitt({ titel, cups, offen, oeffnen, regionWaehlen }: {
  titel: string; cups: Cup[]; offen: string | null;
  oeffnen: (c: Cup) => void; regionWaehlen: (c: Cup, r: string) => void;
}) {
  const { sprache, t } = useSprache();
  /*
   * Nach und nach zeichnen: die beendeten sind hunderte. Erst vierundzwanzig,
   * jedes Mal, wenn das Ende ins Bild kommt, vierundzwanzig mehr.
   */
  const [zahl, setZahl] = useState(24);
  const ende = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ende.current;
    if (!el || zahl >= cups.length) return;
    const b = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setZahl((z) => z + 24);
    }, { rootMargin: '400px' });
    b.observe(el);
    return () => b.disconnect();
  }, [zahl, cups.length]);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-3">
        <span className="rounded-lg bg-sky-500/15 px-3 py-1 text-lg font-black uppercase italic tracking-wide
                         text-sky-300 ring-1 ring-sky-500/30">
          <T>{titel}</T>
        </span>
        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-300">
          {cups.length}
        </span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cups.slice(0, zahl).map((c) => {
          const regionen = Object.keys(c.regionen);
          const istOffen = offen === c.id;
          return (
            <article key={c.id}
              className={`group overflow-hidden rounded-xl border bg-zinc-950/70 transition ${
                istOffen ? 'border-sky-500' : 'border-zinc-800 hover:border-zinc-600'}`}>
              <button type="button" onClick={() => oeffnen(c)} className="block w-full text-left">
                <div className="relative aspect-video overflow-hidden bg-zinc-900">
                  <Bild c={c} klasse="h-full w-full transition duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
                  <div className="absolute left-2 top-2"><Marke c={c} t={t} /></div>
                  <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px]
                                   font-semibold uppercase tracking-wider text-slate-200 ring-1 ring-white/10">
                    {c.global ? t('global') : istMobile(c) ? t('Mobile')
                      : `${regionen.length} ${t(regionen.length === 1 ? 'Region' : 'Regionen')}`}
                  </span>
                </div>
                <div className="px-3 pb-3 pt-2">
                  <h3 className="truncate text-sm font-bold text-slate-100">{c.titel}</h3>
                  <p className="truncate text-xs text-slate-500">{unterzeile(c, sprache, t)}</p>
                </div>
              </button>
              {istOffen && (
                <div className="max-h-60 overflow-y-auto border-t border-zinc-800 bg-zinc-950/90">
                  {regionen.map((r) => {
                    const liste = c.regionen[r];
                    const live = liste.find((x) => x.status === 'live');
                    const naechstes = liste.find((x) => x.status === 'kommt');
                    return (
                      <button key={r} type="button" onClick={() => regionWaehlen(c, r)}
                        className="flex w-full items-center justify-between gap-2 border-b border-zinc-900 px-3 py-2
                                   text-left text-xs transition last:border-0 hover:bg-zinc-900">
                        <span className={`flex items-center gap-2 font-medium ${regionFarbe(r).schrift}`}>
                          {live && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
                          {REGION_TEXT[r] ?? r}
                        </span>
                        <span className="text-slate-500">
                          {live ? t('läuft') : naechstes ? restzeit(naechstes.begin, t) : t('beendet')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {zahl < cups.length && <div ref={ende} aria-hidden className="h-px" />}
    </section>
  );
}

/* ================================================================ Kalender */

/*
 * Die naechsten vierzehn Tage, Tag fuer Tag: welche Cups beginnen, in welcher
 * Region, um wie viel Uhr (Ortszeit des Betrachters). Dieselben Filter wie
 * im Katalog - ausser dem Status, der ergibt sich hier aus dem Datum.
 */
function Kalender({ cups, sprache, region, oeffnen }: {
  cups: Cup[]; sprache: Sprache; region: string; oeffnen: (c: Cup) => void;
}) {
  const tage = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const bis = start.getTime() + 14 * 86_400_000;
    const je = new Map<string, Map<string, { cup: Cup; zeiten: Array<{ region: string; begin: number }> }>>();
    for (const c of cups) {
      for (const [r, liste] of Object.entries(c.regionen)) {
        if (region !== 'alle' && !c.global && r !== region) continue;
        for (const f of liste) {
          if (f.begin < start.getTime() || f.begin >= bis) continue;
          const tag = new Date(f.begin); tag.setHours(0, 0, 0, 0);
          const k = String(tag.getTime());
          const tagMap = je.get(k) ?? je.set(k, new Map()).get(k)!;
          const e = tagMap.get(c.id) ?? tagMap.set(c.id, { cup: c, zeiten: [] }).get(c.id)!;
          e.zeiten.push({ region: r, begin: f.begin });
        }
      }
    }
    return [...je.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, m]) => ({
        tag: Number(k),
        cups: [...m.values()]
          .map((e) => ({ ...e, zeiten: e.zeiten.sort((x, y) => x.begin - y.begin) }))
          .sort((x, y) => x.zeiten[0].begin - y.zeiten[0].begin),
      }));
  }, [cups, region]);

  const ort = sprache === 'en' ? 'en-GB' : 'de-DE';
  if (!tage.length) {
    return <p className="py-10 text-center text-sm text-slate-500"><T>In den nächsten vierzehn Tagen steht nichts an.</T></p>;
  }
  return (
    <div className="space-y-6">
      {tage.map((d) => (
        <section key={d.tag}>
          <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-sky-300">
            {new Date(d.tag).toLocaleDateString(ort, { weekday: 'long', day: '2-digit', month: 'long' })}
          </h3>
          <div className="divide-y divide-zinc-800/80 overflow-hidden rounded-xl border border-zinc-800">
            {d.cups.map(({ cup, zeiten }) => (
              <button key={cup.id} type="button" onClick={() => oeffnen(cup)}
                className="flex w-full items-center gap-3 bg-zinc-950/60 px-3 py-2 text-left transition hover:bg-zinc-900">
                <Bild c={cup} klasse="h-10 w-16 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-100">{cup.titel}</span>
                  <span className="block truncate text-xs text-slate-500">{cup.untertitel}</span>
                </span>
                <span className="flex max-w-[55%] flex-wrap justify-end gap-1.5">
                  {zeiten.map((z) => (
                    <span key={`${z.region}-${z.begin}`}
                      className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] tabular-nums text-slate-300">
                      <span className={`font-semibold ${regionFarbe(z.region).schrift}`}>{z.region}</span>{' '}
                      {new Date(z.begin).toLocaleTimeString(ort, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
