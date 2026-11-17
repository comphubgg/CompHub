import Link from 'next/link';
import { liesAwards, naechsterSchritt, phaseVon, type Awards, type Kategorie, type Phase } from '@/lib/awards';
import Countdown from './Countdown';
import { ART_TEXT, PHASE_TEXT, datum, zeitraum } from './anzeige';
import { mitAktuellenFotos } from './fotos';

/*
 * /awards - die Uebersicht der CompHub Awards 2026 (lib/awards): Phase, Countdown, die Kategorien und die Sonderpreise.
 * Vorerst nur fuer den Admin (app/awards/layout.tsx, middleware.ts).
 */

export const dynamic = 'force-dynamic';

function Schritte({ a, phase }: { a: Awards; phase: Phase }) {
  const reihe: Array<{ titel: string; wann: string; aktiv: boolean; vorbei: boolean }> = [
    { titel: 'Nominations', wann: zeitraum(a.phasen.nominierung.start, a.phasen.nominierung.ende), aktiv: phase === 'nominierung', vorbei: ['zwischen', 'abstimmung', 'auswertung', 'ergebnis'].includes(phase) },
    { titel: 'Community vote', wann: zeitraum(a.phasen.abstimmung.start, a.phasen.abstimmung.ende), aktiv: phase === 'abstimmung', vorbei: ['auswertung', 'ergebnis'].includes(phase) },
    { titel: 'Winners', wann: datum(a.phasen.ergebnis.datum), aktiv: phase === 'ergebnis', vorbei: false },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {reihe.map((s, i) => (
        <li key={s.titel} className={`aw-box px-5 py-4 ${s.aktiv ? 'border-sky-400/80 shadow-[0_0_30px_rgba(14,165,233,.25)]' : ''}`}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${s.aktiv ? 'bg-sky-400 text-slate-950' : s.vorbei ? 'bg-sky-900 text-sky-300' : 'bg-slate-800 text-slate-300'}`}>{s.vorbei ? '✓' : i + 1}</span>
            {s.aktiv ? <span className="text-sky-300">Now</span> : s.vorbei ? 'Done' : 'Upcoming'}
          </div>
          <div className="aw-anton mt-2 text-2xl">{s.titel.toUpperCase()}</div>
          <div className="mt-1 text-sm text-slate-400">{s.wann}</div>
        </li>
      ))}
    </ol>
  );
}

function Karte({ k, phase }: { k: Kategorie; phase: Phase }) {
  const sieger = phase === 'ergebnis' ? k.nominierte.find((n) => n.id === k.sieger) : undefined;
  const gesichter = k.nominierte.filter((n) => n.bild).slice(0, 5);
  return (
    <Link href={`/awards/${k.id}`} className="aw-box aw-box-link group flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] ${k.art === 'panel' ? 'border-slate-600 text-slate-300' : 'border-sky-400/50 bg-sky-400/10 text-sky-300'}`}>{ART_TEXT[k.art]}</span>
        <span className="text-xs font-semibold text-slate-500">{k.nominierte.length ? `${k.nominierte.length} nominee${k.nominierte.length === 1 ? '' : 's'}` : 'Nominees TBA'}</span>
      </div>
      <h3 className="aw-anton mt-4 text-3xl leading-none">{k.name.toUpperCase()}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{k.beschreibung}</p>
      {sieger ? (
        <p className="mt-4 text-sm font-bold"><span className="aw-gold">★ Winner:</span> {sieger.name}</p>
      ) : gesichter.length > 0 ? (
        <div className="mt-4 flex -space-x-3">
          {gesichter.map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={n.id} src={n.bild as string} alt="" className="h-10 w-10 rounded-full border-2 border-slate-900 bg-slate-800 object-cover" />
          ))}
        </div>
      ) : null}
      <span className="mt-4 text-sm font-semibold text-sky-400 group-hover:text-sky-300">View category →</span>
    </Link>
  );
}

export default async function AwardsUebersicht() {
  const a = await mitAktuellenFotos(await liesAwards());
  const phase = phaseVon(a);
  const naechst = naechsterSchritt(a);
  const haupt = a.kategorien.filter((k) => !k.sonderpreis);
  const sonder = a.kategorien.filter((k) => k.sonderpreis);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="aw-kicker text-sm sm:text-base">Competitive Fortnite · Season 2026</p>
          <h1 className="aw-anton mt-3 text-6xl leading-[0.95] sm:text-8xl">COMPHUB<br />AWARDS <span className="text-sky-400">2026</span></h1>
          <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
            The year in competitive Fortnite, honoured. A panel of around 15 voters nominates, the <b className="text-sky-400">community votes</b> in the fan categories, and the panel decides the rest.
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
            <span className="h-2 w-2 rounded-full bg-sky-400" />{PHASE_TEXT[phase]}
          </span>
        </div>
        {naechst ? <Countdown ziel={naechst.ziel} was={naechst.was} /> : null}
      </header>

      <section className="mt-12"><Schritte a={a} phase={phase} /></section>

      <section className="mt-16">
        <h2 className="aw-kicker text-sm">Categories</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {haupt.map((k) => <Karte key={k.id} k={k} phase={phase} />)}
        </div>
      </section>

      {sonder.length > 0 && (
        <section className="mt-16">
          <h2 className="aw-kicker text-sm">Special prizes</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sonder.map((k) => <Karte key={k.id} k={k} phase={phase} />)}
          </div>
        </section>
      )}
    </main>
  );
}
