'use client';

/*
 * Werkzeuge der Replay-Karte (Betreiber, 15.11.2026): Einstellungen (Zahnrad oben rechts, im Browser gemerkt), Kill-Feed oben links auf der Karte,
 * Zeichnen auf der Karte, Flaggen aus unseren Profilen. Eigene Gestaltung: CompHub-Blau auf Dunkel.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { Fach, Symbol, bildVon, useWiki, type KillWaffe } from '@/app/replays/SpielerEbene';

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

/*
 * Knock und Eliminierung klar getrennt (Betreiber, 15.11.2026): Knock = rotes Kreuz im Kreis (wie das Knock-Symbol im Spiel), Eliminierung = Totenkopf.
 */
export function KnockSymbol({ gross = 16 }: { gross?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={gross} height={gross} role="img" aria-label="Knock" className="shrink-0">
      <title>Knock</title>
      <circle cx="10" cy="10" r="8.6" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1.8" />
      <path d="M10 5.2 V14.8 M5.2 10 H14.8" stroke="#fecaca" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
export function ElimSymbol({ gross = 16 }: { gross?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={gross} height={gross} role="img" aria-label="Elimination" className="shrink-0">
      <title>Elimination</title>
      <path d="M10 2.2 C5.6 2.2 3 5.1 3 8.7 c0 2.2 1 3.6 2.4 4.5 V15.6 c0 .7.5 1.2 1.2 1.2 H7.6 V15.2 h1.3 v1.6 h2.2 v-1.6 h1.3 v1.6 h1 c.7 0 1.2-.5 1.2-1.2 v-2.4 C16 12.3 17 10.9 17 8.7 17 5.1 14.4 2.2 10 2.2z" fill="#f8fafc" stroke="#111827" strokeWidth=".8" />
      <circle cx="7.2" cy="9.4" r="1.9" fill="#111827" /><circle cx="12.8" cy="9.4" r="1.9" fill="#111827" />
      <path d="M10 11.6 l-1 1.8 h2z" fill="#111827" />
    </svg>
  );
}

/** Die Waffe im Feed: das echte Bild auf der Farbe der Seltenheit; ohne Bild das Symbol der Todesursache. */
export function FeedWaffe({ echt, waffe, gross = 22 }: { echt: KillWaffe | null; waffe: string | null; gross?: number }) {
  useWiki();
  // Das Bild kann erst nach dem Laden der Wiki-Tabelle da sein: hier neu nachsehen.
  const bild = echt ? (bildVon(echt.roh) ? echt.roh : echt.bild && bildVon(echt.bild) ? echt.bild : null) : null;
  if (echt && bild) return <span title={bildVon(bild)?.name} data-waffe={echt.roh} className="shrink-0"><Fach roh={bild} selten={echt.selten} gross={gross} /></span>;
  return <span data-waffe-fehlt={echt?.roh ?? ''} className="contents"><WaffenSymbol waffe={waffe} gross={Math.round(gross * 0.75)} /></span>;
}

/* ------------------------------------------------------------------ Kill-Feed auf der Karte */

export interface FeedZeile { schluessel: string; t: number; art: 'unten' | 'tot'; von: { name: string; land?: string; farbe: string } | null; an: { name: string; land?: string; farbe: string }; waffe: string | null; echt: KillWaffe | null }

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
            <FeedWaffe echt={z.echt} waffe={z.waffe} gross={22} />
            <Flagge land={z.an.land} klein /><span className="max-w-[110px] truncate" style={{ color: z.an.farbe }}>{z.an.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ Zeichnen */

type Werkzeug = 'stift' | 'pfeil' | 'kreis';
interface Form { art: Werkzeug; farbe: string; p: Array<[number, number]> }
const STIFTFARBEN = ['#38bdf8', '#f8fafc', '#fbbf24', '#f43f5e'];

/** Zeichnen ueber der Karte: Stift, Pfeil, Kreis in vier Farben; Rueckgaengig (Strg+Z), Loeschen, Beenden. Koordinaten in Prozent des Rahmens. */
export function Zeichenflaeche({ an, leeren, beenden }: { an: boolean; leeren: number; beenden: () => void }) {
  const [formen, setFormen] = useState<Form[]>([]);
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('stift');
  const [farbe, setFarbe] = useState(STIFTFARBEN[0]);
  const zieht = useRef(false);
  useEffect(() => { setFormen([]); }, [leeren]);
  useEffect(() => {
    if (!an) return undefined;
    const taste = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); setFormen((f) => f.slice(0, -1)); } };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [an]);
  const punkt = (ev: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const r = ev.currentTarget.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 100, ((ev.clientY - r.top) / r.height) * 100];
  };
  const zeichne = (f: Form, i: number) => {
    const [a, b] = [f.p[0], f.p[f.p.length - 1]];
    const strich = { stroke: f.farbe, strokeWidth: 3, fill: 'none', vectorEffect: 'non-scaling-stroke' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { filter: 'drop-shadow(0 0 1px #000)' } };
    if (f.art === 'stift') return <polyline key={i} points={f.p.map((q) => q.join(',')).join(' ')} {...strich} />;
    if (f.art === 'kreis') return <ellipse key={i} cx={a[0]} cy={a[1]} rx={Math.hypot(b[0] - a[0], b[1] - a[1])} ry={Math.hypot(b[0] - a[0], b[1] - a[1])} {...strich} />;
    const w = Math.atan2(b[1] - a[1], b[0] - a[0]); const l = 2.4;
    const s1 = [b[0] - l * Math.cos(w - 0.5), b[1] - l * Math.sin(w - 0.5)]; const s2 = [b[0] - l * Math.cos(w + 0.5), b[1] - l * Math.sin(w + 0.5)];
    return <g key={i}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...strich} /><polyline points={`${s1.join(',')} ${b.join(',')} ${s2.join(',')}`} {...strich} /></g>;
  };
  const knopf = (aktiv: boolean) => `grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-[11px] font-bold transition ${aktiv ? 'bg-sky-500 text-white' : 'text-slate-200 hover:bg-white/10'}`;
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" data-knopf className={`absolute inset-0 z-[35] h-full w-full touch-none ${an ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onPointerDown={(ev) => { if (!an) return; zieht.current = true; ev.currentTarget.setPointerCapture(ev.pointerId); const q = punkt(ev); setFormen((f) => [...f, { art: werkzeug, farbe, p: [q, q] }]); }}
        onPointerMove={(ev) => {
          if (!zieht.current) return;
          const q = punkt(ev);
          setFormen((f) => { const n = [...f]; const l = n[n.length - 1]; if (!l) return f; n[n.length - 1] = { ...l, p: l.art === 'stift' ? [...l.p, q] : [l.p[0], q] }; return n; });
        }}
        onPointerUp={() => { zieht.current = false; }} onPointerCancel={() => { zieht.current = false; }}>
        {formen.map(zeichne)}
      </svg>
      {an && (
        <div className="absolute bottom-3 left-3 z-40 flex flex-wrap items-center gap-0.5 rounded-lg border border-white/15 bg-zinc-950/90 p-1 shadow-xl" data-knopf>
          {([['stift', 'Pen', '✎'], ['pfeil', 'Arrow', '➚'], ['kreis', 'Circle', '◯']] as const).map(([k, n, z]) => (
            <button key={k} type="button" data-knopf title={n} aria-label={n} onClick={() => setWerkzeug(k)} className={knopf(werkzeug === k)}>{z}</button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/15" />
          {STIFTFARBEN.map((f) => <button key={f} type="button" data-knopf aria-label={f} onClick={() => setFarbe(f)} className={`h-6 w-6 rounded-full border-2 ${farbe === f ? 'border-white' : 'border-transparent'}`} style={{ background: f }} />)}
          <span className="mx-1 h-5 w-px bg-white/15" />
          <button type="button" data-knopf title="Ctrl+Z" onClick={() => setFormen((f) => f.slice(0, -1))} className={knopf(false)}><T>Undo</T></button>
          <button type="button" data-knopf onClick={() => setFormen([])} className={knopf(false)}><T>Clear</T></button>
          <button type="button" data-knopf onClick={beenden} className={knopf(true)}><T>Stop</T></button>
        </div>
      )}
    </>
  );
}
