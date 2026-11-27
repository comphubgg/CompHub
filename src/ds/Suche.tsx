import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWer } from '../teile/Anmeldung';
import { BEREICHE } from './seiten';

/*
 * Schnellsuche ueber den ganzen Hub (Strg+K oder "/"): jede Seite aller Bereiche, dazu Spieler (Power Rankings) und Cups. Pfeiltasten waehlen,
 * Enter oeffnet, Escape schliesst. Geoeffnet wird sie auch ueber das Ereignis "hub-suche" (der Knopf in der Kopfzeile).
 */
interface Treffer { art: 'Page' | 'Player' | 'Cup'; titel: string; unter: string; zu: string; farbe: string; bild?: string | null }
const FARBE: Record<string, string> = { competitive: '56 189 248', community: '45 212 191', streamer: '167 139 250', admin: '251 191 36' };
export const sucheOeffnen = () => window.dispatchEvent(new Event('hub-suche'));

export default function Suche() {
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState('');
  const [wahl, setWahl] = useState(0);
  const [spieler, setSpieler] = useState<Treffer[]>([]);
  const [cups, setCups] = useState<Array<{ id: string; titel: string; bild?: string }>>([]);
  const { wer } = useWer();
  const nav = useNavigate();
  const liste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const imFeld = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !imFeld)) { e.preventDefault(); setOffen(true); }
      if (e.key === 'Escape') setOffen(false);
    };
    const auf = () => setOffen(true);
    window.addEventListener('keydown', taste); window.addEventListener('hub-suche', auf);
    return () => { window.removeEventListener('keydown', taste); window.removeEventListener('hub-suche', auf); };
  }, []);
  useEffect(() => {
    if (!offen) { setQ(''); setWahl(0); return; }
    if (!cups.length) fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((j) => setCups((j.cups ?? []).map((c: { id: string; titel: string; bild?: string }) => ({ id: c.id, titel: c.titel, bild: c.bild })))).catch(() => {});
  }, [offen, cups.length]);
  useEffect(() => {
    const s = q.trim(); if (s.length < 2) { setSpieler([]); return undefined; }
    const t = setTimeout(() => {
      fetch(`/api/power-rankings?page=1&pageSize=6&q=${encodeURIComponent(s)}`).then((r) => r.json()).then((j) => setSpieler((j.players ?? []).map((p: { id: string; name: string; anzeige?: string; rank: number; bild?: string | null }) => (
        { art: 'Player' as const, titel: p.anzeige || p.name, unter: `#${p.rank.toLocaleString('en')} Power Ranking · ${p.name}`, zu: `/competitive/player/${p.id}`, farbe: FARBE.competitive, bild: p.bild })))).catch(() => setSpieler([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const seiten = useMemo<Treffer[]>(() => {
    const out: Treffer[] = [];
    for (const b of Object.values(BEREICHE)) for (const g of b.gruppen) for (const s of g.seiten) {
      out.push({ art: 'Page', titel: s.titel, unter: `${b.titel}${s.text ? ` · ${s.text}` : ''}`, zu: `${b.basis}${s.pfad ? `/${s.pfad}` : ''}`, farbe: FARBE[b.id] });
    }
    out.push({ art: 'Page', titel: 'Hub start', unter: 'Choose Competitive, Community or Streamer', zu: '/', farbe: '255 255 255' });
    if (wer?.userName) out.push({ art: 'Page', titel: 'Account', unter: 'Profile, socials, password', zu: '/account', farbe: '255 255 255' }, { art: 'Page', titel: 'Messages', unter: 'Your conversations with CompHub', zu: '/messages', farbe: '255 255 255' });
    if (wer?.isAdmin) out.push({ art: 'Page', titel: 'Admin', unter: 'Every admin tool', zu: '/admin', farbe: FARBE.admin });
    return out;
  }, [wer]);
  const treffer = useMemo<Treffer[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return seiten.filter((x) => ['Overview', 'Events', 'Rankings', 'Map', 'Weapons', 'Item Shop', 'Live Streams', 'Overlays'].includes(x.titel)).slice(0, 9);
    const passt = (t: string) => t.toLowerCase().includes(s);
    const p = seiten.filter((x) => passt(x.titel) || passt(x.unter)).sort((a, b) => Number(passt(b.titel)) - Number(passt(a.titel))).slice(0, 7);
    const c = cups.filter((x) => passt(x.titel)).slice(0, 4).map<Treffer>((x) => ({ art: 'Cup', titel: x.titel, unter: 'Competitive · Event', zu: `/competitive/events/${x.id}`, farbe: FARBE.competitive, bild: x.bild }));
    return [...p, ...spieler, ...c];
  }, [q, seiten, spieler, cups]);
  useEffect(() => { setWahl(0); }, [q]);
  useEffect(() => { liste.current?.querySelector('[data-an="1"]')?.scrollIntoView({ block: 'nearest' }); }, [wahl]);
  const los = (t?: Treffer) => { if (!t) return; setOffen(false); nav(t.zu); };

  return (
    <AnimatePresence>
      {offen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[400] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) setOffen(false); }}>
          <motion.div initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fl-fest w-full max-w-2xl overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-5">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, players, cups …" spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setWahl((w) => Math.min(treffer.length - 1, w + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setWahl((w) => Math.max(0, w - 1)); }
                  if (e.key === 'Enter') los(treffer[wahl]);
                }}
                className="h-14 w-full bg-transparent text-base text-white outline-none placeholder:text-white/35" />
              <kbd className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/40">ESC</kbd>
            </div>
            <div ref={liste} className="max-h-[52vh] overflow-y-auto p-2">
              {!q.trim() && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">Jump to</p>}
              {treffer.length === 0 && <p className="px-3 py-8 text-center text-sm text-white/45">Nothing found for “{q}”.</p>}
              {treffer.map((t, i) => (
                <button key={t.art + t.zu} type="button" data-an={i === wahl ? '1' : '0'} onMouseEnter={() => setWahl(i)} onClick={() => los(t)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === wahl ? 'bg-white/[0.07]' : ''}`}>
                  {t.bild ? <img src={t.bild} alt="" className={`shrink-0 rounded-lg object-cover object-top ${t.art === 'Player' ? 'h-10 w-8' : 'h-8 w-14'}`} />
                    : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10" style={{ background: `rgb(${t.farbe} / 0.12)` }}><span className="h-2 w-2 rounded-full" style={{ background: `rgb(${t.farbe})`, boxShadow: `0 0 10px rgb(${t.farbe})` }} /></span>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{t.titel}</span><span className="block truncate text-xs text-white/45">{t.unter}</span></span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">{t.art}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 border-t border-white/[0.07] px-5 py-2.5 text-[11px] text-white/35">
              <span><b className="text-white/60">↑ ↓</b> choose</span><span><b className="text-white/60">Enter</b> open</span><span className="ml-auto">Open anywhere with <b className="text-white/60">Ctrl K</b></span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
