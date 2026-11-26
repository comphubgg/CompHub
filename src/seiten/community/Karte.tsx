import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Bald, TEAL, Ueberschrift } from './Teile';
import { Abzeichen, EBENEN, OrtNadel, SymbolVorlagen, ebeneVon, typVon } from './kartenSymbole';

/*
 * Interaktive Karte der Insel von heute (Betreiber, 26.11.2026). Bild /bilder/karte-leer.png bzw. karte-orte.png (fortnite-api.com ueber
 * /api/fortnite-map), Ortspunkte aus derselben Antwort (Epics Weltkoordinaten in cm). Weltausschnitt des Bildes: lib/zonenKarte.ts BR_RAHMEN[43]
 * auf main (x0 -142.800, y0 -146.000, Spanne 301.500; Bildspalte = x, Bildzeile = y) - beim naechsten Saisonwechsel neu messen.
 *
 * Objekt-Ebenen (Truhen, Munition, Slurp-Faesser ...): kommen aus einem eigenen Export der Spieldateien (karte/objekte.json, x/y/z in Unreal-cm).
 * Geladen wird /hub-daten/objekte.json - liegt die Datei nicht da, bleiben die Ebenen leer (mit Hinweis). Format:
 *   { probe?: true, hinweis?: string, objekte: [{ typ: 'chest', x, y, z, x2?, y2?, chance?, name? }] }   (x2/y2: Endpunkt, z. B. Zipline;
 *   chance: Erscheinungs-Wahrscheinlichkeit 0..1, falls das Objekt nicht immer da ist). Export-Auftrag: scratchpad/waffen-export-auftrag.md.
 *
 * Marker werden in Bildschirm-Pixeln gezeichnet (nicht mitskaliert), damit die Symbole bei jedem Zoom scharf bleiben; weit draussen werden
 * sie kleiner und gleichartige Nachbarn zu einem Marker mit Zahl zusammengefasst (Klick zoomt hinein).
 * Statt "objekte" darf auch ein blosses Array kommen.
 */

const RAHMEN = { x0: -142_800, y0: -146_000, spanne: 301_500 };
const zuProzent = (x: number, y: number) => ({ l: ((x - RAHMEN.x0) / RAHMEN.spanne) * 100, o: ((y - RAHMEN.y0) / RAHMEN.spanne) * 100 });

interface Ort { id: string; name: string; x: number; y: number; links: number; oben: number }
interface Objekt { typ: string; x: number; y: number; z?: number; x2?: number; y2?: number; chance?: number; name?: string }
/** Marker auf dem Bildschirm: ein Objekt oder (weit herausgezoomt) mehrere gleicher Art, die zu nah beieinander liegen. */
interface Gruppe { id: string; typ: string; px: number; py: number; liste: Objekt[] }

const GRID = 10;
const SPALTEN = 'ABCDEFGHIJ';

export default function Karte() {
  const [orte, setOrte] = useState<Ort[]>([]);
  const [stand, setStand] = useState<string | null>(null);
  const [objekte, setObjekte] = useState<Objekt[] | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const [an, setAn] = useState<Record<string, boolean>>(() => Object.fromEntries(EBENEN.map((e) => [e.typ, true])));
  const [namen, setNamen] = useState(true);
  const [epicBild, setEpicBild] = useState(false);
  const [gitter, setGitter] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Ort | null>(null);
  const [suche, setSuche] = useState('');

  useEffect(() => {
    fetch('/api/fortnite-map').then((r) => r.json()).then((j) => { setOrte(j?.orte ?? []); setStand(j?.stand ?? null); }).catch(() => {});
    fetch('/hub-daten/objekte.json', { cache: 'no-store' }).then((r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('fehlt');
      return r.json();
    }).then((j) => {
      const liste = (Array.isArray(j) ? j : j?.objekte ?? []) as Objekt[];
      setObjekte(liste.filter((o) => Number.isFinite(o?.x) && Number.isFinite(o?.y)).map((o) => ({ ...o, typ: typVon(String(o.typ ?? '')) })));
      if (!Array.isArray(j) && j?.probe) setProbe(String(j.hinweis ?? 'Sample data'));
    }).catch(() => setObjekte([]));
  }, []);

  /* ---------------------------------------------- Verschieben und Zoomen */
  const rahmen = useRef<HTMLDivElement>(null);
  const [groesse, setGroesse] = useState({ b: 800, h: 800 });
  const [sicht, setSicht] = useState({ s: 1, tx: 0, ty: 0 });
  const basis = Math.min(groesse.b, groesse.h);
  // Start: auf die Insel gezoomt (das Bild hat viel Meer drumherum), Mitte der Landflaeche bei etwa 54 % / 56 %.
  const zuruecksetzen = useCallback(() => {
    const s = 1.55;
    setSicht({ s, tx: groesse.b / 2 - 0.54 * basis * s, ty: groesse.h / 2 - 0.565 * basis * s });
  }, [groesse, basis]);
  useEffect(() => {
    const el = rahmen.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setGroesse({ b: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { zuruecksetzen(); }, [zuruecksetzen]);

  const zoomen = useCallback((faktor: number, mx?: number, my?: number) => {
    setSicht((v) => {
      const s = Math.min(10, Math.max(0.8, v.s * faktor));
      const px = mx ?? groesse.b / 2; const py = my ?? groesse.h / 2;
      return { s, tx: px - (px - v.tx) * (s / v.s), ty: py - (py - v.ty) * (s / v.s) };
    });
  }, [groesse]);
  useEffect(() => {
    const el = rahmen.current; if (!el) return undefined;
    const rad = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomen(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', rad, { passive: false });
    return () => el.removeEventListener('wheel', rad);
  }, [zoomen]);
  const ziehen = useRef<{ x: number; y: number; tx: number; ty: number; bewegt: boolean } | null>(null);
  const [zeiger, setZeiger] = useState<{ x: number; y: number } | null>(null);
  const gezogen = useRef(false); // war der letzte Druck ein Ziehen? Dann ist das Loslassen kein Klick auf einen Marker.
  function runter(e: React.PointerEvent) { (e.target as Element).setPointerCapture?.(e.pointerId); gezogen.current = false; ziehen.current = { x: e.clientX, y: e.clientY, tx: sicht.tx, ty: sicht.ty, bewegt: false }; }
  function bewegen(e: React.PointerEvent) {
    const r = rahmen.current!.getBoundingClientRect();
    const mx = e.clientX - r.left; const my = e.clientY - r.top;
    setZeiger({ x: ((mx - sicht.tx) / (basis * sicht.s)) * RAHMEN.spanne + RAHMEN.x0, y: ((my - sicht.ty) / (basis * sicht.s)) * RAHMEN.spanne + RAHMEN.y0 });
    const z = ziehen.current; if (!z) return;
    const dx = e.clientX - z.x; const dy = e.clientY - z.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { z.bewegt = true; gezogen.current = true; }
    setSicht((v) => ({ ...v, tx: z.tx + dx, ty: z.ty + dy }));
  }
  function hin(o: Ort) {
    const s = Math.max(sicht.s, 3.2);
    setSicht({ s, tx: groesse.b / 2 - (o.links / 100) * basis * s, ty: groesse.h / 2 - (o.oben / 100) * basis * s });
    setGewaehlt(o);
  }

  const zaehlen = useMemo(() => { const m: Record<string, number> = {}; for (const o of objekte ?? []) m[o.typ] = (m[o.typ] ?? 0) + 1; return m; }, [objekte]);
  const sichtbar = useMemo(() => (objekte ?? []).filter((o) => an[o.typ]), [objekte, an]);
  const r = (px: number) => (px * 1000) / (basis * sicht.s);

  /* ---------------------------------------------- Marker: Groesse je Zoom, Zusammenfassen weit draussen */
  const skala = basis * sicht.s; // Bildschirm-Pixel je ganze Bildbreite
  const symbolPx = Math.round(Math.min(26, Math.max(14, 8 + sicht.s * 4.2)));
  const gruppen = useMemo(() => {
    // Weit draussen grob zusammenfassen (Uebersicht), nah dran nur, was sich ueberlappen wuerde, ganz nah gar nicht.
    const zelle = sicht.s >= 6 ? 0 : symbolPx * (sicht.s < 2.4 ? 2.1 : sicht.s < 4 ? 1.5 : 1.15);
    const m = new Map<string, { typ: string; sx: number; sy: number; liste: Objekt[] }>();
    sichtbar.forEach((o, i) => {
      const p = zuProzent(o.x, o.y);
      let px = (p.l / 100) * skala; let py = (p.o / 100) * skala;
      if (o.x2 !== undefined && o.y2 !== undefined) { const q = zuProzent(o.x2, o.y2); px = (px + (q.l / 100) * skala) / 2; py = (py + (q.o / 100) * skala) / 2; }
      const id = zelle ? `${o.typ}:${Math.floor(px / zelle)}:${Math.floor(py / zelle)}` : `${o.typ}:${i}`;
      const g = m.get(id) ?? { typ: o.typ, sx: 0, sy: 0, liste: [] };
      g.sx += px; g.sy += py; g.liste.push(o); m.set(id, g);
    });
    return [...m.entries()].map(([id, g]): Gruppe => ({ id, typ: g.typ, px: g.sx / g.liste.length, py: g.sy / g.liste.length, liste: g.liste }));
  }, [sichtbar, skala, sicht.s, symbolPx]);
  const [ueber, setUeber] = useState<string | null>(null);
  const [fest, setFest] = useState<string | null>(null);
  const tipp = gruppen.find((g) => g.id === (fest ?? ueber)) ?? null;
  const imBild = (g: Gruppe) => g.px + sicht.tx > -40 && g.px + sicht.tx < groesse.b + 40 && g.py + sicht.ty > -40 && g.py + sicht.ty < groesse.h + 40;
  function markerKlick(g: Gruppe) {
    if (gezogen.current) return;
    if (g.liste.length > 1) { zoomen(2.2, g.px + sicht.tx, g.py + sicht.ty); setFest(null); return; }
    setFest((f) => (f === g.id ? null : g.id));
  }
  // Objekte rund um einen gewaehlten Ort (120 m Umkreis)
  const umOrt = useMemo(() => {
    if (!gewaehlt || !objekte?.length) return [];
    const m: Record<string, number> = {};
    for (const o of objekte) if (Math.hypot(o.x - gewaehlt.x, o.y - gewaehlt.y) < 12_000) m[o.typ] = (m[o.typ] ?? 0) + 1;
    return EBENEN.filter((e) => m[e.typ]).map((e) => ({ typ: e.typ, titel: e.titel, n: m[e.typ] }));
  }, [gewaehlt, objekte]);
  const gefiltert = orte.filter((o) => o.name.toLowerCase().includes(suche.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const benannt = (o: Ort) => /\.POI\./.test(o.id);
  const imGitter = (o: { links: number; oben: number }) => `${SPALTEN[Math.min(GRID - 1, Math.floor(o.links / (100 / GRID)))]}${Math.min(GRID, Math.floor(o.oben / (100 / GRID)) + 1)}`;

  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Map" titel="The island" farbe={TEAL}
        text={<>Scroll to zoom, drag to move. Positions are Epic's own world coordinates{stand ? <> · map image from {new Date(stand).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</> : null}.</>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Karte */}
        <Glas className="relative overflow-hidden">
          <div ref={rahmen} className="relative h-[calc(100vh-250px)] min-h-[560px] cursor-grab touch-none select-none overflow-hidden bg-[rgb(13,81,151)] active:cursor-grabbing"
            onPointerDown={runter} onPointerMove={bewegen} onPointerUp={() => { ziehen.current = null; }} onPointerLeave={() => { ziehen.current = null; setZeiger(null); }}
            onDoubleClick={(e) => { const rr = rahmen.current!.getBoundingClientRect(); zoomen(1.8, e.clientX - rr.left, e.clientY - rr.top); }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: basis, height: basis, transform: `translate(${sicht.tx}px, ${sicht.ty}px) scale(${sicht.s})` }}>
              <img src={epicBild ? '/bilder/karte-orte.png' : '/bilder/karte-leer.png'} alt="Map" draggable={false} className="absolute inset-0 h-full w-full" style={{ imageRendering: sicht.s > 4 ? 'auto' : undefined }} />
              {gitter && (
                <svg viewBox="0 0 1000 1000" className="pointer-events-none absolute inset-0 h-full w-full">
                  {Array.from({ length: GRID - 1 }, (_, i) => (
                    <g key={i} stroke="rgba(255,255,255,0.28)" strokeWidth={r(1)}>
                      <line x1={(i + 1) * 100} y1={0} x2={(i + 1) * 100} y2={1000} /><line x1={0} y1={(i + 1) * 100} x2={1000} y2={(i + 1) * 100} />
                    </g>
                  ))}
                  {Array.from({ length: GRID * GRID }, (_, i) => (
                    <text key={i} x={(i % GRID) * 100 + r(5)} y={Math.floor(i / GRID) * 100 + r(14)} fill="rgba(255,255,255,0.55)" fontSize={r(11)} fontWeight={700}>{SPALTEN[i % GRID]}{Math.floor(i / GRID) + 1}</text>
                  ))}
                </svg>
              )}
            </div>
            {/* Objekte - eine SVG-Ebene in Bildschirm-Pixeln (Symbole per <use>), damit auch Tausende Marker scharf und fluessig bleiben */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <SymbolVorlagen />
              <g transform={`translate(${sicht.tx} ${sicht.ty})`}>
                {sichtbar.filter((o) => o.x2 !== undefined && o.y2 !== undefined).map((o, i) => {
                  const p = zuProzent(o.x, o.y); const q = zuProzent(o.x2!, o.y2!);
                  return <line key={i} x1={(p.l / 100) * skala} y1={(p.o / 100) * skala} x2={(q.l / 100) * skala} y2={(q.o / 100) * skala} stroke={ebeneVon(o.typ).farbe} strokeOpacity={0.85} strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />;
                })}
                <g filter="url(#k-schatten)">
                  {gruppen.filter(imBild).map((g) => {
                    const n = g.liste.length; const gr = n > 1 ? symbolPx + 2 : symbolPx; const aktiv = tipp?.id === g.id;
                    return (
                      <g key={g.id} className="cursor-pointer" style={{ pointerEvents: 'auto' }} onPointerEnter={() => setUeber(g.id)} onPointerLeave={() => setUeber((u) => (u === g.id ? null : u))} onClick={() => markerKlick(g)}>
                        <use href={`#k-${g.typ}`} x={g.px - gr / 2} y={g.py - gr / 2} width={gr} height={gr} transform={aktiv ? `translate(${g.px} ${g.py}) scale(1.22) translate(${-g.px} ${-g.py})` : undefined} />
                        {n > 1 && (
                          <g>
                            <rect x={g.px + gr / 2 - 9} y={g.py - gr / 2 - 7} width={n > 99 ? 22 : n > 9 ? 18 : 14} height={14} rx={7} fill="#06080f" stroke={ebeneVon(g.typ).farbe} strokeWidth={1.2} />
                            <text x={g.px + gr / 2 - 9 + (n > 99 ? 11 : n > 9 ? 9 : 7)} y={g.py - gr / 2 + 3.6} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#fff">{n > 99 ? '99+' : n}</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
            {/* Hinweis zum Marker: Art, Koordinaten, Hoehe - beim Darueberfahren, per Klick festgehalten */}
            <AnimatePresence>
              {tipp && (
                <motion.div key={tipp.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`absolute z-10 w-max min-w-[190px] max-w-[260px] -translate-x-1/2 -translate-y-full rounded-2xl border border-white/15 bg-[#06080f]/90 p-3 text-left shadow-2xl backdrop-blur-xl ${fest ? '' : 'pointer-events-none'}`}
                  style={{ left: tipp.px + sicht.tx, top: tipp.py + sicht.ty - symbolPx / 2 - 10 }}>
                  <MarkerInfo g={tipp} skala={skala} gitter={imGitter} schliessen={fest ? () => setFest(null) : undefined} />
                </motion.div>
              )}
            </AnimatePresence>
            {/* Orte - ausserhalb der skalierten Ebene, in Bildschirm-Pixeln: so bleiben Schrift und Nadeln bei jedem Zoom scharf */}
            {namen && !epicBild && orte.map((o) => (
              <button key={o.id} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => hin(o)}
                className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: sicht.tx + (o.links / 100) * basis * sicht.s, top: sicht.ty + (o.oben / 100) * basis * sicht.s - (benannt(o) ? 16 : 12) }}>
                <OrtNadel aktiv={gewaehlt?.id === o.id} klein={!benannt(o)} />
                <span className={`mt-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wide text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] ${benannt(o) ? 'text-[12px]' : 'text-[10px] text-white/80'} ${gewaehlt?.id === o.id ? 'bg-teal-500/50' : 'bg-black/35'}`}>{o.name}</span>
              </button>
            ))}
            {/* Bedienung */}
            <div className="absolute right-4 top-4 flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
              {[['+', () => zoomen(1.4)], ['−', () => zoomen(1 / 1.4)], ['⟲', zuruecksetzen]].map(([z, f]) => (
                <button key={z as string} type="button" onClick={f as () => void} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#06080f]/70 text-lg font-bold text-white backdrop-blur transition hover:border-teal-300/40 hover:text-teal-200">{z as string}</button>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 flex gap-2 text-[11px] font-semibold tabular-nums">
              <span className="rounded-lg bg-[#06080f]/75 px-2.5 py-1.5 text-white/70 backdrop-blur">{Math.round(sicht.s * 100)} %</span>
              {zeiger && <span className="rounded-lg bg-[#06080f]/75 px-2.5 py-1.5 text-white/70 backdrop-blur">X {Math.round(zeiger.x / 100).toLocaleString('en')} m · Y {Math.round(zeiger.y / 100).toLocaleString('en')} m</span>}
            </div>
            {probe && <div className="pointer-events-none absolute left-4 top-4 max-w-sm rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] font-semibold text-amber-100 backdrop-blur">SAMPLE DATA · {probe}</div>}
          </div>
        </Glas>

        {/* Seitenleiste */}
        <div className="space-y-5">
          <AnimatePresence>
            {gewaehlt && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Glas className="border-teal-300/25 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">{benannt(gewaehlt) ? 'Named location' : 'Landmark'}</p>
                      <h3 className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">{gewaehlt.name}</h3>
                    </div>
                    <button type="button" onClick={() => setGewaehlt(null)} className="text-white/40 hover:text-white">✕</button>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[['Grid', imGitter(gewaehlt)], ['X', `${Math.round(gewaehlt.x / 100).toLocaleString('en')} m`], ['Y', `${Math.round(gewaehlt.y / 100).toLocaleString('en')} m`]].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-white/[0.04] px-2 py-2"><dt className="text-[10px] uppercase tracking-wider text-white/40">{k}</dt><dd className="text-sm font-bold tabular-nums text-white">{v}</dd></div>
                    ))}
                  </dl>
                  {umOrt.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {umOrt.map((u) => <span key={u.typ} title={u.titel} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] py-1 pl-1 pr-2 text-xs font-bold tabular-nums text-white"><Abzeichen typ={u.typ} groesse={18} />{u.n}</span>)}
                      <span className="self-center text-[10px] text-white/35">within 120 m</span>
                    </div>
                  ) : <p className="mt-3 text-xs text-white/40">Chests, ammo and more around {gewaehlt.name} <Bald text="export pending" /></p>}
                </Glas>
              </motion.div>
            )}
          </AnimatePresence>

          <Glas className="p-5" verzoegerung={0.1}>
            <h3 className="font-bold text-white">Layers</h3>
            <div className="mt-3 space-y-1.5">
              {[['Location names', namen, setNamen], ['Epic\'s map labels', epicBild, setEpicBild], ['Grid', gitter, setGitter]].map(([t, w, f]) => (
                <Schalter key={t as string} titel={t as string} an={w as boolean} umschalten={() => (f as (x: (v: boolean) => boolean) => void)((v) => !v)} />
              ))}
            </div>
            <div className="my-4 h-px bg-white/5" />
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Objects</p>
              {objekte && !objekte.length && <Bald text="export pending" />}
            </div>
            <div className="mt-2 space-y-1.5">
              {EBENEN.filter((e) => e.typ !== 'other' || zaehlen.other).map((e) => (
                <Schalter key={e.typ} titel={e.titel} typ={e.typ} an={an[e.typ]} anzahl={zaehlen[e.typ] ?? 0} leer={!zaehlen[e.typ]}
                  umschalten={() => setAn((a) => ({ ...a, [e.typ]: !a[e.typ] }))} />
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-white/35">Object positions come from our own export of the game files – every chest, ammo box and barrel at its exact spot. Until it lands, the layers stay empty.</p>
          </Glas>

          <Glas className="p-5" verzoegerung={0.18}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-white">Locations</h3>
              <span className="text-xs text-white/40">{orte.length}</span>
            </div>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a location…"
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
            <ul className="mt-2 max-h-[320px] space-y-0.5 overflow-y-auto pr-1">
              {gefiltert.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => hin(o)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-white/5 ${gewaehlt?.id === o.id ? 'bg-teal-300/10 text-white' : 'text-white/75'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${benannt(o) ? 'bg-white' : 'bg-white/40'}`} />
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <span className="text-[11px] tabular-nums text-white/35">{imGitter(o)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Glas>
        </div>
      </div>
    </div>
  );
}

function MarkerInfo({ g, skala, gitter, schliessen }: { g: Gruppe; skala: number; gitter: (o: { links: number; oben: number }) => string; schliessen?: () => void }) {
  const e = ebeneVon(g.typ); const n = g.liste.length; const o = g.liste[0];
  const feld = gitter({ links: (g.px / skala) * 100, oben: (g.py / skala) * 100 });
  const m = (cm: number) => `${Math.round(cm / 100).toLocaleString('en')} m`;
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Abzeichen typ={g.typ} groesse={26} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-tight text-white">{n > 1 ? `${n} ${e.titel.toLowerCase()}` : (o.name ?? e.einzeln)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: e.farbe }}>{n > 1 ? 'Cluster · click to zoom in' : o.name ? e.einzeln : `Grid ${feld}`}</p>
        </div>
        {schliessen && <button type="button" onClick={schliessen} className="self-start text-xs text-white/40 hover:text-white">✕</button>}
      </div>
      {n === 1 ? (
        <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
          {[['X', m(o.x)], ['Y', m(o.y)], [o.z !== undefined ? 'Height' : 'Grid', o.z !== undefined ? m(o.z) : feld]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/[0.05] px-1.5 py-1"><dt className="text-[9px] uppercase tracking-wider text-white/40">{k}</dt><dd className="text-xs font-bold tabular-nums text-white">{v}</dd></div>
          ))}
        </dl>
      ) : <p className="mt-2 text-xs text-white/55">Around grid {feld}. Zoom in to see each one.</p>}
      {n === 1 && (o.name || o.chance !== undefined || o.x2 !== undefined) && (
        <p className="mt-2 flex justify-between text-[11px] text-white/45">
          <span>{o.name ? `Grid ${feld}` : ''}{o.x2 !== undefined && o.y2 !== undefined ? `${o.name ? ' · ' : ''}${m(Math.hypot(o.x2 - o.x, o.y2 - o.y))} long` : ''}</span>
          {o.chance !== undefined && <span className="font-semibold text-white/70">Spawns {Math.round(o.chance * 100)} %</span>}
        </p>
      )}
    </div>
  );
}

function Schalter({ titel, an, umschalten, typ, anzahl, leer }: { titel: string; an: boolean; umschalten: () => void; typ?: string; anzahl?: number; leer?: boolean }) {
  return (
    <button type="button" onClick={umschalten} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-white/5 ${leer ? 'opacity-50' : ''}`}>
      {typ ? <Abzeichen typ={typ} groesse={22} /> : null}
      <span className="flex-1 text-white/80">{titel}</span>
      {anzahl !== undefined && <span className="text-xs tabular-nums text-white/40">{anzahl.toLocaleString('en')}</span>}
      <span className={`relative h-5 w-9 rounded-full transition ${an ? 'bg-teal-400/80' : 'bg-white/10'}`}>
        <motion.span layout className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${an ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
