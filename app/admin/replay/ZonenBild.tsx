'use client';

/*
 * Das Zonen-Bild eines Turniers - zum Posten.
 *
 * Der Betreiber (28.9.2026) nach einer Vorlage, die er von einem anderen
 * Angebot kannte: je Game die spaete Zone als dunkler Kreis mit "GAME N",
 * darunter in Gelb die kleinere, in die sie danach rotiert ist. Day 1 in
 * Schwarz, Day 2 "in Blau, also meiner Farbe", und ein Bild mit beiden Tagen.
 *
 * Am 29.9.2026 dann: "Blau passt gar nicht. Man erkennt das nicht so krass.
 * Mach eine andere Farbe" - Blau ging auf dem Wasser und den blauen Flaechen
 * der Karte unter. Day 2 ist jetzt Rot, das sich von Gruen, Blau und dem
 * Gelb der kleinen Zonen gleichermassen abhebt.
 *
 * Gezeichnet auf einer Leinwand in voller Kartengroesse, damit es sich als
 * PNG speichern laesst. Die Zonen kommen aus den Server-Replays
 * (tools/replay-voll): der dunkle Kreis ist die Zone mit Radius 20.000, der
 * gelbe die mit 10.000 - so gross sind sie auch in der Vorlage.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { fortniteKarte } from '@/lib/bildAdressen';

interface Zone { naechsterRadius?: number; x?: number; y?: number }
interface TagKurz { windowId: string; titel: string; matches: Array<{ id: string; nr: number; beginn?: string }> }

const SPANNE = 135_000;
const GROSS = 20_000;
const KLEIN = 10_000;
/** Die Farbe des grossen Kreises je Tag: Schwarz, dann Rot (ein dritter Tag Violett). */
const TAGFARBEN = ['rgba(8, 8, 12, 0.74)', 'rgba(220, 20, 60, 0.68)', 'rgba(124, 58, 237, 0.66)'];
const GELB = 'rgba(250, 204, 21, 0.62)';

const tagNummer = (windowId: string, i: number) => Number(/Day\s*(\d+)/i.exec(windowId)?.[1] ?? i + 1);

export default function ZonenBild({ tage }: { tage: TagKurz[] }) {
  const leinwand = useRef<HTMLCanvasElement | null>(null);
  const [wahl, setWahl] = useState<string>(tage[0]?.windowId ?? 'alle');
  const [zonen, setZonen] = useState<Record<string, Zone[]>>({});
  const [bereit, setBereit] = useState(false);
  const angefragt = useRef(new Set<string>());

  // Die Zonen aller Games dieser Tage - je Game genau einmal geholt.
  useEffect(() => {
    const ids = tage.flatMap((t) => t.matches.map((m) => m.id)).filter((id) => !angefragt.current.has(id));
    if (!ids.length) return;
    for (const id of ids) angefragt.current.add(id);
    Promise.all(ids.map((id) => fetch(`/api/replay?match=${id}`).then((r) => r.json()).then((j) => [id, j?.zonen ?? []] as const).catch(() => [id, []] as const)))
      .then((liste) => setZonen((alt) => ({ ...alt, ...Object.fromEntries(liste) })));
  }, [tage]);

  const gezeigt = useMemo(() => (wahl === 'alle' ? tage : tage.filter((t) => t.windowId === wahl)), [tage, wahl]);
  const jahr = (() => {
    const b = tage[0]?.matches[0]?.beginn;
    return b ? new Date(b).getUTCFullYear() : null;
  })();
  const titel = [tage[0]?.titel.replace(/^Fortnite\s+/i, '').toUpperCase(), jahr].filter(Boolean).join(' ')
    + (wahl === 'alle' ? '' : ` · DAY ${tagNummer(wahl, tage.findIndex((t) => t.windowId === wahl))}`);

  // Zeichnen, sobald Karte und Zonen da sind.
  useEffect(() => {
    const c = leinwand.current;
    if (!c) return;
    const bild = new Image();
    bild.src = fortniteKarte(false);
    let weg = false;
    bild.onload = () => {
      if (weg) return;
      const n = bild.naturalWidth || 2048;
      c.width = n; c.height = n;
      const g = c.getContext('2d');
      if (!g) return;
      const px = (v: number) => ((v + SPANNE) / (2 * SPANNE)) * n;
      const pr = (r: number) => (r / (2 * SPANNE)) * n;
      g.drawImage(bild, 0, 0, n, n);

      // Nummern ueber alle gezeigten Tage fortlaufend (beide Tage: 1 bis 12).
      let versatz = 0;
      const games: Array<{ gross?: Zone; klein?: Zone; nr: number; farbe: string }> = [];
      gezeigt.forEach((t) => {
        const farbe = TAGFARBEN[tage.indexOf(t) % TAGFARBEN.length];
        for (const m of t.matches) {
          const z = zonen[m.id] ?? [];
          games.push({
            gross: z.find((x) => Math.round(x.naechsterRadius ?? 0) === GROSS),
            klein: z.find((x) => Math.round(x.naechsterRadius ?? 0) === KLEIN),
            nr: versatz + m.nr, farbe,
          });
        }
        versatz += t.matches.length;
      });
      // Erst alle gelben, dann die dunklen darueber - wie in der Vorlage.
      for (const s of games) {
        if (typeof s.klein?.x !== 'number' || typeof s.klein.y !== 'number') continue;
        g.beginPath(); g.arc(px(s.klein.x), px(s.klein.y), pr(KLEIN), 0, Math.PI * 2);
        g.fillStyle = GELB; g.fill();
      }
      for (const s of games) {
        if (typeof s.gross?.x !== 'number' || typeof s.gross.y !== 'number') continue;
        g.beginPath(); g.arc(px(s.gross.x), px(s.gross.y), pr(GROSS), 0, Math.PI * 2);
        g.fillStyle = s.farbe; g.fill();
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(n * 0.024)}px Inter, system-ui, sans-serif`;
      for (const s of games) {
        if (typeof s.gross?.x !== 'number' || typeof s.gross.y !== 'number') continue;
        g.lineWidth = n * 0.004; g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.strokeText(`GAME ${s.nr}`, px(s.gross.x), px(s.gross.y));
        g.fillStyle = '#ffffff';
        g.fillText(`GAME ${s.nr}`, px(s.gross.x), px(s.gross.y));
      }

      // Unten links: ZONES, der Turniername im Blau der Seite, CompHub.
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const rand = n * 0.03;
      g.fillStyle = '#ffffff';
      g.font = `800 ${Math.round(n * 0.05)}px Inter, system-ui, sans-serif`;
      g.fillText('ZONES', rand, n - rand - n * 0.03);
      g.fillStyle = '#38bdf8';
      g.font = `700 ${Math.round(n * 0.018)}px Inter, system-ui, sans-serif`;
      g.fillText(titel, rand, n - rand);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.textAlign = 'right';
      g.font = `700 ${Math.round(n * 0.016)}px Inter, system-ui, sans-serif`;
      g.fillText('THECOMPHUB.COM', n - rand, n - rand);
      // Bei mehreren Tagen die Farben erklaeren.
      if (gezeigt.length > 1) {
        g.textAlign = 'left';
        g.font = `700 ${Math.round(n * 0.014)}px Inter, system-ui, sans-serif`;
        gezeigt.forEach((t, i) => {
          const y = n - rand - n * 0.105 + i * n * 0.024;
          g.fillStyle = TAGFARBEN[tage.indexOf(t) % TAGFARBEN.length].replace(/[\d.]+\)$/, '1)');
          g.beginPath(); g.arc(rand + n * 0.007, y - n * 0.005, n * 0.007, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#ffffff'; g.lineWidth = n * 0.0015; g.stroke();
          g.fillStyle = '#ffffff';
          g.fillText(`DAY ${tagNummer(t.windowId, tage.indexOf(t))}`, rand + n * 0.022, y);
        });
      }
      setBereit(true);
    };
    return () => { weg = true; };
  }, [gezeigt, zonen, titel, tage]);

  const speichern = () => {
    const c = leinwand.current;
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `zones-${titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };

  const fehlend = gezeigt.some((t) => t.matches.some((m) => !zonen[m.id]));

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-300"><T>Zonen-Bild</T></h2>
        {[...tage.map((t, i) => [t.windowId, `Day ${tagNummer(t.windowId, i)}`] as [string, string]),
          ...(tage.length > 1 ? [['alle', 'Beide Tage zusammen'] as [string, string]] : [])].map(([w, name]) => (
          <button key={w} type="button" onClick={() => setWahl(w)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${wahl === w
              ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:border-zinc-600 hover:text-slate-200'}`}>
            {w === 'alle' ? <T>{name}</T> : name}
          </button>
        ))}
        <button type="button" onClick={speichern} disabled={!bereit || fehlend}
          className="ml-auto rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50">
          <T>Bild speichern</T>
        </button>
      </div>
      {fehlend && <p className="text-xs text-slate-500"><T>Die Zonen der Games werden geladen …</T></p>}
      <canvas ref={leinwand} className="aspect-square w-full max-w-3xl rounded-xl border border-zinc-800 bg-sky-950" />
    </section>
  );
}
