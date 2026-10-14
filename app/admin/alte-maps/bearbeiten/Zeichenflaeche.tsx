'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { fortniteKarte } from '@/lib/bildAdressen';
import { rahmen as formRahmen, spanneBei, einheitsGroesse, type Punkt, type Spot } from '@/lib/prognoseKarte';
import { kartenSchrift, kartenName, formFarbe, hebeFormHervor } from '@/app/lib/kartenStil';
import KartenWasserzeichen from '@/app/components/KartenWasserzeichen';
import { ZOOM_MAX, doppelKlickZiel } from '@/app/lib/kartenZoom';
import { kartenQuelle } from '@/app/globals-solos/Bausteine';

/*
 * Die Zeichenflaeche des Editors einer alten Map.
 *
 * Der Betreiber (14.10.2026): im Editor hatte die Karte ein anderes Bild als die Ansicht, die Formen trugen Zahlen und waren gelb,
 * und weder Zoom noch Ueberfahren funktionierten - "es soll die gleichen Settings haben wie alle anderen Map Generator: Schwarz
 * Standard, schwarz wenn nur ein Team dort drin ist, rot wenn mehr als ein Team dort drin ist." Darum zeichnet diese Flaeche
 * genau wie jede andere Turnierkarte (app/lib/kartenStil, app/lib/kartenZoom, globals.css): dieselben Farben und Raender,
 * Alata-Namen statt Nummern, die Form waechst beim Ueberfahren, das Rad zoomt, Doppelklick faehrt eine Form an.
 *
 * Gezeichnet wird in Prozent des Kartenbildes - unabhaengig vom Zoom. Verschieben geht mit gedrueckter rechter oder mittlerer
 * Maustaste oder mit Leertaste und Ziehen (die linke Taste zeichnet), in "Auswaehlen" auch mit der linken.
 */

export interface ZForm { id: string; punkte: Punkt[]; /** Je Team auf der Form die Namen seiner Spieler. */ teams: string[][] }
export type ZModus = 'waehlen' | 'rechteck' | 'polygon';

/** Liegt der Punkt in der Flaeche? Strahlenverfahren. */
function imPolygon(p: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Den Blickpunkt so einfangen, dass der Ausschnitt am Bildrand haelt. */
function begrenze(z: number, m: Punkt): Punkt {
  if (z <= 1) return { x: 50, y: 50 };
  const sicht = 100 / z;
  return { x: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.x)), y: Math.min(100 - sicht / 2, Math.max(sicht / 2, m.y)) };
}

const rund = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
const klemme = (p: Punkt): Punkt => ({ x: rund(p.x), y: rund(p.y) });

export default function Zeichenflaeche({ bild, formen, wahl, modus, onWahl, onNeueForm, onLoeschen, onModus, rotAb = 2 }: {
  bild: string | null;
  formen: ZForm[];
  wahl: string | null;
  modus: ZModus;
  onWahl: (id: string | null) => void;
  onNeueForm: (punkte: Punkt[]) => void;
  onLoeschen: () => void;
  onModus: (m: ZModus) => void;
  /** Ab wie vielen Teams auf einer Form sie rot wird. */
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
  const drinRef = useRef(false);
  const leerRef = useRef(false);
  const [gezoomt, setGezoomt] = useState(false);

  // Zeichnen
  const [zieht, setZieht] = useState<{ a: Punkt; b: Punkt } | null>(null);
  const ziehtRef = useRef<{ a: Punkt; b: Punkt } | null>(null);
  const [ecken, setEcken] = useState<Punkt[]>([]);
  const eckenRef = useRef<Punkt[]>([]);
  const [zeiger, setZeiger] = useState<Punkt | null>(null);
  const geste = useRef<null | { art: 'rechteck' | 'pan' | 'klick'; sx: number; sy: number; mitte: Punkt; kasten: DOMRect; a?: Punkt }>(null);

  // Immer der neueste Stand fuer die Handler am Fenster.
  const stand = useRef({ modus, formen, onWahl, onNeueForm, onLoeschen, onModus });
  useEffect(() => { stand.current = { modus, formen, onWahl, onNeueForm, onLoeschen, onModus }; });

  const setzeEcken = useCallback((n: Punkt[]) => { eckenRef.current = n; setEcken(n); }, []);
  const setzeZieht = useCallback((z: { a: Punkt; b: Punkt } | null) => { ziehtRef.current = z; setZieht(z); }, []);

  const spots = useMemo(() => formen.map((f): Spot & { zeilen: string[]; teams: number } => {
    const xs = [...new Set(f.punkte.map((q) => q.x))];
    const ys = [...new Set(f.punkte.map((q) => q.y))];
    const rechteck = f.punkte.length === 4 && xs.length === 2 && ys.length === 2;
    const teams = f.teams.length;
    // Wie auf jeder Karte: ein Team allein - jeder Spieler eine Zeile; mehrere Teams - je Team eine Zeile, die Spieler nebeneinander.
    const zeilen = teams > 1 ? f.teams.map((x) => x.join(' ')) : (f.teams[0] ?? []);
    return { id: f.id, form: rechteck ? 'rechteck' : 'polygon', punkte: f.punkte, zeilen, teams };
  }), [formen]);
  const aufSpot = useMemo(() => Object.fromEntries(spots.map((sp) => [sp.id, sp.zeilen])), [spots]);
  const zeilenFn = useCallback((name: string) => [kartenName(name)], []);
  const groesse = useMemo(() => einheitsGroesse(spots, aufSpot, zeilenFn), [spots, aufSpot, zeilenFn]);

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
      const f = Math.min(1, (jetzt - start) / 650);
      const e = f < 0.5 ? 2 * f * f : 1 - ((-2 * f + 2) ** 2) / 2;
      zoomRef.current = z0 + (z1 - z0) * e;
      mitteRef.current = { x: m0.x + (m1.x - m0.x) * e, y: m0.y + (m1.y - m0.y) * e };
      male();
      if (f < 1) bewegung.current = requestAnimationFrame(schritt);
      else { bewegung.current = null; zielZoom.current = null; }
    };
    bewegung.current = requestAnimationFrame(schritt);
  }, [male, stopp]);

  /** Der Kartenpunkt unter dem Zeiger, in Prozent (mit Zoom und Verschiebung gerechnet). */
  const punktBei = useCallback((e: { clientX: number; clientY: number }): Punkt | null => {
    const el = flaeche.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const z = zoomRef.current, m = mitteRef.current, sicht = 100 / z;
    return { x: m.x - sicht / 2 + ((e.clientX - r.left) / r.width) * sicht, y: m.y - sicht / 2 + ((e.clientY - r.top) / r.height) * sicht };
  }, []);
  const formBei = useCallback((e: { clientX: number; clientY: number }) => {
    const p = punktBei(e);
    return p ? [...stand.current.formen].reverse().find((f) => imPolygon(p, f.punkte)) : undefined;
  }, [punktBei]);

  /* ---------------------------------------------------------- Polygon */

  const polygonFertig = useCallback(() => {
    if (eckenRef.current.length >= 3) stand.current.onNeueForm(eckenRef.current);
    setzeEcken([]);
  }, [setzeEcken]);
  const polygonPunkt = useCallback((p: Punkt) => {
    const alt = eckenRef.current;
    if (alt.length >= 3 && Math.hypot(p.x - alt[0].x, p.y - alt[0].y) < 1.8 / zoomRef.current) { polygonFertig(); return; }
    const letzter = alt[alt.length - 1];
    if (letzter && Math.hypot(p.x - letzter.x, p.y - letzter.y) < 0.3 / zoomRef.current) return; // der zweite Klick eines Doppelklicks
    setzeEcken([...alt, p]);
  }, [polygonFertig, setzeEcken]);

  // Wechsel der Werkzeuge verwirft eine angefangene Form.
  useEffect(() => { setzeEcken([]); setzeZieht(null); hebeFormHervor(flaeche.current, hoverRef.current, null); hoverRef.current = null; }, [modus, setzeEcken, setzeZieht]);

  // Tasten: Esc bricht ab, Enter schliesst die Form, Rueckschritt nimmt den letzten Punkt, Entf loescht die gewaehlte Form, Leertaste verschiebt.
  useEffect(() => {
    const ziel = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName;
    const unten = (e: KeyboardEvent) => {
      if (ziel(e) === 'INPUT' || ziel(e) === 'TEXTAREA') return;
      const m = stand.current.modus;
      if (e.key === ' ') { leerRef.current = true; if (drinRef.current) e.preventDefault(); return; }
      if (e.key === 'Escape') { setzeEcken([]); setzeZieht(null); geste.current = null; stand.current.onModus('waehlen'); }
      if (e.key === 'Enter' && m === 'polygon') polygonFertig();
      if (e.key === 'Backspace' && m === 'polygon') { e.preventDefault(); setzeEcken(eckenRef.current.slice(0, -1)); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && m === 'waehlen') { e.preventDefault(); stand.current.onLoeschen(); }
    };
    const oben = (e: KeyboardEvent) => { if (e.key === ' ') leerRef.current = false; };
    window.addEventListener('keydown', unten);
    window.addEventListener('keyup', oben);
    return () => { window.removeEventListener('keydown', unten); window.removeEventListener('keyup', oben); };
  }, [polygonFertig, setzeEcken, setzeZieht]);

  // Das Rad zoomt, und die Seite scrollt dabei nicht mit.
  useEffect(() => {
    const amRad = (e: WheelEvent) => {
      const el = flaeche.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
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

  // Ziehen (Zeichnen eines Rechtecks, Verschieben, Klick) - ueber die Bildschirmstrecke seit dem Anfassen gerechnet.
  useEffect(() => {
    const bewegt = (e: PointerEvent) => {
      const g = geste.current;
      if (!g) return;
      if (g.art === 'rechteck') {
        const p = punktBei(e);
        if (p && g.a) setzeZieht({ a: g.a, b: klemme(p) });
        return;
      }
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (g.art === 'klick') {
        if (Math.hypot(dx, dy) <= 4) return;
        if (zoomRef.current <= 1) return;
        g.art = 'pan';
      }
      const sicht = 100 / zoomRef.current;
      zielZoom.current = null;
      mitteRef.current = begrenze(zoomRef.current, { x: g.mitte.x - (dx / g.kasten.width) * sicht, y: g.mitte.y - (dy / g.kasten.height) * sicht });
      male();
    };
    const los = (e: PointerEvent) => {
      const g = geste.current;
      geste.current = null;
      if (!g) return;
      if (g.art === 'rechteck') {
        const z = ziehtRef.current;
        setzeZieht(null);
        if (!z) return;
        if (Math.abs(z.a.x - z.b.x) < 0.8 / zoomRef.current || Math.abs(z.a.y - z.b.y) < 0.8 / zoomRef.current) return;
        const [x1, x2] = [Math.min(z.a.x, z.b.x), Math.max(z.a.x, z.b.x)];
        const [y1, y2] = [Math.min(z.a.y, z.b.y), Math.max(z.a.y, z.b.y)];
        stand.current.onNeueForm([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]);
        return;
      }
      if (g.art === 'klick') stand.current.onWahl(formBei(e)?.id ?? null);
    };
    window.addEventListener('pointermove', bewegt);
    window.addEventListener('pointerup', los);
    window.addEventListener('pointercancel', los);
    return () => {
      window.removeEventListener('pointermove', bewegt);
      window.removeEventListener('pointerup', los);
      window.removeEventListener('pointercancel', los);
    };
  }, [male, punktBei, formBei, setzeZieht]);

  useEffect(() => () => {
    if (malUhr.current !== null) cancelAnimationFrame(malUhr.current);
    if (bewegung.current !== null) cancelAnimationFrame(bewegung.current);
  }, []);

  const abwaerts = (e: React.PointerEvent) => {
    const el = flaeche.current;
    if (!el) return;
    stopp();
    const kasten = el.getBoundingClientRect();
    const start = { sx: e.clientX, sy: e.clientY, mitte: { ...mitteRef.current }, kasten };
    // Rechte oder mittlere Taste, oder Leertaste: verschieben - in jedem Werkzeug.
    if (e.button === 1 || e.button === 2 || (e.button === 0 && leerRef.current)) {
      if (zoomRef.current > 1) { e.preventDefault(); geste.current = { art: 'pan', ...start }; }
      return;
    }
    if (e.button !== 0) return;
    const p = punktBei(e);
    if (!p) return;
    if (modus === 'rechteck') {
      const q = klemme(p);
      geste.current = { art: 'rechteck', ...start, a: q };
      setzeZieht({ a: q, b: q });
      return;
    }
    if (modus === 'polygon') { polygonPunkt(klemme(p)); return; }
    geste.current = { art: 'klick', ...start };
  };

  const bewegtDrueber = (e: React.PointerEvent) => {
    if (geste.current) return;
    const p = punktBei(e);
    if (modus === 'polygon' && p && eckenRef.current.length) setZeiger(klemme(p));
    // Wie auf jeder Karte: die ueberfahrene Form waechst ein wenig.
    const drunter = modus === 'waehlen' ? (formBei(e)?.id ?? null) : null;
    hebeFormHervor(flaeche.current, hoverRef.current, drunter);
    hoverRef.current = drunter;
  };

  const verlassen = () => {
    drinRef.current = false;
    setZeiger(null);
    hebeFormHervor(flaeche.current, hoverRef.current, null);
    hoverRef.current = null;
  };

  const doppelt = (e: React.MouseEvent) => {
    if (modus === 'polygon') { polygonFertig(); return; }
    if (modus !== 'waehlen') return;
    // Doppelklick: in Stufen an die Form heran (app/lib/kartenZoom), ohne Form ein Schritt an die Stelle.
    const p = punktBei(e);
    if (!p) return;
    geste.current = null;
    const f = formBei(e);
    const ziel = doppelKlickZiel(f ? formRahmen(f.punkte) : null, p, zielZoom.current ?? zoomRef.current);
    gleite(ziel.zoom, ziel.mitte);
  };

  const schritt = (faktor: number) => {
    stopp();
    zielZoom.current = null;
    const z2 = Math.max(1, Math.min(ZOOM_MAX, zoomRef.current * faktor));
    zoomRef.current = z2;
    mitteRef.current = begrenze(z2, mitteRef.current);
    male();
  };

  const gewaehlteForm = wahl ? formen.find((f) => f.id === wahl) : null;
  const cursor = modus === 'waehlen' ? (gezoomt ? 'grab' : 'default') : 'crosshair';

  return (
    <div ref={flaeche}
      className={`${kartenSchrift.variable} relative mx-auto aspect-square w-full touch-none select-none overflow-hidden rounded-xl border border-white/[0.06] bg-[#0b2f83]`}
      style={{ containerType: 'inline-size', maxWidth: 'min(100%, calc(100vh - 9rem))', cursor }}
      onPointerDown={abwaerts} onPointerMove={bewegtDrueber} onPointerEnter={() => { drinRef.current = true; }} onPointerLeave={verlassen}
      onDoubleClick={doppelt} onContextMenu={(e) => e.preventDefault()}>
      <div ref={ebene} className="absolute inset-0 origin-top-left" style={{ '--z': 1 } as React.CSSProperties}>
        {/* Dasselbe Kartenbild wie in der Ansicht - die Wahl des Admins, sonst die Insel der Saison. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={kartenQuelle(bild)} alt={t('Karte')} draggable={false}
          onError={(ev) => { const el = ev.currentTarget; if (!el.dataset.ersatz) { el.dataset.ersatz = '1'; el.src = fortniteKarte(false); } }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover" />

        {/* thecomphub.com, wie auf jeder Karte - unter den Formen. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden"><KartenWasserzeichen /></div>

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {spots.map((sp) => {
            const c = formFarbe(sp.teams >= rotAb ? 2 : sp.teams ? 1 : 0);
            return (
              <polygon key={sp.id} data-form={sp.id}
                className={`karten-form${c.rot ? ' ist-rot' : ''}${sp.id === wahl ? ' ist-gewaehlt' : ''}`}
                points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
                fill={c.fuellung} stroke={c.rand} vectorEffect="non-scaling-stroke" />
            );
          })}
          {gewaehlteForm && (
            <polygon points={gewaehlteForm.punkte.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#38bdf8"
              strokeDasharray="6 4" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 'calc(2px / var(--z, 1))' }} />
          )}
          {zieht && (
            <rect x={Math.min(zieht.a.x, zieht.b.x)} y={Math.min(zieht.a.y, zieht.b.y)} width={Math.abs(zieht.a.x - zieht.b.x)} height={Math.abs(zieht.a.y - zieht.b.y)}
              fill="rgba(56,189,248,.2)" stroke="#38bdf8" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 'calc(2px / var(--z, 1))' }} />
          )}
          {ecken.length > 0 && (
            <polyline points={[...ecken, ...(zeiger ? [zeiger] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(56,189,248,.14)" stroke="#38bdf8" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 'calc(2px / var(--z, 1))' }} />
          )}
        </svg>

        {/* Die Namen auf den Formen - Alata mit schwarzer Kontur, wie auf jeder Karte. */}
        {spots.map((sp) => {
          if (!sp.zeilen.length) return null;
          const r = formRahmen(sp.punkte);
          const anzahl = sp.zeilen.length;
          const mitteX = r.links + r.breite / 2;
          const gedraengt = sp.teams <= 1 || anzahl === 1;
          return (
            <div key={`n${sp.id}`} data-form={sp.id}
              className="karten-beschriftung pointer-events-none absolute z-10 flex flex-col items-center text-center"
              style={{
                left: `${r.links}%`, top: `${r.oben}%`, width: `${r.breite}%`, height: `${r.hoehe}%`,
                justifyContent: gedraengt ? 'center' : 'space-between',
                paddingBlock: 'calc(0.45cqw / var(--z, 1))',
              }}>
              {sp.zeilen.map((name, i) => {
                const yProz = gedraengt
                  ? r.oben + r.hoehe / 2 + (i - (anzahl - 1) / 2) * groesse * 1.12
                  : r.oben + r.hoehe * (0.1 + 0.8 * (i / (anzahl - 1)));
                const spanne = sp.form === 'rechteck' ? null : spanneBei(sp.punkte, yProz);
                const versatz = spanne && r.breite > 0 ? ((spanne.mitte - mitteX) / r.breite) * 100 : 0;
                return (
                  <div key={`${name}-${i}`} className="relative" style={versatz ? { left: `${versatz}%` } : undefined}>
                    <p className="karten-name" style={{ fontSize: `calc(${groesse}cqw / var(--z, 1))` }}>{kartenName(name)}</p>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Erster Punkt der offenen Form - hier schliesst sie sich. */}
        {ecken.length >= 3 && (
          <span style={{ left: `${ecken[0].x}%`, top: `${ecken[0].y}%` }}
            className="karten-fest pointer-events-none absolute z-20 h-3.5 w-3.5 rounded-full border-2 border-emerald-400 bg-emerald-950" />
        )}
      </div>

      {/* Zoom: Plus und Minus rechts unten, "Ganze Karte" links unten. */}
      <div className="absolute bottom-2 right-2 z-30 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => schritt(1.5)} aria-label={t('Hineinzoomen')} title={t('Hineinzoomen')}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-black/75 text-base font-bold text-slate-100 transition hover:bg-black/90">+</button>
        <button type="button" onClick={() => schritt(1 / 1.5)} aria-label={t('Herauszoomen')} title={t('Herauszoomen')}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-black/75 text-base font-bold text-slate-100 transition hover:bg-black/90">−</button>
      </div>
      {gezoomt && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => gleite(1, { x: 50, y: 50 })}
          className="absolute bottom-2 left-2 z-30 rounded-md bg-black/75 px-2.5 py-1 text-[11px] text-slate-200 transition hover:bg-black/90">
          <T>Ganze Karte</T>
        </button>
      )}
    </div>
  );
}
