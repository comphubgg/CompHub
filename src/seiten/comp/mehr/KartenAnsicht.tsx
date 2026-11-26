import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/*
 * Die Landepunkt-Karte im Hub - wie jede Turnierkarte der Seite: Schwarz, wo ein Team steht, Rot ab rotAb Teams, weisse Namen in
 * Grossbuchstaben mit schwarzer Kontur. Rad zoomt zum Zeiger, Ziehen verschiebt, Doppelklick zoomt hinein, Strg+F sucht einen Spieler
 * und springt hin, Vollbild, als PNG speichern. Nur Anschauen - bearbeitet wird auf thecomphub.com (/maps).
 */

export interface Punkt { x: number; y: number }
export interface KartenForm { punkte: Punkt[]; zeilen: string[]; teams: number; farbe?: string | null; name?: string; /** Alle Einzelnamen (fuer die Suche) */ alle?: string[] }

const ZOOM_MAX = 8;

/** Ein Name, wie er auf der Karte steht: ohne [Marke], Startnummer und Zierzeichen am Ende, gross, hoechstens 16 Zeichen. */
export function kartenName(name: string): string {
  const teile = String(name ?? '').trim().split(/\s+/).filter((t) => !/^\[.*\]$/.test(t)).filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  let s = (teile.length ? teile.join(' ') : String(name ?? '')).trim();
  while (s.length && !/[\p{L}\p{N}]/u.test(s[s.length - 1])) s = s.slice(0, -1);
  return (s || String(name ?? '')).slice(0, 16).toUpperCase();
}

/** Wo das Kartenbild herkommt: fremde Bilder ueber den Server der Seite, eigene direkt, sonst Epics aktuelle Karte. */
export function kartenQuelle(bild?: string | null): string {
  if (!bild) return '/bilder/karte-leer.png';
  return /^https?:\/\//.test(bild) ? `/api/maps-bild?u=${encodeURIComponent(bild)}&v=png` : encodeURI(bild);
}

function rahmen(p: Punkt[]) {
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  const links = Math.min(...xs), oben = Math.min(...ys);
  return { links, oben, breite: Math.max(...xs) - links, hoehe: Math.max(...ys) - oben };
}
/** Schwerpunkt der Flaeche (bei Rechtecken genau die Mitte). */
function schwerpunkt(p: Punkt[]): Punkt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    const f = q.x * r.y - r.x * q.y;
    a += f; cx += (q.x + r.x) * f; cy += (q.y + r.y) * f;
  }
  if (Math.abs(a) < 1e-6) { const r = rahmen(p); return { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 }; }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
function farbe(teams: number, rotAb: number, eigene?: string | null) {
  if (eigene && /^#[0-9a-f]{6}$/i.test(eigene)) {
    const n = parseInt(eigene.slice(1), 16);
    return { f: `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.4)`, r: eigene };
  }
  if (teams >= rotAb) return { f: 'rgba(255,0,0,0.4)', r: '#d32f2f' };
  if (teams >= 1) return { f: 'rgba(0,0,0,0.4)', r: '#000' };
  return { f: 'rgba(0,0,0,0.14)', r: 'rgba(0,0,0,0.7)' };
}

function begrenze(z: number, m: Punkt): Punkt {
  if (z <= 1) return { x: 50, y: 50 };
  const sicht = 100 / z;
  return { x: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.x)), y: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.y)) };
}

export default function KartenAnsicht({ formen, bild, rotAb = 2, titel = 'map' }: { formen: KartenForm[]; bild?: string | null; rotAb?: number; titel?: string }) {
  const huelle = useRef<HTMLDivElement | null>(null);
  const flaeche = useRef<HTMLDivElement | null>(null);
  const [z, setZ] = useState(1);
  const [m, setM] = useState<Punkt>({ x: 50, y: 50 });
  const zug = useRef<{ sx: number; sy: number; m: Punkt; w: number; bewegt: boolean } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [suche, setSuche] = useState('');
  const [sucheOffen, setSucheOffen] = useState(false);
  const [leuchte, setLeuchte] = useState<number | null>(null);
  const [voll, setVoll] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const quelle = kartenQuelle(bild);

  const spots = useMemo(() => formen.map((f, i) => ({ ...f, i, r: rahmen(f.punkte), a: schwerpunkt(f.punkte), namen: f.zeilen.map(kartenName) })), [formen]);
  /** Eine Schriftgroesse fuer alle (Prozent der Kartenbreite bei Zoom 1) - aus dem typischen Platz der belegten Stellen. */
  const schrift = useMemo(() => {
    const passt = spots.filter((s) => s.namen.length).map((s) => {
      const laengste = Math.max(...s.namen.map((n) => n.length), 3);
      return Math.min(s.r.breite / (laengste * 0.62), s.r.hoehe / (s.namen.length * 1.25));
    }).sort((a, b) => a - b);
    if (!passt.length) return 1;
    return Math.max(0.55, Math.min(1.3, passt[Math.floor(passt.length * 0.4)]));
  }, [spots]);

  useEffect(() => {
    const w = () => setVoll(document.fullscreenElement !== null && document.fullscreenElement === huelle.current);
    document.addEventListener('fullscreenchange', w);
    return () => document.removeEventListener('fullscreenchange', w);
  }, []);

  /* Weich zu einem Ausschnitt gleiten. */
  const lauf = useRef<number | null>(null);
  const zr = useRef(1); const mr = useRef<Punkt>({ x: 50, y: 50 });
  useEffect(() => { zr.current = z; mr.current = m; }, [z, m]);
  const gleite = useCallback((z1: number, m1: Punkt) => {
    if (lauf.current) cancelAnimationFrame(lauf.current);
    const zz = Math.max(1, Math.min(ZOOM_MAX, z1)); const mm = begrenze(zz, m1);
    const z0 = zr.current, m0 = mr.current, t0 = performance.now();
    const schritt = (jetzt: number) => {
      const t = Math.min(1, (jetzt - t0) / 550); const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      setZ(z0 + (zz - z0) * e); setM({ x: m0.x + (mm.x - m0.x) * e, y: m0.y + (mm.y - m0.y) * e });
      if (t < 1) lauf.current = requestAnimationFrame(schritt); else lauf.current = null;
    };
    lauf.current = requestAnimationFrame(schritt);
  }, []);

  /*
   * Beim Oeffnen auf die belegten Stellen zoomen (Betreiber: "viel zu viel blauer Rand") - aus dem Rahmen aller Formen, mit etwas Luft.
   * Ohne Formen bleibt die ganze Karte.
   */
  const eingepasst = useRef('');
  useEffect(() => {
    const kennung = spots.map((s) => `${s.r.links.toFixed(1)},${s.r.oben.toFixed(1)}`).join('|');
    if (!spots.length || eingepasst.current === kennung) return;
    const erstes = !eingepasst.current; eingepasst.current = kennung;
    if (!erstes) return;
    const x0 = Math.min(...spots.map((s) => s.r.links)), y0 = Math.min(...spots.map((s) => s.r.oben));
    const x1 = Math.max(...spots.map((s) => s.r.links + s.r.breite)), y1 = Math.max(...spots.map((s) => s.r.oben + s.r.hoehe));
    const zz = Math.min(2.4, 88 / Math.max(x1 - x0, y1 - y0, 1));
    if (zz > 1.12) gleite(zz, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  }, [spots, gleite]);

  /** Bildschirmpunkt -> Kartenpunkt (Prozent). */
  const kartenPunkt = useCallback((cx: number, cy: number): Punkt | null => {
    const el = flaeche.current; if (!el) return null;
    const k = el.getBoundingClientRect();
    const fx = (cx - k.left) / k.width, fy = (cy - k.top) / k.height;
    return { x: mr.current.x + (fx - 0.5) * (100 / zr.current), y: mr.current.y + (fy - 0.5) * (100 / zr.current) };
  }, []);

  // Rad: zum Zeiger zoomen (nicht passiv, damit die Seite nicht scrollt).
  useEffect(() => {
    const el = flaeche.current; if (!el) return undefined;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      if (lauf.current) { cancelAnimationFrame(lauf.current); lauf.current = null; }
      const p = kartenPunkt(e.clientX, e.clientY); if (!p) return;
      const z0 = zr.current; const z1 = Math.max(1, Math.min(ZOOM_MAX, z0 * Math.exp(-e.deltaY * 0.0022)));
      const k = el.getBoundingClientRect(); const fx = (e.clientX - k.left) / k.width - 0.5, fy = (e.clientY - k.top) / k.height - 0.5;
      const m1 = begrenze(z1, { x: p.x - fx * (100 / z1), y: p.y - fy * (100 / z1) });
      zr.current = z1; mr.current = m1; setZ(z1); setM(m1);
    };
    el.addEventListener('wheel', rad, { passive: false });
    return () => el.removeEventListener('wheel', rad);
  }, [kartenPunkt]);

  // Strg+F oeffnet die Spielersuche (nur wenn die Karte zu sehen ist).
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && huelle.current) {
        const k = huelle.current.getBoundingClientRect();
        if (k.bottom < 0 || k.top > window.innerHeight) return;
        e.preventDefault(); setSucheOffen(true);
      }
      if (e.key === 'Escape') setSucheOffen(false);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase(); if (!q) return [] as Array<{ name: string; i: number }>;
    return spots.flatMap((s) => (s.alle ?? s.zeilen).map((name) => ({ name, i: s.i })))
      .filter((x) => x.name.toLowerCase().includes(q) || kartenName(x.name).toLowerCase().includes(q)).slice(0, 12);
  }, [suche, spots]);
  const trefferSet = useMemo(() => new Set(treffer.map((x) => x.i)), [treffer]);
  const springe = (i: number) => {
    const s = spots[i]; if (!s) return;
    gleite(Math.max(3, Math.min(ZOOM_MAX - 1, 55 / Math.max(s.r.breite, s.r.hoehe, 1))), { x: s.r.links + s.r.breite / 2, y: s.r.oben + s.r.hoehe / 2 });
    setLeuchte(i); setTimeout(() => setLeuchte((x) => (x === i ? null : x)), 2600);
  };

  /** Als PNG speichern: Bild, Formen und Namen auf eine Leinwand. */
  const speichern = async () => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = quelle;
    await img.decode().catch(() => null);
    const n = 2048; const c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d'); if (!g) return;
    try { g.drawImage(img, 0, 0, n, n); } catch { g.fillStyle = '#0b1220'; g.fillRect(0, 0, n, n); }
    for (const s of spots) {
      const fb = farbe(s.teams, rotAb, s.farbe);
      g.beginPath(); s.punkte.forEach((p, k) => (k ? g.lineTo(p.x * n / 100, p.y * n / 100) : g.moveTo(p.x * n / 100, p.y * n / 100))); g.closePath();
      g.fillStyle = fb.f; g.fill(); g.lineWidth = 3; g.strokeStyle = fb.r; g.stroke();
    }
    const px = schrift * n / 100;
    g.font = `600 ${px}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const s of spots) {
      s.namen.forEach((name, k) => {
        const y = (s.a.y * n / 100) + (k - (s.namen.length - 1) / 2) * px * 1.2;
        g.lineWidth = Math.max(2, px / 5); g.strokeStyle = '#000'; g.strokeText(name, s.a.x * n / 100, y);
        g.fillStyle = '#fff'; g.fillText(name, s.a.x * n / 100, y);
      });
    }
    g.font = `800 ${n / 60}px Inter, sans-serif`; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('thecomphub.com', n - 24, n - 28);
    c.toBlob((b) => {
      if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = `${titel.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'map'}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };

  // Namen wachsen beim Zoomen nur langsam mit (z^0.35), sonst ueberdecken sie sich bei Zoom 1 oder werden winzig beim Hineinzoomen.
  const fs = (schrift * z ** 0.35) / z;
  const knopf = 'grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/60 text-white backdrop-blur transition hover:border-sky-400/60 hover:bg-black/80';

  return (
    <div ref={huelle} className={`relative ${voll ? 'flex h-full w-full items-center justify-center bg-[#0b2340]' : ''}`}>
      <div ref={flaeche}
        className={`relative mx-auto aspect-square touch-none select-none overflow-hidden rounded-3xl border border-white/10 bg-[#0b2340] ${voll ? 'h-full max-h-screen rounded-none border-0' : 'w-full'} ${z > 1.02 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ containerType: 'inline-size', maxWidth: voll ? undefined : 'min(100%, 86vh)' }}
        onPointerDown={(e) => { const k = e.currentTarget.getBoundingClientRect(); zug.current = { sx: e.clientX, sy: e.clientY, m: mr.current, w: k.width, bewegt: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const g = zug.current; if (!g || zr.current <= 1.01) return;
          const dx = e.clientX - g.sx, dy = e.clientY - g.sy; if (Math.abs(dx) + Math.abs(dy) > 3) g.bewegt = true;
          const m1 = begrenze(zr.current, { x: g.m.x - (dx / g.w) * (100 / zr.current), y: g.m.y - (dy / g.w) * (100 / zr.current) });
          mr.current = m1; setM(m1);
        }}
        onPointerUp={() => { zug.current = null; }}
        onDoubleClick={(e) => { const p = kartenPunkt(e.clientX, e.clientY); if (p) gleite(zr.current >= ZOOM_MAX - 0.5 ? 1 : zr.current * 2, p); }}>
        <div className="absolute inset-0 origin-top-left will-change-transform"
          style={{ transform: `scale(${z}) translate(${50 / z - m.x}%, ${50 / z - m.y}%)`, transformOrigin: '0 0' }}>
          <img src={quelle} alt="" draggable={false} onLoad={() => setGeladen(true)} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${geladen ? 'opacity-100' : 'opacity-0'}`} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {spots.map((s) => {
              const fb = farbe(s.teams, rotAb, s.farbe);
              const an = hover === s.i || leuchte === s.i || trefferSet.has(s.i);
              return (
                <polygon key={s.i} points={s.punkte.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={leuchte === s.i ? 'rgba(56,189,248,0.45)' : fb.f} stroke={an ? '#38bdf8' : fb.r} strokeWidth={an ? 2.4 : 1.5} vectorEffect="non-scaling-stroke"
                  style={{ transition: 'fill .2s, stroke .2s', filter: an ? 'drop-shadow(0 0 6px rgba(56,189,248,.7))' : undefined }}
                  onPointerEnter={() => setHover(s.i)} onPointerLeave={() => setHover((x) => (x === s.i ? null : x))} />
              );
            })}
          </svg>
          {spots.filter((s) => s.namen.length).map((s) => (
            <div key={s.i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-semibold leading-[1.15] text-white"
              style={{ left: `${s.a.x}%`, top: `${s.a.y}%`, fontSize: `${fs}cqw`, WebkitTextStroke: `${Math.max(0.04, fs * 0.09)}cqw #000`, paintOrder: 'stroke fill', textShadow: '0 0 2px #000' }}>
              {s.namen.map((n, k) => <div key={k}>{n}</div>)}
            </div>
          ))}
        </div>
        {!geladen && <div className="absolute inset-0 grid place-items-center"><span className="h-7 w-7 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-400" /></div>}
        <span className="pointer-events-none absolute bottom-3 left-4 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 drop-shadow">thecomphub.com</span>
      </div>

      {/* Werkzeuge unten rechts */}
      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <button type="button" title="Zoom in" onClick={() => gleite(zr.current * 1.6, mr.current)} className={knopf}>+</button>
        <button type="button" title="Zoom out" onClick={() => gleite(zr.current / 1.6, mr.current)} className={knopf}>−</button>
        {z > 1.02 && <button type="button" title="Reset" onClick={() => gleite(1, { x: 50, y: 50 })} className={knopf}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10a6 6 0 1 0 2-4.5M4 3v3h3" strokeLinecap="round" /></svg></button>}
        {formen.some((f) => f.zeilen.length) && <button type="button" title="Find a player (Ctrl + F)" onClick={() => setSucheOffen((v) => !v)} className={knopf}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" strokeLinecap="round" /></svg></button>}
        <button type="button" title="Save as PNG" onClick={() => void speichern()} className={knopf}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15h12" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <button type="button" title={voll ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void huelle.current?.requestFullscreen?.())} className={knopf}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{voll ? <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" /> : <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />}</svg></button>
      </div>

      {sucheOffen && (
        <div className="absolute left-3 top-3 w-[min(320px,calc(100%-24px))] rounded-2xl border border-white/10 bg-[#0a0e18]/90 p-2 shadow-2xl backdrop-blur-xl">
          <input autoFocus value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Find a player …"
            onKeyDown={(e) => { if (e.key === 'Enter' && treffer[0]) springe(treffer[0].i); }}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
          {treffer.length > 0 && (
            <ul className="mt-1 max-h-60 overflow-y-auto">
              {treffer.map((t, k) => (
                <li key={`${t.i}-${k}`}><button type="button" onClick={() => springe(t.i)} className="w-full truncate rounded-lg px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-white/80 hover:bg-sky-400/10 hover:text-white">{t.name}</button></li>
              ))}
            </ul>
          )}
          {suche && !treffer.length && <p className="px-3 py-2 text-xs text-white/40">Nobody with that name on this map.</p>}
        </div>
      )}
      {!formen.length && <p className="mt-3 text-center text-xs text-white/40">No drop spots for this day yet.</p>}
    </div>
  );
}
