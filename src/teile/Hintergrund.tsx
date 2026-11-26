import { useEffect, useState } from 'react';

/*
 * Hintergrund im CompHub-Stil (Betreiber, 26.11.2026: "eigener Style ... der Hintergrund gefaellt mir gar nicht"; die Startseite der echten Seite
 * gefaellt ihm): schraege Reihen aus echten Cup-Bannern, Karten und Spielerfotos, die langsam gegeneinander laufen - abgedunkelt, leicht
 * unscharf, mit einem Licht in der Mitte. Bilder von thecomphub.com (/hero, /api/startvitrine).
 */
const CUPS = ['/cups/fncs-grand-finals.webp', '/cups/fncs-major.webp', '/cups/elite-cup.webp', '/cups/cash-cup.webp', '/cups/reload-cup.webp', '/cups/world-cup.webp'];
const KARTEN: string[] = [];

function gemischt<T>(a: T[]): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export default function Hintergrund() {
  const [fotos, setFotos] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/startvitrine').then((r) => r.json()).then((j) => setFotos(gemischt<string>((j.fotos ?? []).map((f: { bild: string }) => f.bild)).slice(0, 32))).catch(() => {});
  }, []);
  const reihen = [0, 1, 2, 3].map((r) => {
    const f = fotos.slice(r * 8, r * 8 + 8);
    const deko = gemischt([...CUPS, ...KARTEN]).slice(0, 6);
    const mix: string[] = [];
    for (let i = 0; i < Math.max(f.length, deko.length); i++) { if (deko[i]) mix.push(deko[i]); if (f[i]) mix.push(f[i]); }
    return mix;
  });
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#06080f]" aria-hidden>
      <div className="absolute -inset-[20%] flex -rotate-[8deg] flex-col justify-center gap-5 opacity-[0.7] blur-[1px]">
        {reihen.map((bilder, r) => (
          <div key={r} className="flex w-max gap-5" style={{ animation: `lauf ${70 + r * 12}s linear infinite ${r % 2 ? 'reverse' : ''}` }}>
            {[...bilder, ...bilder].map((src, i) => (
              <img key={`${src}-${i}`} src={src} alt="" draggable={false}
                className={`h-44 w-72 shrink-0 rounded-2xl object-cover ${src.includes('spielerbilder') ? 'object-[center_20%]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
      {/* Schleier: dunkel am Rand, ein kuehles Licht hinter der Mitte */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 52%, rgba(14,165,233,0.16), transparent 70%), radial-gradient(ellipse at center, rgba(6,8,15,0.45) 0%, rgba(6,8,15,0.82) 60%, #06080f 100%)' }} />
      {/* Unser Logo gross und leise hinter allem */}
      <img src="/logos/CompHub-Logo.png" alt="" className="absolute left-1/2 top-1/2 w-[70vmin] -translate-x-1/2 -translate-y-1/2 opacity-[0.05] blur-[1px]" />
      <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27><filter id=%27n%27><feTurbulence baseFrequency=%270.9%27 numOctaves=%272%27/></filter><rect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/></svg>")' }} />
    </div>
  );
}
