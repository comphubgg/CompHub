import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useHubDatei } from '../Bausteine';
import { Link } from 'react-router-dom';
import { Flaeche, Laedt } from '../../../ds/Bausteine';
import { seltenVon, useTeile, type Teil } from './daten';

/*
 * Die uebrigen Menuepunkte der Spezifikation:
 *   Discover / Creators: jetzt in epic/Live.tsx (Epics Fortnite Data API)
 *   Community (27)    jetzt in epic/Sozial.tsx (Social: X zuerst, Reddit als Zweites)
 *   Sprites (1)       /hub-daten/sprites.json (Spieldaten-Export) + Owned/Mastered pro Variante
 *   Treasure Hunt (2) /hub-daten/schatzsuche.json (Spieldaten-Export, Format unten) + "Mark as found"; dazu die Kosmetik der laufenden Saison
 *   Lorebook (25)     Geruest aus den echten Kapiteln/Saisons (fortnite-api: introduction); Texte redaktionell in /hub-daten/lorebook.json
 */

/* ---------------------------------------------- Lorebook (Design 3.0, neu komponiert 28.11.2026)
 * Ein Buch statt einer Liste: oben die Kapitel als Leiste von Bildkacheln (je drei Outfits des Kapitels), darunter das gewaehlte Kapitel
 * als Buehne mit der Key Art seiner ersten Saison und danach die Saisons als Zeitleiste - je Zeile Key Art der Saison (16:9), Nummer,
 * Zahl der Kosmetik, Redaktionstext (lorebook.json, wenn vorhanden) und eine Reihe ihrer Outfits. Keine erfundenen Daten.
 */
interface Lore { aktuell?: { titel: string; text: string }; kapitel?: Record<string, { titel?: string; zeitraum?: string; text?: string; saisons?: Record<string, string> }> }
interface SaisonInfo { n: number; outfits: Teil[]; keyArt?: Teil }
const RANG: Record<string, number> = { legendary: 0, icon: 0, marvel: 0, dc: 0, gaminglegends: 0, starwars: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
export function Lorebook() {
  const { daten } = useHubDatei<Lore>('lorebook.json');
  const { teile, laedt } = useTeile(['br']);
  const kapitel = useMemo(() => {
    const m = new Map<string, Map<string, SaisonInfo>>();
    const ls = new Map<string, Teil[]>();
    for (const t of teile) {
      if (t.kapitel && t.typ === 'loadingscreen' && t.bildBreit) ls.set(t.kapitel, [...(ls.get(t.kapitel) ?? []), t]);
      if (!t.kapitel || !t.saison) continue;
      const k = m.get(t.kapitel) ?? new Map<string, SaisonInfo>(); const s = k.get(t.saison) ?? { n: 0, outfits: [] };
      s.n += 1;
      if (t.typ === 'outfit' && t.bild) s.outfits.push(t);
      if (t.typ === 'loadingscreen' && t.bildBreit && (!s.keyArt || (/KeyArt/i.test(t.id) && !/KeyArt/i.test(s.keyArt.id)))) s.keyArt = t;
      k.set(t.saison, s); m.set(t.kapitel, k);
    }
    for (const k of m.values()) for (const s of k.values()) s.outfits.sort((a, b) => (RANG[a.selten] ?? 5) - (RANG[b.selten] ?? 5));
    return [...m.entries()].sort((a, b) => Number(b[0]) - Number(a[0]) || b[0].localeCompare(a[0]))
      .map(([k, s]) => {
        const saisons = [...s.entries()].sort((a, b) => (Number(a[0]) || 99) - (Number(b[0]) || 99) || a[0].localeCompare(b[0]));
        // Drei Outfits fuer die Kachel - aus verschiedenen Saisons, damit das Kapitel nicht von einer Saison bestimmt wird
        const bilder = saisons.map(([, x]) => x.outfits[0]).filter(Boolean).slice(0, 3) as Teil[];
        // Buehnenbild des Kapitels: ein Ladebild, das keine Saisonzeile schon zeigt (kein Bild doppelt), Key Art bevorzugt
        const belegt = new Set(saisons.map(([, x]) => x.keyArt?.id));
        const frei = (ls.get(k) ?? []).filter((t) => !belegt.has(t.id));
        const buehne = frei.find((t) => /KeyArt/i.test(t.id)) ?? frei[0];
        return { k, saisons, bilder, buehne, n: saisons.reduce((z, [, x]) => z + x.n, 0) };
      });
  }, [teile]);
  const [offen, setOffen] = useState<string | null>(null);
  const zeig = offen ?? kapitel[0]?.k ?? null;
  const c = kapitel.find((x) => x.k === zeig); const ed = zeig ? daten?.kapitel?.[zeig] : undefined;
  const buehnenBild = c?.buehne;
  const nameS = (s: string) => (/^\d+$/.test(s) ? `Season ${s}` : s);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="ueber">Community · Season</p><h1 className="titel mt-1 text-6xl lg:text-7xl">Lorebook</h1></div>
        <p className="max-w-md text-sm text-white/50">Fortnite's story, chapter by chapter – every season with its key art and the outfits it introduced.</p>
      </header>
      {daten?.aktuell && <Flaeche fest className="p-6"><p className="ueber">Current season</p><h2 className="titel mt-1 text-5xl">{daten.aktuell.titel}</h2><p className="mt-2 max-w-3xl whitespace-pre-line text-white/60">{daten.aktuell.text}</p></Flaeche>}
      {laedt ? <Laedt text="Reading the chapters" /> : (
        <>
          {/* Kapitel-Leiste */}
          <div className="ohne-leiste -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {kapitel.map((x, i) => (
              <motion.button key={x.k} type="button" onClick={() => setOffen(x.k)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`fl-fest group relative w-52 shrink-0 overflow-hidden !rounded-2xl text-left transition ${zeig === x.k ? 'ring-2 ring-akz' : 'hover:-translate-y-0.5 hover:border-akz/40'}`}>
                <div className="relative flex h-28 items-end justify-center gap-0 overflow-hidden bg-gradient-to-b from-white/[0.06] to-transparent">
                  {x.bilder.map((b) => <img key={b.id} src={b.bild} alt="" loading="lazy" className="-mx-3 h-28 w-28 object-contain object-bottom transition duration-500 group-hover:scale-105" />)}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-fl to-transparent" />
                </div>
                <div className="px-3.5 pb-3 pt-1">
                  <p className="titel text-3xl">{daten?.kapitel?.[x.k]?.titel ?? (/^\d+$/.test(x.k) ? `Chapter ${x.k}` : x.k)}</p>
                  <p className="zahl text-[11px] text-white/45">{x.saisons.length} seasons · {x.n.toLocaleString('en')} cosmetics</p>
                </div>
              </motion.button>
            ))}
          </div>

          {c && (
            <motion.div key={zeig} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <header className="fl-fest relative isolate min-h-[260px] overflow-hidden">
                {buehnenBild && <img src={buehnenBild.bildBreit} alt="" className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover lg:w-[65%]" />}
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/85 to-fl/10" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl/80 via-transparent to-transparent" />
                <div className="flex min-h-[260px] flex-col justify-end p-6 lg:p-8">
                  <p className="ueber">Chapter {zeig}{ed?.zeitraum ? ` · ${ed.zeitraum}` : ''}</p>
                  <h2 className="titel mt-1 text-6xl lg:text-7xl">{ed?.titel ?? `Chapter ${zeig}`}</h2>
                  {ed?.text && <p className="mt-2 max-w-2xl whitespace-pre-line text-white/65">{ed.text}</p>}
                  <p className="zahl mt-3 text-sm text-white/55">{c.saisons.length} seasons · {c.n.toLocaleString('en')} cosmetics introduced{buehnenBild ? ` · key art: ${buehnenBild.name}` : ''}</p>
                </div>
              </header>
              <ol className="relative space-y-3">
                {c.saisons.map(([s, x], i) => {
                  const bild = x.keyArt && x.keyArt.id !== buehnenBild?.id ? x.keyArt : undefined;
                  return (
                    <Flaeche fest key={s} verz={Math.min(i, 8) * 0.04} className="grid items-center gap-4 overflow-hidden p-3 sm:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,0.8fr)_minmax(0,1.5fr)]">
                      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black/30">
                        {bild ? <img src={bild.bildBreit} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                          : <div className="absolute inset-0 grid place-items-center"><span className="titel text-6xl text-white/15">{/^\d+$/.test(s) ? s : 'S'}</span></div>}
                      </div>
                      <div className="min-w-0 px-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-akz">Chapter {zeig}</p>
                        <p className="titel text-4xl">{nameS(s)}</p>
                        {bild && <p className="truncate text-xs text-white/45">{bild.name}</p>}
                        <p className="zahl mt-1 text-sm text-white/55">{x.n.toLocaleString('en')} cosmetics · {x.outfits.length} outfits</p>
                        {ed?.saisons?.[s] && <p className="mt-1.5 line-clamp-3 text-sm text-white/60">{ed.saisons[s]}</p>}
                      </div>
                      <div className="flex gap-2 overflow-hidden sm:col-span-2 xl:col-span-1">
                        {x.outfits.slice(0, 7).map((o) => (
                          <Link key={o.id} to={`/community/cosmetics/${encodeURIComponent(o.id)}`} title={o.name} className="group relative aspect-square w-full max-w-[112px] shrink overflow-hidden rounded-xl" style={{ background: `radial-gradient(120% 90% at 50% 12%, ${seltenVon(o.selten).a}55, ${seltenVon(o.selten).b} 65%, #04050a)` }}>
                            <img src={o.bild} alt={o.name} loading="lazy" className="absolute inset-0 h-full w-full object-contain transition duration-500 group-hover:scale-110" />
                          </Link>
                        ))}
                      </div>
                    </Flaeche>
                  );
                })}
              </ol>
            </motion.div>
          )}
        </>
      )}
      <p className="text-[11px] text-white/30">Chapters, seasons, key art and outfits come from Fortnite's cosmetics data (fortnite-api.com).</p>
    </div>
  );
}
