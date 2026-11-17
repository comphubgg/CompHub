'use client';

import { useEffect, useState } from 'react';
import SpielerPlatzhalter from '@/app/components/SpielerPlatzhalter';
import { flaggenPfad } from '@/components/TeamFlagge';
import type { Nominierter } from '@/lib/awards';

/*
 * Die Nominierten einer Kategorie als Karten - und die Community-Abstimmung (app/api/awards/stimme).
 *
 * Abstimmen nur mit bei Epic bestaetigtem Konto; eine Stimme je Kategorie, endgueltig (deshalb ein zweiter Klick zum Bestaetigen). Wie andere gestimmt
 * haben, sieht niemand vor der Ergebnis-Phase: die Schnittstelle nennt nur die eigene Stimme, Zahlen kommen erst mit den Ergebnissen (zahlen).
 */

interface Props {
  kategorie: string;
  nominierte: Nominierter[];
  abstimmbar: boolean;
  offen: boolean;
  sieger: string | null;
  zahlen: Record<string, number> | null;
}

type Stand = { laedt: true } | { laedt: false; angemeldet: boolean; meine: string | null; fehler?: string };

export default function Abstimmung({ kategorie, nominierte, abstimmbar, offen, sieger, zahlen }: Props) {
  const [stand, setStand] = useState<Stand>({ laedt: true });
  const [wahl, setWahl] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState('');

  useEffect(() => {
    if (!abstimmbar) return;
    let weg = false;
    fetch('/api/awards/stimme', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!weg) setStand({ laedt: false, angemeldet: !!j?.angemeldet, meine: j?.meine?.[kategorie] ?? null, fehler: j?.ok === false ? j.error : undefined }); })
      .catch(() => { if (!weg) setStand({ laedt: false, angemeldet: false, meine: null, fehler: 'Votes are unavailable right now.' }); });
    return () => { weg = true; };
  }, [abstimmbar, kategorie]);

  const abstimmen = async (n: Nominierter) => {
    if (wahl !== n.id) { setWahl(n.id); setMeldung(''); return; }
    setSendet(true); setMeldung('');
    try {
      const r = await fetch('/api/awards/stimme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kategorie, nominierter: n.id }) });
      const j = await r.json().catch(() => null);
      if (j?.ok) setStand({ laedt: false, angemeldet: true, meine: n.id });
      else setMeldung(j?.error || 'Your vote could not be saved - please try again.');
    } catch { setMeldung('Your vote could not be saved - please try again.'); }
    setSendet(false); setWahl(null);
  };

  const gesamt = zahlen ? Object.values(zahlen).reduce((a, b) => a + b, 0) : 0;
  const meine = !stand.laedt ? stand.meine : null;
  const darf = abstimmbar && offen && !stand.laedt && stand.angemeldet && !meine;

  return (
    <section className="mt-12">
      {abstimmbar && offen && !stand.laedt && !stand.angemeldet && (
        <div className="aw-box mb-6 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">Voting is open. Sign in with your Epic Games account to cast your vote - one vote per account.</p>
          <a href={`/api/auth/epic/authorize?zurueck=${encodeURIComponent(`/awards/${kategorie}`)}`} className="shrink-0 rounded-xl bg-sky-500 px-5 py-2.5 text-center text-sm font-bold text-white transition hover:bg-sky-400">Sign in with Epic Games</a>
        </div>
      )}
      {meine && <p className="mb-6 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-200">Your vote is in. Results are revealed when voting has closed.</p>}
      {meldung && <p className="mb-6 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-200">{meldung}</p>}
      {!stand.laedt && stand.fehler && <p className="mb-6 text-sm text-rose-300">{stand.fehler}</p>}

      {nominierte.length === 0 ? (
        <div className="aw-box px-6 py-16 text-center">
          <p className="aw-anton text-3xl text-slate-200">NOMINEES TBA</p>
          <p className="mt-2 text-sm text-slate-400">The shortlist is still being put together.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {nominierte.map((n) => {
            const gewaehlt = meine === n.id;
            const gewinner = sieger === n.id;
            const anteil = zahlen && gesamt ? Math.round(((zahlen[n.id] ?? 0) / gesamt) * 1000) / 10 : null;
            return (
              <article key={n.id} className={`aw-box relative flex flex-col overflow-hidden ${gewinner ? 'border-amber-300/80 shadow-[0_0_40px_rgba(252,211,77,.25)]' : gewaehlt ? 'border-sky-400/80 shadow-[0_0_34px_rgba(14,165,233,.3)]' : ''}`}>
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-900">
                  {/* FotoFokus (app/components) setzt object-position fuer Spielerfotos schon vor dem Hydrieren - deshalb suppressHydrationWarning. */}
                  {n.bild
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={n.bild} alt={n.name} suppressHydrationWarning className="absolute inset-0 h-full w-full object-cover object-top" />
                    : <SpielerPlatzhalter name={n.name} />}
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#060d1a] via-[#060d1a]/70 to-transparent" />
                  <span aria-hidden className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-sky-500/20 blur-2xl" />
                  {gewinner && <span className="absolute left-3 top-3 rounded-full bg-amber-300 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-950">★ Winner</span>}
                  {gewaehlt && !gewinner && <span className="absolute left-3 top-3 rounded-full bg-sky-400 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-950">Your vote</span>}
                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      {n.land && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flaggenPfad(n.land)} alt={n.land} className="h-[18px] w-[26px] shrink-0 rounded-[3px] object-cover" />
                      )}
                      <h3 className="aw-anton truncate text-2xl leading-none sm:text-3xl">{n.name.toUpperCase()}</h3>
                    </div>
                    {(n.team || n.teamLogo) && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        {n.teamLogo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={n.teamLogo} alt="" className="h-4 w-4 rounded-sm object-contain" />
                        )}
                        <span className="truncate">{n.team}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                  {n.statZeile && <p className="text-xs font-semibold leading-snug text-sky-200/90">{n.statZeile}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                    {n.x && <a href={`https://x.com/${n.x}`} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-sky-300">@{n.x}</a>}
                    {n.link && <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">{n.art === 'clip' ? '▶ Watch the play' : 'Link'}</a>}
                  </div>
                  {anteil !== null && (
                    <div className="mt-auto pt-2">
                      <div className="flex justify-between text-xs font-bold text-slate-300"><span>Community</span><span>{anteil}%</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${anteil}%` }} /></div>
                    </div>
                  )}
                  {darf && (
                    <button
                      type="button"
                      disabled={sendet}
                      onClick={() => abstimmen(n)}
                      className={`mt-auto rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:opacity-60 ${wahl === n.id ? 'bg-sky-400 text-slate-950 hover:bg-sky-300' : 'border border-sky-400/50 text-sky-300 hover:bg-sky-400/10'}`}
                    >
                      {wahl === n.id ? (sendet ? 'Saving…' : 'Confirm - final') : 'Vote'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
