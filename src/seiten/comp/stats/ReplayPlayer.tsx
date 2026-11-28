import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from '../../../teile/Glas';
import { zahl } from './teile';

/*
 * 2D-Wiedergabe eines Games (Daten: /api/replay?match=<id>&v=4, wie thecomphub.com/replays/<Tag>/<Nr>).
 *
 * Aufbau (Design-System 3.0, "Theater"): die Karte fuellt die Buehne - so gross, wie der Bildschirm erlaubt, auch breiter als hoch (die Welt wird
 * dann links und rechts weiter gezeigt) -, die Steuerung ist unten an die Buehne angedockt, Kill-Feed und Teams stehen in der Seitentafel rechts
 * (auf dem Handy darunter). `kopf` ist der Kopf der Seitentafel (Titel, Zurueck, Game-Wahl) und kommt von der Seite. Vollbild ueber den Knopf.
 *
 * Alles wird auf eine Leinwand gezeichnet (kein DOM je Spieler): Karte, Sturm (aktueller Kreis, naechster Kreis gestrichelt), der Bus, jeder Spieler
 * als Punkt in der Farbe seines Teams mit einer kurzen Spur, Knocks als Ring, Eliminierungen als X. Die Spielerorte aus dem Replay sind duenn
 * (alle paar Sekunden ein Punkt) - dazwischen wird geradlinig gerechnet. Mausrad = Zoom, Ziehen = Verschieben, Leertaste = Abspielen/Pause.
 */

export interface RSpieler { id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number; kills?: number; tod?: number; todX?: number; todY?: number }
export interface REreignis { t: number; opfer?: number; taeter?: number; art: 'auf' | 'unten' | 'tot'; x?: number; y?: number; ursache?: number | null }
export interface RZone { radius?: number; naechsterRadius?: number; x?: number; y?: number; schrumpftAb?: number; schrumpftBis?: number }
export interface RMatch {
  spieler: RSpieler[]; feed: REreignis[]; zonen: RZone[]; sieger?: number; ende?: number; playlist?: string; karte?: string;
  orte?: Record<string, number[][]>; figuren?: Array<{ id: number; t: number }>; laender?: Record<string, string>;
  bus?: Array<{ x?: number; y?: number; yaw?: number; tempo?: number; sprungAb?: number; sprungBis?: number; flugBis?: number }> | null; busAb?: number;
  schaden?: Array<{ id: number; gemacht?: number }>;
}
export interface Rahmen { x0: number; y0: number; spanne: number }

const FARBEN = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa', '#2dd4bf', '#c084fc', '#fb923c', '#a3e635', '#e879f9', '#4ade80', '#f87171', '#93c5fd'];
const URSACHE: Record<number, string> = { 0: 'Storm', 1: 'Fall', 2: 'Pistol', 3: 'Shotgun', 4: 'Rifle', 5: 'SMG', 6: 'Sniper', 7: 'Sniper', 8: 'Melee', 10: 'Grenade', 12: 'Launcher', 13: 'Rocket', 17: 'Bleed out', 23: 'Vehicle' };
const TEMPI = [1, 2, 5, 10, 20, 50];
const uhr = (s: number) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const ohneMarke = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '').trim() || '?';
const nameVon = (p?: RSpieler) => (p?.bot ? 'Bot' : ohneMarke(p?.name));

/** Spielerorte ab dem Bus; der erste Ort ist der Bus im Augenblick des Absprungs (wie app/replays/analyse mitBusStart). */
function orteAufbereiten(m: RMatch): Map<number, Float64Array> {
  const raus = new Map<number, Float64Array>();
  const bus = m.bus?.[0]; const ab = m.busAb;
  const mitBus = bus && typeof ab === 'number' && typeof bus.x === 'number' && typeof bus.y === 'number' && typeof bus.yaw === 'number' && bus.tempo;
  const rad = mitBus ? (bus.yaw! * Math.PI) / 180 : 0; const c = Math.cos(rad); const sn = Math.sin(rad);
  for (const [k, l] of Object.entries(m.orte ?? {})) {
    const id = Number(k);
    let nach = [...l].sort((a, b) => a[0] - b[0]);
    if (mitBus) {
      nach = nach.filter((o) => o[0] >= ab!);
      if (nach.length) {
        const erst = nach[0];
        const fig = (m.figuren ?? []).find((f) => f.id === id && f.t - ab! >= (bus.sprungAb ?? 0) - 2 && f.t - ab! <= (bus.flugBis ?? 60) + 2);
        let s: number;
        if (fig && fig.t < erst[0]) s = fig.t - ab!;
        else {
          const proj = ((erst[1] - bus.x!) * c + (erst[2] - bus.y!) * sn) / bus.tempo!;
          s = Math.min(Math.max(proj, bus.sprungAb ?? 0), Math.min(bus.sprungBis ?? proj, erst[0] - ab! - 3));
        }
        if (s >= 0 && ab! + s < erst[0]) nach = [[ab! + s, bus.x! + c * bus.tempo! * s, bus.y! + sn * bus.tempo! * s], ...nach];
      }
    }
    const f = new Float64Array(nach.length * 3);
    nach.forEach((o, i) => { f[i * 3] = o[0]; f[i * 3 + 1] = o[1]; f[i * 3 + 2] = o[2]; });
    raus.set(id, f);
  }
  return raus;
}

/** Index des letzten Orts mit Zeit <= t (-1: noch keiner). */
function bis(f: Float64Array, t: number) {
  let lo = 0; let hi = f.length / 3 - 1; let r = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (f[mid * 3] <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; }
  return r;
}
function ortBei(f: Float64Array, t: number): [number, number] | null {
  const i = bis(f, t);
  if (i < 0) return null;
  const n = f.length / 3;
  if (i === n - 1) return [f[i * 3 + 1], f[i * 3 + 2]];
  const t0 = f[i * 3]; const t1 = f[i * 3 + 3]; const a = (t - t0) / Math.max(0.001, t1 - t0);
  return [f[i * 3 + 1] + (f[i * 3 + 4] - f[i * 3 + 1]) * a, f[i * 3 + 2] + (f[i * 3 + 5] - f[i * 3 + 2]) * a];
}

interface Kreis { x: number; y: number; r: number }
/** Die Zone zu einem Zeitpunkt: vor dem Schrumpfen die aktuelle, waehrenddessen gleitend zur naechsten (wie ReplayAnsicht zoneBei). */
function zoneBei(zonen: RZone[], t: number): { jetzt: Kreis | null; ziel: Kreis | null; phase: number; schrumpft: boolean } {
  if (!zonen.length) return { jetzt: null, ziel: null, phase: 0, schrumpft: false };
  let i = 0;
  for (let k = 0; k < zonen.length; k += 1) if ((zonen[k].schrumpftAb ?? Infinity) <= t) i = k;
  const z = zonen[i]; const naechste = zonen[i + 1];
  const von: Kreis = { x: z.x ?? 0, y: z.y ?? 0, r: z.radius ?? 0 };
  const nach: Kreis = { x: naechste?.x ?? von.x, y: naechste?.y ?? von.y, r: z.naechsterRadius ?? von.r };
  const ab = z.schrumpftAb ?? 0; const bisT = z.schrumpftBis ?? ab;
  if (t < ab) return { jetzt: i === 0 ? von : { x: zonen[i - 1].x ?? von.x, y: zonen[i - 1].y ?? von.y, r: zonen[i - 1].naechsterRadius ?? von.r }, ziel: i === 0 ? nach : von, phase: i, schrumpft: false };
  if (t >= bisT) return { jetzt: nach, ziel: naechste ? { x: naechste.x ?? nach.x, y: naechste.y ?? nach.y, r: naechste.naechsterRadius ?? nach.r } : null, phase: i + 1, schrumpft: false };
  const f = (t - ab) / Math.max(1, bisT - ab);
  return { jetzt: { x: von.x + (nach.x - von.x) * f, y: von.y + (nach.y - von.y) * f, r: von.r + (nach.r - von.r) * f }, ziel: nach, phase: i + 1, schrumpft: true };
}

export default function ReplayPlayer({ match, kartenBild, bildRahmen, ausschnitt, kopf }: { match: RMatch; kartenBild: string | null; bildRahmen: Rahmen; ausschnitt?: Rahmen | null; kopf?: ReactNode }) {
  const orte = useMemo(() => orteAufbereiten(match), [match]);
  const feed = useMemo(() => [...match.feed].sort((a, b) => a.t - b.t), [match.feed]);
  const nachId = useMemo(() => new Map(match.spieler.map((s) => [s.id, s])), [match.spieler]);
  const teamFarbe = useMemo(() => {
    // Farbe je Team nach Endplatz - die Besten bekommen die kraeftigsten Farben.
    const teams = [...new Set(match.spieler.map((s) => s.team ?? -s.id))].sort((a, b) => {
      const pa = Math.min(...match.spieler.filter((s) => (s.team ?? -s.id) === a).map((s) => s.platz ?? 999));
      const pb = Math.min(...match.spieler.filter((s) => (s.team ?? -s.id) === b).map((s) => s.platz ?? 999));
      return pa - pb;
    });
    return new Map(teams.map((t, i) => [t, FARBEN[i % FARBEN.length]]));
  }, [match.spieler]);
  const farbe = useCallback((id?: number) => { const s = id === undefined ? undefined : nachId.get(id); return s ? teamFarbe.get(s.team ?? -s.id) ?? '#94a3b8' : '#94a3b8'; }, [nachId, teamFarbe]);

  // Ausschnitt der Welt: wo gespielt wurde (1.-99. Perzentil der Orte, dazu die spaeteren Zonen).
  const welt = useMemo<Rahmen>(() => {
    if (ausschnitt) return ausschnitt;
    const xs: number[] = []; const ys: number[] = [];
    for (const f of orte.values()) for (let i = 0; i < f.length; i += 3) { xs.push(f[i + 1]); ys.push(f[i + 2]); }
    if (xs.length > 50) {
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
      const q = (l: number[], p: number) => l[Math.min(l.length - 1, Math.max(0, Math.floor(p * l.length)))];
      let x0 = q(xs, 0.01); let x1 = q(xs, 0.99); let y0 = q(ys, 0.01); let y1 = q(ys, 0.99);
      for (const z of match.zonen.slice(1)) if (typeof z.x === 'number' && typeof z.y === 'number' && typeof z.radius === 'number' && z.radius < 80_000) {
        x0 = Math.min(x0, z.x - z.radius); x1 = Math.max(x1, z.x + z.radius); y0 = Math.min(y0, z.y - z.radius); y1 = Math.max(y1, z.y + z.radius);
      }
      const sp = Math.max(x1 - x0, y1 - y0) * 1.1;
      return { x0: (x0 + x1) / 2 - sp / 2, y0: (y0 + y1) / 2 - sp / 2, spanne: sp };
    }
    if (kartenBild) return bildRahmen;
    for (const e of feed) { if (typeof e.x === 'number' && typeof e.y === 'number') { xs.push(e.x); ys.push(e.y); } }
    for (const z of match.zonen) if (typeof z.x === 'number' && typeof z.y === 'number') { const r = Math.min(z.radius ?? 0, 60_000); xs.push(z.x - r, z.x + r); ys.push(z.y - r, z.y + r); }
    if (!xs.length) return bildRahmen;
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const sp = Math.max(x1 - x0, y1 - y0) * 1.08;
    return { x0: (x0 + x1) / 2 - sp / 2, y0: (y0 + y1) / 2 - sp / 2, spanne: sp };
  }, [ausschnitt, orte, match.zonen, kartenBild, bildRahmen, feed]);

  const start = useMemo(() => {
    if (typeof match.busAb === 'number') return match.busAb;
    let m = Infinity; for (const f of orte.values()) if (f.length) m = Math.min(m, f[0]);
    return Number.isFinite(m) ? m : (feed[0]?.t ?? 0) - 60;
  }, [match.busAb, orte, feed]);
  const ende = match.ende ?? (feed.length ? feed[feed.length - 1].t + 5 : start + 1200);

  /* --------------------------------------------------------- Zustand: Zeit, Tempo, Ansicht */
  const tRef = useRef(start);
  const [t, setT] = useState(start);
  const [laeuft, setLaeuft] = useState(false);
  const [tempo, setTempo] = useState(10);
  const [spuren, setSpuren] = useState(true);
  const [namen, setNamen] = useState(false);
  const [markiert, setMarkiert] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; id: number } | null>(null);
  const sicht = useRef<Rahmen>(welt);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const kasten = useRef<HTMLDivElement>(null);
  const [bild, setBild] = useState<HTMLImageElement | null>(null);
  /** Farbe des Meers am Bildrand - damit die Karte auf einer breiten Buehne ohne sichtbare Kante auslaeuft. */
  const meer = useRef('#0a1220');
  const theater = useRef<HTMLDivElement>(null);
  const [voll, setVoll] = useState(false);
  const zeichnenRef = useRef<() => void>(() => {});

  useEffect(() => { sicht.current = welt; tRef.current = start; setT(start); zeichnenRef.current(); }, [welt, start]);
  useEffect(() => {
    setBild(null);
    if (!kartenBild) return;
    const b = new Image();
    b.onload = () => {
      try {
        const k = document.createElement('canvas'); k.width = 1; k.height = 1;
        const kg = k.getContext('2d');
        if (kg) { kg.drawImage(b, 2, 2, 1, 1, 0, 0, 1, 1); const d = kg.getImageData(0, 0, 1, 1).data; if (d[3] > 200) meer.current = `rgb(${d[0]},${d[1]},${d[2]})`; }
      } catch { /* fremdes Bild: Standardfarbe bleibt */ }
      setBild(b);
    };
    b.src = kartenBild;
  }, [kartenBild]);

  /* --------------------------------------------------------- Zeichnen */
  const zeichnen = useCallback(() => {
    const c = leinwand.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    // Die Sicht (x0, y0, spanne) beschreibt ein Quadrat in der Mitte der Leinwand; ist die Buehne breiter oder hoeher, sieht man dort mehr Welt.
    const W = c.width; const H = c.height; const S = Math.min(W, H); const ox = (W - S) / 2; const oy = (H - S) / 2; const dpr = window.devicePixelRatio || 1;
    const v = sicht.current; const jetzt = tRef.current;
    const px = (x: number) => ox + ((x - v.x0) / v.spanne) * S;
    const py = (y: number) => oy + ((y - v.y0) / v.spanne) * S;
    const pr = (r: number) => (r / v.spanne) * S;
    g.fillStyle = bild ? meer.current : '#0a1220'; g.fillRect(0, 0, W, H);
    if (bild) {
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(bild, px(bildRahmen.x0), py(bildRahmen.y0), pr(bildRahmen.spanne), pr(bildRahmen.spanne));
      g.fillStyle = 'rgba(6,8,15,.18)'; g.fillRect(0, 0, W, H);
    } else {
      // Ohne Kartenbild ein feines Raster.
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
      const kante = Math.max(W, H) / 20;
      for (let p = 0; p <= Math.max(W, H); p += kante) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); }
    }

    // Sturm: aussen violett, Kreis weiss, naechster Kreis gestrichelt.
    const z = zoneBei(match.zonen, jetzt);
    if (z.jetzt && z.jetzt.r > 0) {
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.arc(px(z.jetzt.x), py(z.jetzt.y), pr(z.jetzt.r), 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(126,34,206,.28)'; g.fill('evenodd'); g.restore();
      g.beginPath(); g.arc(px(z.jetzt.x), py(z.jetzt.y), pr(z.jetzt.r), 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2 * dpr; g.stroke();
    }
    if (z.ziel && z.ziel.r > 0) {
      g.beginPath(); g.setLineDash([8 * dpr, 6 * dpr]); g.arc(px(z.ziel.x), py(z.ziel.y), pr(z.ziel.r), 0, Math.PI * 2); g.strokeStyle = 'rgba(56,189,248,.8)'; g.lineWidth = 1.5 * dpr; g.stroke(); g.setLineDash([]);
    }

    // Der Bus, solange er fliegt.
    const bus = match.bus?.[0];
    if (bus && typeof match.busAb === 'number' && typeof bus.x === 'number' && typeof bus.y === 'number' && typeof bus.yaw === 'number' && bus.tempo) {
      const rad = (bus.yaw * Math.PI) / 180; const s = jetzt - match.busAb; const flug = bus.flugBis ?? 60;
      if (s <= flug + 2) {
        const a = { x: bus.x, y: bus.y }; const e = { x: bus.x + Math.cos(rad) * bus.tempo * flug, y: bus.y + Math.sin(rad) * bus.tempo * flug };
        g.beginPath(); g.moveTo(px(a.x), py(a.y)); g.lineTo(px(e.x), py(e.y)); g.strokeStyle = 'rgba(250,204,21,.55)'; g.lineWidth = 2 * dpr; g.setLineDash([4 * dpr, 5 * dpr]); g.stroke(); g.setLineDash([]);
        const b = { x: bus.x + Math.cos(rad) * bus.tempo * Math.max(0, s), y: bus.y + Math.sin(rad) * bus.tempo * Math.max(0, s) };
        g.beginPath(); g.arc(px(b.x), py(b.y), 7 * dpr, 0, Math.PI * 2); g.fillStyle = '#facc15'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2 * dpr; g.stroke();
      }
    }

    const team = (id: number) => nachId.get(id)?.team;
    const gedimmt = (id?: number) => markiert !== null && (id === undefined || team(id) !== markiert);

    // Knocks (Ring, 12 s) und Eliminierungen (X, bleiben, aelter blasser).
    for (const e of feed) {
      if (e.t > jetzt) break;
      if (typeof e.x !== 'number' || typeof e.y !== 'number') continue;
      const x = px(e.x); const y = py(e.y); const col = farbe(e.opfer);
      g.globalAlpha = gedimmt(e.opfer) && gedimmt(e.taeter) ? 0.15 : 1;
      if (e.art === 'unten' && jetzt - e.t < 12) {
        g.beginPath(); g.arc(x, y, 7 * dpr, 0, Math.PI * 2); g.strokeStyle = col; g.lineWidth = 2.5 * dpr; g.stroke();
      } else if (e.art === 'tot') {
        const alt = jetzt - e.t; g.globalAlpha *= alt < 20 ? 1 : 0.55;
        const r = 5 * dpr; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r);
        g.strokeStyle = '#000'; g.lineWidth = 5 * dpr; g.stroke(); g.strokeStyle = col; g.lineWidth = 2.6 * dpr; g.stroke();
        if (alt < 3) { g.beginPath(); g.arc(x, y, (8 + alt * 8) * dpr, 0, Math.PI * 2); g.strokeStyle = col; g.globalAlpha = Math.max(0, 1 - alt / 3); g.lineWidth = 2 * dpr; g.stroke(); }
      }
    }
    g.globalAlpha = 1;

    // Spieler: Spur der letzten 20 s, dann der Punkt.
    const punkte: Array<{ id: number; x: number; y: number }> = [];
    for (const [id, f] of orte) {
      if (!f.length || jetzt < f[0]) continue;
      const sp = nachId.get(id);
      const tot = sp?.tod;
      const letzte = f[f.length - 3];
      if ((typeof tot === 'number' && jetzt > tot && letzte <= tot + 1) || jetzt > letzte + 15) continue;
      const o = ortBei(f, jetzt); if (!o) continue;
      const col = farbe(id); const dim = gedimmt(id);
      g.globalAlpha = dim ? 0.18 : 1;
      if (spuren) {
        const i = bis(f, jetzt); let k = i; while (k > 0 && f[(k - 1) * 3] >= jetzt - 20) k -= 1;
        g.beginPath(); g.moveTo(px(o[0]), py(o[1]));
        for (let j = i; j >= k; j -= 1) g.lineTo(px(f[j * 3 + 1]), py(f[j * 3 + 2]));
        g.strokeStyle = col; g.globalAlpha = dim ? 0.08 : 0.45; g.lineWidth = 1.6 * dpr; g.stroke();
        g.globalAlpha = dim ? 0.18 : 1;
      }
      const x = px(o[0]); const y = py(o[1]);
      g.beginPath(); g.arc(x, y, (markiert !== null && !dim ? 6 : 4.5) * dpr, 0, Math.PI * 2); g.fillStyle = col; g.fill();
      g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1.5 * dpr; g.stroke();
      if ((namen || (markiert !== null && !dim)) && sp) {
        g.font = `600 ${11 * dpr}px Inter, sans-serif`; g.fillStyle = 'rgba(0,0,0,.7)';
        const txt = nameVon(sp); const w = g.measureText(txt).width;
        g.fillRect(x + 7 * dpr, y - 8 * dpr, w + 8 * dpr, 16 * dpr); g.fillStyle = '#fff'; g.fillText(txt, x + 11 * dpr, y + 4 * dpr);
      }
      punkte.push({ id, x: x / dpr, y: y / dpr });
    }
    g.globalAlpha = 1;
    punkteRef.current = punkte;
  }, [bild, bildRahmen, match.zonen, match.bus, match.busAb, feed, orte, nachId, farbe, markiert, spuren, namen]);
  const punkteRef = useRef<Array<{ id: number; x: number; y: number }>>([]);
  zeichnenRef.current = zeichnen;
  useEffect(() => { zeichnen(); }, [zeichnen, t]);

  // Groesse der Leinwand: so gross wie die Buehne (nicht mehr quadratisch), scharf auf hochaufloesenden Bildschirmen.
  useEffect(() => {
    const k = kasten.current; const c = leinwand.current; if (!k || !c) return undefined;
    const ro = new ResizeObserver(() => { const dpr = window.devicePixelRatio || 1; c.width = Math.max(1, Math.round(k.clientWidth * dpr)); c.height = Math.max(1, Math.round(k.clientHeight * dpr)); zeichnenRef.current(); });
    ro.observe(k);
    return () => ro.disconnect();
  }, []);

  // Abspielen.
  useEffect(() => {
    if (!laeuft) return undefined;
    let id = 0; let vorher = performance.now(); let gemeldet = 0;
    const schritt = (jetzt: number) => {
      const dt = Math.min(0.1, (jetzt - vorher) / 1000); vorher = jetzt;
      tRef.current = Math.min(ende, tRef.current + dt * tempo);
      zeichnenRef.current();
      if (jetzt - gemeldet > 120) { gemeldet = jetzt; setT(tRef.current); }
      if (tRef.current >= ende) { setLaeuft(false); setT(ende); return; }
      id = requestAnimationFrame(schritt);
    };
    id = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(id);
  }, [laeuft, tempo, ende]);

  const springe = (neu: number) => { tRef.current = Math.max(start, Math.min(ende, neu)); setT(tRef.current); zeichnenRef.current(); };

  // Tastatur: Leertaste, Pfeile.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); setLaeuft((x) => !x); }
      if (e.code === 'ArrowRight') springe(tRef.current + 10);
      if (e.code === 'ArrowLeft') springe(tRef.current - 10);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  /* --------------------------------------------------------- Maus: Zoom, Ziehen, Hover */
  const ziehen = useRef<{ x: number; y: number; v: Rahmen } | null>(null);
  /** Das Quadrat der Sicht in Bildschirm-Pixeln (siehe zeichnen). */
  const masse = (c: HTMLCanvasElement) => { const r = c.getBoundingClientRect(); const S = Math.min(r.width, r.height); return { r, S, ox: (r.width - S) / 2, oy: (r.height - S) / 2 }; };
  const rad = (e: React.WheelEvent) => {
    const c = leinwand.current; if (!c) return;
    const { r, S, ox, oy } = masse(c); const fx = (e.clientX - r.left - ox) / S; const fy = (e.clientY - r.top - oy) / S;
    const v = sicht.current; const faktor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    const neu = Math.min(welt.spanne * 1.2, Math.max(welt.spanne / 16, v.spanne * faktor));
    const wx = v.x0 + fx * v.spanne; const wy = v.y0 + fy * v.spanne;
    sicht.current = { x0: wx - fx * neu, y0: wy - fy * neu, spanne: neu };
    zeichnenRef.current();
  };
  useEffect(() => {
    // Seite nicht mitscrollen, solange die Maus auf der Karte ist.
    const c = leinwand.current; if (!c) return undefined;
    const f = (e: WheelEvent) => e.preventDefault();
    c.addEventListener('wheel', f, { passive: false });
    return () => c.removeEventListener('wheel', f);
  }, []);
  const runter = (e: React.MouseEvent) => { ziehen.current = { x: e.clientX, y: e.clientY, v: sicht.current }; };
  const bewegen = (e: React.MouseEvent) => {
    const c = leinwand.current; if (!c) return;
    const { r, S } = masse(c);
    if (ziehen.current) {
      const z = ziehen.current; const proPx = z.v.spanne / S;
      sicht.current = { ...z.v, x0: z.v.x0 - (e.clientX - z.x) * proPx, y0: z.v.y0 - (e.clientY - z.y) * proPx };
      zeichnenRef.current(); return;
    }
    const mx = e.clientX - r.left; const my = e.clientY - r.top;
    let best: { x: number; y: number; id: number } | null = null; let d = 14 * 14;
    for (const p of punkteRef.current) { const q = (p.x - mx) ** 2 + (p.y - my) ** 2; if (q < d) { d = q; best = p; } }
    setHover(best);
  };
  const hoch = () => { ziehen.current = null; };
  const zurueck = () => { sicht.current = welt; zeichnenRef.current(); };
  useEffect(() => { const f = () => setVoll(document.fullscreenElement === theater.current); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const vollbild = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void theater.current?.requestFullscreen?.().catch(() => {}); };

  /* --------------------------------------------------------- Seitenleiste: Teams und Feed */
  const teams = useMemo(() => {
    const m = new Map<number, RSpieler[]>();
    for (const s of match.spieler) { const k = s.team ?? -s.id; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); }
    return [...m.entries()].map(([team, spieler]) => ({ team, spieler, platz: Math.min(...spieler.map((s) => s.platz ?? 999)) })).sort((a, b) => a.platz - b.platz);
  }, [match.spieler]);
  const killsBis = useMemo(() => {
    const k = new Map<number, number>();
    for (const e of feed) { if (e.t > t) break; if (e.art === 'tot' && e.taeter !== undefined && e.taeter !== e.opfer) k.set(e.taeter, (k.get(e.taeter) ?? 0) + 1); }
    return k;
  }, [feed, t]);
  const lebt = (s: RSpieler) => !(typeof s.tod === 'number' && s.tod <= t);
  const imSpiel = teams.filter((x) => x.spieler.some(lebt)).length;
  const imSpielSpieler = match.spieler.filter(lebt).length;
  const letzte = useMemo(() => feed.filter((e) => e.t <= t && e.art !== 'auf').slice(-6).reverse(), [feed, t]);
  const zone = zoneBei(match.zonen, t);
  const killMarken = useMemo(() => feed.filter((e) => e.art === 'tot').map((e) => (e.t - start) / Math.max(1, ende - start)), [feed, start, ende]);
  const hoverSp = hover ? nachId.get(hover.id) : undefined;
  const flaggeVon = (s?: RSpieler) => (s?.epic ? match.laender?.[s.epic] : undefined);
  const fortschritt = ((t - start) / Math.max(1, ende - start)) * 100;
  const kn = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-semibold text-white/75 transition hover:border-akz/50 hover:text-white';
  const schalter = (an: boolean) => `${kn} ${an ? '!border-akz/50 !bg-akz/15 !text-white' : ''}`;
  const tafel = 'pointer-events-none rounded-xl border border-white/10 bg-black/65 px-2 py-1 backdrop-blur-md sm:px-3 sm:py-1.5';

  return (
    <div ref={theater} className={`flex flex-col gap-3 xl:flex-row ${voll ? 'h-screen bg-grund p-3' : 'xl:h-[calc(100vh-8.5rem)] xl:min-h-[540px]'}`}>
      {/* Buehne: die Karte, unten die angedockte Steuerung */}
      <div className="fl-fest flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={kasten} className="relative h-[min(100vw,60vh)] min-h-0 bg-[#0a1220] xl:h-auto xl:flex-1">
          <canvas ref={leinwand} className={`absolute inset-0 block h-full w-full ${ziehen.current ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={rad} onMouseDown={runter} onMouseMove={bewegen} onMouseUp={hoch} onMouseLeave={() => { hoch(); setHover(null); }}
            onClick={() => { if (hover) { const tm = nachId.get(hover.id)?.team; setMarkiert(tm === undefined || tm === markiert ? null : tm); } }} />
          {/* Oben links: Zeit und Zone - oben rechts: wer noch lebt */}
          <div className={`absolute left-3 top-3 ${tafel}`}>
            <p className="zahl font-titel text-2xl leading-none tracking-wide text-white sm:text-4xl">{uhr(t - start)}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/55 sm:text-[10px] sm:tracking-[0.2em]">Zone {zone.phase}{zone.schrumpft ? <span className="text-violet-300"> · shrinking</span> : ''}</p>
          </div>
          <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
            {[['Teams', imSpiel], ['Players', imSpielSpieler]].map(([k, v]) => (
              <div key={String(k)} className={`${tafel} text-right`}>
                <p className="zahl font-titel text-xl leading-none tracking-wide text-white sm:text-3xl">{v}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/55 sm:text-[10px] sm:tracking-[0.2em]">{k}<span className="hidden sm:inline"> alive</span></p>
              </div>
            ))}
          </div>
          {hover && hoverSp && (
            <div className="pointer-events-none absolute z-10 rounded-xl border border-white/15 bg-fl/95 px-3 py-2 text-xs backdrop-blur-md" style={{ left: hover.x + 14, top: hover.y - 10 }}>
              <p className="flex items-center gap-1.5 font-bold text-white">{flaggeVon(hoverSp) && <img src={flagge(flaggeVon(hoverSp))} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}{nameVon(hoverSp)}</p>
              <p className="text-white/50">#{hoverSp.platz ?? '–'} · {killsBis.get(hoverSp.id) ?? 0} elims so far · click to follow team</p>
            </div>
          )}
          {/* Unten auf der Karte: Legende links, Hinweise rechts */}
          <div className="pointer-events-none absolute inset-x-3 bottom-2.5 hidden items-center gap-x-4 text-[10px] text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,.9)] sm:flex">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-white" />Zone</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-sky-400" />Next zone</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-rose-300" />Knock</span>
            <span><b className="text-rose-300">✕</b> Elimination</span>
            <span className="ml-auto hidden lg:inline">Wheel zoom · drag to pan · space play/pause · ←/→ 10 s</span>
          </div>
        </div>

        {/* Angedockte Steuerung: Zeitleiste, darunter Abspielen, Tempo, Schalter */}
        <div className="border-t border-white/[0.07] px-3 pb-2.5 pt-2 sm:px-4">
          <div className="relative h-6">
            {/* Eliminierungen als Striche, Schrumpfphasen als Baender */}
            <div className="pointer-events-none absolute inset-x-0 top-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
              {match.zonen.map((z, i) => typeof z.schrumpftAb === 'number' && typeof z.schrumpftBis === 'number' && (
                <span key={i} className="absolute top-0 h-full bg-violet-500/40" style={{ left: `${((z.schrumpftAb - start) / (ende - start)) * 100}%`, width: `${((z.schrumpftBis - z.schrumpftAb) / (ende - start)) * 100}%` }} />
              ))}
              <span className="absolute left-0 top-0 h-full bg-akz/80" style={{ width: `${fortschritt}%` }} />
            </div>
            {killMarken.map((f, i) => <span key={i} className="pointer-events-none absolute top-0 h-1.5 w-px bg-rose-400/80" style={{ left: `${f * 100}%` }} />)}
            <input type="range" min={start} max={ende} step={0.5} value={t} onChange={(e) => springe(Number(e.target.value))} aria-label="Timeline"
              className="absolute inset-x-0 top-0 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgb(var(--akz)/0.35)]" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-2">
            <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={() => { if (tRef.current >= ende) springe(start); setLaeuft(!laeuft); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-akz text-[#04050a] shadow-[0_0_22px_rgb(var(--akz)/0.5)]" aria-label={laeuft ? 'Pause' : 'Play'}>
              {laeuft ? <svg width="15" height="15" viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
                : <svg width="15" height="15" viewBox="0 0 16 16"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor" /></svg>}
            </motion.button>
            <button type="button" onClick={() => springe(t - 30)} className={kn}>−30s</button>
            <button type="button" onClick={() => springe(t + 30)} className={kn}>+30s</button>
            <span className="zahl mx-1 text-sm font-bold text-white">{uhr(t - start)} <span className="text-white/35">/ {uhr(ende - start)}</span></span>
            <div className="ml-auto flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5">
              {TEMPI.map((x) => <button key={x} type="button" onClick={() => setTempo(x)} className={`zahl rounded-md px-2 py-1 text-[11px] font-bold transition ${tempo === x ? 'bg-akz text-[#04050a]' : 'text-white/50 hover:text-white'}`}>{x}×</button>)}
            </div>
            <button type="button" onClick={() => setSpuren(!spuren)} aria-pressed={spuren} className={schalter(spuren)}>Trails</button>
            <button type="button" onClick={() => setNamen(!namen)} aria-pressed={namen} className={schalter(namen)}>Names</button>
            <button type="button" onClick={zurueck} className={kn}>Reset view</button>
            <button type="button" onClick={vollbild} className={kn} aria-label={voll ? 'Leave full screen' : 'Full screen'} title={voll ? 'Leave full screen' : 'Full screen'}>
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{voll ? <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" /> : <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />}</svg>
            </button>
          </div>
        </div>
      </div>

      {/* Seitentafel: Kopf der Seite, Kill-Feed, Teams */}
      <aside className="flex w-full shrink-0 flex-col gap-3 xl:min-h-0 xl:w-[380px]">
        {!voll && kopf}
        <div className="fl-fest shrink-0 p-3">
          <h3 className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Kill feed<span className="zahl normal-case tracking-normal text-white/30">{killMarken.length} eliminations in this game</span></h3>
          <ul className="mt-2 h-[184px] space-y-1 overflow-hidden">
            {letzte.length === 0 && <li className="px-1 py-8 text-center text-xs text-white/30">No eliminations yet – press play.</li>}
            {letzte.map((e, i) => {
              const tae = e.taeter !== undefined ? nachId.get(e.taeter) : undefined; const op = e.opfer !== undefined ? nachId.get(e.opfer) : undefined;
              return (
                <motion.li key={`${e.t}-${e.opfer}-${e.art}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1 - i * 0.09, x: 0 }}
                  className="flex h-[26px] items-center gap-2 rounded-lg bg-black/35 px-2.5 text-[12px]">
                  <span className="zahl w-9 shrink-0 text-[10px] text-white/35">{uhr(e.t - start)}</span>
                  {tae && tae.id !== op?.id ? <span className="max-w-[110px] truncate font-semibold" style={{ color: farbe(tae.id) }}>{nameVon(tae)}</span> : null}
                  <span className={`shrink-0 text-[10px] font-bold uppercase ${e.art === 'tot' ? 'text-rose-300' : 'text-amber-300'}`}>{e.art === 'tot' ? '✕' : 'knock'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: farbe(op?.id) }}>{nameVon(op)}</span>
                  {typeof e.ursache === 'number' && URSACHE[e.ursache] && <span className="shrink-0 text-[10px] text-white/30">{URSACHE[e.ursache]}</span>}
                </motion.li>
              );
            })}
          </ul>
        </div>
        <div className="fl-fest flex min-h-0 flex-1 flex-col p-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Teams · final placement</h3>
            {markiert !== null ? <button type="button" onClick={() => setMarkiert(null)} className="knopf-leer !text-[11px]">Show all</button> : <span className="text-[10px] text-white/30">click to follow</span>}
          </div>
          <ul className="mt-2 max-h-[420px] min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 xl:max-h-none">
            {teams.map((x) => {
              const raus = !x.spieler.some(lebt); const tk = x.spieler.reduce((s, p) => s + (killsBis.get(p.id) ?? 0), 0);
              const an = markiert === x.team;
              return (
                <li key={x.team}>
                  <button type="button" onClick={() => setMarkiert(an ? null : x.team)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${an ? 'bg-akz/15 ring-1 ring-akz/40' : 'hover:bg-white/[0.05]'} ${raus ? 'opacity-40' : ''}`}>
                    <span className="zahl w-7 text-right text-xs font-black text-white/45">#{x.platz === 999 ? '–' : x.platz}</span>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: teamFarbe.get(x.team) }} />
                    <span className="min-w-0 flex-1">
                      {x.spieler.map((s) => (
                        <span key={s.id} className={`flex items-center gap-1.5 truncate text-[12px] ${lebt(s) ? 'text-white' : 'text-white/40 line-through decoration-white/30'}`}>
                          {flaggeVon(s) && <img src={flagge(flaggeVon(s))} alt="" className="h-3 w-3 rounded-full object-cover" />}{nameVon(s)}
                        </span>
                      ))}
                    </span>
                    <span className="zahl text-right text-[11px] text-white/50"><b className="text-sm text-white">{tk}</b> elims</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-1 pt-2">
            {match.schaden?.length ? <span className="zahl text-[11px] text-white/40">Total damage: <b className="text-white/70">{zahl(match.schaden.reduce((s, x) => s + (x.gemacht ?? 0), 0))}</b></span> : <span />}
            <Link to="/competitive/deep-stats" className="knopf-leer !text-[11px]">Weapons & heatmaps <span aria-hidden>→</span></Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
