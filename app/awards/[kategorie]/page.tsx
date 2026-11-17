import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auszaehlen, liesAwards, liesStimmen, naechsterSchritt, phaseVon, stimmtAb } from '@/lib/awards';
import Countdown from '../Countdown';
import { ART_TEXT, PHASE_TEXT, zeitraum } from '../anzeige';
import { mitAktuellenFotos } from '../fotos';
import Abstimmung from './Abstimmung';

/*
 * /awards/<kategorie> - die Nominierten einer Kategorie als Karten (Foto, Flagge, Team, Zahlenzeile) und, in Kategorien mit Community-Abstimmung,
 * die Abstimmung (eine Stimme je Epic-Konto). Stimmenzahlen erst in der Ergebnis-Phase. Vorerst nur fuer den Admin (app/awards/layout.tsx).
 */

export const dynamic = 'force-dynamic';

export default async function AwardsKategorie({ params }: { params: Promise<{ kategorie: string }> }) {
  const { kategorie } = await params;
  const a = await mitAktuellenFotos(await liesAwards());
  const k = a.kategorien.find((x) => x.id === kategorie);
  if (!k) notFound();
  const phase = phaseVon(a);
  const naechst = naechsterSchritt(a);
  let zahlen: Record<string, number> | null = null;
  if (phase === 'ergebnis' && stimmtAb(k)) {
    try { zahlen = auszaehlen(await liesStimmen())[k.id] ?? {}; } catch { zahlen = null; }
  }
  const index = a.kategorien.findIndex((x) => x.id === k.id);
  const vor = a.kategorien[index - 1];
  const nach = a.kategorien[index + 1];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <Link href="/awards" className="text-sm font-semibold text-sky-400 hover:text-sky-300">← CompHub Awards 2026</Link>
      <header className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="aw-kicker text-sm">{k.sonderpreis ? 'Special prize' : 'Category'} · {ART_TEXT[k.art]}</p>
          <h1 className="aw-anton mt-3 text-5xl leading-[0.95] sm:text-7xl">{k.name.toUpperCase()}</h1>
          <p className="mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">{k.beschreibung}</p>
          <p className="mt-4 text-sm text-slate-400">
            {stimmtAb(k)
              ? <>Nominated by the panel · community vote {zeitraum(a.phasen.abstimmung.start, a.phasen.abstimmung.ende)} · one vote per Epic account</>
              : <>Nominated and decided by the panel</>}
            <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-sky-400/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300">{PHASE_TEXT[phase]}</span>
          </p>
        </div>
        {naechst ? <Countdown ziel={naechst.ziel} was={naechst.was} /> : null}
      </header>

      <Abstimmung
        kategorie={k.id}
        nominierte={k.nominierte}
        abstimmbar={stimmtAb(k)}
        offen={phase === 'abstimmung'}
        sieger={phase === 'ergebnis' ? k.sieger ?? null : null}
        zahlen={zahlen}
      />

      <nav className="mt-16 flex flex-wrap justify-between gap-3 text-sm font-semibold">
        {vor ? <Link href={`/awards/${vor.id}`} className="aw-box aw-box-link px-4 py-3 text-slate-200">← {vor.name}</Link> : <span />}
        {nach ? <Link href={`/awards/${nach.id}`} className="aw-box aw-box-link px-4 py-3 text-slate-200">{nach.name} →</Link> : <span />}
      </nav>
    </main>
  );
}
