'use client';

/*
 * Werkzeuge der Replay-Karte (Betreiber, 15.11.2026): Einstellungen (Zahnrad oben rechts, im Browser gemerkt), Kill-Feed oben links auf der Karte,
 * Zeichnen auf der Karte, Flaggen aus unseren Profilen. Eigene Gestaltung: CompHub-Blau auf Dunkel.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { Symbol } from '@/app/replays/SpielerEbene';

/* ------------------------------------------------------------------ Einstellungen */

export interface KartenEinstellungen {
  namen: boolean; hp: boolean; richtung: boolean; spuren: boolean; spurEreignisse: boolean; schuesse: boolean; schaden: boolean; elims: boolean;
  orte: boolean; grau: boolean; bus: boolean; inventar: boolean; folgen: boolean; fokus: boolean; feed: boolean;
}
export const STANDARD: KartenEinstellungen = {
  namen: true, hp: true, richtung: true, spuren: false, spurEreignisse: false, schuesse: true, schaden: true, elims: true,
  orte: true, grau: false, bus: true, inventar: true, folgen: false, fokus: false, feed: true,
};
const SCHLUESSEL = 'comphub-replay-einstellungen';

export function useEinstellungen() {
  const [e, setE] = useState<KartenEinstellungen>(STANDARD);
  useEffect(() => {
    try {
      const roh = localStorage.getItem(SCHLUESSEL);
      if (roh) setE({ ...STANDARD, ...(JSON.parse(roh) as Partial<KartenEinstellungen>) });
    } catch { /* ohne Speicher gelten die Standards */ }
  }, []);
  const setze = (k: keyof KartenEinstellungen, v: boolean) => setE((alt) => {
    const neu = { ...alt, [k]: v };
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify(neu)); } catch { /* nur fuer diese Sitzung */ }
    return neu;
  });
  return [e, setze] as const;
}

function Schalter({ an, onClick, name, aus, hinweis }: { an: boolean; onClick: () => void; name: string; aus?: boolean; hinweis?: string }) {
  return (
    <button type="button" data-knopf onClick={onClick} disabled={aus} title={hinweis}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[12px] text-slate-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40">
      <span><T>{name}</T></span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full transition ${an && !aus ? 'bg-sky-500' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${an && !aus ? 'left-3.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function EinstellungenKnopf({ e, setze, ortsnamenDa, zeichnen, setZeichnen, zuruecksetzen, legende, setLegende, spielerDa }: {
  e: KartenEinstellungen; setze: (k: keyof KartenEinstellungen, v: boolean) => void; ortsnamenDa: boolean;
  zeichnen: boolean; setZeichnen: (v: boolean) => void; zuruecksetzen: () => void; legende: boolean; setLegende: (v: boolean) => void; spielerDa: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const rahmen = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!offen) return undefined;
    const weg = (ev: PointerEvent) => { if (rahmen.current && !rahmen.current.contains(ev.target as Node)) setOffen(false); };
    const taste = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOffen(false); };
    document.addEventListener('pointerdown', weg); document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('pointerdown', weg); document.removeEventListener('keydown', taste); };
  }, [offen]);
  const gruppe = (titel: string, kinder: ReactNode) => (
    <div className="border-b border-white/[0.06] py-1.5 last:border-0">
      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300/80"><T>{titel}</T></p>
      {kinder}
    </div>
  );
  const s = (k: keyof KartenEinstellungen, name: string, aus?: boolean, hinweis?: string) => <Schalter key={k} an={e[k]} onClick={() => setze(k, !e[k])} name={name} aus={aus} hinweis={hinweis} />;
  return (
    <div ref={rahmen} className="relative" data-knopf>
      <button type="button" data-knopf onClick={() => setOffen((o) => !o)} aria-label="Map settings" aria-expanded={offen}
        className={`grid h-9 w-9 place-items-center rounded-lg border bg-black/70 text-slate-100 transition hover:bg-white/10 ${offen ? 'border-sky-500' : 'border-white/15'}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {offen && (
        <div className="absolute right-0 top-11 z-50 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-white/15 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur" data-knopf>
          {gruppe('Map', <>
            {s('namen', 'Names', !spielerDa)}{s('hp', 'Health bars', !spielerDa)}{s('richtung', 'Player direction', !spielerDa)}
            {s('spuren', 'Trails', !spielerDa)}{s('spurEreignisse', 'Trail events', !spielerDa)}{s('schuesse', 'Bullet traces', !spielerDa)}
            {s('schaden', 'Damage indicators', !spielerDa)}{s('elims', 'Elim markers')}{s('feed', 'Kill feed')}
            {s('orte', 'POI names', !ortsnamenDa, ortsnamenDa ? undefined : 'No place names for this island')}{s('grau', 'Gray map')}
          </>)}
          {gruppe('Match', <>{s('bus', 'Bus route')}</>)}
          {gruppe('Selected player', <>{s('inventar', 'Inventory bar', !spielerDa)}{s('folgen', 'Follow selected', !spielerDa)}{s('fokus', 'Focus selected', !spielerDa)}</>)}
          {gruppe('Tools', <>
            <Schalter an={zeichnen} onClick={() => setZeichnen(!zeichnen)} name="Draw" />
            <Schalter an={legende} onClick={() => setLegende(!legende)} name="Icon legend" />
            <button type="button" data-knopf onClick={() => { zuruecksetzen(); setOffen(false); }} className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-sky-300 transition hover:bg-white/[0.06]"><T>Reset view</T></button>
          </>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Flaggen und Symbole */

/** Eine Flagge aus public/flags - nur fuer Laender aus unseren eigenen Profilen. */
export function Flagge({ land, klein }: { land?: string | null; klein?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  if (!land || kaputt) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/flags/${land}.png`} alt={land.toUpperCase()} onError={() => setKaputt(true)} className={`${klein ? 'h-2.5 w-[15px]' : 'h-3 w-[18px]'} shrink-0 rounded-[2px] object-cover shadow`} draggable={false} />;
}

/** Waffenart aus der Todesursache (siehe URSACHE in ReplayAnsicht) -> eigenes Symbol. */
const WAFFE_SYMBOL: Record<string, Parameters<typeof Symbol>[0]['art']> = {
  Pistol: 'pistol', Shotgun: 'shotgun', Rifle: 'ar', SMG: 'smg', Sniper: 'sniper', Melee: 'hacke', Grenade: 'granate', 'Grenade Launcher': 'granate', 'Rocket Launcher': 'granate',
};
export function WaffenSymbol({ waffe, gross = 18 }: { waffe: string | null; gross?: number }) {
  const art = waffe ? WAFFE_SYMBOL[waffe] : undefined;
  if (!art) return null;
  return <span title={waffe ?? ''} className="opacity-90"><Symbol art={art} gross={gross} /></span>;
}

/** Knock: ein nach unten zeigender Winkel; Eliminierung: ein Fadenkreuz mit X. */
export function KnockSymbol({ gross = 16 }: { gross?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={gross} height={gross} aria-label="Knock" className="shrink-0">
      <circle cx="10" cy="10" r="9" fill="#f59e0b" fillOpacity=".18" stroke="#f59e0b" strokeWidth="1.5" />
      <path d="M6 8 L10 12.5 L14 8" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function ElimSymbol({ gross = 16 }: { gross?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={gross} height={gross} aria-label="Elimination" className="shrink-0">
      <circle cx="10" cy="10" r="9" fill="#f43f5e" fillOpacity=".2" stroke="#f43f5e" strokeWidth="1.5" />
      <path d="M6.5 6.5 L13.5 13.5 M13.5 6.5 L6.5 13.5" stroke="#fda4af" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Kill-Feed auf der Karte */

export interface FeedZeile { schluessel: string; t: number; art: 'unten' | 'tot'; von: { name: string; land?: string; farbe: string } | null; an: { name: string; land?: string; farbe: string }; waffe: string | null }

/** Oben links auf der Karte: die neuesten Knocks und Eliminierungen, neueste oben, verblassen nach einigen Sekunden. */
export function KartenFeed({ zeilen, zeit, dauer }: { zeilen: FeedZeile[]; zeit: number; dauer: number }) {
  const sichtbar = zeilen.filter((z) => z.t <= zeit && zeit - z.t < dauer).slice(-6).reverse();
  if (!sichtbar.length) return null;
  return (
    <ul className="pointer-events-none flex flex-col gap-1">
      {sichtbar.map((z) => {
        const alter = (zeit - z.t) / dauer;
        return (
          <li key={z.schluessel} className="flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/80 px-2 py-1 text-[11px] font-semibold text-slate-100 shadow-lg backdrop-blur-sm transition-opacity"
            style={{ opacity: alter > 0.7 ? Math.max(0, (1 - alter) / 0.3) : 1 }}>
            {z.von ? <><Flagge land={z.von.land} klein /><span className="max-w-[110px] truncate" style={{ color: z.von.farbe }}>{z.von.name}</span></> : <span className="text-slate-400"><T>Storm</T></span>}
            {z.art === 'tot' ? <ElimSymbol /> : <KnockSymbol />}
            <WaffenSymbol waffe={z.waffe} gross={16} />
            <Flagge land={z.an.land} klein /><span className="max-w-[110px] truncate" style={{ color: z.an.farbe }}>{z.an.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ Zeichnen */

/** Freihand auf der Karte: eine Leinwand ueber allem, nur aktiv, solange "Zeichnen" an ist. */
export function Zeichenflaeche({ an, leeren }: { an: boolean; leeren: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const zieht = useRef(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * (window.devicePixelRatio || 1)); c.height = Math.round(r.height * (window.devicePixelRatio || 1));
  }, [leeren]);
  const punkt = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ev.currentTarget; const r = c.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * c.width, y: ((ev.clientY - r.top) / r.height) * c.height };
  };
  return (
    <canvas ref={ref} data-knopf className={`absolute inset-0 z-[35] h-full w-full ${an ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(ev) => {
        if (!an) return;
        const g = ev.currentTarget.getContext('2d'); if (!g) return;
        zieht.current = true; ev.currentTarget.setPointerCapture(ev.pointerId);
        const p = punkt(ev);
        g.strokeStyle = '#38bdf8'; g.lineWidth = 4 * (window.devicePixelRatio || 1); g.lineCap = 'round'; g.lineJoin = 'round';
        g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 3;
        g.beginPath(); g.moveTo(p.x, p.y);
      }}
      onPointerMove={(ev) => {
        if (!zieht.current) return;
        const g = ev.currentTarget.getContext('2d'); if (!g) return;
        const p = punkt(ev); g.lineTo(p.x, p.y); g.stroke();
      }}
      onPointerUp={() => { zieht.current = false; }} onPointerCancel={() => { zieht.current = false; }} />
  );
}
