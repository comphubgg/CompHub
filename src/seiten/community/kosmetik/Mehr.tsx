import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useHubDatei } from '../Bausteine';
import { Flaeche, Laedt, SeitenKopf } from '../../../ds/Bausteine';
import { seltenVon, useTeile, type Teil } from './daten';

/*
 * Die uebrigen Menuepunkte der Spezifikation:
 *   Discover / Creators: jetzt in epic/Live.tsx (Epics Fortnite Data API)
 *   Community (27)    jetzt in epic/Sozial.tsx (Social: X zuerst, Reddit als Zweites)
 *   Sprites (1)       /hub-daten/sprites.json (Spieldaten-Export) + Owned/Mastered pro Variante
 *   Treasure Hunt (2) /hub-daten/schatzsuche.json (Spieldaten-Export, Format unten) + "Mark as found"; dazu die Kosmetik der laufenden Saison
 *   Lorebook (25)     Geruest aus den echten Kapiteln/Saisons (fortnite-api: introduction); Texte redaktionell in /hub-daten/lorebook.json
 */

/* ---------------------------------------------- Lorebook */
interface Lore { aktuell?: { titel: string; text: string }; kapitel?: Record<string, { titel?: string; zeitraum?: string; text?: string; saisons?: Record<string, string> }> }
export function Lorebook() {
  const { daten } = useHubDatei<Lore>('lorebook.json');
  const { teile, laedt } = useTeile(['br']);
  const kapitel = useMemo(() => {
    const m = new Map<string, Map<string, { n: number; bild?: Teil }>>();
    for (const t of teile) {
      if (!t.kapitel || !t.saison) continue;
      const k = m.get(t.kapitel) ?? new Map(); const s = k.get(t.saison) ?? { n: 0 };
      s.n += 1; if (t.typ === 'outfit' && (!s.bild || t.selten === 'legendary')) s.bild = t; k.set(t.saison, s); m.set(t.kapitel, k);
    }
    return [...m.entries()].sort((a, b) => Number(b[0]) - Number(a[0]) || b[0].localeCompare(a[0]))
      .map(([k, s]) => ({ k, saisons: [...s.entries()].sort((a, b) => (Number(a[0]) || 99) - (Number(b[0]) || 99) || a[0].localeCompare(b[0])) }));
  }, [teile]);
  const [offen, setOffen] = useState<string | null>(null);
  const zeig = offen ?? kapitel[0]?.k ?? null;
  return (
    <div className="space-y-6">
      <SeitenKopf klein ueber="Community · Season" titel="Lorebook" text="Fortnite's story, chapter by chapter." />
      {daten?.aktuell && <Flaeche fest className="border-akz/25 p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-akz">Current season</p><h2 className="titel mt-1 text-5xl">{daten.aktuell.titel}</h2><p className="mt-2 max-w-3xl whitespace-pre-line text-white/60">{daten.aktuell.text}</p></Flaeche>}
      {laedt ? <Laedt /> : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Flaeche fest className="h-max p-3">
            {kapitel.map((c) => (
              <button key={c.k} type="button" onClick={() => setOffen(c.k)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${zeig === c.k ? 'bg-akz/15 text-white ring-1 ring-akz/30' : 'text-white/65 hover:bg-white/5'}`}>
                <span className="font-bold">{daten?.kapitel?.[c.k]?.titel ?? `Chapter ${c.k}`}</span><span className="text-xs text-white/40">{c.saisons.length} seasons</span>
              </button>
            ))}
          </Flaeche>
          {zeig && (() => {
            const c = kapitel.find((x) => x.k === zeig)!; const ed = daten?.kapitel?.[zeig];
            return (
              <motion.div key={zeig} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <Flaeche fest className="p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-akz">Chapter {zeig}{ed?.zeitraum ? ` · ${ed.zeitraum}` : ''}</p>
                  <h2 className="titel mt-1 text-5xl">{ed?.titel ?? `Chapter ${zeig}`}</h2>
                  {ed?.text && <p className="mt-2 max-w-3xl whitespace-pre-line text-white/60">{ed.text}</p>}
                </Flaeche>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {c.saisons.map(([s, x], i) => (
                    <Flaeche fest key={s} className="flex gap-4 p-4" verz={i * 0.03}>
                      {x.bild && <img src={x.bild.bild} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-contain" style={{ background: seltenVon(x.bild.selten).b }} />}
                      <div className="min-w-0">
                        <p className="text-lg font-extrabold text-white">{/^\d+$/.test(s) ? `Season ${s}` : s}</p>
                        <p className="text-[11px] text-white/40">{x.n.toLocaleString('en')} cosmetics introduced</p>
                        <p className="mt-1 line-clamp-3 text-sm text-white/55">{ed?.saisons?.[s] ?? ''}</p>
                      </div>
                    </Flaeche>
                  ))}
                </div>
              </motion.div>
            );
          })()}
        </div>
      )}
      <p className="text-[11px] text-white/30">Chapters and seasons come from Fortnite's cosmetics data.</p>
    </div>
  );
}
