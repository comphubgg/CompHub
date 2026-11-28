import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { ZOOM_MAX, SCHLIESS_NAEHE, anker, begrenze, doppelKlickZiel, formFarbe, imPolygon, rahmen, rechteckPunkte, type Form, type Punkt, type Spot } from './kartenLib';

/*
 * Die Zeichenflaeche der Werkzeuge im Hub (Turnierkarte, Globals-Prognose) - wie die Karte im Karten-Werkzeug auf main:
 *  - Rad zoomt zum Zeiger, Ziehen verschiebt (ab Zoom > 1), Doppelklick zoomt in Stufen auf eine Form, langes Druecken (Ansicht) springt hin;
 *  - mit Baurecht: Rechteck aufziehen, freie Form Ecke fuer Ecke (am ersten Punkt schliessen), Doppelklick oeffnet eine Form, gewaehlte Form
 *    ziehen verschiebt sie, die Ecken ziehen sie um (beim Rechteck bleibt die Gegenecke fest);
 *  - Teams werden per Drag & Drop auf eine Form gelegt (die Kennung reist als "text/team" und zusaetzlich ueber gezogen.current).
 * Waehrend des Ziehens wird der Ausschnitt direkt in die Ebene geschrieben (kein React-Durchlauf je Bewegung), danach in den Zustand.
 */

export interface Gruppe { key: string; zeilen: string[] }
export interface Steuerung { zeigeSpot: (s: { punkte: Punkt[] }) => void; zurueck: () => void; zoomen: (f: number) => void; zoom: () => number }

export default function Zeichenflaeche({
  spots, anzeige, gruppen, schrift, bild, darfBauen = false, werkzeug = null, setWerkzeug, gewaehlt = null, setGewaehlt,
  aendern, merke, neueForm, darfAblegen = false, abgelegt, gezogen, labelKlick, labelZiehbar = false, pause, marken, oben, unten,
  steuerung, bildRef, voll = false, hervorheben,
}: {
  spots: Spot[];
  /** Die angezeigte Fassung (Noble leicht vereinfacht) - gleiche Reihenfolge wie spots. */
  anzeige?: Spot[];
  gruppen: (s: Spot) => Gruppe[];
  schrift: number;
  bild: string;
  darfBauen?: boolean;
  werkzeug?: Form | null;
  setWerkzeug?: (w: Form | null) => void;
  gewaehlt?: string | null;
  setGewaehlt?: (id: string | null) => void;
  aendern?: (f: (alt: Spot[]) => Spot[]) => void;
  merke?: () => void;
  neueForm?: (punkte: Punkt[], form: Form) => void;
  darfAblegen?: boolean;
  abgelegt?: (spot: Spot | null, key: string, p: Punkt) => void;
  gezogen?: MutableRefObject<string | null>;
  labelKlick?: (spotId: string, key: string) => void;
  labelZiehbar?: boolean;
  pause?: { quelle: string; klar: number } | null;
  marken?: Array<{ id: string; x: number; y: number; text: string; an: boolean }>;
  oben?: ReactNode;
  unten?: ReactNode;
  steuerung?: MutableRefObject<Steuerung | null>;
  bildRef?: MutableRefObject<HTMLImageElement | null>;
  voll?: boolean;
  hervorheben?: string | null;
}) {
  const flaeche = useRef<HTMLDivElement | null>(null);
  const ebene = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mitte, setMitte] = useState<Punkt>({ x: 50, y: 50 });
  const zr = useRef(1); const mr = useRef<Punkt>({ x: 50, y: 50 });
  const [hover, setHover] = useState<string | null>(null);
  const [rohbau, setRohbau] = useState<Punkt[]>([]);
  const [zeiger, setZeiger] = useState<Punkt | null>(null);
  const [gummi, setGummi] = useState<{ von: Punkt; bis: Punkt } | null>(null);
  const [geladen, setGeladen] = useState(false);
  type Griff = { art: 'karte'; sx: number; sy: number; m: Punkt; w: number; h: number }
    | { art: 'flaeche'; start: Punkt } | { art: 'ecke'; index: number; gegen: Punkt | null };
  const griff = useRef<Griff | null>(null);
  const gummiRef = useRef<{ von: Punkt; bis: Punkt } | null>(null);
  const halte = useRef<{ uhr: ReturnType<typeof setTimeout>; p: Punkt } | null>(null);
  const lauf = useRef<number | null>(null);
  const malUhr = useRef<number | null>(null);
  const festUhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!werkzeug) { setRohbau([]); setZeiger(null); setGummi(null); gummiRef.current = null; } }, [werkzeug]);
  useEffect(() => { setGeladen(false); }, [bild]);

  const male = useCallback((z: number, m: Punkt) => {
    zr.current = z; mr.current = m;
    if (malUhr.current !== null) return;
    malUhr.current = requestAnimationFrame(() => {
      malUhr.current = null;
      const el = ebene.current; if (!el) return;
      el.style.transform = `scale(${zr.current}) translate(${50 / zr.current - mr.current.x}%, ${50 / zr.current - mr.current.y}%)`;
      el.style.setProperty('--z', String(zr.current));
    });
  }, []);
  const fest = useCallback(() => {
    if (festUhr.current) clearTimeout(festUhr.current);
    festUhr.current = setTimeout(() => { festUhr.current = null; setZoom(zr.current); setMitte(mr.current); }, 160);
  }, []);
  useEffect(() => () => { if (festUhr.current) clearTimeout(festUhr.current); if (lauf.current) cancelAnimationFrame(lauf.current); }, []);

  /** Weich an ein Ziel gleiten (650 ms, ein- und ausschwingend). */
  const gleite = useCallback((z1: number, m1: Punkt) => {
    if (lauf.current) cancelAnimationFrame(lauf.current);
    const zz = Math.max(1, Math.min(ZOOM_MAX, z1)); const mm = begrenze(zz, m1);
    const z0 = zr.current, m0 = { ...mr.current }, t0 = performance.now();
    const schritt = (jetzt: number) => {
      const t = Math.min(1, (jetzt - t0) / 650); const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      male(z0 + (zz - z0) * e, { x: m0.x + (mm.x - m0.x) * e, y: m0.y + (mm.y - m0.y) * e });
      if (t < 1) lauf.current = requestAnimationFrame(schritt); else { lauf.current = null; setZoom(zz); setMitte(mm); }
    };
    lauf.current = requestAnimationFrame(schritt);
  }, [male]);

  const zeigeSpot = useCallback((s: { punkte: Punkt[] }) => {
    const r = rahmen(s.punkte);
    gleite(Math.min(ZOOM_MAX, 55 / Math.max(r.breite, r.hoehe, 4)), { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 });
  }, [gleite]);
  useEffect(() => {
    if (!steuerung) return;
    steuerung.current = { zeigeSpot, zurueck: () => gleite(1, { x: 50, y: 50 }), zoomen: (f) => gleite(zr.current * f, mr.current), zoom: () => zr.current };
  }, [steuerung, zeigeSpot, gleite]);

  /* Beim ersten Mal auf die belegten Stellen einpassen (Betreiber: "viel zu viel blauer Rand") - danach nie wieder von selbst. */
  const eingepasst = useRef(false);
  useEffect(() => {
    if (eingepasst.current || !spots.length) return;
    eingepasst.current = true;
    const x0 = Math.min(...spots.flatMap((s) => s.punkte.map((p) => p.x))), x1 = Math.max(...spots.flatMap((s) => s.punkte.map((p) => p.x)));
    const y0 = Math.min(...spots.flatMap((s) => s.punkte.map((p) => p.y))), y1 = Math.max(...spots.flatMap((s) => s.punkte.map((p) => p.y)));
    const zz = Math.min(2.4, 88 / Math.max(x1 - x0, y1 - y0, 1));
    if (zz > 1.12) gleite(zz, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  }, [spots, gleite]);

  /* Esc beendet das Zeichnen einer Form. */
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') setWerkzeug?.(null); };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [setWerkzeug]);

  /** Bildschirm -> Kartenprozent. */
  const pos = useCallback((e: { clientX: number; clientY: number }): Punkt => {
    const el = flaeche.current; if (!el) return { x: 50, y: 50 };
    const k = el.getBoundingClientRect(); const s = 100 / zr.current;
    return {
      x: Math.min(100, Math.max(0, mr.current.x - s / 2 + ((e.clientX - k.left) / k.width) * s)),
      y: Math.min(100, Math.max(0, mr.current.y - s / 2 + ((e.clientY - k.top) / k.height) * s)),
    };
  }, []);

  // Rad: zum Zeiger zoomen, die Seite scrollt dabei nicht.
  useEffect(() => {
    const el = flaeche.current; if (!el) return undefined;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      if (lauf.current) { cancelAnimationFrame(lauf.current); lauf.current = null; }
      const k = el.getBoundingClientRect(); const fx = (e.clientX - k.left) / k.width, fy = (e.clientY - k.top) / k.height;
      const z = zr.current, s = 100 / z; const px = mr.current.x - s / 2 + fx * s, py = mr.current.y - s / 2 + fy * s;
      const z2 = Math.max(1, Math.min(ZOOM_MAX, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); const s2 = 100 / z2;
      male(z2, begrenze(z2, { x: px + s2 * (0.5 - fx), y: py + s2 * (0.5 - fy) })); fest();
    };
    el.addEventListener('wheel', rad, { passive: false });
    return () => el.removeEventListener('wheel', rad);
  }, [male, fest]);

  const treffer = (p: Punkt) => [...spots].reverse().find((s) => imPolygon(p, s.punkte));
  const halteAus = () => { if (halte.current) clearTimeout(halte.current.uhr); halte.current = null; };

  const runter = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (lauf.current) { cancelAnimationFrame(lauf.current); lauf.current = null; setZoom(zr.current); setMitte(mr.current); }
    const p = pos(e);
    const k = flaeche.current!.getBoundingClientRect();
    const karte: Griff = { art: 'karte', sx: e.clientX, sy: e.clientY, m: mr.current, w: k.width, h: k.height };
    if (!darfBauen) {
      const t = !werkzeug ? treffer(p) : undefined;
      if (t) halte.current = { p, uhr: setTimeout(() => { halte.current = null; griff.current = null; zeigeSpot(t); }, 420) };
      if (zr.current > 1) griff.current = karte;
      return;
    }
    if (werkzeug === 'polygon') {
      if (rohbau.length >= 3 && Math.hypot(rohbau[0].x - p.x, rohbau[0].y - p.y) < SCHLIESS_NAEHE / Math.sqrt(zr.current)) {
        neueForm?.(rohbau, 'polygon'); setRohbau([]); setZeiger(null); setWerkzeug?.(null); return;
      }
      setRohbau((a) => [...a, p]); return;
    }
    if (werkzeug === 'rechteck') { gummiRef.current = { von: p, bis: p }; setGummi(gummiRef.current); return; }
    const t = treffer(p);
    if (t && t.id === gewaehlt) { merke?.(); griff.current = { art: 'flaeche', start: p }; return; }
    if (!t) setGewaehlt?.(null);
    if (zr.current > 1) griff.current = karte;
  };

  const bewegt = (e: React.MouseEvent) => {
    const p = pos(e);
    if (!griff.current && !gummiRef.current && !werkzeug) {
      const d = treffer(p)?.id ?? null; if (d !== hover) setHover(d);
    }
    if (halte.current && Math.hypot(p.x - halte.current.p.x, p.y - halte.current.p.y) > 0.8) halteAus();
    if (werkzeug === 'polygon' && rohbau.length) setZeiger(p);
    if (gummiRef.current) { gummiRef.current = { ...gummiRef.current, bis: p }; setGummi(gummiRef.current); return; }
    const g = griff.current; if (!g) return;
    if (g.art === 'karte') {
      const s = 100 / zr.current;
      male(zr.current, begrenze(zr.current, { x: g.m.x - ((e.clientX - g.sx) / g.w) * s, y: g.m.y - ((e.clientY - g.sy) / g.h) * s }));
      return;
    }
    const id = gewaehlt; if (!id || !aendern) return;
    aendern((alt) => alt.map((s) => {
      if (s.id !== id) return s;
      if (g.art === 'flaeche') { const dx = p.x - g.start.x, dy = p.y - g.start.y; return { ...s, punkte: s.punkte.map((q) => ({ x: q.x + dx, y: q.y + dy })) }; }
      if (s.form === 'rechteck' && s.punkte.length === 4 && g.gegen) return { ...s, punkte: rechteckPunkte(p, g.gegen) };
      return { ...s, punkte: s.punkte.map((q, i) => (i === g.index ? p : q)) };
    }));
    if (g.art === 'flaeche') griff.current = { art: 'flaeche', start: p };
  };

  const hoch = (e: React.MouseEvent) => {
    const z = gummiRef.current;
    if (z && werkzeug === 'rechteck') {
      const bis = pos(e);
      if (Math.abs(bis.x - z.von.x) > 1 && Math.abs(bis.y - z.von.y) > 1) { neueForm?.(rechteckPunkte(z.von, bis), 'rechteck'); setWerkzeug?.(null); }
    }
    gummiRef.current = null; setGummi(null); halteAus();
    if (griff.current?.art === 'karte') { setZoom(zr.current); setMitte(mr.current); }
    griff.current = null;
  };

  const doppelt = (e: React.MouseEvent) => {
    if (werkzeug) return;
    const p = pos(e); const t = treffer(p);
    griff.current = null; halteAus();
    if (t && darfBauen) { setGewaehlt?.(t.id); return; }
    const ziel = doppelKlickZiel(t ? rahmen(t.punkte) : null, p, zr.current);
    gleite(ziel.zoom, ziel.mitte);
  };

  const fallen = (e: React.DragEvent) => {
    e.preventDefault();
    if (!darfAblegen) return;
    const key = e.dataTransfer.getData('text/team') || gezogen?.current || '';
    if (gezogen) gezogen.current = null;
    const p = pos(e);
    abgelegt?.(treffer(p) ?? null, key, p);
  };

  const gew = spots.find((s) => s.id === gewaehlt) ?? null;
  const zeigen = anzeige ?? spots;
  const knopf = 'grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/60 text-white backdrop-blur transition hover:border-akz/60 hover:bg-black/80';

  return (
    <div ref={flaeche}
      onMouseDown={runter} onMouseMove={bewegt} onMouseUp={hoch} onDoubleClick={doppelt}
      onMouseLeave={() => { setHover(null); halteAus(); gummiRef.current = null; setGummi(null); if (griff.current?.art === 'karte') { setZoom(zr.current); setMitte(mr.current); } griff.current = null; }}
      onDragOver={(e) => { if (darfAblegen) e.preventDefault(); }} onDrop={fallen}
      className={`relative mx-auto aspect-square select-none overflow-hidden bg-[#0b2340] ${voll ? 'h-full max-h-screen' : 'w-full rounded-3xl border border-white/[0.07]'} ${werkzeug ? 'cursor-crosshair' : zoom > 1.02 ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ containerType: 'inline-size', overscrollBehavior: 'contain' }}>
      <div ref={ebene} className="absolute inset-0 origin-top-left"
        style={{ transform: `scale(${zoom}) translate(${50 / zoom - mitte.x}%, ${50 / zoom - mitte.y}%)`, transformOrigin: '0 0', '--z': zoom } as CSSProperties}>
        <img ref={bildRef ?? undefined} src={bild} alt="" draggable={false} crossOrigin="anonymous" onLoad={() => setGeladen(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${geladen ? 'opacity-100' : 'opacity-0'}`} />
        {pause && <img src={pause.quelle} alt="" draggable={false} style={{ opacity: pause.klar / 100 }} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
        {/* Wasserzeichen wie auf jeder Karte der Seite */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -inset-1/2 grid content-center justify-center gap-x-14 gap-y-16 opacity-[0.075]" style={{ transform: 'rotate(-20deg)', gridTemplateColumns: 'repeat(4, max-content)' }}>
            {Array.from({ length: 32 }, (_, i) => <span key={i} className="whitespace-nowrap text-lg font-extrabold tracking-wide text-white" style={{ transform: i % 8 >= 4 ? 'translateX(50%)' : undefined }}>thecomphub.com</span>)}
          </div>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {zeigen.map((a, i) => {
            const s = darfBauen && gewaehlt === a.id ? spots[i] ?? a : a;
            const n = gruppen(s).length;
            const f = formFarbe(n, s.farbe);
            const an = hover === s.id || gewaehlt === s.id || hervorheben === s.id;
            return (
              <polygon key={s.id} points={s.punkte.map((p) => `${p.x},${p.y}`).join(' ')}
                strokeWidth={an ? 2.4 : 1.5} vectorEffect="non-scaling-stroke"
                style={{ fill: hervorheben === s.id ? 'rgb(var(--akz) / 0.4)' : f.fuellung, stroke: an ? 'rgb(var(--akz))' : f.rand, transition: 'fill .2s, stroke .2s', filter: an ? 'drop-shadow(0 0 6px rgb(var(--akz) / 0.6))' : undefined }} />
            );
          })}
          {gummi && <polygon points={rechteckPunkte(gummi.von, gummi.bis).map((p) => `${p.x},${p.y}`).join(' ')} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" style={{ fill: 'rgb(var(--akz) / 0.2)', stroke: 'rgb(var(--akz))' }} />}
          {rohbau.length > 0 && <polyline points={[...rohbau, ...(zeiger ? [zeiger] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(52,211,153,0.14)" stroke="#34d399" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        </svg>
        {rohbau.length >= 3 && <span style={{ left: `${rohbau[0].x}%`, top: `${rohbau[0].y}%`, transform: 'translate(-50%,-50%) scale(calc(1 / var(--z, 1)))' }} className="pointer-events-none absolute z-20 h-3.5 w-3.5 rounded-full border-2 border-emerald-400 bg-emerald-950" />}

        {darfBauen && gew && !werkzeug && gew.punkte.map((p, i) => (
          <button key={i} type="button" title="Drag the corner"
            onMouseDown={(e) => { e.stopPropagation(); merke?.(); griff.current = { art: 'ecke', index: i, gegen: gew.form === 'rechteck' && gew.punkte.length === 4 ? gew.punkte[(i + 2) % 4] : null }; }}
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%) scale(calc(1 / var(--z, 1)))' }}
            className="absolute z-20 grid h-6 w-6 cursor-grab place-items-center">
            <span className="h-3 w-3 rounded-sm border-2 border-akz bg-[#04050a]" />
          </button>
        ))}

        {zeigen.map((a, i) => {
          const s = darfBauen && gewaehlt === a.id ? spots[i] ?? a : a;
          const gs = gruppen(s);
          const leer = !gs.length;
          if (leer && !s.name) return null;
          const r = rahmen(s.punkte); const ak = anker(s.punkte);
          const liste = leer ? [{ key: '', zeilen: [s.name ?? ''] }] : gs;
          return (
            <div key={s.id} className="pointer-events-none absolute z-10 flex flex-col items-center justify-center text-center"
              style={{ left: `${ak.x - r.breite / 2}%`, top: `${ak.y - r.hoehe / 2}%`, width: `${r.breite}%`, height: `${r.hoehe}%` }}>
              {liste.map((g) => (
                <div key={g.key || 'name'}
                  draggable={labelZiehbar && !!g.key}
                  onDragStart={(e) => { e.dataTransfer.setData('text/team', g.key); if (gezogen) gezogen.current = g.key; }}
                  onMouseDown={(e) => { if (labelKlick && g.key) e.stopPropagation(); }}
                  onClick={labelKlick && g.key ? (e) => { e.stopPropagation(); labelKlick(s.id, g.key); } : undefined}
                  title={labelKlick && g.key ? 'Click removes the team from this spot' : undefined}
                  className={labelKlick && g.key ? 'pointer-events-auto cursor-pointer rounded hover:bg-rose-500/30' : ''}>
                  {g.zeilen.map((z, k) => (
                    <p key={k} className={`whitespace-nowrap font-semibold uppercase leading-[1.05] text-white ${leer ? 'opacity-75' : ''}`}
                      style={{ fontSize: `calc(${schrift}cqw / var(--z, 1))`, WebkitTextStroke: `calc(${schrift * 0.12}cqw / var(--z, 1)) #000`, paintOrder: 'stroke fill', textShadow: '0 0 2px #000' }}>{z}</p>
                  ))}
                </div>
              ))}
            </div>
          );
        })}

        {marken?.map((m) => (
          <span key={m.id} style={{ left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%,-50%) scale(calc(1 / var(--z, 1)))' }}
            className={`pointer-events-none absolute z-20 whitespace-nowrap rounded px-1 py-0.5 text-[9px] font-semibold shadow ${m.an ? 'bg-akz/90 text-white' : 'bg-black/80 text-white/40 line-through'}`}>{m.text}</span>
        ))}
      </div>

      {!geladen && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="h-7 w-7 animate-spin rounded-full border-2 border-akz/20 border-t-akz" /></div>}
      <div onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} className="absolute right-3 top-3 z-30 flex flex-col gap-1.5">
        {oben}
      </div>
      <div onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} className="absolute bottom-3 left-3 z-30 flex flex-wrap items-center gap-1.5">
        <button type="button" title="Zoom in" onClick={() => gleite(zr.current * 1.6, mr.current)} className={knopf}>+</button>
        <button type="button" title="Zoom out" onClick={() => gleite(zr.current / 1.6, mr.current)} className={knopf}>−</button>
        {zoom > 1.02 && <button type="button" onClick={() => gleite(1, { x: 50, y: 50 })} className="rounded-xl border border-white/10 bg-black/60 px-2.5 py-2 text-[11px] font-semibold text-white/80 backdrop-blur hover:border-akz/60">{zoom.toFixed(1)}× · reset</button>}
        {werkzeug === 'polygon' && <span className="rounded-xl bg-black/70 px-2.5 py-2 text-[11px] font-semibold text-emerald-300">Click corner by corner — click the first point to close ({rohbau.length} set) · Esc cancels</span>}
        {werkzeug === 'rechteck' && <span className="rounded-xl bg-black/70 px-2.5 py-2 text-[11px] font-semibold text-akz">Drag a rectangle on the map · Esc cancels</span>}
        {unten}
      </div>
    </div>
  );
}

/** Ein runder Werkzeugknopf fuer die Leiste an der Karte. */
export function WerkzeugKnopf({ titel, aktiv, gefahr, onClick, kind, aus }: { titel: string; aktiv?: boolean; gefahr?: boolean; onClick: () => void; kind: ReactNode; aus?: boolean }) {
  return (
    <button type="button" title={titel} aria-label={titel} onClick={onClick} disabled={aus}
      className={`grid h-9 w-9 place-items-center rounded-xl border backdrop-blur transition disabled:opacity-40 ${aktiv ? 'border-akz bg-akz text-[#04050a]'
        : gefahr ? 'border-white/10 bg-black/60 text-rose-300 hover:border-rose-400/70' : 'border-white/10 bg-black/60 text-white/80 hover:border-akz/60 hover:text-white'}`}>
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{kind}</svg>
    </button>
  );
}

export const IKONE = {
  vollbild: <><path d="M7.5 2.5h-5v5" /><path d="M12.5 2.5h5v5" /><path d="M17.5 12.5v5h-5" /><path d="M2.5 12.5v5h5" /></>,
  mittig: <><circle cx="10" cy="10" r="6" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></>,
  schloss: <><rect x="4" y="9" width="12" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>,
  muell: <><path d="M3.5 5.5h13" /><path d="M8 5.5V3.5h4v2" /><path d="M5 5.5 6 17h8l1-11.5" /></>,
  polygon: <path d="M10 2.2 16.6 5.4 18.2 12.3 13.8 17.8H6.2L1.8 12.3 3.4 5.4Z" />,
  rechteck: <rect x="3" y="4.5" width="14" height="11" rx="2" />,
  bild: <><rect x="4.5" y="3" width="11" height="15" rx="1.5" /><path d="M7.5 3V1.8h5V3" /><path d="M7.5 8.5h5" /><path d="M7.5 12h5" /></>,
  rueck: <path d="M4 10a6 6 0 1 0 2-4.5M4 3v3h3" />,
};
