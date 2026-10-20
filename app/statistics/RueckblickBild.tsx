'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { speichereLeinwand, dateinameAus } from '@/app/lib/bildSpeichern';

/*
 * Der Saisonrückblick eines Spielers als Bild zum Teilen (Betreiber, 1.10.2026: "Idee 9").
 *
 * Es sind genau die Zahlen, die oben im Profil stehen - für den Zeitraum, der dort gewählt ist: nichts wird hier neu gerechnet oder geschätzt. Das Bild entsteht im Browser
 * auf einer Leinwand (1080 × 1350, das Hochformat für X und Instagram) und lässt sich kopieren oder speichern. Ohne echtes Foto bleibt der Platz oben ein Farbverlauf.
 */

export interface RueckblickDaten {
  name: string;
  /** Nur ein echtes Foto - die Silhouette gehört nicht auf ein Bild zum Teilen. */
  bild?: string | null;
  land?: string | null;
  region?: string | null;
  /** Der Zeitraum, wie er oben im Profil heißt ("Chapter 7 Season 4", "2026", "Alle Saisons"). */
  zeitraum: string;
  /** Beschriftung, Wert, Unterzeile - schon übersetzt und formatiert. */
  kacheln: Array<[string, string, string]>;
  /** Kleine Zeile unter dem Namen ("12 Spieltage · 340 Matches"). */
  zeile: string;
}

const B = 1080;
const H = 1350;
const BLAU = '#0ea5e9';
const BLAU_HELL = '#38bdf8';

function ladeBild(src: string): Promise<HTMLImageElement | null> {
  return new Promise((fertig) => {
    const b = new Image();
    b.crossOrigin = 'anonymous';
    b.onload = () => fertig(b);
    b.onerror = () => fertig(null);
    b.src = src;
  });
}

/** Das Foto verwischt: klein gezeichnet und wieder aufgezogen - ohne ctx.filter, das nicht jeder Browser kennt. */
function weich(b: HTMLImageElement): HTMLCanvasElement {
  const k = document.createElement('canvas'); k.width = 36; k.height = 26;
  const x = k.getContext('2d');
  if (x) { x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, 36, 26); }
  return k;
}

/** Ein Rechteck mit runden Ecken - `roundRect` gibt es nicht in jedem Browser. */
function rundRechteck(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Ein Bild so einpassen, dass es die Fläche füllt (wie object-fit: cover), mit dem Gesicht im oberen Drittel. */
function fuelle(c: CanvasRenderingContext2D, b: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const f = Math.max(w / b.width, h / b.height);
  const bw = b.width * f; const bh = b.height * f;
  c.drawImage(b, x + (w - bw) / 2, y + Math.min(0, (h - bh) * 0.12), bw, bh);
}

async function zeichne(leinwand: HTMLCanvasElement, d: RueckblickDaten, titel: string): Promise<boolean> {
  const c = leinwand.getContext('2d');
  if (!c) return false;
  leinwand.width = B; leinwand.height = H;
  try { await document.fonts.ready; } catch { /* Schrift ist dann die Ersatzschrift */ }
  const schrift = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const foto = d.bild ? await ladeBild(d.bild) : null;
  const flagge = d.land && /^[A-Za-z]{2}$/.test(d.land) ? await ladeBild(`/flags/${d.land.toLowerCase()}.png`) : null;
  const logo = await ladeBild('/logos/CompHub-Logo-frei.png');

  // Grund
  c.fillStyle = '#09090b'; c.fillRect(0, 0, B, H);
  const glanz = c.createRadialGradient(180, 120, 20, 180, 120, 900);
  glanz.addColorStop(0, 'rgba(14,165,233,.42)'); glanz.addColorStop(1, 'rgba(14,165,233,0)');
  c.fillStyle = glanz; c.fillRect(0, 0, B, H);

  // Foto oben, unten in den Grund ausgeblendet
  if (foto) {
    c.save();
    c.beginPath(); c.rect(0, 0, B, 760); c.clip();
    c.globalAlpha = 0.5; c.imageSmoothingQuality = 'high'; c.drawImage(weich(foto), -120, -120, B + 240, 760 + 240); c.globalAlpha = 1;
    c.restore();
    c.save();
    c.beginPath(); c.rect(B * 0.34, 0, B * 0.66, 760); c.clip();
    fuelle(c, foto, B * 0.34, 0, B * 0.66, 760);
    c.restore();
    const seite = c.createLinearGradient(B * 0.30, 0, B * 0.62, 0);
    seite.addColorStop(0, '#09090b'); seite.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = seite; c.fillRect(0, 0, B, 760);
  }
  const unten = c.createLinearGradient(0, 400, 0, 752);
  unten.addColorStop(0, 'rgba(9,9,11,0)'); unten.addColorStop(1, '#09090b');
  c.fillStyle = unten; c.fillRect(0, 400, B, 380);

  // Kopf: Marke und Zeitraum
  c.textBaseline = 'alphabetic';
  c.fillStyle = BLAU_HELL; c.font = `800 30px ${schrift}`;
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '8px';
  c.fillText(titel.toUpperCase(), 64, 100);
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '0px';
  c.fillStyle = '#e2e8f0'; c.font = `700 40px ${schrift}`;
  c.fillText(d.zeitraum, 64, 156, 520);

  // Name, so groß, wie es in die Breite passt
  const name = d.name.toUpperCase();
  let g = 132;
  c.font = `900 ${g}px ${schrift}`;
  while (c.measureText(name).width > B - 128 && g > 54) { g -= 4; c.font = `900 ${g}px ${schrift}`; }
  c.fillStyle = '#ffffff'; c.fillText(name, 64, 680);

  // Flagge, Region und die kleine Zeile
  let x = 64;
  if (flagge) {
    c.save(); rundRechteck(c, x, 712, 56, 38, 6); c.clip(); c.drawImage(flagge, x, 712, 56, 38); c.restore();
    x += 76;
  }
  c.fillStyle = '#94a3b8'; c.font = `600 30px ${schrift}`;
  const teile = [d.region, d.zeile].filter(Boolean).join('  ·  ');
  c.fillText(teile, x, 742, B - x - 64);

  // Kacheln: zwei Spalten, drei Reihen
  const kw = 476; const kh = 142; const lueck = 24; const y0 = 790;
  d.kacheln.slice(0, 6).forEach(([label, wert, sub], i) => {
    const kx = 64 + (i % 2) * (kw + lueck);
    const ky = y0 + Math.floor(i / 2) * (kh + 18);
    rundRechteck(c, kx, ky, kw, kh, 22);
    c.fillStyle = 'rgba(255,255,255,.055)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#94a3b8'; c.font = `700 22px ${schrift}`;
    if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '3px';
    c.fillText(label.toUpperCase(), kx + 28, ky + 38, kw - 56);
    if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '0px';
    c.fillStyle = '#ffffff'; c.font = `800 58px ${schrift}`;
    c.fillText(wert, kx + 28, ky + 98, kw - 56);
    if (sub) { c.fillStyle = '#64748b'; c.font = `500 21px ${schrift}`; c.fillText(sub, kx + 28, ky + 128, kw - 56); }
  });

  // Fuß
  c.fillStyle = BLAU; c.fillRect(64, 1296, 56, 4);
  c.fillStyle = '#cbd5e1'; c.font = `700 28px ${schrift}`;
  c.fillText('thecomphub.com', 64, 1336);
  if (logo) { const lw = Math.min(260, (logo.width / logo.height) * 44); c.drawImage(logo, B - 64 - lw, 1296, lw, lw * (logo.height / logo.width)); }
  return true;
}

/** Der Knopf im Profil und das Fenster mit der Vorschau. */
export default function RueckblickBild({ daten }: { daten: RueckblickDaten }) {
  const t = useT();
  const [auf, setAuf] = useState(false);
  const [stand, setStand] = useState('');
  const leinwand = useRef<HTMLCanvasElement>(null);
  const titel = t('Saison-Rückblick');

  // Die Daten werden bei jedem Zeichnen der Seite neu zusammengesetzt - nur wenn sich der Inhalt ändert, wird das Bild neu gemalt.
  const inhalt = JSON.stringify(daten);
  useEffect(() => {
    if (!auf || !leinwand.current) return undefined;
    let weg = false;
    void zeichne(leinwand.current, JSON.parse(inhalt) as RueckblickDaten, titel).then((ok) => { if (!weg && !ok) setStand(t('Das Bild ließ sich nicht zeichnen.')); });
    return () => { weg = true; };
  }, [auf, inhalt, titel, t]);

  const speichern = useCallback(async (nurDownload: boolean) => {
    if (!leinwand.current) return;
    setStand('');
    try {
      const r = await speichereLeinwand(leinwand.current, dateinameAus(`${daten.name}-${daten.zeitraum}`, 'rueckblick'), nurDownload);
      setStand(r === 'kopiert' ? t('Kopiert') : t('Gespeichert'));
    } catch { setStand(t('Das Bild ließ sich nicht speichern.')); }
  }, [daten.name, daten.zeitraum, t]);

  return (
    <>
      <button type="button" onClick={() => { setStand(''); setAuf(true); }}
        className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 transition hover:border-sky-400 hover:bg-sky-500/20">
        <T>Rückblick als Bild</T>
      </button>
      {auf && (
        <div role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setAuf(false); }}
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-full w-full max-w-md flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl">
            <canvas ref={leinwand} className="w-full rounded-xl border border-zinc-800 bg-zinc-950" style={{ aspectRatio: `${B} / ${H}` }} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void speichern(false)}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Bild kopieren</T></button>
              <button type="button" onClick={() => void speichern(true)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500 hover:text-sky-400"><T>Bild speichern</T></button>
              <button type="button" onClick={() => setAuf(false)}
                className="ml-auto text-sm text-slate-400 transition hover:text-slate-200"><T>Schließen</T></button>
            </div>
            {stand && <p className="text-xs text-slate-400" aria-live="polite">{stand}</p>}
          </div>
        </div>
      )}
    </>
  );
}
