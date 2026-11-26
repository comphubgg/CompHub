import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { chip } from '../teile';

/*
 * Die Kartenversion eines Updates waehlen (nur Admin, wie app/components/KartenUpdateWahl auf main) - jede Karte von fortnite.gg aus
 * /api/karten-updates, nach Kapitel und Saison geordnet ("Neu gefunden" ganz vorn). Die Bilder kommen verkleinert ueber /api/maps-bild und
 * werden nur fuer die offene Saison geladen. "Find new map" (POST aktion: suchen) sucht bei fortnite.gg nach neuen Updates.
 */

interface Update { patch: string; kapitel: number; saison: string; img: string; url: string; neu?: boolean; gefunden?: string }

/*
 * Quellen der Reihe nach (wie Map Evolution im Hub): der Server der Seite bekommt von fortnite.gg keine Bilder mehr (seit 16.11.2026), danach
 * das Bild direkt im Browser, zuletzt die eigene Kopie im Archiv der Seite. Gespeichert wird immer die Adresse von fortnite.gg (wie auf main).
 */
const QUELLEN = [
  (u: Update) => `/api/maps-bild?u=${encodeURIComponent(u.url)}&b=420`,
  (u: Update) => u.url,
  (u: Update) => `https://www.thecomphub.com/maps/archiv/gg/gg-${u.patch}.webp`,
];
function Vorschau({ u }: { u: Update }) {
  const [n, setN] = useState(0);
  if (n >= QUELLEN.length) return <span className="grid aspect-square w-full place-items-center bg-[#0b2340] text-[10px] font-bold uppercase tracking-widest text-white/30">No preview</span>;
  return <img key={n} src={QUELLEN[n](u)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setN((x) => x + 1)} className="aspect-square w-full bg-[#0b2340] object-cover" />;
}
/** "CH7 S4" -> Kapitel 7, "Season 4". */
function ausKurz(kurz?: string): { kapitel: number; saison: string } | null {
  const m = /CH(\d+)\s*S(\d+)/i.exec(kurz ?? '');
  return m ? { kapitel: Number(m[1]), saison: `Season ${m[2]}` } : null;
}
const saisonName = (s: string) => (s === 'Neu gefunden' ? 'Newly found' : s);

export default function KartenUpdateWahl({ aktuell, waehle, vorgabe, speichert = false }: {
  aktuell: string | null; waehle: (url: string, titel: string) => void; vorgabe?: string; speichert?: boolean;
}) {
  const [liste, setListe] = useState<Update[] | null>(null);
  const [kapitel, setKapitel] = useState<number | null>(null);
  const [saison, setSaison] = useState('');
  const [suche, setSuche] = useState<{ laeuft: boolean; text: string }>({ laeuft: false, text: '' });

  const laden = () => fetch('/api/karten-updates', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.ok) setListe(j.updates); else setListe([]); }).catch(() => setListe([]));
  useEffect(() => { void laden(); }, []);

  const gruppen = useMemo(() => {
    const m = new Map<number, Map<string, Update[]>>();
    for (const u of liste ?? []) {
      const s = m.get(u.kapitel) ?? new Map<string, Update[]>();
      s.set(u.saison, [...(s.get(u.saison) ?? []), u]); m.set(u.kapitel, s);
    }
    return [...m.entries()].sort((a, b) => (a[0] === 0 ? -1 : b[0] === 0 ? 1 : b[0] - a[0]));
  }, [liste]);

  // Anfangs die Saison des Cups, sonst die neueste.
  useEffect(() => {
    if (!gruppen.length || kapitel !== null) return;
    const v = ausKurz(vorgabe);
    if (v && gruppen.some(([k, s]) => k === v.kapitel && s.has(v.saison))) { setKapitel(v.kapitel); setSaison(v.saison); return; }
    const [k, s] = gruppen.find(([nr]) => nr !== 0) ?? gruppen[0];
    setKapitel(k); setSaison([...s.keys()][0] ?? '');
  }, [gruppen, kapitel, vorgabe]);

  const saisons = gruppen.find(([k]) => k === kapitel)?.[1] ?? new Map<string, Update[]>();
  const angezeigt = saisons.get(saison) ?? [];

  const neuSuchen = async () => {
    setSuche({ laeuft: true, text: '' });
    try {
      const r = await fetch('/api/karten-updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'suchen' }) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) { setSuche({ laeuft: false, text: j?.error || 'The search did not go through.' }); return; }
      setSuche({ laeuft: false, text: j.neu?.length ? `Newly found: ${(j.neu as string[]).map((p) => `Update ${p}`).join(', ')}` : `Nothing new (newest version ${j.neueste}).` });
      await laden();
      if (j.neu?.length) { setKapitel(0); setSaison('Neu gefunden'); }
    } catch { setSuche({ laeuft: false, text: 'The search did not go through.' }); }
  };

  return (
    <div className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">All updates{liste ? ` · ${liste.length}` : ''}</span>
        <button type="button" onClick={() => void neuSuchen()} disabled={suche.laeuft}
          className="ml-auto rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300 transition hover:border-amber-300 disabled:opacity-60">
          {suche.laeuft ? 'Searching …' : 'Find new map'}
        </button>
      </div>
      {suche.text && <p className="mt-2 text-xs text-white/55">{suche.text}</p>}
      {liste === null && <p className="mt-3 text-xs text-white/40">Loading …</p>}
      {gruppen.length > 0 && <>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {gruppen.map(([k, s]) => <button key={k} type="button" onClick={() => { setKapitel(k); setSaison([...s.keys()][0] ?? ''); }} className={chip(kapitel === k)}>{k === 0 ? 'Newly found' : `Chapter ${k}`}</button>)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...saisons.entries()].map(([name, us]) => <button key={name} type="button" onClick={() => setSaison(name)} className={chip(saison === name)}>{saisonName(name)}<span className="ml-1.5 tabular-nums opacity-60">{us.length}</span></button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {angezeigt.map((u, i) => (
            <motion.button key={u.img} type="button" disabled={speichert} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} whileHover={{ y: -3 }}
              onClick={() => waehle(u.url, `${u.kapitel ? `Chapter ${u.kapitel} · ` : ''}${saisonName(u.saison)} · Update ${u.patch}`)}
              className={`overflow-hidden rounded-xl border text-left transition ${aktuell === u.url ? 'border-sky-400 ring-2 ring-sky-400/30' : 'border-white/10 hover:border-sky-400/50'}`}>
              <Vorschau u={u} />
              <span className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-bold text-white/85">
                <span>Update {u.patch}</span>
                {u.neu && <span className="rounded bg-amber-400 px-1 text-[9px] font-black uppercase text-[#06080f]">new</span>}
              </span>
            </motion.button>
          ))}
        </div>
      </>}
    </div>
  );
}
