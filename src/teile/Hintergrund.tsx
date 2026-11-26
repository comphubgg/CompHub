import { useEffect, useRef } from 'react';

/*
 * Der lebendige Hintergrund des Hubs: weiche Farbfelder, die langsam wandern, ein feines Raster mit Perspektive und Funken, die aufsteigen
 * (Canvas, 60 fps, pausiert im Hintergrund-Tab). Farben: CompHub-Blau, dazu Violett und ein warmer Akzent.
 */
export default function Hintergrund() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const g = c.getContext('2d')!;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const groesse = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    groesse(); addEventListener('resize', groesse);
    const funken = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0006 + Math.random() * 0.0016, r: 0.6 + Math.random() * 1.8, a: 0.2 + Math.random() * 0.6, d: Math.random() * Math.PI * 2 }));
    const felder = [
      { f: '56,189,248', x: 0.2, y: 0.3, r: 0.55, s: 0.00011 },
      { f: '139,92,246', x: 0.8, y: 0.25, r: 0.5, s: 0.00009 },
      { f: '14,165,233', x: 0.55, y: 0.85, r: 0.6, s: 0.00007 },
      { f: '244,114,182', x: 0.9, y: 0.9, r: 0.35, s: 0.00013 },
    ];
    const los = (t: number) => {
      raf = requestAnimationFrame(los);
      g.fillStyle = '#05070d'; g.fillRect(0, 0, w, h);
      // Farbfelder
      g.globalCompositeOperation = 'lighter';
      for (const [i, f] of felder.entries()) {
        const x = (f.x + Math.sin(t * f.s + i) * 0.08) * w, y = (f.y + Math.cos(t * f.s * 1.3 + i) * 0.08) * h, r = f.r * Math.max(w, h);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${f.f},0.22)`); gr.addColorStop(1, `rgba(${f.f},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      g.globalCompositeOperation = 'source-over';
      // Raster am Boden mit Perspektive, langsam fliessend
      const horizont = h * 0.62, linien = 22, zeit = (t * 0.00004) % 1;
      g.strokeStyle = 'rgba(56,189,248,0.10)'; g.lineWidth = 1;
      for (let i = 0; i < linien; i++) {
        const p = ((i + zeit) / linien) ** 2.2, y = horizont + p * (h - horizont);
        g.globalAlpha = Math.min(1, p * 3); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }
      for (let i = -20; i <= 20; i++) {
        g.globalAlpha = 0.8; g.beginPath(); g.moveTo(w / 2 + i * 18, horizont); g.lineTo(w / 2 + i * w * 0.12, h); g.stroke();
      }
      g.globalAlpha = 1;
      // Funken
      for (const s of funken) {
        s.y -= s.v; s.d += 0.01; if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
        const x = (s.x + Math.sin(s.d) * 0.004) * w, y = s.y * h;
        g.fillStyle = `rgba(186,230,253,${s.a * (0.4 + 0.6 * Math.sin(t * 0.002 + s.d) ** 2)})`;
        g.beginPath(); g.arc(x, y, s.r, 0, Math.PI * 2); g.fill();
      }
      // Vignette
      const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(los);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', groesse); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 h-full w-full" aria-hidden />;
}
