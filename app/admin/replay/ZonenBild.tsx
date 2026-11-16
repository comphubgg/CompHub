'use client';

/*
 * Das Zonen-Bild eines Turniers - zum Posten.
 *
 * Der Betreiber (28.9.2026) nach einer Vorlage, die er von einem anderen
 * Angebot kannte: je Game die spaete Zone als dunkler Kreis mit "GAME N",
 * darunter in Gelb die kleinere, in die sie danach rotiert ist, und ein Bild
 * mit allen Teilen zusammen.
 *
 * 16.11.2026 (Betreiber): alle grossen Kreise im Schwarz des ersten Tages -
 * keine Farbe je Tag mehr und keine Farbpunkte. Im gemeinsamen Bild laufen
 * die Nummern weiter (GAME 1-16), und die Legende sagt, welche Games zu
 * welchem Teil gehoeren: "HEAT 1: GAMES 1-8". Sonst sieht es aus wie vorher -
 * dieselbe Fuellung ohne Rand, dieselbe Schrift mit demselben Strich (ein
 * erster Versuch mit durchsichtigen Kreisen und dickerer Schrift wurde
 * zurueckgenommen: "die Schrift ist haesslich", "nicht gefuellt wie vorher").
 *
 * Die Teile heissen, wie Epic sie nennt (Heat 1, Round 1 · Day 2, Event 1 ·
 * Round 2 - lib/zonenTeile), und die Karte ist die Insel des Cups: bei Reload
 * die Reload-Insel, sonst die grosse Karte der Saison, jeweils an echten
 * Replays geeicht (lib/zonenKarte).
 *
 * Gezeichnet auf einer Leinwand, damit es sich als PNG kopieren und
 * speichern laesst. Die Zonen kommen aus den Server-Replays
 * (tools/replay-voll): der dunkle Kreis ist die Zone mit Radius 20.000, der
 * gelbe die mit 10.000 - so gross sind sie auch in der Vorlage.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { inselAusschnitt } from '@/lib/inselAusschnitt';
import { speichereLeinwand } from '@/app/lib/bildSpeichern';
import { useT } from '@/app/components/SprachProvider';
import { teilName, teilKurz, stufenName, zusammenName } from '@/lib/zonenTeile';
import { zonenKarte, rahmenUmZonen, type Rahmen } from '@/lib/zonenKarte';

interface Zone { naechsterRadius?: number; x?: number; y?: number }
interface TagKurz { windowId: string; titel: string; matches: Array<{ id: string; nr: number; beginn?: string }> }
interface Kreis { x: number; y: number }

/*
 * Die Zonen, die gezeichnet werden: auf der grossen Karte 20.000 (dunkel) und 10.000 (gelb). Auf einer Reload-Insel eine Phase spaeter, 10.000 und 5.000
 * (Betreiber, 16.11.2026: "du verdeckst mit diesen Kreisen die halbe Map" - die Reload-Inseln sind nur gut zwei Drittel so gross).
 */
const RADIEN = { br: [20_000, 10_000], reload: [10_000, 5_000] } as const;
const N = 2048;
/** Wie bisher: der grosse Kreis im Schwarz des ersten Tages, der kleine gelb - beide ohne Rand. */
const SCHWARZ = 'rgba(8, 8, 12, 0.74)';
const GELB = 'rgba(250, 204, 21, 0.62)';
const WASSER = '#0b3a66';
const SCHRIFT = 'Inter, system-ui, sans-serif';

/**
 * Die Schrift laden, bevor gezeichnet wird. Eine Leinwand wartet nicht auf Schriften: ist sie noch nicht da, steht der Text in der Ersatzschrift
 * und bleibt so. Inter ist keine Webschrift dieser Seite - dann ist sofort klar, was greift (wie bisher system-ui), und es wird nicht gewartet.
 */
async function schriftBereit(): Promise<void> {
  try {
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!f) return;
    await Promise.race([
      Promise.all(['700 48px', '800 100px'].map((g) => f.load(`${g} ${SCHRIFT}`))),
      new Promise((fertig) => setTimeout(fertig, 3000)),
    ]);
  } catch { /* ohne FontFaceSet: einfach zeichnen */ }
}

const da = (z?: Zone): z is Zone & Kreis => typeof z?.x === 'number' && typeof z?.y === 'number';

export default function ZonenBild({ tage }: { tage: TagKurz[] }) {
  const leinwand = useRef<HTMLCanvasElement | null>(null);
  const [wahl, setWahl] = useState<string>(tage[0]?.windowId ?? 'alle');
  const [zonen, setZonen] = useState<Record<string, Zone[]>>({});
  /** Die Playlist je Spieltag - daraus die Insel. */
  const [playlists, setPlaylists] = useState<Record<string, string>>({});
  const [bereit, setBereit] = useState(false);
  const angefragt = useRef(new Map<string, number>());
  /** Spieltage, deren Antwort da ist - auch wenn sie leer war. Vorher stand bei fehlenden Dateien endlos "wird geladen". */
  const [geholt, setGeholt] = useState<Set<string>>(new Set());

  // Die Zonen aller Games dieser Tage: je Tag eine Anfrage (nur die Zonen, alle Games zusammen) statt je Game eine ganze Antwort. Kommt ein Game dazu, wird der Tag noch einmal geholt.
  useEffect(() => {
    const noetig = tage.filter((t) => t.matches.length && angefragt.current.get(t.windowId) !== t.matches.length);
    if (!noetig.length) return;
    for (const t of noetig) angefragt.current.set(t.windowId, t.matches.length);
    Promise.all(noetig.map((t) => fetch(`/api/replay?zonen=${encodeURIComponent(t.windowId)}`).then((r) => r.json())
      .then((j) => ({ windowId: t.windowId, zonen: (j?.zonen ?? {}) as Record<string, Zone[]>, playlist: typeof j?.playlist === 'string' ? j.playlist as string : '' }))
      .catch(() => { angefragt.current.delete(t.windowId); return { windowId: t.windowId, zonen: {} as Record<string, Zone[]>, playlist: '' }; })))
      .then((liste) => {
        setZonen((alt) => Object.assign({}, alt, ...liste.map((x) => x.zonen)));
        setPlaylists((alt) => ({ ...alt, ...Object.fromEntries(liste.filter((x) => x.playlist).map((x) => [x.windowId, x.playlist])) }));
        setGeholt((alt) => new Set([...alt, ...noetig.map((t) => t.windowId)]));
      });
  }, [tage]);

  const gezeigt = useMemo(() => (wahl === 'alle' ? tage : tage.filter((t) => t.windowId === wahl)), [tage, wahl]);
  const laedt = gezeigt.some((t) => !geholt.has(t.windowId));
  const fehlend = laedt || gezeigt.some((t) => t.matches.some((m) => !zonen[m.id]));

  // Die Insel: aus der Playlist des ersten Teils, der eine hat (alle Teile einer Stufe spielen dieselbe Insel).
  const playlist = gezeigt.map((t) => playlists[t.windowId]).find(Boolean) ?? null;
  const ersterTeil = gezeigt[0]?.windowId ?? '';
  const karte = useMemo(() => zonenKarte(playlist, ersterTeil), [playlist, ersterTeil]);

  const jahr = (() => {
    const b = tage[0]?.matches[0]?.beginn;
    return b ? new Date(b).getUTCFullYear() : null;
  })();
  const zusatz = wahl === 'alle' ? stufenName(tage[0]?.windowId ?? '') : teilName(wahl);
  const titel = [tage[0]?.titel.replace(/^Fortnite\s+/i, '').toUpperCase(), jahr].filter(Boolean).join(' ')
    + (zusatz ? ` · ${zusatz.toUpperCase()}` : '');

  // Zeichnen, sobald Karte und Zonen da sind.
  useEffect(() => {
    const c = leinwand.current;
    if (!c || laedt) return undefined;
    let weg = false;
    const [GROSS, KLEIN] = RADIEN[karte.art];

    // Nummern ueber alle gezeigten Teile fortlaufend (beide Heats: 1 bis 16).
    let versatz = 0;
    const games: Array<{ gross?: Zone; klein?: Zone; nr: number }> = [];
    const legende: string[] = [];
    gezeigt.forEach((t) => {
      for (const m of t.matches) {
        const z = zonen[m.id] ?? [];
        games.push({
          gross: z.find((x) => Math.round(x.naechsterRadius ?? 0) === GROSS),
          klein: z.find((x) => Math.round(x.naechsterRadius ?? 0) === KLEIN),
          nr: versatz + m.nr,
        });
      }
      if (t.matches.length) legende.push(`${teilKurz(t.windowId).toUpperCase()}: GAMES ${versatz + 1}–${versatz + t.matches.length}`);
      versatz += t.matches.length;
    });

    const zeichnen = (bild: HTMLImageElement | null) => {
      if (weg) return;
      c.width = N; c.height = N;
      const g = c.getContext('2d');
      if (!g) return;
      // Welcher Weltausschnitt gezeigt wird: der feste der Insel, sonst der am Bild gemessene (nur die Insel, wenig Wasser), ohne Bild um die Zonen.
      let sicht: Rahmen;
      if (bild && karte.ausschnitt) sicht = karte.ausschnitt;
      else if (bild) {
        const a = inselAusschnitt(bild);
        sicht = { x0: karte.rahmen.x0 + a.x * karte.rahmen.spanne, y0: karte.rahmen.y0 + a.y * karte.rahmen.spanne, spanne: a.seite * karte.rahmen.spanne };
      } else {
        sicht = rahmenUmZonen(games.flatMap((s) => [s.gross, s.klein]).filter(da).map((z) => ({ x: z.x, y: z.y, r: GROSS })));
      }
      const px = (v: number) => ((v - sicht.x0) / sicht.spanne) * N;
      const py = (v: number) => ((v - sicht.y0) / sicht.spanne) * N;
      const pr = (r: number) => (r / sicht.spanne) * N;

      g.fillStyle = WASSER; g.fillRect(0, 0, N, N);
      if (bild) {
        const w = bild.naturalWidth || N; const h = bild.naturalHeight || N;
        const r = karte.rahmen;
        g.drawImage(bild, ((sicht.x0 - r.x0) / r.spanne) * w, ((sicht.y0 - r.y0) / r.spanne) * h, (sicht.spanne / r.spanne) * w, (sicht.spanne / r.spanne) * h, 0, 0, N, N);
      }

      // Erst alle gelben, dann die dunklen darueber - wie in der Vorlage.
      for (const s of games) {
        if (!da(s.klein)) continue;
        g.beginPath(); g.arc(px(s.klein.x), py(s.klein.y), pr(KLEIN), 0, Math.PI * 2);
        g.fillStyle = GELB; g.fill();
      }
      for (const s of games) {
        if (!da(s.gross)) continue;
        g.beginPath(); g.arc(px(s.gross.x), py(s.gross.y), pr(GROSS), 0, Math.PI * 2);
        g.fillStyle = SCHWARZ; g.fill();
      }
      // Beschriftung; liegen zwei Zonen fast uebereinander, ruecken die Namen auseinander (wie lib/zonenBild).
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(N * 0.024)}px ${SCHRIFT}`;
      const gesetzt: Kreis[] = [];
      const hoehe = N * 0.03; const breite = N * 0.13;
      for (const s of games) {
        if (!da(s.gross)) continue;
        const x = px(s.gross.x); let y = py(s.gross.y);
        for (let i = 0; i < 6 && gesetzt.some((q) => Math.abs(q.x - x) < breite && Math.abs(q.y - y) < hoehe); i += 1) y += hoehe;
        gesetzt.push({ x, y });
        g.lineWidth = N * 0.004; g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.strokeText(`GAME ${s.nr}`, x, y);
        g.fillStyle = '#ffffff';
        g.fillText(`GAME ${s.nr}`, x, y);
      }

      // Unten links: ZONES, der Turniername im Blau der Seite, CompHub - wie bisher, ohne Strich.
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const rand = N * 0.03;
      g.fillStyle = '#ffffff';
      g.font = `800 ${Math.round(N * 0.05)}px ${SCHRIFT}`;
      g.fillText('ZONES', rand, N - rand - N * 0.03);
      g.fillStyle = '#38bdf8';
      g.font = `700 ${Math.round(N * 0.018)}px ${SCHRIFT}`;
      g.fillText(titel, rand, N - rand);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.textAlign = 'right';
      g.font = `700 ${Math.round(N * 0.016)}px ${SCHRIFT}`;
      g.fillText('THECOMPHUB.COM', N - rand, N - rand);
      // Bei mehreren Teilen: welche Games zu welchem Teil gehoeren - an der Stelle der frueheren Tageslegende, ohne Farbpunkt.
      if (gezeigt.length > 1) {
        g.textAlign = 'left';
        g.font = `700 ${Math.round(N * 0.014)}px ${SCHRIFT}`;
        g.fillStyle = '#ffffff';
        legende.forEach((zeile, i) => g.fillText(zeile, rand, N - rand - N * 0.105 + i * N * 0.024));
      }
      setBereit(true);
    };

    const schrift = schriftBereit();
    if (!karte.bild) { void schrift.then(() => zeichnen(null)); return () => { weg = true; }; }
    const bild = new Image();
    bild.onload = () => { void schrift.then(() => zeichnen(bild)); };
    bild.onerror = () => { void schrift.then(() => zeichnen(null)); };
    bild.src = karte.bild;
    return () => { weg = true; };
  }, [gezeigt, zonen, titel, karte, laedt]);

  const t = useT();
  const [meldung, setMeldung] = useState('');
  /** Das Bild kopieren (Zwischenablage - Betreiber, 19.10.2026: "Copy Image, dass ich es nicht immer herunterladen muss"); geht das nicht, wird es gespeichert. */
  const kopieren = async (nurDownload = false) => {
    const c = leinwand.current;
    if (!c) return;
    try {
      const r = await speichereLeinwand(c, `zones-${titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, nurDownload);
      setMeldung(r === 'kopiert' ? t('Bild kopiert') : t('Bild gespeichert'));
    } catch { setMeldung(t('Das Bild ließ sich nicht auslesen.')); }
    setTimeout(() => setMeldung(''), 4000);
  };

  const reiter: Array<[string, string, boolean]> = [
    ...tage.map((x) => [x.windowId, teilName(x.windowId), false] as [string, string, boolean]),
    ...(tage.length > 1 ? [['alle', zusammenName(tage.map((x) => x.windowId)), true] as [string, string, boolean]] : []),
  ];

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-300"><T>Zonen-Bild</T></h2>
        {reiter.map(([w, name, uebersetzen]) => (
          <button key={w} type="button" onClick={() => setWahl(w)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${wahl === w
              ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400 hover:border-zinc-600 hover:text-slate-200'}`}>
            {uebersetzen ? <T>{name}</T> : name}
          </button>
        ))}
        {meldung && <span className="ml-auto text-xs font-semibold text-emerald-400">{meldung}</span>}
        <button type="button" onClick={() => void kopieren(false)} disabled={!bereit || fehlend}
          className={`${meldung ? '' : 'ml-auto '}rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50`}>
          <T>Bild kopieren</T>
        </button>
        <button type="button" onClick={() => void kopieren(true)} disabled={!bereit || fehlend}
          className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
          <T>Bild speichern</T>
        </button>
      </div>
      {laedt && <p className="text-xs text-slate-500"><T>Die Zonen der Games werden geladen …</T></p>}
      {!laedt && fehlend && <p className="text-xs text-amber-300"><T>Für diese Games liegen die Zonen noch nicht vor. Sie erscheinen von selbst, sobald die Replays voll gelesen sind.</T></p>}
      {!laedt && !karte.bild && (
        <p className="text-xs text-amber-300">
          <T>Für diese Reload-Insel gibt es noch kein geeichtes Kartenbild - die Zonen stehen ohne Karte, aber richtig zueinander.</T>
          {karte.insel ? ` (${karte.insel})` : ''}
        </p>
      )}
      <canvas ref={leinwand} data-insel={karte.insel ?? karte.art} className="aspect-square w-full max-w-3xl rounded-xl border border-zinc-800 bg-sky-950" />
    </section>
  );
}
