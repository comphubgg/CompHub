import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAblage } from './kosmetik/daten';
import { AblageHinweis } from './kosmetik/Raster';

/*
 * "My drawings" auf der Karte (Spezifikation Punkt 3: Stift, Linie, Polygon, Rechteck, Kreis, Pin, Text, Farbwahl, Undo/Redo, Speichern, Fertig).
 * Koordinaten in Bild-Einheiten 0..1000 (dieselbe Flaeche wie das Kartenbild) - damit passen Zeichnungen bei jedem Zoom und lassen sich als Link teilen.
 *   - Gespeichert pro Konto (/api/user-storage "hub-karten-zeichnungen"), sonst im Browser.
 *   - Teilen: die Formen stecken (gerundet, kompakt) im Adress-Anker #zeichnung=..., wer den Link oeffnet, sieht sie und kann sie uebernehmen.
 *   - Export als PNG: Karte.tsx zeichnet Bild + Marker + Namen + diese Formen auf ein Canvas (zeichneFormen unten).
 */

export type Werkzeug = 'stift' | 'linie' | 'pfeil' | 'polygon' | 'rechteck' | 'kreis' | 'pin' | 'text';
export interface Form { a: Werkzeug; f: string; p: Array<[number, number]>; t?: string; b?: number }
export interface Zeichnung { id: string; name: string; formen: Form[]; stand: string }
export const FARBEN = ['#5eead4', '#38bdf8', '#a78bfa', '#f472b6', '#f87171', '#fbbf24', '#a3e635', '#ffffff', '#0f172a'];
const WERKZEUGE: Array<[Werkzeug, string, string]> = [
  ['stift', 'Pen', 'M4 20c4-1 5-6 8-9s6-5 8-7'], ['linie', 'Line', 'M5 19L19 5'], ['pfeil', 'Arrow', 'M5 19L19 5M11 5h8v8'],
  ['polygon', 'Polygon', 'M6 18L4 9l8-5 8 6-3 8z'], ['rechteck', 'Rectangle', 'M5 6h14v12H5z'], ['kreis', 'Circle', 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16'],
  ['pin', 'Pin', 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM12 8v4'], ['text', 'Text', 'M5 6h14M12 6v13'],
];

/* ---------------------------------------------- Kodieren fuer den Link */
export function kodieren(formen: Form[]): string {
  const kurz = formen.map((f) => [f.a, f.f, f.p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), f.t ?? '', f.b ?? 3]);
  return btoa(unescape(encodeURIComponent(JSON.stringify(kurz)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function dekodieren(s: string): Form[] | null {
  try {
    const roh = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))) as Array<[Werkzeug, string, Array<[number, number]>, string, number]>;
    return roh.map(([a, f, p, t, b]) => ({ a, f, p, t: t || undefined, b }));
  } catch { return null; }
}

/* ---------------------------------------------- Zustand */
export function useZeichnen() {
  const [werkzeug, setWerkzeug] = useState<Werkzeug | null>(null);
  const [farbe, setFarbe] = useState(FARBEN[0]);
  const [breite, setBreite] = useState(3);
  const [formen, setFormen] = useState<Form[]>([]);
  const [zurueck, setZurueck] = useState<Form[][]>([]); const [vor, setVor] = useState<Form[][]>([]);
  const [entwurf, setEntwurf] = useState<Form | null>(null);
  const [textOrt, setTextOrt] = useState<[number, number] | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [geteilt, setGeteilt] = useState(false);
  const ablage = useAblage<Zeichnung[]>('karten-zeichnungen', []);
  const unten = useRef(false);
  // Geteilter Link: #zeichnung=...
  useEffect(() => {
    const m = window.location.hash.match(/zeichnung=([\w-]+)/);
    const f = m ? dekodieren(m[1]) : null;
    if (f?.length) { setFormen(f); setGeteilt(true); }
  }, []);
  const setzen = useCallback((neu: Form[]) => { setZurueck((z) => [...z.slice(-60), formen]); setVor([]); setFormen(neu); }, [formen]);
  const neueForm = (f: Form) => setzen([...formen, f]);
  function runter(p: [number, number]) {
    if (!werkzeug) return;
    if (werkzeug === 'pin') { neueForm({ a: 'pin', f: farbe, p: [p], b: breite }); return; }
    if (werkzeug === 'text') { setTextOrt(p); return; }
    if (werkzeug === 'polygon') {
      if (!entwurf) { setEntwurf({ a: 'polygon', f: farbe, p: [p, p], b: breite }); return; }
      const erst = entwurf.p[0];
      if (entwurf.p.length > 3 && Math.hypot(erst[0] - p[0], erst[1] - p[1]) < 8) { neueForm({ ...entwurf, p: entwurf.p.slice(0, -1) }); setEntwurf(null); return; }
      setEntwurf({ ...entwurf, p: [...entwurf.p.slice(0, -1), p, p] }); return;
    }
    unten.current = true;
    setEntwurf({ a: werkzeug, f: farbe, p: [p, p], b: breite });
  }
  function bewegen(p: [number, number]) {
    if (!entwurf) return;
    if (entwurf.a === 'polygon') { setEntwurf({ ...entwurf, p: [...entwurf.p.slice(0, -1), p] }); return; }
    if (!unten.current) return;
    if (entwurf.a === 'stift') { const l = entwurf.p.at(-1)!; if (Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.6) setEntwurf({ ...entwurf, p: [...entwurf.p, p] }); }
    else setEntwurf({ ...entwurf, p: [entwurf.p[0], p] });
  }
  function hoch() {
    if (!unten.current) return;
    unten.current = false;
    if (entwurf && entwurf.a !== 'polygon') {
      const [a, b] = [entwurf.p[0], entwurf.p.at(-1)!];
      if (entwurf.a === 'stift' ? entwurf.p.length > 1 : Math.hypot(a[0] - b[0], a[1] - b[1]) > 1) neueForm(entwurf);
      setEntwurf(null);
    }
  }
  function polygonFertig() { if (entwurf?.a === 'polygon' && entwurf.p.length > 3) neueForm({ ...entwurf, p: entwurf.p.slice(0, -1) }); setEntwurf(null); }
  function textSetzen(t: string) { if (textOrt && t.trim()) neueForm({ a: 'text', f: farbe, p: [textOrt], t: t.trim().slice(0, 80), b: breite }); setTextOrt(null); }
  function rueck() { if (!zurueck.length) return; setVor((v) => [formen, ...v]); setFormen(zurueck.at(-1)!); setZurueck((z) => z.slice(0, -1)); }
  function wieder() { if (!vor.length) return; setZurueck((z) => [...z, formen]); setFormen(vor[0]); setVor((v) => v.slice(1)); }
  function speichern(name?: string) {
    const id = offenId ?? `z${Date.now().toString(36)}`;
    const z: Zeichnung = { id, name: name || ablage.wert.find((x) => x.id === id)?.name || `Drawing ${ablage.wert.length + 1}`, formen, stand: new Date().toISOString() };
    ablage.setzen((l) => [z, ...l.filter((x) => x.id !== id)].slice(0, 50));
    setOffenId(id); setGeteilt(false);
  }
  function oeffnen(z: Zeichnung) { setzen(z.formen); setOffenId(z.id); setGeteilt(false); }
  function neu() { setzen([]); setOffenId(null); setEntwurf(null); }
  const link = () => `${window.location.origin}${window.location.pathname}#zeichnung=${kodieren(formen)}`;
  return { werkzeug, setWerkzeug, farbe, setFarbe, breite, setBreite, formen, entwurf, textOrt, setTextOrt, runter, bewegen, hoch, polygonFertig, textSetzen,
    rueck, wieder, kannRueck: zurueck.length > 0, kannVor: vor.length > 0, setzen, speichern, oeffnen, neu, offenId, ablage, link, geteilt, loeschen: () => setzen([]) };
}
export type Zeichnen = ReturnType<typeof useZeichnen>;

/* ---------------------------------------------- SVG-Ebene (im skalierten Kartenrahmen, viewBox 0..1000) */
export function ZeichenEbene({ z, r }: { z: Zeichnen; r: (px: number) => number }) {
  const alle = z.entwurf ? [...z.formen, z.entwurf] : z.formen;
  return (
    <svg viewBox="0 0 1000 1000" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        {FARBEN.map((f) => <marker key={f} id={`zp-${f.slice(1)}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={f} /></marker>)}
      </defs>
      {alle.map((f, i) => <FormSvg key={i} f={f} r={r} />)}
      {z.entwurf?.a === 'polygon' && <circle cx={z.entwurf.p[0][0]} cy={z.entwurf.p[0][1]} r={r(6)} fill="none" stroke="#fff" strokeWidth={r(1.5)} />}
    </svg>
  );
}
function FormSvg({ f, r }: { f: Form; r: (px: number) => number }) {
  const b = r(f.b ?? 3); const pts = f.p.map((p) => p.join(',')).join(' ');
  const gem = { stroke: f.f, strokeWidth: b, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const [a, e] = [f.p[0], f.p.at(-1)!];
  switch (f.a) {
    case 'stift': return <polyline points={pts} {...gem} />;
    case 'linie': return <line x1={a[0]} y1={a[1]} x2={e[0]} y2={e[1]} {...gem} />;
    case 'pfeil': return <line x1={a[0]} y1={a[1]} x2={e[0]} y2={e[1]} {...gem} markerEnd={`url(#zp-${f.f.slice(1)})`} />;
    case 'polygon': return <polygon points={pts} {...gem} fill={f.f} fillOpacity={0.18} />;
    case 'rechteck': return <rect x={Math.min(a[0], e[0])} y={Math.min(a[1], e[1])} width={Math.abs(e[0] - a[0])} height={Math.abs(e[1] - a[1])} {...gem} fill={f.f} fillOpacity={0.12} />;
    case 'kreis': return <circle cx={a[0]} cy={a[1]} r={Math.hypot(e[0] - a[0], e[1] - a[1])} {...gem} fill={f.f} fillOpacity={0.12} />;
    case 'pin': return <g transform={`translate(${a[0]} ${a[1]}) scale(${r(1)})`}><path d="M0 0C-5-7-9-11-9-16a9 9 0 0 1 18 0c0 5-4 9-9 16z" fill={f.f} stroke="#06080f" strokeWidth={1.5} /><circle cy={-16} r={3.2} fill="#06080f" /></g>;
    case 'text': return <text x={a[0]} y={a[1]} fill={f.f} fontSize={r(12 + (f.b ?? 3) * 2)} fontWeight={800} stroke="#06080f" strokeWidth={r(3)} paintOrder="stroke" textAnchor="middle" dominantBaseline="middle">{f.t}</text>;
    default: return null;
  }
}

/* ---------------------------------------------- Canvas (fuer den PNG-Export) */
export function zeichneFormen(c: CanvasRenderingContext2D, formen: Form[], zuPx: (p: [number, number]) => [number, number], skala: number) {
  for (const f of formen) {
    const b = (f.b ?? 3) * skala; const pts = f.p.map(zuPx); const [a, e] = [pts[0], pts.at(-1)!];
    c.save(); c.strokeStyle = f.f; c.fillStyle = f.f; c.lineWidth = b; c.lineCap = 'round'; c.lineJoin = 'round';
    const fuellen = (alpha: number) => { c.globalAlpha = alpha; c.fill(); c.globalAlpha = 1; c.stroke(); };
    c.beginPath();
    if (f.a === 'stift' || f.a === 'linie' || f.a === 'pfeil') {
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (f.a !== 'stift') { c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]); } c.stroke();
      if (f.a === 'pfeil') { const w = Math.atan2(e[1] - a[1], e[0] - a[0]); const l = 6 * skala + b * 2; c.beginPath(); c.moveTo(e[0], e[1]); c.lineTo(e[0] - l * Math.cos(w - 0.45), e[1] - l * Math.sin(w - 0.45)); c.lineTo(e[0] - l * Math.cos(w + 0.45), e[1] - l * Math.sin(w + 0.45)); c.closePath(); c.fill(); }
    } else if (f.a === 'polygon') { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); fuellen(0.18); }
    else if (f.a === 'rechteck') { c.rect(Math.min(a[0], e[0]), Math.min(a[1], e[1]), Math.abs(e[0] - a[0]), Math.abs(e[1] - a[1])); fuellen(0.12); }
    else if (f.a === 'kreis') { c.arc(a[0], a[1], Math.hypot(e[0] - a[0], e[1] - a[1]), 0, Math.PI * 2); fuellen(0.12); }
    else if (f.a === 'pin') {
      c.translate(a[0], a[1]); c.scale(skala, skala); c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-5, -7, -9, -11, -9, -16); c.arc(0, -16, 9, Math.PI, 0); c.bezierCurveTo(9, -11, 5, -7, 0, 0);
      c.fill(); c.strokeStyle = '#06080f'; c.lineWidth = 1.5; c.stroke(); c.beginPath(); c.arc(0, -16, 3.2, 0, Math.PI * 2); c.fillStyle = '#06080f'; c.fill();
    } else if (f.a === 'text' && f.t) {
      c.font = `800 ${(12 + (f.b ?? 3) * 2) * skala}px Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3 * skala; c.strokeStyle = '#06080f'; c.strokeText(f.t, a[0], a[1]); c.fillText(f.t, a[0], a[1]);
    }
    c.restore();
  }
}

/* ---------------------------------------------- Werkzeugleiste (ueber der Karte) */
const Zeichen = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
export function ZeichenLeiste({ z, schliessen }: { z: Zeichnen; schliessen: () => void }) {
  const knopf = (an: boolean) => `grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${an ? 'bg-akz text-[#04050a]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`;
  const [kopiert, setKopiert] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      className="absolute bottom-4 left-1/2 z-20 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/10 bg-fl/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      {WERKZEUGE.map(([k, t, d]) => <button key={k} type="button" title={t} onClick={() => z.setWerkzeug(z.werkzeug === k ? null : k)} className={knopf(z.werkzeug === k)}><Zeichen d={d} /></button>)}
      <span className="mx-1 h-6 w-px bg-white/10" />
      {FARBEN.map((f) => <button key={f} type="button" title={f} onClick={() => z.setFarbe(f)} className={`h-5 w-5 shrink-0 rounded-full border-2 transition ${z.farbe === f ? 'scale-125 border-white' : 'border-white/15'}`} style={{ background: f }} />)}
      <input type="range" min={1} max={8} value={z.breite} onChange={(e) => z.setBreite(Number(e.target.value))} title="Thickness" className="mx-1 w-16" style={{ accentColor: 'rgb(var(--akz))' }} />
      <span className="mx-1 h-6 w-px bg-white/10" />
      <button type="button" title="Undo" disabled={!z.kannRueck} onClick={z.rueck} className={`${knopf(false)} disabled:opacity-25`}><Zeichen d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></button>
      <button type="button" title="Redo" disabled={!z.kannVor} onClick={z.wieder} className={`${knopf(false)} disabled:opacity-25`}><Zeichen d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></button>
      <button type="button" title="Clear" disabled={!z.formen.length} onClick={z.loeschen} className={`${knopf(false)} disabled:opacity-25`}><Zeichen d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></button>
      {z.entwurf?.a === 'polygon' && <button type="button" onClick={z.polygonFertig} className="knopf !px-2.5 !py-1.5 !text-xs">Close shape</button>}
      <button type="button" disabled={!z.formen.length} onClick={() => z.speichern()} className="knopf !px-3 !py-1.5 !text-xs">Save</button>
      <button type="button" disabled={!z.formen.length} onClick={() => { navigator.clipboard?.writeText(z.link()).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 1500); }).catch(() => {}); }} className="knopf !px-3 !py-1.5 !text-xs">{kopiert ? 'Copied' : 'Share link'}</button>
      <button type="button" onClick={() => { z.setWerkzeug(null); schliessen(); }} className="knopf-prim !rounded-lg !px-3 !py-1.5 !text-xs">Done</button>
    </motion.div>
  );
}

/** Texteingabe an der angeklickten Stelle. */
export function TextEingabe({ z, ort }: { z: Zeichnen; ort: { x: number; y: number } }) {
  const [t, setT] = useState('');
  return (
    <form onPointerDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); z.textSetzen(t); }} className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: ort.x, top: ort.y }}>
      <input autoFocus value={t} onChange={(e) => setT(e.target.value)} onBlur={() => z.textSetzen(t)} onKeyDown={(e) => { if (e.key === 'Escape') z.setTextOrt(null); }} placeholder="Label…"
        className="w-44 rounded-lg border border-akz/60 bg-fl/95 px-2 py-1 text-sm font-bold text-white focus:outline-none" style={{ color: z.farbe }} />
    </form>
  );
}

/* ---------------------------------------------- Seitentafel: Meine Zeichnungen (Inhalt eines Reiters der Karten-Tafel) */
export function MeineZeichnungen({ z, starten }: { z: Zeichnen; starten: () => void }) {
  const [name, setName] = useState('');
  const l = z.ablage.wert;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">My drawings · {l.length}</p>
      <div className="mt-2"><AblageHinweis ort={z.ablage.ort} /></div>
      <AnimatePresence>
        {z.geteilt && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl border border-akz/30 bg-akz/10 px-3 py-2 text-xs text-white/85">Someone shared this drawing with you. Save it to keep a copy.</motion.p>}
      </AnimatePresence>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={starten} className="knopf-prim flex-1 !py-2"><Zeichen d="M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3" />Draw on the map</button>
        <button type="button" onClick={z.neu} className="knopf">New</button>
      </div>
      {z.formen.length > 0 && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); z.speichern(name.trim() || undefined); setName(''); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={z.offenId ? 'Rename…' : 'Name this drawing…'} className="eingabe min-w-0 flex-1 !py-1.5" />
          <button type="submit" className="knopf !py-1.5">Save</button>
        </form>
      )}
      <ul className="mt-3 space-y-1">
        {l.map((d) => (
          <li key={d.id} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm ${z.offenId === d.id ? 'bg-akz/10 ring-1 ring-akz/30' : 'hover:bg-white/[0.05]'}`}>
            <button type="button" onClick={() => z.oeffnen(d)} className="min-w-0 flex-1 text-left">
              <span className="block truncate font-semibold text-white/85">{d.name}</span>
              <span className="block text-[10px] text-white/35">{d.formen.length} shapes · {new Date(d.stand).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </button>
            <button type="button" title="Copy share link" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#zeichnung=${kodieren(d.formen)}`)} className="grid h-7 w-7 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"><Zeichen d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></button>
            <button type="button" title="Delete" onClick={() => z.ablage.setzen((x) => x.filter((y) => y.id !== d.id))} className="grid h-7 w-7 place-items-center rounded-lg text-white/35 hover:bg-red-500/15 hover:text-red-300"><Zeichen d="M6 6l12 12M18 6L6 18" /></button>
          </li>
        ))}
      </ul>
      {!l.length && <p className="mt-3 text-xs leading-relaxed text-white/45">Plan your drop, rotations or loot route – pen, lines, arrows, shapes, pins and labels. Saved drawings show up here and can be shared as a link.</p>}
    </div>
  );
}
