'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { flaggenPfad } from '@/components/TeamFlagge';
import { kartenName } from '@/app/lib/kartenStil';
import { fortniteKarte } from '@/lib/bildAdressen';
import type { SolosFenster } from '@/lib/globalsSolos';

/*
 * Das Karten-Plakat (Betreiber, 26.10.2026, Vorbild: der Beitrag von kxrr zur Grand-Finals-Map): die Insel mit allen Landepunkten, jeder Punkt mit der Flagge des Landes gefuellt und mit den Namen
 * darauf - bereit zum Posten. Gezeichnet wird im Browser (Canvas), aus denselben Daten wie die Kartenseiten (/api/maps-liste, /api/maps-karte): wer wo landet, ist nicht geschaetzt.
 *
 * Ein Landepunkt mit Spielern aus einem Land bekommt dessen Flagge; stehen Spieler aus mehreren Laendern darauf, bleibt er dunkel (rot, wo mehrere Teams landen) - eine
 * gemischte Flagge wuerde falsche Herkunft vortaeuschen. Kein Noble-Logo im Bild: das Kartenbild kommt ohne.
 */

interface Eintrag { turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string; datum: number | null; saisonKurz?: string }

const GROESSE = 2000;
const bildLaden = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const b = new Image();
  b.crossOrigin = 'anonymous';
  b.onload = () => ok(b);
  b.onerror = () => ok(null);
  b.src = src;
});

export default function KartenPlakat() {
  const t = useT();
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [suche, setSuche] = useState('');
  const [wahl, setWahl] = useState<Eintrag | null>(null);
  const [titel, setTitel] = useState('');
  const [fenster, setFenster] = useState<SolosFenster | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const leinwand = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetch('/api/maps-liste').then((r) => r.json()).then((j) => setListe(Array.isArray(j?.eintraege) ? j.eintraege : [])).catch(() => setListe([]));
  }, []);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (liste ?? []).filter((e) => e.datum && e.datum <= Date.now() && (!q || `${e.titel} ${e.region} ${e.cup}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0)).slice(0, 40);
  }, [liste, suche]);

  useEffect(() => {
    if (!wahl) return undefined;
    let weg = false;
    // Zurueckgesetzt wird beim Wechsel der Wahl (siehe waehlen) - hier nur geholt.
    fetch(`/api/maps-karte?t=${encodeURIComponent(wahl.turnierId)}&r=${encodeURIComponent(wahl.region)}&w=${encodeURIComponent(wahl.windowId)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => {
        if (weg) return;
        if (j?.ok && j.fenster) setFenster(j.fenster as SolosFenster); else setFehler(String(j?.error ?? t('Zu diesem Spieltag gibt es keine Karte.')));
      }).catch(() => { if (!weg) setFehler(t('Keine Verbindung zum Server.')); }).finally(() => { if (!weg) setLaedt(false); });
    return () => { weg = true; };
  }, [wahl, t]);

  const waehlen = (e: Eintrag) => { setWahl(e); setFenster(null); setFehler(''); setLaedt(true); setTitel(`${e.saisonKurz ? e.saisonKurz + ' ' : ''}${e.titel}${e.region ? ` · ${e.region}` : ''} - landing spots`.trim()); };

  const zeichnen = useCallback(async () => {
    const c = leinwand.current;
    if (!c || !fenster) return;
    const g = c.getContext('2d');
    if (!g) return;
    c.width = GROESSE; c.height = GROESSE + 150;
    g.fillStyle = '#05070d'; g.fillRect(0, 0, c.width, c.height);

    // Das Kartenbild - ueber die eigene Auslieferung (kein fremder Ursprung, sonst laesst sich das Bild nicht speichern).
    const quelle = fenster.bild && /^https?:\/\//.test(fenster.bild) ? `/api/maps-bild?u=${encodeURIComponent(fenster.bild)}` : (fenster.bild || fortniteKarte(false));
    const karte = (await bildLaden(quelle)) ?? (await bildLaden(fortniteKarte(false)));
    const kopf = 150;
    g.save();
    g.beginPath(); g.roundRect(0, kopf, GROESSE, GROESSE, 36); g.clip();
    if (karte) g.drawImage(karte, 0, kopf, GROESSE, GROESSE);
    g.restore();

    // Land je Spieler (nach Anzeigename), und die Flaggen, die gebraucht werden.
    const landVon = new Map<string, string>();
    for (const s of fenster.spieler) if (s.land) landVon.set(s.anzeige.toLowerCase(), s.land.toLowerCase());
    const flaggen = new Map<string, HTMLImageElement | null>();
    const noetig = new Set<string>();
    for (const fo of fenster.formen) for (const n of fo.spieler) { const l = landVon.get(n.toLowerCase()); if (l && /^[a-z]{2}$/.test(l)) noetig.add(l); }
    await Promise.all([...noetig].map(async (l) => { flaggen.set(l, await bildLaden(flaggenPfad(l)).catch(() => null)); }));

    const X = (p: number) => (p / 100) * GROESSE;
    const Y = (p: number) => kopf + (p / 100) * GROESSE;
    for (const fo of fenster.formen) {
      if (fo.punkte.length < 3) continue;
      const xs = fo.punkte.map((q) => X(q.x)); const ys = fo.punkte.map((q) => Y(q.y));
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const bahn = () => { g.beginPath(); fo.punkte.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); g.closePath(); };
      const laender = [...new Set(fo.spieler.map((n) => landVon.get(n.toLowerCase())).filter((l): l is string => !!l))];
      const flagge = laender.length === 1 ? flaggen.get(laender[0]) ?? null : null;
      const teams = fo.teams ?? fo.spieler.length;
      g.save();
      bahn(); g.clip();
      if (flagge) { g.globalAlpha = 0.78; g.drawImage(flagge, x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      else { g.fillStyle = teams >= 2 ? 'rgba(255,0,0,0.42)' : 'rgba(0,0,0,0.45)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      g.restore();
      bahn(); g.lineWidth = 3; g.strokeStyle = teams >= 2 ? '#d32f2f' : '#000'; g.stroke();

      // Die Namen, in Grossbuchstaben, mittig - die Schrift wird der Form angepasst.
      const zeilen = (teams > 1 && fo.gruppen?.length ? fo.gruppen.filter((gr) => gr.length).map((gr) => gr.map(kartenName).join(' ')) : fo.spieler.map(kartenName)).slice(0, 8);
      if (!zeilen.length) continue;
      const breite = x1 - x0; const hoehe = y1 - y0;
      const laengste = Math.max(...zeilen.map((z) => z.length));
      const px = Math.max(15, Math.min(40, hoehe / (zeilen.length + 0.6) * 0.82, (breite / Math.max(4, laengste)) * 1.5));
      g.font = `800 ${px}px "Bricolage Grotesque", "Figtree", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
      zeilen.forEach((z, i) => {
        const y = cy + (i - (zeilen.length - 1) / 2) * px * 1.02;
        g.lineWidth = Math.max(4, px * 0.22); g.strokeStyle = '#000'; g.strokeText(z, cx, y, breite * 1.05);
        g.fillStyle = '#fff'; g.fillText(z, cx, y, breite * 1.05);
      });
    }

    // Kopf: Titel links, Marke rechts; Wasserzeichen unten rechts.
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = '800 62px "Bricolage Grotesque", Arial, sans-serif'; g.fillStyle = '#f8fafc';
    g.fillText(titel.slice(0, 54), 44, 98, GROESSE - 520);
    g.textAlign = 'right'; g.font = '800 54px "Bricolage Grotesque", Arial, sans-serif';
    g.fillStyle = '#38bdf8'; g.fillText('COMP', GROESSE - 44 - 190, 98); g.fillStyle = '#f8fafc'; g.fillText('HUB', GROESSE - 44, 98);
    g.font = '700 24px Figtree, Arial, sans-serif'; g.fillStyle = 'rgba(248,250,252,0.85)';
    g.fillText('thecomphub.com', GROESSE - 44, kopf + GROESSE - 22);
  }, [fenster, titel]);

  useEffect(() => { void zeichnen(); }, [zeichnen]);

  const herunterladen = () => {
    const c = leinwand.current; if (!c) return;
    const a = document.createElement('a');
    a.download = 'comphub-karte.png'; a.href = c.toDataURL('image/png'); a.click();
  };
  const kopieren = async () => {
    const c = leinwand.current; if (!c) return;
    try {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('leer');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setMeldung(t('Bild kopiert'));
    } catch { setMeldung(t('Kopieren hat nicht geklappt - bitte herunterladen.')); }
    setTimeout(() => setMeldung(''), 2500);
  };

  const feld = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500';
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Spieltag mit Karte</T></span>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Suchen …')} spellCheck={false} className={feld} /></label>
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {liste === null && <p className="py-3 text-center text-xs text-slate-500"><T>Wird geladen …</T></p>}
          {treffer.map((e) => (
            <button key={`${e.windowId}|${e.region}`} type="button" onClick={() => waehlen(e)}
              className={`block w-full truncate rounded-lg border px-3 py-1.5 text-left text-xs transition ${wahl?.windowId === e.windowId && wahl.region === e.region
                ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
              {e.titel} · {e.region}
            </button>
          ))}
        </div>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Titel</T></span>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} spellCheck={false} className={feld} /></label>
        <p className="text-[11px] leading-relaxed text-slate-500"><T>Jeder Landepunkt mit Spielern aus einem Land trägt dessen Flagge; stehen mehrere Länder darauf, bleibt er dunkel (rot, wo mehrere Teams landen).</T></p>
      </section>
      <section className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          {!fenster ? (
            <p className="px-6 py-24 text-center text-sm text-slate-500">
              {laedt ? <T>Karte wird geladen …</T> : fehler || <T>Spieltag wählen — dann erscheint die Karte hier.</T>}
            </p>
          ) : <canvas ref={leinwand} className="h-auto w-full rounded-xl" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={herunterladen} disabled={!fenster}
            className="rounded-full bg-sky-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-sky-400 disabled:opacity-40"><T>Herunterladen</T></button>
          <button type="button" onClick={() => void kopieren()} disabled={!fenster}
            className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-40"><T>Bild kopieren</T></button>
          {meldung && <span className="text-xs text-slate-400">{meldung}</span>}
        </div>
      </section>
    </div>
  );
}
