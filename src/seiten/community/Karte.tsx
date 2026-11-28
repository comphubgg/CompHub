import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Segment } from '../../ds/Bausteine';
import { Kipp, Regler } from './teileA';
import { Abzeichen, EBENEN, GRUPPEN_KARTE, OrtNadel, SymbolVorlagen, chanceVon, ebeneVon, symbolQuelle, typVon, useOriginalSymbole } from './kartenSymbole';
import { MeineZeichnungen, TextEingabe, ZeichenEbene, ZeichenLeiste, zeichneFormen, useZeichnen } from './Zeichnen';
import { waffeVon } from './waffenNamen';

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
 *
 * Aufbau seit dem Design-System 3.0 (27.11.2026, Betreiber: "die Karte ist die Seite"): die Seite hat keinen Rand (Schale ohneRand) und fuellt
 * den Bildschirm unter der Leiste genau aus. Links die angedockte Tafel (Titel, 2D/3D, Reiter Layers / Places / Cup loot / Drawings - der Inhalt
 * rollt in sich), rechts die Karte bis an den Rand mit schwebender Werkzeugleiste. Auf dem Handy: Karte oben, Tafel darunter.
 * 3D: laedt die fertige Ansicht der lokalen 3D-Sitzung aus /hub-daten/3d/index.html in einem Rahmen, sobald die Datei dort liegt (nur lokal,
 * siehe tools/export-auftrag.md Schritt 5e) - sonst ein ehrlicher Satz. Der Rahmen bekommt die Objekte der Karte per postMessage
 * ({ type: 'comphub-objekte', ... }, Format in tools/export-auftrag.md Schritt "3D-Ansicht"), damit die 3D-Ansicht sie selbst zeichnen kann.
 *
 * Objekte wie bei fortnite.gg (Betreiber 28.11.2026): je Art das Original-Symbol aus dem Spiel (icons/karte/<typ>.png, sonst ein flaches
 * Ersatz-Symbol im Spielstil), Groesse waechst mit dem Zoom; Ziplines als Seil zwischen den zwei Endpfosten mit kleinen Punkten an den Enden;
 * Klick auf einen Marker oeffnet die Karte mit Art, Spawn-Chance (aus dem Export, sonst die Grundchance der Klasse), Hoehe, Planquadrat und
 * Gruppe ("2 of 5 spots"); zusammengefasst wird nur weit herausgezoomt.
 */

const RAHMEN = { x0: -142_800, y0: -146_000, spanne: 301_500 };
const zuProzent = (x: number, y: number) => ({ l: ((x - RAHMEN.x0) / RAHMEN.spanne) * 100, o: ((y - RAHMEN.y0) / RAHMEN.spanne) * 100 });

interface Ort { id: string; name: string; x: number; y: number; links: number; oben: number }
interface Objekt { typ: string; x: number; y: number; z?: number; x2?: number; y2?: number; chance?: number; name?: string; gruppe?: string; nr: number }
/** Linien-Objekt (Zipline): zwei Endpunkte statt eines Punkts */
const istLinie = (o: Objekt) => typeof o.x2 === 'number' && typeof o.y2 === 'number' && Number.isFinite(o.x2) && Number.isFinite(o.y2);
/** Ist das ganze Kartenbild kleiner als so viele Pixel (weiter draussen als die ganze Insel, oder das Handy), werden gleiche Marker zu Haufen mit Zahl zusammengefasst. */
const BUENDELN_BIS = 1050;
/*
 * Zusatz-Ebene "Looted in cups" (/hub-daten/kisten-aus-replays.json, aus unseren eigenen Cup-Replays): wie oft Spieler eine Truhe / Munitionskiste
 * geoeffnet haben und was herauskam. KEINE Truhenliste (nie geoeffnete fehlen, keine Spawn-Chancen) - deshalb aus, bis man sie einschaltet,
 * und klar beschriftet. Positionen stammen daher, wo die Beute lag (4,5-m-Cluster) - ungefaehr.
 */
interface Beute { typ: 'chest' | 'ammo_box'; x: number; y: number; z?: number; geoeffnet: number; anteil: number; loot: Array<{ item: string; n: number }> }
interface BeuteDatei { spiele: number; saison?: number; stand?: string; objekte: Beute[] }
/** Hitze-Farbe 0..1: blau -> gelb -> rot. */
const hitze = (a: number) => `hsl(${Math.round(210 - Math.min(1, Math.max(0, a)) * 210)} 95% ${55 + a * 5}%)`;
const MUNITION: Record<string, string> = {
  AthenaAmmoDataBulletsMedium: 'Medium ammo', AthenaAmmoDataBulletsLight: 'Light ammo', AthenaAmmoDataBulletsHeavy: 'Heavy ammo', AthenaAmmoDataShells: 'Shells',
  AmmoDataRockets: 'Rockets', MetalItemData: 'Metal', StoneItemData: 'Brick', WoodItemData: 'Wood', AthenaAmmoDataEnergyCell: 'Energy cells',
};
/** Liegt die 3D-Ansicht im Hub-Ordner? Vite liefert fuer fehlende Dateien die Hub-Seite selbst (erkennbar an /src/main.tsx) - das zaehlt nicht. */
const DREI_D = '/hub-daten/3d/index.html';
const HINWEIS_3D = "The 3D island isn't installed on this PC yet.";
const ANSICHTEN: Array<{ k: '2d' | '3d'; titel: React.ReactNode }> = [
  { k: '2d', titel: <span className="flex items-center gap-2"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" /></svg>2D map</span> },
  { k: '3d', titel: <span className="flex items-center gap-2"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>3D island</span> },
];
const SELTEN_BEUTE: Record<string, [string, string]> = { C: ['Common', '#9ca3af'], UC: ['Uncommon', '#4ade80'], R: ['Rare', '#38bdf8'], VR: ['Epic', '#c084fc'], SR: ['Legendary', '#fb923c'], UR: ['Mythic', '#facc15'] };
function beuteName(item: string): { name: string; bild: string | null; selten?: [string, string] } {
  if (MUNITION[item]) return { name: MUNITION[item], bild: null };
  const w = waffeVon(item);
  const m = /_(C|UC|R|VR|SR|UR)(_Ore_T0\d|_T0\d)?$/i.exec(item);
  return { ...w, selten: m ? SELTEN_BEUTE[m[1].toUpperCase()] : undefined };
}
/** Marker auf dem Bildschirm: ein Objekt oder (weit herausgezoomt) mehrere gleicher Art, die zu nah beieinander liegen. */
interface Gruppe { id: string; typ: string; px: number; py: number; liste: Objekt[]; linie?: [number, number, number, number] }

/** Der Bildrand laeuft weich ins Meerblau des Rahmens aus - so sieht man bei keinem Zoom eine Kante. */
const RAND_WEICH: React.CSSProperties = {
  WebkitMaskImage: 'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent), linear-gradient(to bottom, transparent, #000 4%, #000 96%, transparent)',
  maskImage: 'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent), linear-gradient(to bottom, transparent, #000 4%, #000 96%, transparent)',
  WebkitMaskComposite: 'source-in', maskComposite: 'intersect',
};
const GRID = 10;
const SPALTEN = 'ABCDEFGHIJ';

export default function Karte() {
  const [orte, setOrte] = useState<Ort[]>([]);
  const [stand, setStand] = useState<string | null>(null);
  const [objekte, setObjekte] = useState<Objekt[] | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const [exportStand, setExportStand] = useState<{ build?: string; am?: string } | null>(null);
  const original = useOriginalSymbole();
  const [an, setAn] = useState<Record<string, boolean>>(() => Object.fromEntries(EBENEN.map((e) => [e.typ, true])));
  const [namen, setNamen] = useState(true);
  const [epicBild, setEpicBild] = useState(false);
  const [gitter, setGitter] = useState(false);
  // Einstellungen wie in der Spezifikation: Marker gruppieren, Groesse, Deckkraft, Schriftgroesse; Karte: Helligkeit, Kontrast, Saettigung.
  const START_EINST = { gruppieren: true, groesse: 100, deckkraft: 100, text: 100, hell: 100, kontrast: 100, saett: 100 };
  const [einst, setEinst] = useState(START_EINST);
  const [einstOffen, setEinstOffen] = useState(false);
  const [ebeneSuche, setEbeneSuche] = useState('');
  const [zu, setZu] = useState<Record<string, boolean>>({});
  const [voll, setVoll] = useState(false);
  // Tafel links: welcher Reiter offen ist; Ansicht 2D/3D (3D nur, wenn die lokale 3D-Ansicht im Hub-Ordner liegt)
  const [tafel, setTafel] = useState<'ebenen' | 'orte' | 'beute' | 'zeichnen'>('ebenen');
  const [ansicht, setAnsicht] = useState<'2d' | '3d'>('2d');
  const [dreiD, setDreiD] = useState<'pruefen' | 'da' | 'fehlt'>('pruefen');
  const [hinweis3d, setHinweis3d] = useState(false);
  useEffect(() => {
    fetch(DREI_D, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error('fehlt'))))
      .then((t) => setDreiD(t.includes('/src/main.tsx') || !/<(html|canvas|script|body)/i.test(t) ? 'fehlt' : 'da')).catch(() => setDreiD('fehlt'));
  }, []);
  const ansichtWaehlen = (k: '2d' | '3d') => { if (k === '3d' && dreiD !== 'da') { setHinweis3d(true); return; } setHinweis3d(false); setAnsicht(k); };
  // Hoehe: genau der Platz unter Kopf und Leiste (am breiten Schirm), damit unter der Karte nichts frei bleibt
  const seite = useRef<HTMLDivElement>(null);
  const [oben, setOben] = useState(102);
  useEffect(() => {
    const messen = () => { const el = seite.current; if (el) setOben(Math.round(el.getBoundingClientRect().top + window.scrollY)); };
    // mehrmals messen: die Leiste aendert ihre Hoehe noch, wenn die Schrift geladen ist
    messen(); const t = [150, 600, 1500, 3000].map((ms) => setTimeout(messen, ms)); document.fonts?.ready.then(messen).catch(() => {});
    window.addEventListener('resize', messen); return () => { t.forEach(clearTimeout); window.removeEventListener('resize', messen); };
  }, []);
  useEffect(() => { const f = () => setVoll(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const [gewaehlt, setGewaehlt] = useState<Ort | null>(null);
  // Spawn-Chance-Filter (nur sichtbar, wenn der Export Chancen hat) und die Zusatz-Ebene "Looted in cups"
  const [minChance, setMinChance] = useState(0);
  const [beute, setBeute] = useState<BeuteDatei | null | 'fehlt'>(null);
  const [beuteAn, setBeuteAn] = useState(false);
  const [minSpiele, setMinSpiele] = useState(3);
  const [beuteArt, setBeuteArt] = useState<'chest' | 'ammo_box' | 'beide'>('beide');
  const [beuteTipp, setBeuteTipp] = useState<{ b: Beute; fest: boolean } | null>(null);
  // Ohne Export der Spieldateien: die Truhen-/Munitions-Ebenen zeigen die Cup-Replay-Daten (klar beschriftet) statt leerer Zaehler
  const ohneExport = objekte !== null && !objekte.length;
  const mitExport = !!objekte?.length;
  useEffect(() => { if (ohneExport) setBeuteAn(true); }, [ohneExport]);
  useEffect(() => {
    if (!beuteAn || beute) return;
    fetch('/hub-daten/kisten-aus-replays.json', { cache: 'no-store' }).then((r) => { if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(); return r.json(); })
      .then((j: BeuteDatei) => setBeute({ ...j, objekte: (j.objekte ?? []).filter((o) => Number.isFinite(o.x) && Number.isFinite(o.y)) })).catch(() => setBeute('fehlt'));
  }, [beuteAn, beute]);
  const [suche, setSuche] = useState('');
  // Eigene Zeichnungen (Zeichnen.tsx) - im Zeichenmodus verschiebt Ziehen nicht die Karte, sondern zeichnet.
  const z = useZeichnen();
  const [zeichnen, setZeichnen] = useState(false);
  useEffect(() => { if (z.geteilt) setZeichnen(true); }, [z.geteilt]);

  useEffect(() => {
    fetch('/api/fortnite-map').then((r) => r.json()).then((j) => { setOrte(j?.orte ?? []); setStand(j?.stand ?? null); }).catch(() => {});
    // Erst der echte Export der lokalen Sitzung (nie im Repo, siehe .gitignore - der 10-s-Abgleich darf ihn nicht ueberschreiben), sonst die Probe.
    const laden = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('fehlt');
      return r.json();
    });
    // Die Probe-Datei (3 Marker) nur zum Testen mit ?probe=1 - sonst nie im normalen Betrieb
    const probeUrl = new URLSearchParams(window.location.search).get('probe') === '1';
    (probeUrl ? laden('/hub-daten/objekte-beispiel.json') : laden('/hub-daten/objekte.json')).then((j) => {
      const liste = (Array.isArray(j) ? j : j?.objekte ?? []) as Objekt[];
      setObjekte(liste.filter((o) => Number.isFinite(o?.x) && Number.isFinite(o?.y)).map((o, nr) => ({ ...o, typ: typVon(String(o.typ ?? '')), nr })));
      if (!Array.isArray(j) && j?.probe) setProbe(String(j.hinweis ?? 'Sample data'));
      if (!Array.isArray(j)) setExportStand({ build: typeof j?.build === 'string' ? j.build : undefined, am: typeof j?.exportedAt === 'string' ? j.exportedAt : undefined });
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
  }, [ansicht]);
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
  }, [zoomen, ansicht]);
  const ziehen = useRef<{ x: number; y: number; tx: number; ty: number; bewegt: boolean } | null>(null);
  const [zeiger, setZeiger] = useState<{ x: number; y: number } | null>(null);
  const gezogen = useRef(false); // war der letzte Druck ein Ziehen? Dann ist das Loslassen kein Klick auf einen Marker.
  const bildPunkt = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const rr = rahmen.current!.getBoundingClientRect();
    return [((e.clientX - rr.left - sicht.tx) / (basis * sicht.s)) * 1000, ((e.clientY - rr.top - sicht.ty) / (basis * sicht.s)) * 1000];
  };
  function runter(e: React.PointerEvent) {
    if (zeichnen && z.werkzeug) { (e.target as Element).setPointerCapture?.(e.pointerId); z.runter(bildPunkt(e)); return; }
    (e.target as Element).setPointerCapture?.(e.pointerId); gezogen.current = false; ziehen.current = { x: e.clientX, y: e.clientY, tx: sicht.tx, ty: sicht.ty, bewegt: false }; }
  function bewegen(e: React.PointerEvent) {
    const r = rahmen.current!.getBoundingClientRect();
    const mx = e.clientX - r.left; const my = e.clientY - r.top;
    setZeiger({ x: ((mx - sicht.tx) / (basis * sicht.s)) * RAHMEN.spanne + RAHMEN.x0, y: ((my - sicht.ty) / (basis * sicht.s)) * RAHMEN.spanne + RAHMEN.y0 });
    if (zeichnen && z.werkzeug) { z.bewegen(bildPunkt(e)); return; }
    const zg = ziehen.current; if (!zg) return;
    const dx = e.clientX - zg.x; const dy = e.clientY - zg.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { zg.bewegt = true; gezogen.current = true; }
    setSicht((v) => ({ ...v, tx: zg.tx + dx, ty: zg.ty + dy }));
  }
  function hin(o: Ort) {
    if (ansicht !== '2d') setAnsicht('2d');
    const s = Math.max(sicht.s, 3.2);
    setSicht({ s, tx: groesse.b / 2 - (o.links / 100) * basis * s, ty: groesse.h / 2 - (o.oben / 100) * basis * s });
    setGewaehlt(o);
  }

  const [beuteZahl, setBeuteZahl] = useState<Record<string, number>>({});
  const zaehlen = useMemo(() => { const m: Record<string, number> = { ...beuteZahl }; for (const o of objekte ?? []) m[o.typ] = (m[o.typ] ?? 0) + 1; return m; }, [objekte, beuteZahl]);
  // Spawn-Chance je Objekt: aus dem Export, sonst die Grundchance der Klasse (Truhe 67 %, Munition 75 %) - siehe chanceVon
  const mitChance = useMemo(() => (objekte ?? []).some((o) => chanceVon(o) !== null), [objekte]);
  const sichtbar = useMemo(() => (objekte ?? []).filter((o) => { if (!an[o.typ]) return false; const c = chanceVon(o); return !c || c.wert * 100 >= minChance - 1e-9; }), [objekte, an, minChance]);
  // Gruppen aus dem Export ("M von N Plaetzen"): wie viele Plaetze hat jede Gruppe?
  const gruppenGroesse = useMemo(() => { const m = new Map<string, number>(); for (const o of objekte ?? []) if (o.gruppe) m.set(o.gruppe, (m.get(o.gruppe) ?? 0) + 1); return m; }, [objekte]);
  const beuteDa = beute && beute !== 'fehlt' ? beute : null;
  useEffect(() => {
    if (!ohneExport || !beuteDa) { setBeuteZahl({}); return; }
    const l = beuteDa.objekte.filter((b) => b.geoeffnet >= minSpiele);
    setBeuteZahl({ chest: l.filter((b) => b.typ === 'chest').length, ammo: l.filter((b) => b.typ === 'ammo_box').length });
  }, [ohneExport, beuteDa, minSpiele]);
  const beuteSicht = useMemo(() => (!beuteAn || !beuteDa ? [] : beuteDa.objekte.filter((b) => b.geoeffnet >= minSpiele && (beuteArt === 'beide' || b.typ === beuteArt)
    && (!ohneExport || an[b.typ === 'chest' ? 'chest' : 'ammo']))), [beuteAn, beuteDa, minSpiele, beuteArt, ohneExport, an]);
  const r = (px: number) => (px * 1000) / (basis * sicht.s);

  /* ---------------------------------------------- Marker: Groesse je Zoom, Zusammenfassen nur weit draussen */
  const skala = basis * sicht.s; // Bildschirm-Pixel je ganze Bildbreite
  // Wie fortnite.gg: ueber der ganzen Insel klein (16 px), beim Hineinzoomen groesser (bis 36 px); "Size" in den Einstellungen skaliert mit
  // (gemessen an der Bildgroesse in Pixeln, nicht am Zoomfaktor - so passt es auch auf dem Handy, wo die ganze Insel nur ~600 px misst)
  const symbolPx = Math.round(Math.min(36, Math.max(12, 9 + skala * 0.0058)) * (einst.groesse / 100));
  const gruppen = useMemo(() => {
    // Nur weit draussen (kleiner als die ganze Insel) gleiche Nachbarn zu einem Haufen mit Zahl zusammenfassen - sonst jedes Objekt einzeln.
    const zelle = einst.gruppieren && skala < BUENDELN_BIS ? symbolPx * 2.2 : 0;
    const m = new Map<string, { typ: string; sx: number; sy: number; liste: Objekt[] }>();
    for (const o of sichtbar) {
      if (istLinie(o)) continue;
      const p = zuProzent(o.x, o.y);
      const px = (p.l / 100) * skala; const py = (p.o / 100) * skala;
      const id = zelle ? `${o.typ}:${Math.floor(px / zelle)}:${Math.floor(py / zelle)}` : `o:${o.nr}`;
      const g = m.get(id) ?? { typ: o.typ, sx: 0, sy: 0, liste: [] };
      g.sx += px; g.sy += py; g.liste.push(o); m.set(id, g);
    }
    // Zeichenreihenfolge: seltene Arten zuletzt (oben), Loot ganz oben - so verdeckt kein Busch eine Truhe
    const rang = (t: string) => EBENEN.findIndex((e) => e.typ === t);
    return [...m.entries()].map(([id, g]): Gruppe => ({ id, typ: g.typ, px: g.sx / g.liste.length, py: g.sy / g.liste.length, liste: g.liste }))
      .sort((a, b) => rang(b.typ) - rang(a.typ));
  }, [sichtbar, skala, symbolPx, einst.gruppieren]);
  // Ziplines: Linie zwischen den zwei Endpfosten (Bildschirm-Pixel ohne Verschiebung); Mitte fuer die Info-Karte
  const linien = useMemo(() => sichtbar.filter(istLinie).map((o): Gruppe => {
    const p = zuProzent(o.x, o.y); const q = zuProzent(o.x2!, o.y2!);
    const l: [number, number, number, number] = [(p.l / 100) * skala, (p.o / 100) * skala, (q.l / 100) * skala, (q.o / 100) * skala];
    return { id: `l:${o.nr}`, typ: o.typ, px: (l[0] + l[2]) / 2, py: (l[1] + l[3]) / 2, liste: [o], linie: l };
  }), [sichtbar, skala]);
  const mitZahl = (g: Gruppe) => g.liste.length >= 2;
  const [ueber, setUeber] = useState<string | null>(null);
  const [fest, setFest] = useState<string | null>(null);
  const tippId = fest ?? ueber;
  const tipp = useMemo(() => (tippId ? (tippId.startsWith('l:') ? linien : gruppen).find((g) => g.id === tippId) ?? null : null), [tippId, gruppen, linien]);
  // Gewaehltes Objekt einer Gruppe: die anderen Plaetze derselben Gruppe markieren
  const geschwister = useMemo(() => {
    const o = tipp?.liste.length === 1 ? tipp.liste[0] : null;
    if (!o?.gruppe) return [];
    return (objekte ?? []).filter((x) => x.gruppe === o.gruppe && x.nr !== o.nr).map((x) => { const p = zuProzent(x.x, x.y); return { nr: x.nr, px: (p.l / 100) * skala, py: (p.o / 100) * skala }; });
  }, [tipp, objekte, skala]);
  const imBild = (g: Gruppe) => g.px + sicht.tx > -40 && g.px + sicht.tx < groesse.b + 40 && g.py + sicht.ty > -40 && g.py + sicht.ty < groesse.h + 40;
  const markerKlick = useCallback((g: Gruppe) => {
    if (gezogen.current) return;
    if (g.liste.length > 1) { zoomen(Math.max(1.8, (BUENDELN_BIS * 1.6) / skala), g.px + sicht.tx, g.py + sicht.ty); setFest(null); return; }
    setFest((f) => (f === g.id ? null : g.id));
  }, [zoomen, sicht, skala]);
  // Objekte rund um einen gewaehlten Ort (120 m Umkreis)
  const umOrt = useMemo(() => {
    if (!gewaehlt) return [];
    const m: Record<string, number> = {};
    for (const o of objekte ?? []) if (Math.hypot(o.x - gewaehlt.x, o.y - gewaehlt.y) < 12_000) m[o.typ] = (m[o.typ] ?? 0) + 1;
    // ohne Export: geplunderte Truhen/Munitionskisten aus den Cup-Replays
    for (const b of beuteSicht) if (Math.hypot(b.x - gewaehlt.x, b.y - gewaehlt.y) < 12_000) { const t = b.typ === 'chest' ? 'chest' : 'ammo'; m[t] = (m[t] ?? 0) + 1; }
    return EBENEN.filter((e) => m[e.typ]).map((e) => ({ typ: e.typ, titel: e.titel, n: m[e.typ] }));
  }, [gewaehlt, objekte, beuteSicht]);
  const gefiltert = orte.filter((o) => o.name.toLowerCase().includes(suche.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const benannt = (o: Ort) => /\.POI\./.test(o.id);
  const imGitter = (o: { links: number; oben: number }) => `${SPALTEN[Math.min(GRID - 1, Math.floor(o.links / (100 / GRID)))]}${Math.min(GRID, Math.floor(o.oben / (100 / GRID)) + 1)}`;

  /* ---------------------------------------------- Bild herunterladen: die aktuelle Ansicht mit allen sichtbaren Ebenen als PNG */
  const [bildLaeuft, setBildLaeuft] = useState(false);
  async function bildSpeichern() {
    if (bildLaeuft) return;
    setBildLaeuft(true);
    try {
      const B = groesse.b; const H = groesse.h; const dpr = 2;
      const c = document.createElement('canvas'); c.width = B * dpr; c.height = H * dpr;
      const g = c.getContext('2d')!; g.scale(dpr, dpr);
      g.fillStyle = 'rgb(13,81,151)'; g.fillRect(0, 0, B, H);
      const img = new Image(); img.src = epicBild ? '/bilder/karte-orte.png' : '/bilder/karte-leer.png'; await img.decode();
      const kante = basis * sicht.s;
      g.save(); g.filter = `brightness(${einst.hell}%) contrast(${einst.kontrast}%) saturate(${einst.saett}%)`; g.drawImage(img, sicht.tx, sicht.ty, kante, kante); g.restore();
      if (gitter) {
        g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '700 11px Inter, system-ui, sans-serif';
        for (let i = 1; i < GRID; i += 1) { const v = (i / GRID) * kante; g.beginPath(); g.moveTo(sicht.tx + v, sicht.ty); g.lineTo(sicht.tx + v, sicht.ty + kante); g.moveTo(sicht.tx, sicht.ty + v); g.lineTo(sicht.tx + kante, sicht.ty + v); g.stroke(); }
        for (let i = 0; i < GRID * GRID; i += 1) g.fillText(`${SPALTEN[i % GRID]}${Math.floor(i / GRID) + 1}`, sicht.tx + ((i % GRID) / GRID) * kante + 5, sicht.ty + (Math.floor(i / GRID) / GRID) * kante + 14);
      }
      // Ziplines (Seil mit Endpunkten) und Marker mit denselben Symbolen wie auf dem Schirm
      g.globalAlpha = einst.deckkraft / 100; g.lineCap = 'round';
      for (const l of linien) {
        const [x1, y1, x2, y2] = l.linie!.map((v, i) => v + (i % 2 ? sicht.ty : sicht.tx));
        for (const [farbe, w] of [['rgba(5,7,12,0.7)', 5], ['#eef2f7', 2.4]] as const) { g.strokeStyle = farbe; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        for (const [x, y] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#05070c'; g.stroke(); }
      }
      const bilder = new Map<string, HTMLImageElement>();
      await Promise.all([...new Set(gruppen.map((x) => x.typ))].map(async (t) => { const im = new Image(); im.src = symbolQuelle(t, original); try { await im.decode(); bilder.set(t, im); } catch { /* ohne Bild */ } }));
      for (const gr of gruppen.filter(imBild)) {
        const x = gr.px + sicht.tx; const y = gr.py + sicht.ty; const gross = mitZahl(gr) ? symbolPx + 4 : symbolPx; const rad = gross / 2;
        const im = bilder.get(gr.typ);
        if (im) g.drawImage(im, x - rad, y - rad, gross, gross);
        else { g.beginPath(); g.arc(x, y, rad * 0.7, 0, Math.PI * 2); g.fillStyle = ebeneVon(gr.typ).farbe; g.fill(); }
        if (mitZahl(gr)) { g.fillStyle = '#05070c'; g.beginPath(); g.arc(x + rad, y - rad, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = '800 9px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(gr.liste.length > 99 ? '99+' : String(gr.liste.length), x + rad, y - rad); g.textAlign = 'start'; g.textBaseline = 'alphabetic'; }
      }
      g.globalAlpha = 1;
      if (namen && !epicBild) {
        g.textAlign = 'center'; g.textBaseline = 'top';
        for (const o of orte) {
          const x = sicht.tx + (o.links / 100) * kante; const y = sicht.ty + (o.oben / 100) * kante;
          if (x < -50 || x > B + 50 || y < -20 || y > H + 20) continue;
          g.font = `800 ${Math.round((benannt(o) ? 11 : 9.5) * (einst.text / 100))}px Inter, system-ui, sans-serif`;
          g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.fillStyle = benannt(o) ? '#fff' : 'rgba(255,255,255,0.85)';
          const t = o.name.toUpperCase(); g.strokeText(t, x, y + 4); g.fillText(t, x, y + 4);
          g.beginPath(); g.arc(x, y - 2, benannt(o) ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
        }
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
      zeichneFormen(g, z.formen, ([x, y]) => [sicht.tx + (x / 1000) * kante, sicht.ty + (y / 1000) * kante], 1);
      // Fusszeile
      g.fillStyle = 'rgba(6,8,15,0.75)'; g.fillRect(B - 230, H - 30, 222, 22);
      g.fillStyle = '#2dd4bf'; g.font = '800 11px Inter, system-ui, sans-serif'; g.fillText(`thecomphub.com · ${new Date().toLocaleDateString('en-GB')}`, B - 220, H - 15);
      const blob: Blob | null = await new Promise((ok) => c.toBlob(ok, 'image/png'));
      if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `comphub-map-${new Date().toISOString().slice(0, 10)}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch { /* Bild nicht ladbar - nichts tun */ } finally { setBildLaeuft(false); }
  }

  const meter = (cm: number) => `${Math.round(cm / 100).toLocaleString('en')} m`;
  const zeichnenStarten = () => { if (ansicht !== '2d') setAnsicht('2d'); setZeichnen(true); if (!z.werkzeug) z.setWerkzeug('stift'); };
  const kopf = (id: string) => (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0"><p className="ueber">Community · Map</p><h1 className="titel mt-1 text-4xl">The island</h1></div>
        {id === 'handy' && <Segment id="karte-ansicht-handy" klein wert={ansicht} wahl={[{ k: '2d', titel: '2D map' }, { k: '3d', titel: '3D island' }]} onWahl={ansichtWaehlen} />}
      </div>
      <AnimatePresence initial={false}>
        {hinweis3d && id === 'handy' && (
          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-xs text-white/60">
            <span className="mt-2 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-akz" />{HINWEIS_3D}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </>
  );
  /*
   * 3D-Ansicht: die Objekte der Karte gehen per postMessage an den Rahmen (gleiche Herkunft), damit die lokale 3D-Ansicht sie zeichnen kann.
   * Gesendet beim Laden des Rahmens, bei jeder Aenderung (Ebenen an/aus, Mindest-Chance) und wenn die Ansicht danach fragt
   * ({ type: 'comphub-objekte-bitte' }). Format: tools/export-auftrag.md, Schritt "3D-Ansicht".
   */
  const dreiRahmen = useRef<HTMLIFrameElement>(null);
  const objekteSenden = useCallback(() => {
    const w = dreiRahmen.current?.contentWindow; if (!w || !objekte) return;
    w.postMessage({
      type: 'comphub-objekte', version: 1, build: exportStand?.build ?? null, rahmen: RAHMEN,
      ebenen: EBENEN.filter((e) => an[e.typ]).map((e) => e.typ), minChance: minChance / 100,
      objekte: objekte.map(({ nr: _nr, ...o }) => { const c = chanceVon(o); return { ...o, chance: c ? c.wert : undefined, chanceStandard: c?.standard || undefined }; }),
    }, window.location.origin);
  }, [objekte, exportStand, an, minChance]);
  useEffect(() => { if (ansicht === '3d') objekteSenden(); }, [ansicht, objekteSenden]);
  useEffect(() => {
    const bitte = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === 'comphub-objekte-bitte') objekteSenden(); };
    window.addEventListener('message', bitte); return () => window.removeEventListener('message', bitte);
  }, [objekteSenden]);

  const werkzeuge: Array<{ t: string; d: string; f: () => void; an?: boolean }> = [
    { t: 'Zoom in', d: 'M12 5v14M5 12h14', f: () => zoomen(1.4) }, { t: 'Zoom out', d: 'M5 12h14', f: () => zoomen(1 / 1.4) },
    { t: 'Reset view', d: 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12 2.5M18.5 9a7 7 0 0 0-12-2.5', f: zuruecksetzen },
    { t: 'Settings', d: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4', f: () => setEinstOffen((o) => !o), an: einstOffen },
    { t: 'Draw', d: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3', f: () => (zeichnen ? setZeichnen(false) : zeichnenStarten()), an: zeichnen },
    { t: bildLaeuft ? 'Saving …' : 'Download this view as PNG', d: 'M12 4v11M7 11l5 5 5-5M5 20h14', f: bildSpeichern },
    { t: voll ? 'Leave full screen' : 'Full screen', d: voll ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', f: () => (document.fullscreenElement ? document.exitFullscreen() : rahmen.current?.requestFullscreen?.()) },
  ];

  return (
    <div ref={seite} className="flex flex-col xl:h-[calc(100dvh-var(--oben))] xl:min-h-[520px] xl:flex-row" style={{ '--oben': `${oben}px` } as React.CSSProperties}>
      {/* Handy: Titel ueber der Karte */}
      <div className="border-b border-white/[0.07] bg-fl px-4 pb-3 pt-4 xl:hidden">{kopf('handy')}</div>

      {/* Karte */}
      <div className="relative order-1 h-[68svh] min-h-[380px] min-w-0 shrink-0 xl:order-2 xl:h-auto xl:min-h-0 xl:flex-1 xl:shrink">
        {/* 2D / 3D - gross und mittig ueber der Karte, damit man ihn sofort sieht */}
        <div className="pointer-events-none absolute inset-x-0 top-4 z-30 hidden flex-col items-center gap-2 xl:flex">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-fl/95 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <Segment id="karte-ansicht" wert={ansicht} wahl={ANSICHTEN} onWahl={ansichtWaehlen} />
          </div>
          <AnimatePresence>
            {hinweis3d && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-fl/95 px-3.5 py-2 text-xs text-white/70 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-akz" />{HINWEIS_3D}
                <button type="button" aria-label="Close" onClick={() => setHinweis3d(false)} className="ml-1 text-white/40 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></button>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {ansicht === '3d' ? (
          <>
            <iframe ref={dreiRahmen} title="The island in 3D" src={DREI_D} onLoad={objekteSenden} className="absolute inset-0 h-full w-full border-0 bg-black" allow="fullscreen" />
            {/* 3D fuellt die ganze Flaeche - der Umschalter schwebt darueber (die Tafel gehoert zur 2D-Karte) */}
            <div className="absolute left-4 top-4 z-10 hidden w-[340px] rounded-2xl border border-white/10 bg-fl/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl xl:block">{kopf('drei')}</div>
          </>
        ) : (
          <div ref={rahmen} className="absolute inset-0 cursor-grab touch-none select-none overflow-hidden bg-[rgb(13,81,151)] active:cursor-grabbing"
            onPointerDown={runter} onPointerMove={bewegen} onPointerUp={() => { ziehen.current = null; z.hoch(); }} onPointerLeave={() => { ziehen.current = null; setZeiger(null); z.hoch(); }}
            onDoubleClick={(e) => { if (zeichnen && z.werkzeug) { if (z.werkzeug === 'polygon') z.polygonFertig(); return; } const rr = rahmen.current!.getBoundingClientRect(); zoomen(1.8, e.clientX - rr.left, e.clientY - rr.top); }}
            style={zeichnen && z.werkzeug ? { cursor: 'crosshair' } : undefined}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: basis, height: basis, transform: `translate(${sicht.tx}px, ${sicht.ty}px) scale(${sicht.s})` }}>
              <img src={epicBild ? '/bilder/karte-orte.png' : '/bilder/karte-leer.png'} alt="Map" draggable={false} className="absolute inset-0 h-full w-full" style={{ filter: `brightness(${einst.hell}%) contrast(${einst.kontrast}%) saturate(${einst.saett}%)`, ...RAND_WEICH }} />
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
              <ZeichenEbene z={z} r={r} />
            </div>
            {/* Objekte - eine SVG-Ebene in Bildschirm-Pixeln (Symbole per <use>), damit auch Tausende Marker scharf und fluessig bleiben */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <SymbolVorlagen />
              <g transform={`translate(${sicht.tx} ${sicht.ty})`}>
                {beuteSicht.length > 0 && (
                  <g>
                    {beuteSicht.map((b, i) => {
                      const p = zuProzent(b.x, b.y); const x = (p.l / 100) * skala; const y = (p.o / 100) * skala;
                      if (x + sicht.tx < -20 || x + sicht.tx > groesse.b + 20 || y + sicht.ty < -20 || y + sicht.ty > groesse.h + 20) return null;
                      const rad = Math.max(2.5, Math.min(9, 1.2 + sicht.s * 1.1)) * (0.75 + b.anteil * 0.6);
                      return <circle key={i} cx={x} cy={y} r={rad} fill={hitze(b.anteil)} fillOpacity={0.8} stroke={b.typ === 'ammo_box' ? '#fff' : '#06080f'} strokeWidth={b.typ === 'ammo_box' ? 1 : 0.8}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }} onPointerEnter={() => setBeuteTipp((t) => (t?.fest ? t : { b, fest: false }))} onPointerLeave={() => setBeuteTipp((t) => (t?.fest ? t : null))}
                        onClick={() => { if (!gezogen.current) setBeuteTipp((t) => (t?.fest && t.b === b ? null : { b, fest: true })); }} />;
                    })}
                  </g>
                )}
                {/* Ziplines: Seil zwischen den zwei Endpfosten, dunkel unterlegt, kleine Punkte an den Enden (wie fortnite.gg) */}
                <g opacity={einst.deckkraft / 100}>
                  {linien.map((l) => {
                    const [x1, y1, x2, y2] = l.linie!; const aktiv = tipp?.id === l.id;
                    const breite = Math.min(4, Math.max(2, 1.4 + sicht.s * 0.4)); const ende = Math.min(5, Math.max(2.6, 1.8 + sicht.s * 0.5));
                    return (
                      <g key={l.id} className="cursor-pointer" style={{ pointerEvents: 'auto' }} onPointerEnter={() => setUeber(l.id)} onPointerLeave={() => setUeber((u) => (u === l.id ? null : u))} onClick={() => markerKlick(l)}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#05070c" strokeOpacity={0.7} strokeWidth={breite + 2.6} strokeLinecap="round" />
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={aktiv ? 'rgb(var(--akz))' : '#eef2f7'} strokeWidth={breite} strokeLinecap="round" />
                        {[[x1, y1], [x2, y2]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r={aktiv ? ende + 1 : ende} fill={aktiv ? 'rgb(var(--akz))' : '#ffffff'} stroke="#05070c" strokeWidth={1.6} />)}
                      </g>
                    );
                  })}
                </g>
                {/* Die anderen Plaetze derselben Gruppe ("2 of 5 spots") - gestrichelt verbunden */}
                {geschwister.length > 0 && tipp && (
                  <g pointerEvents="none">
                    {geschwister.map((x) => <line key={`v${x.nr}`} x1={tipp.px} y1={tipp.py} x2={x.px} y2={x.py} stroke="rgb(var(--akz))" strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="4 4" />)}
                    {geschwister.map((x) => <circle key={`k${x.nr}`} cx={x.px} cy={x.py} r={symbolPx * 0.78} fill="rgb(var(--akz) / 0.12)" stroke="rgb(var(--akz))" strokeWidth={1.6} strokeDasharray="3 3" />)}
                  </g>
                )}
                <g opacity={einst.deckkraft / 100}>
                  <MarkerEbene gruppen={gruppen} gr={symbolPx} aktiv={tipp && !tipp.linie ? tipp.id : null} setUeber={setUeber} klick={markerKlick} />
                </g>
              </g>
            </svg>
            {/* Hinweis zum Marker: Art, Koordinaten, Hoehe - beim Darueberfahren, per Klick festgehalten */}
            <AnimatePresence>
              {tipp && (() => {
                // Ueber dem Marker, mittig; nahe am oberen Rand darunter; seitlich nie aus dem Bild (nur Deckkraft animiert - die Lage macht translate)
                const abstand = tipp.linie ? 10 : symbolPx / 2 + 10; const y = tipp.py + sicht.ty; const unten = y < 250;
                return (
                <motion.div key={tipp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                  onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
                  className={`absolute z-20 w-max min-w-[210px] max-w-[270px] -translate-x-1/2 rounded-2xl border border-white/10 bg-fl/95 p-3 text-left shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl ${unten ? '' : '-translate-y-full'} ${fest ? '' : 'pointer-events-none'}`}
                  style={{ left: Math.min(Math.max(tipp.px + sicht.tx, 140), groesse.b - 140), top: unten ? y + abstand : y - abstand }}>
                  <MarkerInfo g={tipp} skala={skala} gitter={imGitter} gruppenGroesse={gruppenGroesse} schliessen={fest ? () => setFest(null) : undefined} />
                </motion.div>
                );
              })()}
            </AnimatePresence>
            <AnimatePresence>
              {beuteTipp && beuteDa && (() => {
                const p = zuProzent(beuteTipp.b.x, beuteTipp.b.y);
                return (
                  <motion.div key={`${beuteTipp.b.x}:${beuteTipp.b.y}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onPointerDown={(e) => e.stopPropagation()}
                    className={`absolute z-10 w-[250px] -translate-x-1/2 -translate-y-full rounded-2xl border border-white/10 bg-fl/95 p-3 text-left shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl ${beuteTipp.fest ? '' : 'pointer-events-none'}`}
                    style={{ left: (p.l / 100) * skala + sicht.tx, top: (p.o / 100) * skala + sicht.ty - 12 }}>
                    <BeuteInfo b={beuteTipp.b} spiele={beuteDa.spiele} feld={imGitter({ links: p.l, oben: p.o })} schliessen={beuteTipp.fest ? () => setBeuteTipp(null) : undefined} />
                  </motion.div>
                );
              })()}
            </AnimatePresence>
            {/* Orte - ausserhalb der skalierten Ebene, in Bildschirm-Pixeln: so bleiben Schrift und Nadeln bei jedem Zoom scharf */}
            {namen && !epicBild && orte.map((o) => (
              <button key={o.id} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => hin(o)}
                className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: sicht.tx + (o.links / 100) * basis * sicht.s, top: sicht.ty + (o.oben / 100) * basis * sicht.s - (benannt(o) ? 16 : 12) }}>
                <OrtNadel aktiv={gewaehlt?.id === o.id} klein={!benannt(o)} />
                <span className={`mt-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wide text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] ${benannt(o) ? '' : 'text-white/80'} ${gewaehlt?.id === o.id ? 'bg-akz/60' : 'bg-black/35'}`} style={{ fontSize: ((benannt(o) ? 12 : 10) * einst.text) / 100 }}>{o.name}</span>
              </button>
            ))}
            {/* Zeichnen: Werkzeugleiste und Texteingabe */}
            <AnimatePresence>{zeichnen && <ZeichenLeiste z={z} schliessen={() => setZeichnen(false)} />}</AnimatePresence>
            {z.textOrt && <TextEingabe z={z} ort={{ x: sicht.tx + (z.textOrt[0] / 1000) * basis * sicht.s, y: sicht.ty + (z.textOrt[1] / 1000) * basis * sicht.s }} />}

            {/* Oben links: gewaehlter Ort (und der Hinweis auf Probedaten) */}
            <div className="absolute left-3 top-3 z-10 flex w-[min(320px,calc(100%-5rem))] flex-col gap-2 sm:left-4 sm:top-4" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              {probe && <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] font-semibold text-amber-100 backdrop-blur">SAMPLE DATA · {probe}</div>}
              <AnimatePresence>
                {gewaehlt && (
                  <motion.div key={gewaehlt.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="rounded-2xl border border-akz/30 bg-fl/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="ueber !tracking-[0.25em]">{benannt(gewaehlt) ? 'Named location' : 'Landmark'}</p>
                        <h3 className="titel mt-1 truncate text-3xl">{gewaehlt.name}</h3>
                      </div>
                      <button type="button" aria-label="Close" onClick={() => setGewaehlt(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></button>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                      {[['Grid', imGitter(gewaehlt)], ['X', meter(gewaehlt.x)], ['Y', meter(gewaehlt.y)]].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-black/40 px-2 py-1.5"><dt className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">{k}</dt><dd className="zahl text-sm font-bold text-white">{v}</dd></div>
                      ))}
                    </dl>
                    {umOrt.length ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {umOrt.map((u) => <span key={u.typ} title={u.titel} className="zahl inline-flex items-center gap-1.5 rounded-lg bg-black/40 py-1 pl-1 pr-2 text-xs font-bold text-white"><Abzeichen typ={u.typ} groesse={18} />{u.n}</span>)}
                        <span className="text-[10px] text-white/40">within 120 m{ohneExport ? ' · looted in cups' : ''}</span>
                      </div>
                    ) : <p className="mt-3 text-xs text-white/45">No chests or ammo boxes recorded within 120 m.</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Oben rechts: Bedienung */}
            <div className="absolute right-3 top-3 z-10 flex flex-col rounded-2xl border border-white/10 bg-fl/90 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur sm:right-4 sm:top-4" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              {werkzeuge.map((w, i) => (
                <button key={w.t} type="button" title={w.t} aria-label={w.t} onClick={w.f}
                  className={`grid h-9 w-9 place-items-center rounded-xl transition ${w.an ? 'bg-akz text-[#04050a]' : 'text-white/75 hover:bg-white/10 hover:text-white'} ${i === 3 ? 'mt-1 border-t border-white/[0.07] pt-0' : ''}`}><Icon d={w.d} /></button>
              ))}
            </div>
            <AnimatePresence>
              {einstOffen && (
                <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
                  className="absolute right-16 top-3 z-20 w-72 max-w-[calc(100%-5rem)] rounded-2xl border border-white/10 bg-fl/95 p-3 text-sm shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:top-4">
                  <div className="flex items-center justify-between px-2.5"><p className="titel text-xl">Settings</p><button type="button" onClick={() => setEinst(START_EINST)} className="knopf-leer !text-xs">Reset</button></div>
                  <p className="mt-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Markers</p>
                  <Kipp titel="Group nearby markers" an={einst.gruppieren} umschalten={() => setEinst((v) => ({ ...v, gruppieren: !v.gruppieren }))} />
                  {([['groesse', 'Size', 50, 200], ['deckkraft', 'Opacity', 20, 100], ['text', 'Text size', 60, 180]] as const).map(([k, t, a, b]) => (
                    <Regler key={k} titel={t} wert={einst[k]} min={a} max={b} einheit=" %" setzen={(n) => setEinst((v) => ({ ...v, [k]: n }))} start={100} />
                  ))}
                  <p className="mt-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Map image</p>
                  {([['hell', 'Brightness'], ['kontrast', 'Contrast'], ['saett', 'Saturation']] as const).map(([k, t]) => (
                    <Regler key={k} titel={t} wert={einst[k]} min={30} max={200} einheit=" %" setzen={(n) => setEinst((v) => ({ ...v, [k]: n }))} start={100} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="zahl pointer-events-none absolute bottom-3 left-3 flex gap-1.5 text-[11px] font-semibold sm:bottom-4 sm:left-4">
              <span className="rounded-lg border border-white/10 bg-fl/85 px-2.5 py-1.5 text-white/75 backdrop-blur">{Math.round(sicht.s * 100)} %</span>
              {zeiger && <span className="hidden rounded-lg border border-white/10 bg-fl/85 px-2.5 py-1.5 text-white/75 backdrop-blur sm:inline">X {Math.round(zeiger.x / 100).toLocaleString('en')} m · Y {Math.round(zeiger.y / 100).toLocaleString('en')} m</span>}
            </div>
          </div>
        )}
      </div>

      {/* Tafel - am breiten Schirm links angedockt und so hoch wie die Karte, der Inhalt rollt in sich */}
      {ansicht === '2d' && (
      <aside className="order-2 flex min-h-0 flex-col border-white/[0.07] bg-fl xl:order-1 xl:w-[376px] xl:shrink-0 xl:border-r 2xl:w-[410px]">
        <div className="hidden px-5 pt-5 xl:block">{kopf('breit')}</div>
          <>
            <div className="border-b border-white/[0.07] px-4 pb-3 pt-3 xl:px-5 xl:pt-4">
              <div className="ohne-leiste -mx-1 overflow-x-auto px-1">
                <Segment id="karte-tafel" klein wert={tafel} onWahl={setTafel} wahl={[{ k: 'ebenen', titel: 'Layers' }, { k: 'orte', titel: <>Places <span className="opacity-60">{orte.length || ''}</span></> }, { k: 'beute', titel: 'Cup loot' }, { k: 'zeichnen', titel: 'Drawings' }]} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 xl:px-4">
              {tafel === 'ebenen' && (
                <div>
                  <Kipp titel="Location names" an={namen} umschalten={() => setNamen((v) => !v)} />
                  <Kipp titel="Epic's map labels" an={epicBild} umschalten={() => setEpicBild((v) => !v)} />
                  <Kipp titel="Grid" unter="A1 – J10" an={gitter} umschalten={() => setGitter((v) => !v)} />
                  {mitChance && <div className="mt-1 rounded-xl bg-black/30 py-1"><Regler titel="Min. spawn chance" wert={minChance} min={0} max={100} schritt={5} einheit=" %" setzen={setMinChance} start={0} /></div>}
                  <div className="mt-4 flex items-baseline justify-between gap-2 px-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Objects</p>
                    {ohneExport && beuteDa && <span className="text-[10px] font-semibold text-amber-200/80">Chests & ammo: looted in cups</span>}
                  </div>
                  <div className="mt-2 flex gap-1.5 px-1">
                    <input value={ebeneSuche} onChange={(e) => setEbeneSuche(e.target.value)} placeholder="Search markers…" className="eingabe min-w-0 flex-1 !py-1.5" />
                    {[['All', true], ['None', false]].map(([t, w]) => (
                      <button key={t as string} type="button" title={w ? 'Show all layers' : 'Hide all layers'} onClick={() => setAn(Object.fromEntries(EBENEN.map((e) => [e.typ, w as boolean])))} className="knopf !px-2.5 !py-1.5 !text-xs">{t as string}</button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-3 px-1">
                    {GRUPPEN_KARTE.map((g) => {
                      const ebenen = EBENEN.filter((e) => e.gruppe === g && (mitExport ? !!zaehlen[e.typ] : e.typ !== 'other' || zaehlen.other) && e.titel.toLowerCase().includes(ebeneSuche.toLowerCase()));
                      if (!ebenen.length) return null;
                      const aktiv = ebenen.filter((e) => an[e.typ]).length;
                      return (
                        <div key={g}>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setZu((x) => ({ ...x, [g]: !x[g] }))} className="flex flex-1 items-center gap-1.5 text-left text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                              <svg viewBox="0 0 20 20" className={`h-3 w-3 text-white/40 transition ${zu[g] ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
                              {g}<span className="zahl font-semibold tracking-normal text-white/35">{aktiv}/{ebenen.length}</span>
                            </button>
                            <button type="button" title={aktiv ? 'Hide group' : 'Show group'} onClick={() => setAn((a) => ({ ...a, ...Object.fromEntries(ebenen.map((e) => [e.typ, !aktiv])) }))}
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition ${aktiv ? 'text-akz hover:bg-akz/10' : 'text-white/35 hover:bg-white/10'}`}>{aktiv ? 'On' : 'Off'}</button>
                          </div>
                          {!zu[g] && (
                            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                              {ebenen.map((e) => (
                                <button key={e.typ} type="button" onClick={() => setAn((a) => ({ ...a, [e.typ]: !a[e.typ] }))} aria-pressed={an[e.typ]}
                                  className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition ${an[e.typ] ? 'border-white/10 bg-white/[0.05] hover:border-akz/40' : 'border-transparent opacity-40 hover:opacity-70'}`}>
                                  <Abzeichen typ={e.typ} groesse={22} />
                                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/85">{e.titel}</span>
                                  {zaehlen[e.typ] ? <span className="zahl text-[10px] text-white/45">{zaehlen[e.typ].toLocaleString('en')}</span> : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 px-2.5 text-[11px] leading-relaxed text-white/35">{ohneExport ? <>Until our game-file export lands, Chests and Ammo boxes show the spots players looted in {beuteDa?.spiele ?? 'our'} S{beuteDa?.saison ?? 43} cup replays (approximate positions, chests nobody opened are missing). The export brings every object at its exact spot with spawn chances.</> : <>Every object at its exact spot, from our own export of the game files{exportStand?.build ? <> · build <span className="zahl">{exportStand.build.replace(/^\+\+Fortnite\+Release-/, '')}</span></> : null}{exportStand?.am ? ` · ${new Date(exportStand.am).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.</>}</p>
                </div>
              )}

              {tafel === 'orte' && (
                <div>
                  <div className="px-1"><input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a location…" className="eingabe w-full !py-2" /></div>
                  <ul className="mt-2 space-y-0.5">
                    {gefiltert.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => hin(o)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${gewaehlt?.id === o.id ? 'bg-akz/15 text-white ring-1 ring-akz/40' : 'text-white/75 hover:bg-white/[0.05]'}`}>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${benannt(o) ? 'bg-akz' : 'bg-white/30'}`} />
                          <span className={`min-w-0 flex-1 truncate ${benannt(o) ? 'font-semibold' : ''}`}>{o.name}</span>
                          <span className="zahl text-[11px] text-white/35">{imGitter(o)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!gefiltert.length && <p className="px-2.5 py-6 text-center text-xs text-white/40">{orte.length ? 'No location matches.' : 'Loading the locations …'}</p>}
                </div>
              )}

              {tafel === 'beute' && (
                <div>
                  <Kipp titel="Looted in cups" unter="Heat overlay from our own cup replays" an={beuteAn} umschalten={() => setBeuteAn((v) => !v)} zahl={beuteAn && beuteDa ? beuteSicht.length.toLocaleString('en') : undefined} />
                  <p className="mt-1 px-2.5 text-[11px] leading-relaxed text-white/45">
                    How often players opened a chest or ammo box in our S{beuteDa?.saison ?? 43} cup replays{beuteDa ? ` (${beuteDa.spiele} games)` : ''} – and what came out. Not the chest list: chests nobody opened are missing, and positions are approximate (where the loot dropped).
                  </p>
                  <AnimatePresence initial={false}>
                    {beuteAn && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        {beute === 'fehlt' ? <p className="mt-3 px-2.5 text-xs text-white/45">The replay file isn't there yet.</p> : !beuteDa ? <p className="mt-3 px-2.5 text-xs text-white/45">Loading …</p> : (
                          <div className="mt-4 space-y-3">
                            <div className="px-2.5"><Segment id="karte-beute" klein wert={beuteArt} onWahl={setBeuteArt} wahl={[{ k: 'beide', titel: 'Both' }, { k: 'chest', titel: 'Chests' }, { k: 'ammo_box', titel: 'Ammo boxes' }]} /></div>
                            <Regler titel="Looted in at least" wert={minSpiele} min={1} max={Math.min(40, beuteDa.spiele)} einheit={minSpiele === 1 ? ' game' : ' games'} setzen={setMinSpiele} start={3} />
                            <div className="px-2.5">
                              <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${hitze(0)}, ${hitze(0.5)}, ${hitze(1)})` }} />
                              <div className="mt-1 flex justify-between text-[10px] text-white/40"><span>rarely looted</span><span>looted almost every game</span></div>
                              <p className="mt-2 text-[10px] text-white/35">from {beuteDa.spiele} cup replays{beuteDa.stand ? ` · ${new Date(beuteDa.stand).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''} · white ring = ammo box · click a dot for its loot</p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {tafel === 'zeichnen' && <div className="px-1.5 py-1"><MeineZeichnungen z={z} starten={zeichnenStarten} /></div>}
            </div>
            <p className="hidden border-t border-white/[0.07] px-5 py-2.5 text-[11px] text-white/35 xl:block">Scroll to zoom, drag to move · Epic's world coordinates{stand ? <> · map image {new Date(stand).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</> : null}</p>
          </>
      </aside>
      )}
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

/**
 * Alle Marker als eine Ebene (Bildschirm-Pixel, Symbole per <use>). Eigene, gemerkte Komponente: beim Verschieben aendert sich nur die
 * Verschiebung der Ebene darueber, die Tausende Marker werden dabei nicht neu gebaut.
 */
const MarkerEbene = memo(function MarkerEbene({ gruppen, gr, aktiv, setUeber, klick }: {
  gruppen: Gruppe[]; gr: number; aktiv: string | null; setUeber: (f: (u: string | null) => string | null) => void; klick: (g: Gruppe) => void;
}) {
  return (
    <>
      {gruppen.map((g) => {
        const n = g.liste.length; const an = aktiv === g.id; const gross = n > 1 ? gr + 4 : an ? Math.round(gr * 1.3) : gr;
        return (
          <g key={g.id} className="cursor-pointer" style={{ pointerEvents: 'auto' }} onPointerEnter={() => setUeber(() => g.id)} onPointerLeave={() => setUeber((u) => (u === g.id ? null : u))} onClick={() => klick(g)}>
            {an && <circle cx={g.px} cy={g.py} r={gross * 0.72} fill="rgb(var(--akz) / 0.25)" stroke="rgb(var(--akz))" strokeWidth={2} />}
            <use href={`#k-${g.typ}`} x={g.px - gross / 2} y={g.py - gross / 2} width={gross} height={gross} />
            {n > 1 && (
              <g>
                <rect x={g.px + gross / 2 - 9} y={g.py - gross / 2 - 7} width={n > 99 ? 23 : n > 9 ? 18 : 14} height={14} rx={7} fill="#05070c" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                <text x={g.px + gross / 2 - 9 + (n > 99 ? 11.5 : n > 9 ? 9 : 7)} y={g.py - gross / 2 + 3.3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">{n > 99 ? '99+' : n}</text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});

function MarkerInfo({ g, skala, gitter, gruppenGroesse, schliessen }: { g: Gruppe; skala: number; gitter: (o: { links: number; oben: number }) => string; gruppenGroesse: Map<string, number>; schliessen?: () => void }) {
  const e = ebeneVon(g.typ); const n = g.liste.length; const o = g.liste[0];
  const feldVon = (px: number, py: number) => gitter({ links: (px / skala) * 100, oben: (py / skala) * 100 });
  const feld = g.linie ? feldVon(g.linie[0], g.linie[1]) : feldVon(g.px, g.py);
  const m = (cm: number) => `${Math.round(cm / 100).toLocaleString('en')} m`;
  const c = n === 1 ? chanceVon(o) : null;
  const plaetze = o.gruppe ? gruppenGroesse.get(o.gruppe) ?? 1 : 0;
  // "M of N spots": M aus der Chance des Exports (Gruppe aus N Plaetzen, M erscheinen -> chance = M/N)
  const davon = o.gruppe && c && !c.standard ? Math.round(c.wert * plaetze) : null;
  const zelle = (k: string, v: string) => <div key={k} className="rounded-lg bg-black/40 px-1.5 py-1"><dt className="text-[9px] uppercase tracking-wider text-white/40">{k}</dt><dd className="zahl text-xs font-bold text-white">{v}</dd></div>;
  const schnitt = n > 1 ? g.liste.map(chanceVon).filter((x): x is NonNullable<typeof x> => !!x) : [];
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Abzeichen typ={g.typ} groesse={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-tight text-white">{n > 1 ? `${n} ${e.titel.toLowerCase()}` : (o.name && o.name !== 'needs key' ? o.name : e.einzeln)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{n > 1 ? 'Click to zoom in' : `${e.gruppe} · grid ${feld}`}</p>
        </div>
        {schliessen && <button type="button" aria-label="Close" onClick={schliessen} className="self-start text-white/40 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></button>}
      </div>
      {c && (
        <div className="mt-2.5 rounded-lg bg-black/40 px-2.5 py-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-white/45">Spawn chance</span>
            <span className="zahl text-base font-extrabold text-akz">{c.wert >= 1 ? 'Always' : `${Math.round(c.wert * 100)}%`}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-akz" style={{ width: `${Math.round(c.wert * 100)}%` }} /></div>
          {c.standard && <p className="mt-1 text-[10px] text-white/40">Base chance for every {e.einzeln.toLowerCase()}</p>}
        </div>
      )}
      {o.gruppe && n === 1 && (
        <p className="mt-2 rounded-lg bg-akz/10 px-2.5 py-1.5 text-[11px] text-white/75">
          {davon !== null ? <><b className="zahl text-white">{davon} of {plaetze}</b> spots of this group spawn</> : <>One of <b className="zahl text-white">{plaetze}</b> spots in this group</>}
        </p>
      )}
      {n === 1 ? (
        <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          {g.linie && o.x2 !== undefined && o.y2 !== undefined
            ? [zelle('Length', m(Math.hypot(o.x2 - o.x, o.y2 - o.y))), zelle('From', feld), zelle('To', feldVon(g.linie[2], g.linie[3]))]
            : [zelle('X', m(o.x)), zelle('Y', m(o.y)), zelle('Height', o.z !== undefined ? m(o.z) : '–')]}
        </dl>
      ) : <p className="mt-2 text-xs text-white/55">Around grid {feld}{schnitt.length ? ` · avg. spawn chance ${Math.round((schnitt.reduce((a, x) => a + x.wert, 0) / schnitt.length) * 100)}%` : ''}.</p>}
      {n === 1 && o.name === 'needs key' && <p className="mt-2 text-[11px] text-amber-200/80">Needs a key</p>}
    </div>
  );
}

function BeuteInfo({ b, spiele, feld, schliessen }: { b: Beute; spiele: number; feld: string; schliessen?: () => void }) {
  const m = (cm: number) => `${Math.round(cm / 100).toLocaleString('en')} m`;
  const summe = b.loot.reduce((a, l) => a + l.n, 0) || 1;
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full" style={{ background: hitze(b.anteil), boxShadow: `0 0 12px ${hitze(b.anteil)}` }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-tight text-white">{b.typ === 'chest' ? 'Chest' : 'Ammo box'} · grid {feld}</p>
          <p className="text-[11px] text-white/60">Opened in <b className="text-white">{Math.round(b.anteil * 100)}%</b> of {spiele} cup games ({b.geoeffnet})</p>
        </div>
        {schliessen && <button type="button" aria-label="Close" onClick={schliessen} className="text-white/40 hover:text-white"><Icon d="M6 6l12 12M18 6L6 18" /></button>}
      </div>
      {b.loot.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {b.loot.slice(0, 6).map((l) => {
            const w = beuteName(l.item);
            return (
              <li key={l.item} className="relative flex items-center gap-2 overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px]">
                <span className="absolute inset-y-0 left-0 bg-white/[0.06]" style={{ width: `${(l.n / summe) * 100}%` }} />
                {w.bild ? <img src={w.bild} alt="" className="relative h-5 w-5 object-contain" /> : <span className="relative h-5 w-5" />}
                <span className="relative min-w-0 flex-1 truncate font-semibold text-white/85">{w.name}</span>
                {w.selten && <span className="relative text-[9px] font-bold" style={{ color: w.selten[1] }}>{w.selten[0]}</span>}
                <span className="zahl relative text-white/50">×{l.n}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="zahl mt-2 text-[10px] text-white/35">X {m(b.x)} · Y {m(b.y)}{b.z !== undefined ? ` · height ${m(b.z)}` : ''} · approximate</p>
    </div>
  );
}
