'use client';

import { ortJetzt } from '@/app/lib/ort';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlatzhalterRund } from '@/app/components/SpielerPlatzhalter';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { fortniteKarte } from '@/lib/bildAdressen';
import { rahmen as formRahmen, spanneBei, einheitsGroesse, type Punkt, type Spot } from '@/lib/prognoseKarte';
import { kartenSchrift, kartenName, formFarbe, hebeFormHervor } from '@/app/lib/kartenStil';
import KartenWasserzeichen from '@/app/components/KartenWasserzeichen';
import { ZOOM_MAX, doppelKlickZiel } from '@/app/lib/kartenZoom';
import { useKartenVollbild } from '@/app/components/kartenVollbild';
import { useZugang } from '@/app/lib/zugang';
import { speichereLeinwand } from '@/app/lib/bildSpeichern';
import { MARKE } from '@/lib/marke';
import type { SolosFenster, SolosSpieler } from '@/lib/globalsSolos';

/*
 * FNCS Globals Solos - die Bausteine der Seiten (die Seiten selbst: page.tsx und die Ordner daneben).
 *
 * Der Betreiber (11.10.2026): "eine neue VIP-Page fuer Globals Solos. Da tust du automatisch immer die
 * eintragen, die sich direkt qualifiziert haben ... dann Heat 1 und Heat 2 mit den Spielern ... dann
 * natuerlich die Map." Alles kommt von selbst von Noble Practice (lib/globalsSolos); hier wird nichts
 * eingetragen, nichts verteilt und nichts gespeichert. Die Seite erneuert sich alle zwei Minuten.
 */

export const BLAU = '#0e47de';

/** Wo das Kartenbild herkommt: Bilder der Quelle ueber unseren Server, eigene direkt, sonst Epics aktuelle Karte. */
export function kartenQuelle(bild?: string | null): string {
  if (!bild) return fortniteKarte(false);
  return /^https?:\/\//.test(bild) ? `/api/maps-bild?u=${encodeURIComponent(bild)}` : encodeURI(bild);
}

export const datum = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat(ortJetzt(), { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels' }).format(new Date(iso))
  : '');
export const uhr = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat(ortJetzt(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }).format(new Date(iso))
  : '');

export function Gesicht({ s, gross }: { s: SolosSpieler; gross?: boolean }) {
  const px = gross ? 'h-12 w-12' : 'h-8 w-8';
  return s.bild
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={s.bild} alt="" loading="lazy" className={`${px} shrink-0 rounded-full border border-amber-400/30 object-cover object-top`} />
    : (
      <PlatzhalterRund name={s.anzeige} groesse={gross ? 48 : 32} />
    );
}

/* ------------------------------------------------------------------ Karte */

/** Liegt der Punkt in der Flaeche? Strahlenverfahren. */
function imPolygon(p: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Den Blickpunkt so einfangen, dass der Ausschnitt am Bildrand haelt. */
function begrenze(z: number, m: Punkt): Punkt {
  if (z <= 1) return { x: 50, y: 50 };
  const sicht = 100 / z;
  return {
    x: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.x)),
    y: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.y)),
  };
}

/**
 * Die Karte eines Spieltags - genau so gezeichnet wie jede Turnierkarte im Werkzeug.
 *
 * Der Betreiber (11.10.2026): "Die Farben von Noble musst du nicht uebernehmen. Du musst einfach die Formen
 * optisch uebernehmen und wo sie sind ... als ob ich es als Admin machen wuerde": Schwarz, wo einer
 * steht, Rot ab zwei, Alata mit schwarzer Kontur, die Form waechst beim Ueberfahren, das Rad zoomt.
 * Dieselben Bausteine wie /maps und /globals/map (app/lib/kartenStil, lib/prognoseKarte, globals.css);
 * nur die Formen und wer darauf steht kommen von Noble.
 */
export function Karte({ f, bild, rotAb = 2 }: {
  f: SolosFenster;
  /** Das Kartenbild (die Wahl des Admins hat Vorrang vor dem der Spielversion); sonst Epics aktuelle Karte. */
  bild?: string | null;
  /** Ab wie vielen Teams auf einer Stelle sie rot wird. Bei Duos und Trios drei, bei Solos zwei. */
  rotAb?: number;
}) {
  const t = useT();
  const flaeche = useRef<HTMLDivElement | null>(null);
  const ebene = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const mitteRef = useRef<Punkt>({ x: 50, y: 50 });
  const hoverRef = useRef<string | null>(null);
  const malUhr = useRef<number | null>(null);
  const bewegung = useRef<number | null>(null);
  const zielZoom = useRef<number | null>(null);
  const zug = useRef<{ sx: number; sy: number; mitte: Punkt; kasten: DOMRect } | null>(null);
  const [gezoomt, setGezoomt] = useState(false);
  /** Die Spielersuche: der eingetippte Text - er filtert die Liste neben der Karte und hebt die Stellen auf der Karte hervor. */
  const [suche, setSuche] = useState('');
  /** Das kleine Suchfenster ueber der Karte (Strg + F oder die Lupe unten rechts). */
  const [popup, setPopup] = useState(false);
  const sucheFeld = useRef<HTMLInputElement | null>(null);
  /** Die Stelle, zu der gerade gesprungen wurde - sie leuchtet ein paar Sekunden. */
  const [leuchte, setLeuchte] = useState<string | null>(null);
  /** Vollbild: Karte und Liste ueber den ganzen Bildschirm, das Meer bis an den Rand. */
  const huelle = useRef<HTMLDivElement | null>(null);
  const [voll, setVoll] = useState(false);
  const { meer, beiLaden, bildStil, messen } = useKartenVollbild();
  const istAdmin = useZugang().admin;
  const [kopiert, setKopiert] = useState('');
  useEffect(() => {
    const beiWechsel = () => setVoll(document.fullscreenElement !== null && document.fullscreenElement === huelle.current);
    document.addEventListener('fullscreenchange', beiWechsel);
    return () => document.removeEventListener('fullscreenchange', beiWechsel);
  }, []);
  const vollbildUmschalten = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void huelle.current?.requestFullscreen?.();
  };

  const spots = useMemo(() => f.formen.map((fo, i): Spot & { spieler: string[]; teams: number } => {
    const xs = [...new Set(fo.punkte.map((q) => q.x))];
    const ys = [...new Set(fo.punkte.map((q) => q.y))];
    const rechteck = fo.punkte.length === 4 && xs.length === 2 && ys.length === 2;
    const teams = fo.teams ?? fo.spieler.length;
    /*
     * Die Zeilen auf der Stelle - die Regel von Noble (Betreiber, 13.10.2026): steht nur ein Team darauf (schwarz), steht jeder
     * Spieler in einer eigenen Zeile untereinander. Stehen mehrere Teams darauf (rot), bekommt jedes Team eine Zeile, und die
     * Spieler eines Duos oder Trios stehen darin nebeneinander - sonst sieht ein Duo wie zwei Solos aus.
     */
    const zeilen = teams > 1 && fo.gruppen?.length ? fo.gruppen.filter((g) => g.length).map((g) => g.join(' ')) : fo.spieler;
    return { id: `f${i}`, form: rechteck ? 'rechteck' : 'polygon', punkte: fo.punkte, spieler: zeilen, teams };
  }), [f.formen]);

  const aufSpot = useMemo(
    () => Object.fromEntries(spots.map((sp) => [sp.id, sp.spieler])), [spots]);

  /*
   * Wer steht wo? Gesucht wird in allen Namen der Formen (Betreiber, 19.10.2026: "Strg + F, einen Spieler suchen - und die Karte zoomt zu seiner Stelle").
   * Die Suche (Strg + F oder die Lupe) hebt die Stellen der Treffer auf der Karte hervor; Enter oder ein Klick springt hin. Eine Liste neben der Karte gibt es nicht mehr
   * (Betreiber, 20.10.2026: eine Liste reicht, und die steht auf den Cup-Seiten links).
   */
  const alleNamen = useMemo(() => f.formen
    .flatMap((fo, i) => fo.spieler.map((n) => ({ name: n, spot: `f${i}` })))
    .sort((x, y) => kartenName(x.name).localeCompare(kartenName(y.name))), [f.formen]);
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [] as Array<{ name: string; spot: string }>;
    return alleNamen.filter((x) => x.name.toLowerCase().includes(q) || kartenName(x.name).toLowerCase().includes(q));
  }, [suche, alleNamen]);
  const trefferSpots = useMemo(() => new Set(treffer.map((x) => x.spot)), [treffer]);
  const zeilen = useCallback((name: string) => [kartenName(name)], []);
  const groesse = useMemo(() => einheitsGroesse(spots, aufSpot, zeilen), [spots, aufSpot, zeilen]);

  /** Den Ausschnitt direkt ans Element schreiben, einmal je Bildaufbau. */
  const male = useCallback(() => {
    if (malUhr.current !== null) return;
    malUhr.current = requestAnimationFrame(() => {
      malUhr.current = null;
      const el = ebene.current;
      if (!el) return;
      const z = zoomRef.current, m = mitteRef.current;
      el.style.transform = `scale(${z}) translate(${50 / z - m.x}%, ${50 / z - m.y}%)`;
      el.style.setProperty('--z', String(z));
      setGezoomt(z > 1.02);
    });
  }, []);

  const stopp = useCallback(() => {
    if (bewegung.current !== null) { cancelAnimationFrame(bewegung.current); bewegung.current = null; }
    // zielZoom bleibt: der zweite Klick eines Doppelklicks haelt die Bewegung an, der naechste Doppelklick
    // zaehlt von deren Ziel aus weiter. Geloescht wird es am Ziel, beim Rad und beim Ziehen.
  }, []);

  /** Zu einem Ausschnitt gleiten - Massstab und Mitte gemeinsam, auf geradem Weg, weich an- und abfahrend. */
  const gleite = useCallback((zielZ: number, zielM: Punkt) => {
    stopp();
    const z1 = Math.max(1, Math.min(ZOOM_MAX, zielZ));
    const m1 = begrenze(z1, zielM);
    const z0 = zoomRef.current, m0 = { ...mitteRef.current };
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      zoomRef.current = z1; mitteRef.current = m1; male();
      return;
    }
    const start = performance.now();
    zielZoom.current = z1;
    const schritt = (jetzt: number) => {
      const t = Math.min(1, (jetzt - start) / 650);
      const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      zoomRef.current = z0 + (z1 - z0) * e;
      mitteRef.current = { x: m0.x + (m1.x - m0.x) * e, y: m0.y + (m1.y - m0.y) * e };
      male();
      if (t < 1) bewegung.current = requestAnimationFrame(schritt);
      else { bewegung.current = null; zielZoom.current = null; }
    };
    bewegung.current = requestAnimationFrame(schritt);
  }, [male, stopp]);

  const springeZu = useCallback((spotId: string) => {
    const sp = spots.find((s) => s.id === spotId);
    if (!sp) return;
    const r = formRahmen(sp.punkte);
    // Je kleiner die Stelle, desto naeher - aber nie so nah, dass die Umgebung fehlt.
    const z = Math.max(3, Math.min(ZOOM_MAX - 1, 55 / Math.max(r.breite, r.hoehe, 1)));
    gleite(z, { x: r.links + r.breite / 2, y: r.oben + r.hoehe / 2 });
    setLeuchte(spotId);
    window.setTimeout(() => setLeuchte((c) => (c === spotId ? null : c)), 3000);
  }, [spots, gleite]);

  // Strg + F oeffnet die Suche in der Karte - nur, wenn die Karte im Bild steht und Spieler hat (sonst bleibt es beim Suchen des Browsers).
  useEffect(() => {
    if (!spots.some((sp) => sp.spieler.length)) return undefined;
    const taste = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) return;
      const el = flaeche.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      e.preventDefault();
      setPopup(true);
      setTimeout(() => sucheFeld.current?.focus(), 0);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [spots]);

  // Das Rad zoomt, und die Seite scrollt dabei nicht mit.
  useEffect(() => {
    const amRad = (e: WheelEvent) => {
      const el = flaeche.current;
      if (!el || !huelle.current) return;
      const r = el.getBoundingClientRect();
      // Das Rad wirkt auf der ganzen blauen Flaeche (dort waechst die Karte beim Zoomen hin), gerechnet wird weiter im Quadrat der Karte.
      const h = huelle.current.getBoundingClientRect();
      if (e.clientX < h.left || e.clientX > h.right || e.clientY < h.top || e.clientY > h.bottom) return;
      e.preventDefault();
      stopp();
      zielZoom.current = null;
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const z = zoomRef.current, m = mitteRef.current, sicht = 100 / z;
      const px = m.x - sicht / 2 + fx * sicht, py = m.y - sicht / 2 + fy * sicht;
      const z2 = Math.max(1, Math.min(ZOOM_MAX, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const sicht2 = 100 / z2;
      zoomRef.current = z2;
      mitteRef.current = begrenze(z2, { x: px + sicht2 * (0.5 - fx), y: py + sicht2 * (0.5 - fy) });
      male();
    };
    window.addEventListener('wheel', amRad, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', amRad, { capture: true } as EventListenerOptions);
  }, [male, stopp]);

  // Ziehen: ueber die Bildschirmstrecke seit dem Anfassen gerechnet.
  useEffect(() => {
    const bewegt = (e: MouseEvent) => {
      const g = zug.current;
      if (!g) return;
      const sicht = 100 / zoomRef.current;
      zielZoom.current = null;
      mitteRef.current = begrenze(zoomRef.current, {
        x: g.mitte.x - ((e.clientX - g.sx) / g.kasten.width) * sicht,
        y: g.mitte.y - ((e.clientY - g.sy) / g.kasten.height) * sicht,
      });
      male();
    };
    const los = () => { zug.current = null; };
    window.addEventListener('mousemove', bewegt);
    window.addEventListener('mouseup', los);
    return () => {
      window.removeEventListener('mousemove', bewegt);
      window.removeEventListener('mouseup', los);
    };
  }, [male]);

  useEffect(() => () => {
    if (malUhr.current !== null) cancelAnimationFrame(malUhr.current);
    if (bewegung.current !== null) cancelAnimationFrame(bewegung.current);
  }, []);

  /** Der Kartenpunkt unter dem Zeiger, in Prozent. */
  const punktBei = (e: { clientX: number; clientY: number }): Punkt | null => {
    const el = flaeche.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const z = zoomRef.current, m = mitteRef.current, sicht = 100 / z;
    return {
      x: m.x - sicht / 2 + ((e.clientX - r.left) / r.width) * sicht,
      y: m.y - sicht / 2 + ((e.clientY - r.top) / r.height) * sicht,
    };
  };
  const formBei = (e: { clientX: number; clientY: number }) => {
    const p = punktBei(e);
    return p ? [...spots].reverse().find((sp) => imPolygon(p, sp.punkte)) : undefined;
  };

  // Ohne Landepunkte steht trotzdem die Insel da - der Hinweis kommt klein darunter (Betreiber, 12.10.2026: "die Map zumindest").
  const kennzeichen = (sp: { id: string }) => (trefferSpots.has(sp.id) || leuchte === sp.id ? ' ist-treffer' : '');
  const hatNamen = spots.some((sp) => sp.spieler.length);
  /** Die Karte als Bild in die Zwischenablage (sonst Download) - nur fuer den Admin (Betreiber, 30.10.2026: "bei jeder Map diese Copy-Funktion am Rand"). */
  async function alsBild() {
    const G = 1400;
    const c = document.createElement('canvas'); c.width = G; c.height = G;
    const g = c.getContext('2d'); if (!g) return;
    const lade = (src: string) => new Promise<HTMLImageElement | null>((fertig) => { const b = new Image(); b.crossOrigin = 'anonymous'; b.onload = () => fertig(b); b.onerror = () => fertig(null); b.src = src; });
    g.fillStyle = meer || '#0b4a9c'; g.fillRect(0, 0, G, G);
    const karte = await lade(kartenQuelle(bild));
    if (karte) g.drawImage(karte, 0, 0, G, G);
    const familie = kartenSchrift.style.fontFamily;
    try { await document.fonts.load(`700 40px ${familie}`); } catch { /* Ersatzschrift */ }
    for (const sp of spots) {
      const farbe = formFarbe(sp.teams >= rotAb ? 2 : sp.spieler.length ? 1 : 0);
      g.beginPath();
      sp.punkte.forEach((q, i) => { const x = (q.x / 100) * G; const y = (q.y / 100) * G; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath(); g.fillStyle = farbe.fuellung; g.fill(); g.strokeStyle = farbe.rand; g.lineWidth = 2; g.stroke();
      if (!sp.spieler.length) continue;
      const r = formRahmen(sp.punkte);
      const px = (groesse / 100) * G;
      g.font = `700 ${px}px ${familie}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(2, px * 0.18); g.strokeStyle = 'rgba(0,0,0,0.85)'; g.fillStyle = '#fff';
      const n = sp.spieler.length; const gedraengt = sp.teams <= 1 || n === 1;
      sp.spieler.forEach((name, i) => {
        const yProz = gedraengt ? r.oben + r.hoehe / 2 + (i - (n - 1) / 2) * groesse * 1.12 : r.oben + r.hoehe * (0.1 + 0.8 * (i / (n - 1)));
        const x = ((r.links + r.breite / 2) / 100) * G; const y = (yProz / 100) * G;
        g.strokeText(kartenName(name), x, y); g.fillText(kartenName(name), x, y);
      });
    }
    const logo = await lade(MARKE.logoFrei);
    if (logo?.naturalWidth) {
      const breite = Math.round(G * 0.13); const hoehe = Math.round(breite * (logo.naturalHeight / logo.naturalWidth)); const rand = Math.round(G * 0.022);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 12; g.drawImage(logo, G - rand - breite, G - rand - hoehe - Math.round(G * 0.02), breite, hoehe); g.restore();
      g.save(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `600 ${Math.round(G * 0.016)}px Segoe UI, system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom';
      g.fillText('thecomphub.com', G - rand, G - Math.round(rand * 0.5)); g.restore();
    }
    try {
      const wie = await speichereLeinwand(c, `${(f.name || 'karte').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
      setKopiert(wie === 'kopiert' ? t('Bild kopiert') : t('Bild gespeichert'));
    } catch { setKopiert(t('ging nicht')); }
    setTimeout(() => setKopiert(''), 2500);
  }

  return (
    <div>
      {/*
        * Karte und Spielerliste nebeneinander (Betreiber, 19.10.2026: "wie bei EU Competitive und Noble - eine Liste links oder rechts mit Suche, die Liste und die
        * Karte werden gefiltert, Enter hebt hervor"). Das Vollbild nimmt beides mit; das Bild geht dort bis an den Rand, in der Farbe des Meeres, statt schwarzer Balken.
        */}
      <div ref={huelle}
        // Auch ausserhalb des Vollbilds fuellt das Meer die ganze Breite (Betreiber, 30.10.2026: die Knoepfe duerfen nicht aus dem Blauen ragen - "das Blaue groesser").
        className={voll ? 'relative flex h-screen w-screen items-center justify-center overflow-hidden' : 'relative block overflow-hidden rounded-2xl pb-12'}
        style={{ background: voll ? meer : (meer || '#084687') }}
        // Ziehen auf der ganzen blauen Flaeche, nicht nur im Quadrat der Karte - beim Zoomen fuellt die Karte die ganze Breite.
        onMouseDown={(e) => {
          if (e.button !== 0 || zoomRef.current <= 1 || !flaeche.current) return;
          if ((e.target as HTMLElement).closest('button, input, a, ul')) return;
          stopp();
          zug.current = {
            sx: e.clientX, sy: e.clientY, mitte: { ...mitteRef.current },
            kasten: flaeche.current.getBoundingClientRect(),
          };
        }}>
        <div ref={flaeche}
          // Ohne overflow-hidden (Betreiber, 31.10.2026, "wie bei Noble"): gezoomt waechst die Karte ueber das Quadrat hinaus und fuellt die ganze
          // blaue Flaeche, statt im Quadrat abgeschnitten zu werden und links und rechts Blau zu lassen. Abgeschnitten wird erst an der Huelle.
          className={`${kartenSchrift.variable} relative select-none ${voll ? 'h-screen' : 'mx-auto aspect-square w-full bg-transparent'} ${gezoomt ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={voll
            ? { containerType: 'inline-size', aspectRatio: '1 / 1', background: 'transparent' }
            : { containerType: 'inline-size', maxWidth: 'min(100%, calc(100vh - 7rem))' }}
          onDoubleClick={(e) => {
            // Doppelklick: in Stufen an die Form heran (app/lib/kartenZoom), ohne Form ein Schritt an die Stelle.
            const p = punktBei(e);
            if (!p) return;
            zug.current = null;
            const sp = formBei(e);
            const ziel = doppelKlickZiel(sp ? formRahmen(sp.punkte) : null, p, zielZoom.current ?? zoomRef.current);
            gleite(ziel.zoom, ziel.mitte);
          }}
          onMouseMove={(e) => {
            if (zug.current) return;
            const drunter = formBei(e)?.id ?? null;
            hebeFormHervor(flaeche.current, hoverRef.current, drunter);
            hoverRef.current = drunter;
          }}
          onMouseLeave={() => {
            hebeFormHervor(flaeche.current, hoverRef.current, null);
            hoverRef.current = null;
          }}>
          <div ref={ebene} className="absolute inset-0 origin-top-left" style={{ '--z': 1 } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={kartenQuelle(bild)} alt={t('Karte')} draggable={false} onLoad={beiLaden} ref={(el) => { if (el?.complete && el.naturalWidth) messen(el); }}
              onError={(ev) => { const el = ev.currentTarget; if (!el.dataset.ersatz) { el.dataset.ersatz = '1'; el.src = fortniteKarte(false); } }}
              style={bildStil(voll)}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover" />


            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full">
              {spots.map((sp) => {
                // Eine Stelle wird erst rot, wenn genug Teams darauf stehen - sonst waere bei einem Finale alles rot.
                const c = formFarbe(sp.teams >= rotAb ? 2 : sp.spieler.length ? 1 : 0);
                return (
                  <polygon key={sp.id} data-form={sp.id}
                    className={`karten-form${c.rot ? ' ist-rot' : ''}${kennzeichen(sp)}`}
                    points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
                    fill={c.fuellung} stroke={c.rand} vectorEffect="non-scaling-stroke" />
                );
              })}
            </svg>

            {spots.map((sp) => {
              if (!sp.spieler.length) return null;
              const r = formRahmen(sp.punkte);
              const anzahl = sp.spieler.length;
              const mitteX = r.links + r.breite / 2;
              return (
                <div key={sp.id} data-form={sp.id}
                  className={`karten-beschriftung pointer-events-none absolute z-10 flex flex-col items-center text-center${kennzeichen(sp)}`}
                  style={{
                    left: `${r.links}%`, top: `${r.oben}%`,
                    width: `${r.breite}%`, height: `${r.hoehe}%`,
                    // Ein Team allein auf der Stelle: die Namen stehen dicht untereinander in der Mitte (Betreiber, 13.10.2026), nicht auf die Stelle verteilt.
                    justifyContent: sp.teams <= 1 || anzahl === 1 ? 'center' : 'space-between',
                    paddingBlock: 'calc(0.45cqw / var(--z, 1))',
                  }}>
                  {sp.spieler.map((name, i) => {
                    const gedraengt = sp.teams <= 1 || anzahl === 1;
                    const yProz = gedraengt
                      ? r.oben + r.hoehe / 2 + (i - (anzahl - 1) / 2) * groesse * 1.12
                      : r.oben + r.hoehe * (0.1 + 0.8 * (i / (anzahl - 1)));
                    const spanne = sp.form === 'rechteck' ? null : spanneBei(sp.punkte, yProz);
                    const versatz = spanne && r.breite > 0 ? ((spanne.mitte - mitteX) / r.breite) * 100 : 0;
                    return (
                      <div key={`${name}-${i}`} className="relative" style={versatz ? { left: `${versatz}%` } : undefined}>
                        <p className="karten-name" style={{ fontSize: `calc(${groesse}cqw / var(--z, 1))` }}>
                          {kartenName(name)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Strg + F: die Suche als kleines Fenster ueber der Karte - das alte Fenster, nur nicht mehr mit einer Lupe in der Ecke. */}
          {popup && hatNamen && (
            <div className="absolute left-2 top-2 z-30 w-56 max-w-[70vw]" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                <input ref={sucheFeld} value={suche} spellCheck={false}
                  onChange={(e) => setSuche(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setPopup(false); }
                    if (e.key === 'Enter' && treffer[0]) springeZu(treffer[0].spot);
                  }}
                  placeholder={t('Spieler suchen …')}
                  className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/75 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-slate-400 focus:border-sky-400" />
                <button type="button" aria-label={t('Schließen')} onClick={() => setPopup(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/75 text-slate-300 transition hover:text-white">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
                </button>
              </div>
              {suche.trim() && (
                <ul className="mt-1 overflow-hidden rounded-md bg-black/85 text-xs text-slate-100">
                  {treffer.length ? treffer.slice(0, 8).map((x) => (
                    <li key={`${x.spot}-${x.name}`}>
                      <button type="button" onClick={() => springeZu(x.spot)}
                        className="block w-full truncate px-2.5 py-1.5 text-left font-semibold uppercase tracking-wide transition hover:bg-sky-500/30">
                        {kartenName(x.name)}
                      </button>
                    </li>
                  )) : <li className="px-2.5 py-1.5 text-slate-400"><T>Nicht gefunden</T></li>}
                </ul>
              )}
            </div>
          )}

          {gezoomt && (
            <button type="button" onMouseDown={(e) => e.stopPropagation()}
              onClick={() => gleite(1, { x: 50, y: 50 })}
              className="absolute bottom-2 left-2 z-30 rounded-md bg-black/75 px-2.5 py-1 text-[11px] text-slate-200
                         transition hover:bg-black/90">
              <T>Ganze Karte</T>
            </button>
          )}

        </div>
        {/*
          * thecomphub.com klein und oft ueber der ganzen Flaeche, auch ueber dem Meer, und das Logo ganz rechts unten am Rand (Betreiber, 31.10.2026:
          * "wie bei Noble", "mein Logo ganz rechts am Rand"). Beides zoomt nicht mit.
          */}
        <div className="pointer-events-none absolute inset-0 z-20"><KartenWasserzeichen dicht /></div>
        <div aria-hidden className={`pointer-events-none absolute right-3 z-30 flex flex-col items-end opacity-90 ${voll ? 'bottom-14' : 'bottom-12'}`} style={{ width: 'clamp(56px, 7%, 110px)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo-frei.png" alt="" draggable={false} className="w-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]" />
          <span className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">thecomphub.com</span>
        </div>
        {/* Unten rechts ganz am Rand (Betreiber, 30.10.2026: "ganz am Rand", nicht in der Karte): Lupe, Vollbild und fuer den Admin Bild kopieren. */}
        <div className="absolute bottom-2 right-2 z-40 flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {kopiert && <span className="rounded-md bg-black/75 px-2 py-1 text-[11px] text-slate-200">{kopiert}</span>}
          {istAdmin && (
            <button type="button" title={t('Bild kopieren')} aria-label={t('Bild kopieren')} onClick={() => void alsBild()}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/65 text-white transition hover:bg-black/85">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="4" width="10" height="13" rx="1.5" /><path d="M8 4V2.5h4V4M8 9h4M8 12h4" /></svg>
            </button>
          )}
          {hatNamen && (
            <button type="button" title={t('Spieler suchen … (Strg + F)')} aria-label={t('Spieler suchen … (Strg + F)')}
              onClick={() => { setPopup(true); setTimeout(() => sucheFeld.current?.focus(), 0); }}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/65 text-white transition hover:bg-black/85">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" /></svg>
            </button>
          )}
          <button type="button" title={voll ? t('Vollbild verlassen') : t('Vollbild')} aria-label={voll ? t('Vollbild verlassen') : t('Vollbild')}
            onClick={vollbildUmschalten}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-black/65 text-white transition hover:bg-black/85">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {voll ? <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" /> : <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />}
            </svg>
          </button>
        </div>

      </div>
      {!f.formen.length && (
        <p className="mt-3 text-center text-xs text-slate-500"><T>Für diesen Spieltag sind noch keine Landepunkte eingetragen.</T></p>
      )}
    </div>
  );
}
