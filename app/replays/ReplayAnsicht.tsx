'use client';

/*
 * Die Replay-Ansicht eines Games - Karte, Zeitleiste, Kill-Feed, Teams.
 *
 * Der Betreiber (13.10.2026): die Replay-Funktion soll eine eigene, dauerhafte Seite sein wie bei Osirion - 2D und 3D, zu jedem Game,
 * ueber eine Adresse, die sich nie aendert. Gespielt wird, was die Server-Replays hergeben (tools/replay-voll): die Zonen jedes Games
 * mit Beginn und Ende des Schrumpfens, jeder Knock und jede Eliminierung mit Ort und Zeit, die Spieler mit Team und Platz. Laufwege
 * liefert der Leser bei aktuellen Replays nicht - deshalb laufen hier Zone, Eliminierungen, Knocks und die Zahl der Lebenden mit der
 * Zeit, keine Spielerpunkte auf der Insel. Die 3D-Ansicht kippt dieselbe Karte nach hinten und stellt die Zone als Wand und die
 * Eliminierungen als Pfosten auf; das ist keine Kamerafahrt durchs Spiel.
 *
 * Am selben Tag (Betreiber): ueber ein Zeichen fahren zeigt ein kleines Fenster - wer es ist, sein Mitspieler, Platz, Punkte, Eliminierungen -;
 * die Karte laesst sich mit dem Mausrad vergroessern und mit der Maus verschieben (die Zeichen behalten ihre Groesse); eine Legende erklaert,
 * was X, Kreis und Ring bedeuten.
 *
 * Weltkoordinaten laufen von -135000 bis +135000 (geprueft an Globals Day 1, Game 6, siehe app/admin/replay).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

export interface RSpieler {
  id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number;
  kills?: number; teamKills?: number; tod?: number; todX?: number; todY?: number; plattform?: string;
}
export interface REreignis { t: number; opfer?: number; taeter?: number; art: 'auf' | 'unten' | 'tot'; x?: number; y?: number; abstand?: number }
export interface RZone { radius?: number; naechsterRadius?: number; x?: number; y?: number; schrumpftAb?: number; schrumpftBis?: number }
export interface RMatch {
  spieler: RSpieler[]; feed: REreignis[]; zonen: RZone[]; sieger?: number; ende?: number; beginn?: string; playlist?: string; runde?: number;
  /** Jeder zugeordnete Treffer (Leser ab 28.10.2026): [Zeit, Schuetze, Ziel, Schaden, Kopftreffer, Ziel am Boden, toedlich]. */
  treffer?: number[][];
  /** Schaden je Spieler ueber das ganze Match (tools/replay-voll): gemacht (ohne Treffer auf Umgehauene), eingesteckt, Treffer, Kopftreffer. */
  schaden?: Array<{ id: number; gemacht?: number; gemachtOhneBoden?: number; genommen?: number; treffer?: number; krit?: number }>;
  /** Zeit im Sturm (Sekunden), wie oft vom Boden wiederbelebt, wie oft rebootet. */
  zusatz?: Array<{ id: number; sturmSek?: number; wiederbelebt?: number; rebootet?: number }>;
  /** Der Bus (Leser ab 29.10.2026): Start, Richtung (Grad), Tempo je Sekunde, Sekunden bis Absprung-Beginn, -Ende und Flugende. */
  bus?: Array<{ x?: number; y?: number; yaw?: number; tempo?: number; sprungAb?: number; sprungBis?: number; flugBis?: number }> | null;
  /** Wann der Bus losflog (Spielzeit wie im Kill-Feed). */
  busAb?: number;
}
/** Wie viele Punkte ein Platz und eine Eliminierung in diesem Cup geben - aus Epics Punkteaufschluesselung (lib/epicCups, wertungAus). */
export interface RWertung { platz: Record<string, number>; elim: number }

/** Die grosse Battle-Royale-Insel: Weltkoordinaten laufen von -135000 bis +135000. */
const BR_SPANNE = 135_000;
const FARBEN = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa', '#2dd4bf', '#c084fc', '#fb923c', '#a3e635'];
const ohneVorsatz = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '').trim() || '?';
/** Bots (die KI-Gegner, die die Lobby auffuellen) haben keinen Namen und keine Werte - sie stehen als "Bot" da, nicht als Fragezeichen. */
const nameVon = (p?: { bot?: boolean; name?: string }) => (p?.bot ? 'Bot' : ohneVorsatz(p?.name));
const uhr = (s: number) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const GESCHWINDIGKEIT = [1, 4, 16, 64];
const MAX_ZOOM = 10;
/** Wie lange der Kreis eines Knocks stehen bleibt (Sekunden). */
const KNOCK_DAUER = 12;

interface Kreis { x: number; y: number; r: number }

/** Die Zone zu einem Zeitpunkt: vor dem Schrumpfen die aktuelle, danach gleitet sie zur naechsten, und bleibt dort stehen. */
function zoneBei(zonen: RZone[], t: number): { jetzt: Kreis | null; ziel: Kreis | null; phase: number; schrumpft: boolean } {
  if (!zonen.length) return { jetzt: null, ziel: null, phase: 0, schrumpft: false };
  let i = 0;
  for (let k = 0; k < zonen.length; k += 1) if ((zonen[k].schrumpftAb ?? Infinity) <= t) i = k;
  const z = zonen[i];
  const naechste = zonen[i + 1];
  const von: Kreis = { x: z.x ?? 0, y: z.y ?? 0, r: z.radius ?? 0 };
  const nach: Kreis = { x: naechste?.x ?? von.x, y: naechste?.y ?? von.y, r: z.naechsterRadius ?? von.r };
  const ab = z.schrumpftAb ?? 0; const bis = z.schrumpftBis ?? ab;
  // Vor dem ersten Schrumpfen steht die erste Zone still.
  if (t < ab) return { jetzt: i === 0 ? von : { x: zonen[i - 1].x ?? von.x, y: zonen[i - 1].y ?? von.y, r: zonen[i - 1].naechsterRadius ?? von.r }, ziel: i === 0 ? nach : von, phase: i, schrumpft: false };
  if (t >= bis) return { jetzt: nach, ziel: naechste ? { x: naechste.x ?? nach.x, y: naechste.y ?? nach.y, r: naechste.naechsterRadius ?? nach.r } : null, phase: i + 1, schrumpft: false };
  const f = (t - ab) / Math.max(1, bis - ab);
  return { jetzt: { x: von.x + (nach.x - von.x) * f, y: von.y + (nach.y - von.y) * f, r: von.r + (nach.r - von.r) * f }, ziel: nach, phase: i + 1, schrumpft: true };
}

interface TeamZeile { team: number; platz: number; spieler: RSpieler[]; kills: number; ausgeschieden: number | null }

/** Das Zeichen einer Eliminierung (ein X mit dunklem Rand), in der Farbe des Teams. */
function XZeichen({ farbe, gross = 22 }: { farbe: string; gross?: number }) {
  return (
    <svg viewBox="0 0 22 22" width={gross} height={gross} className="block overflow-visible">
      <path d="M5 5 L17 17 M17 5 L5 17" stroke="#000" strokeWidth={6} strokeLinecap="round" />
      <path d="M5 5 L17 17 M17 5 L5 17" stroke={farbe} strokeWidth={3.2} strokeLinecap="round" />
    </svg>
  );
}

export default function ReplayAnsicht({ match, kartenBild, titel, wertung, hervorheben }: {
  match: RMatch; kartenBild: string | null; titel?: string; wertung?: RWertung | null;
  /** Epic-Konto, dessen Team von Anfang an markiert ist (die eigenen Spiele unter "Meine Cups"). */
  hervorheben?: string;
}) {
  const t = useT();
  const echte = useMemo(() => match.spieler.filter((s) => !s.bot), [match.spieler]);
  const feed = useMemo(() => [...match.feed].sort((a, b) => a.t - b.t), [match.feed]);
  const nachId = useMemo(() => new Map(match.spieler.map((s) => [s.id, s])), [match.spieler]);

  /*
   * Der Ausschnitt der Welt. Die grosse Insel ("Hera_..._Terrain") hat feste Grenzen; die kleinen Reload-Inseln ("Athena_Empty") haben ein
   * anderes Mass, und ein Kartenbild gibt es dort nicht - der Ausschnitt wird dann aus den Zonen und den Orten der Eliminierungen gebildet.
   */
  const welt = useMemo(() => {
    if (kartenBild) return { x0: -BR_SPANNE, y0: -BR_SPANNE, spanne: 2 * BR_SPANNE };
    const xs: number[] = []; const ys: number[] = [];
    for (const z of match.zonen) { if (typeof z.x === 'number' && typeof z.y === 'number') { const r = z.radius ?? 0; xs.push(z.x - r, z.x + r); ys.push(z.y - r, z.y + r); } }
    for (const e of match.feed) { if (typeof e.x === 'number') xs.push(e.x); if (typeof e.y === 'number') ys.push(e.y); }
    if (!xs.length || !ys.length) return { x0: -BR_SPANNE, y0: -BR_SPANNE, spanne: 2 * BR_SPANNE };
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const spanne = Math.max(x1 - x0, y1 - y0) * 1.08;
    return { x0: (x0 + x1) / 2 - spanne / 2, y0: (y0 + y1) / 2 - spanne / 2, spanne };
  }, [kartenBild, match.zonen, match.feed]);
  /** Weltkoordinate -> Prozent der Kartenbreite (x) bzw. -hoehe (y). */
  const pzx = (v: number) => ((v - welt.x0) / welt.spanne) * 100;
  const pzy = (v: number) => ((v - welt.y0) / welt.spanne) * 100;
  const pr = (rad: number) => (rad / welt.spanne) * 100;
  /** Liegt ein Ereignis auf der Karte? Was weit daneben steht (Aufwaerminsel, Sturz ins Leere), wird nicht gezeichnet. */
  const aufKarte = useCallback((e: REreignis) => typeof e.x === 'number' && typeof e.y === 'number'
    && e.x >= welt.x0 - 0.04 * welt.spanne && e.x <= welt.x0 + 1.04 * welt.spanne
    && e.y >= welt.y0 - 0.04 * welt.spanne && e.y <= welt.y0 + 1.04 * welt.spanne, [welt]);

  /*
   * Wo die Zeitleiste beginnt: kurz vor der Landung. Vor dem Bus schiessen sich die Spieler auf der Aufwaermsinsel an - dort liegt ein
   * einzelner Abschuss oft Minuten vor dem eigentlichen Spiel (an Globals Day 2, Game 6 ein Ausreisser bei 24:15 statt 30:55).
   */
  const tStart = useMemo(() => {
    const innen = feed.filter(aufKarte);
    for (let i = 0; i < innen.length; i += 1) {
      const dicht = innen.filter((e) => e.t >= innen[i].t && e.t <= innen[i].t + 60).length;
      if (dicht >= 3) return Math.max(0, Math.floor(innen[i].t - 40));
    }
    const erster = Math.min(innen[0]?.t ?? Infinity, match.zonen[0]?.schrumpftAb ?? Infinity);
    return Number.isFinite(erster) ? Math.max(0, Math.floor(erster - 45)) : 0;
  }, [feed, match.zonen, aufKarte]);
  const tEnde = useMemo(() => Math.ceil(Math.max(match.ende ?? 0, feed[feed.length - 1]?.t ?? 0, match.zonen[match.zonen.length - 1]?.schrumpftBis ?? 0)), [match.ende, feed, match.zonen]);

  const [zeit, setZeit] = useState(tStart);
  const [laeuft, setLaeuft] = useState(false);
  const [tempo, setTempo] = useState(4);
  const [dreiD, setDreiD] = useState(false);
  const [knocks, setKnocks] = useState(true);
  const [teamWahl, setTeamWahl] = useState<number | null>(null);
  const [reiter, setReiter] = useState<'feed' | 'treffer' | 'teams' | 'spieler'>('feed');
  useEffect(() => {
    setZeit(tStart); setLaeuft(false);
    const eigen = hervorheben ? match.spieler.find((s) => s.epic === hervorheben)?.team : undefined;
    setTeamWahl(typeof eigen === 'number' ? eigen : null);
  }, [tStart, match, hervorheben]);

  // Zoom und Verschiebung der Karte: z = Vergroesserung, x/y = Verschiebung in Bildpunkten.
  const [ansicht, setAnsicht] = useState({ z: 1, x: 0, y: 0 });
  const kartenRef = useRef<HTMLDivElement | null>(null);
  const zug = useRef<{ px: number; py: number; ax: number; ay: number } | null>(null);
  const [tip, setTip] = useState<{ links: number; oben: number; breite: number; e: REreignis } | null>(null);
  useEffect(() => { setAnsicht({ z: 1, x: 0, y: 0 }); setTip(null); }, [match]);
  const klemme = (z: number, x: number, y: number, w: number, h: number) => ({ z, x: Math.min(0, Math.max(w * (1 - z), x)), y: Math.min(0, Math.max(h * (1 - z), y)) });
  const zoomUm = useCallback((faktor: number, cx?: number, cy?: number) => {
    setAnsicht((a) => {
      const r = kartenRef.current?.getBoundingClientRect();
      const w = r?.width ?? 1; const h = r?.height ?? 1;
      const z2 = Math.min(MAX_ZOOM, Math.max(1, a.z * faktor));
      const px = cx ?? w / 2; const py = cy ?? h / 2; const k = z2 / a.z;
      return klemme(z2, px - (px - a.x) * k, py - (py - a.y) * k, w, h);
    });
  }, []);
  // Das Mausrad zoomt um den Zeiger - nicht passiv, damit die Seite dabei nicht mitscrollt.
  useEffect(() => {
    const el = kartenRef.current;
    if (!el) return undefined;
    const rad = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomUm(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    };
    el.addEventListener('wheel', rad, { passive: false });
    return () => el.removeEventListener('wheel', rad);
  }, [zoomUm]);

  // Abspielen: eine Animation pro Bild, die Zeit laeuft mit dem gewaehlten Tempo.
  const letzte = useRef<number | null>(null);
  useEffect(() => {
    if (!laeuft) { letzte.current = null; return undefined; }
    let id = 0;
    const schritt = (jetzt: number) => {
      if (letzte.current !== null) {
        const dt = (jetzt - letzte.current) / 1000;
        setZeit((z) => {
          const n = z + dt * tempo;
          if (n >= tEnde) { setLaeuft(false); return tEnde; }
          return n;
        });
      }
      letzte.current = jetzt;
      id = requestAnimationFrame(schritt);
    };
    id = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(id);
  }, [laeuft, tempo, tEnde]);

  const teams = useMemo<TeamZeile[]>(() => {
    const je = new Map<number, RSpieler[]>();
    for (const s of echte) { if (s.team === undefined) continue; const l = je.get(s.team) ?? []; l.push(s); je.set(s.team, l); }
    return [...je.entries()].map(([team, spieler]) => {
      const platz = Math.min(...spieler.map((s) => s.platz ?? 999));
      const alleTot = spieler.every((s) => s.tod !== undefined && s.tod !== null);
      return {
        team, platz, spieler: [...spieler].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0)),
        kills: spieler.reduce((a, s) => a + (s.kills ?? 0), 0),
        ausgeschieden: alleTot ? Math.max(...spieler.map((s) => s.tod ?? 0)) : null,
      };
    }).sort((a, b) => a.platz - b.platz);
  }, [echte]);

  const lebtBei = useCallback((s: RSpieler, z: number) => !(typeof s.tod === 'number' && s.tod <= z), []);
  const lebende = echte.filter((s) => lebtBei(s, zeit)).length;
  const teamsLeben = teams.filter((x) => x.spieler.some((s) => lebtBei(s, zeit))).length;
  const zone = zoneBei(match.zonen, zeit);

  // Eliminierungen und Knocks bis jetzt.
  const bisJetzt = useMemo(() => feed.filter((e) => e.t <= zeit), [feed, zeit]);
  /*
   * Wer wen angeschossen hat (Betreiber, 28.10.2026: "wie bei Osirion ... wer wen angeschossen hat"): jeder Treffer aus dem Replay bis zur gewaehlten Zeit,
   * dazu der Schaden je Spieler bis hierhin (ohne Treffer auf schon Umgehauene - wie die Damage-Werte der Seite). Lebenspunkte und Loot stehen nicht im Replay.
   */
  const treffer = useMemo(() => [...(match.treffer ?? [])].sort((a, b) => a[0] - b[0]), [match.treffer]);
  const trefferBis = useMemo(() => treffer.filter((h) => h[0] <= zeit), [treffer, zeit]);
  const schadenBis = useMemo(() => {
    const m = new Map<number, number>();
    for (const h of trefferBis) if (!h[5]) m.set(h[1], (m.get(h[1]) ?? 0) + h[3]);
    return m;
  }, [trefferBis]);
  const tote = bisJetzt.filter((e) => e.art === 'tot' && aufKarte(e));
  const gerade = bisJetzt.filter((e) => e.art === 'unten' && aufKarte(e) && zeit - e.t < KNOCK_DAUER);
  const farbeVon = (id?: number) => FARBEN[(nachId.get(id ?? -1)?.team ?? 0) % FARBEN.length];
  const sichtbarTeam = (id?: number) => teamWahl === null || nachId.get(id ?? -1)?.team === teamWahl;

  /** Punkte eines Teams in diesem Game: Platzierung plus Eliminierungen des Teams, nach der Wertung des Cups. */
  const punkteVon = (platz?: number, teamKills = 0): number | null => {
    if (!wertung || !platz || platz >= 999) return null;
    let s = 0;
    for (const [n, w] of Object.entries(wertung.platz)) if (Number(n) >= platz) s += w;
    return Math.round(s + wertung.elim * teamKills);
  };

  // Zahl der Lebenden ueber die Zeit - fuer die Kurve unter der Karte.
  const kurve = useMemo(() => {
    const pt: Array<[number, number]> = [];
    const schritt = Math.max(5, Math.round((tEnde - tStart) / 160));
    for (let z = tStart; z <= tEnde; z += schritt) pt.push([z, echte.filter((s) => !(typeof s.tod === 'number' && s.tod <= z)).length]);
    return pt;
  }, [echte, tStart, tEnde]);
  const kMax = Math.max(1, ...kurve.map((p) => p[1]));
  const kx = (z: number) => ((z - tStart) / Math.max(1, tEnde - tStart)) * 1000;
  const ky = (n: number) => 100 - (n / kMax) * 92;

  const springe = (z: number) => { setZeit(Math.min(tEnde, Math.max(tStart, z))); };
  const naechstes = (art: 'tot' | 'zone') => {
    if (art === 'zone') { const n = match.zonen.map((z) => z.schrumpftAb ?? 0).find((z) => z > zeit + 0.5); if (n !== undefined) springe(n); return; }
    const n = feed.find((e) => e.art === 'tot' && e.t > zeit + 0.5);
    if (n) springe(n.t);
  };

  const wahlTeam = teams.find((x) => x.team === teamWahl) ?? null;
  const imFeed = [...bisJetzt].reverse().slice(0, 60);

  const kreis = (c: Kreis | null, stil: { fuell?: string; rand: string; breite: number; strich?: string }) => (c ? (
    <circle cx={pzx(c.x)} cy={pzy(c.y)} r={pr(c.r)} fill={stil.fuell ?? 'none'} stroke={stil.rand}
      strokeWidth={stil.breite} strokeDasharray={stil.strich} vectorEffect="non-scaling-stroke" />
  ) : null);

  // Das kleine Fenster ueber einem Zeichen.
  const zeigeTip = (ev: ReactMouseEvent, e: REreignis) => {
    const rahmen = kartenRef.current?.getBoundingClientRect();
    const m = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rahmen) return;
    setTip({ links: m.left - rahmen.left + m.width / 2, oben: m.top - rahmen.top, breite: rahmen.width, e });
  };
  const marker = (e: REreignis) => ({
    onMouseEnter: (ev: ReactMouseEvent) => zeigeTip(ev, e),
    onMouseLeave: () => setTip(null),
    onFocus: undefined,
  });

  const kartenInhalt = (
    <>
      {kartenBild ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kartenBild} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-sky-950" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="sturm-maske">
            <rect x="0" y="0" width="100" height="100" fill="#fff" />
            {zone.jetzt && <circle cx={pzx(zone.jetzt.x)} cy={pzy(zone.jetzt.y)} r={pr(zone.jetzt.r)} fill="#000" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="#6d28d9" fillOpacity={0.38} mask="url(#sturm-maske)" />
        {kreis(zone.jetzt, { rand: '#e0e7ff', breite: 2.5 })}
        {kreis(zone.ziel, { rand: '#ffffff', breite: 1.5, strich: '4 4' })}
        {/* Die Busroute wie im Spiel (Betreiber, 29.10.2026: "so wie in Fortnite, mit so Pfeilen, nicht einfach eine Linie"): eine Kette von
            Pfeilspitzen in Flugrichtung - kraeftig gelb, wo man abspringen kann, sonst blass -, und waehrend des Flugs der Bus selbst. */}
        {(match.bus ?? []).map((b, i) => {
          if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.yaw !== 'number' || !b.tempo) return null;
          const rad = (b.yaw * Math.PI) / 180;
          const bei = (s: number) => ({ x: b.x! + Math.cos(rad) * b.tempo! * s, y: b.y! + Math.sin(rad) * b.tempo! * s });
          const flug = b.flugBis ?? 50;
          const imFlug = typeof match.busAb === 'number' ? zeit - match.busAb : null;
          const jetzt = imFlug !== null && imFlug >= 0 && imFlug <= flug ? bei(imFlug) : null;
          // Eine Pfeilspitze alle 3 % der Kartenbreite; Groesse 1,4 % - so dicht wie die Pfeile auf der Karte im Spiel.
          const abstand = (welt.spanne * 0.03) / b.tempo;
          const gross = welt.spanne * 0.014; const quer = rad + Math.PI / 2;
          const spitzen: Array<{ s: number; sprung: boolean }> = [];
          for (let s = abstand / 2; s <= flug; s += abstand) spitzen.push({ s, sprung: s >= (b.sprungAb ?? 0) && s <= (b.sprungBis ?? flug) });
          return (
            <g key={`bus${i}`} opacity={imFlug !== null && imFlug > flug + 90 ? 0.6 : 1}>
              {spitzen.map(({ s, sprung }) => {
                const m = bei(s);
                const vorn = { x: m.x + Math.cos(rad) * gross * 0.5, y: m.y + Math.sin(rad) * gross * 0.5 };
                const hinten = { x: m.x - Math.cos(rad) * gross * 0.5, y: m.y - Math.sin(rad) * gross * 0.5 };
                const links = { x: hinten.x + Math.cos(quer) * gross * 0.6, y: hinten.y + Math.sin(quer) * gross * 0.6 };
                const rechts = { x: hinten.x - Math.cos(quer) * gross * 0.6, y: hinten.y - Math.sin(quer) * gross * 0.6 };
                return (
                  <polyline key={s} points={[links, vorn, rechts].map((q) => `${pzx(q.x)},${pzy(q.y)}`).join(' ')} fill="none"
                    stroke={sprung ? '#facc15' : '#ffffff'} strokeOpacity={sprung ? 1 : 0.55} strokeWidth={sprung ? 3.2 : 2.2}
                    strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                );
              })}
              {jetzt && <circle cx={pzx(jetzt.x)} cy={pzy(jetzt.y)} r={1.3} fill="#facc15" stroke="#000" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </svg>
    </>
  );

  // Das Fenster zu einem Ereignis: das Opfer, sein Mitspieler, Platz, Punkte, Eliminierungen.
  const hud = (e: REreignis) => {
    const p = nachId.get(e.opfer ?? -1);
    const von = nachId.get(e.taeter ?? -1);
    const mitspieler = echte.filter((s) => s.team === p?.team && s.id !== p?.id);
    const teamKills = p?.teamKills ?? p?.kills ?? 0;
    return {
      name: p?.bot ? 'Bot' : ohneVorsatz(p?.name), farbe: farbeVon(e.opfer), mitspieler: mitspieler.map((s) => ohneVorsatz(s.name)),
      platz: p?.platz && p.platz < 999 ? p.platz : null, kills: p?.kills ?? 0, teamKills,
      punkte: punkteVon(p?.platz, teamKills),
      von: von && von.id !== p?.id ? nameVon(von) : null, abstand: typeof e.abstand === 'number' && e.abstand > 0 ? Math.round(e.abstand / 100) : null,
    };
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('Zeit'), uhr(zeit - tStart), `${uhr(zeit)}`],
          [t('Spieler am Leben'), String(lebende), `${echte.length}`],
          [t('Teams am Leben'), String(teamsLeben), `${teams.length}`],
          [t('Zone'), zone.jetzt ? `${Math.round(zone.jetzt.r / 100)} m` : '–', zone.schrumpft ? t('schrumpft') : zone.phase ? `${t('Phase')} ${zone.phase}/${match.zonen.length}` : t('noch nicht gestartet')],
        ].map(([k, w, u]) => (
          <div key={k} className="rounded-xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{k}</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-50">{w}</p>
            <p className="text-[11px] text-slate-500">{u}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] lg:items-start">
        {/* ------------------------------------------------ Karte */}
        <div>
          <div ref={kartenRef}
            className="relative mx-auto aspect-square w-full max-w-[860px] touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-sky-950"
            style={{ perspective: '1300px', cursor: ansicht.z > 1 ? 'grab' : 'default' }}
            onPointerDown={(ev) => {
              if ((ev.target as HTMLElement).closest('[data-marker]') || (ev.target as HTMLElement).closest('[data-knopf]')) return;
              zug.current = { px: ev.clientX, py: ev.clientY, ax: ansicht.x, ay: ansicht.y };
              (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
            }}
            onPointerMove={(ev) => {
              const g = zug.current;
              if (!g) return;
              const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
              setAnsicht((a) => klemme(a.z, g.ax + ev.clientX - g.px, g.ay + ev.clientY - g.py, r.width, r.height));
            }}
            onPointerUp={() => { zug.current = null; }}
            onPointerCancel={() => { zug.current = null; }}
            onDoubleClick={() => setAnsicht({ z: 1, x: 0, y: 0 })}>
            <div
              className="absolute inset-0 transition-transform duration-700 ease-out"
              style={{ transformStyle: 'preserve-3d', transform: dreiD ? 'rotateX(52deg) scale(0.72) translateY(-3%)' : 'none', transformOrigin: '50% 50%' }}>
              <div className="absolute inset-0"
                style={{ transformStyle: 'preserve-3d', transformOrigin: '0 0', transform: `translate(${ansicht.x}px, ${ansicht.y}px) scale(${ansicht.z})`, '--z': ansicht.z } as CSSProperties}>
                <div className="absolute inset-0 overflow-hidden rounded-xl shadow-2xl">{kartenInhalt}</div>

                {dreiD && zone.jetzt && Array.from({ length: 9 }, (_, k) => (
                  <svg key={`w${k}`} viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{ transform: `translateZ(${(k + 1) * 14}px)`, opacity: 0.1 + k * 0.03 }}>
                    {kreis(zone.jetzt, { rand: '#c4b5fd', breite: 2 })}
                  </svg>
                ))}

                {/* Eliminierungen: ein X in der Farbe des Teams - bleibt stehen */}
                {tote.map((e, i) => (
                  <button key={`t${i}`} type="button" data-marker aria-label={t('Eliminiert')} {...marker(e)}
                    className="absolute z-10 block cursor-pointer border-0 bg-transparent p-0"
                    style={{ left: `${pzx(e.x as number)}%`, top: `${pzy(e.y as number)}%`, width: 22, height: 22, transform: 'translate(-50%, -50%) scale(calc(1 / var(--z, 1)))', opacity: sichtbarTeam(e.opfer) ? 1 : 0.2 }}>
                    <XZeichen farbe={farbeVon(e.opfer)} />
                  </button>
                ))}

                {/* Knocks: ein Kreis, der nach einigen Sekunden verschwindet */}
                {knocks && gerade.map((e, i) => (
                  <button key={`k${i}`} type="button" data-marker aria-label={t('Umgehauen')} {...marker(e)}
                    className="absolute z-10 block cursor-pointer rounded-full border-2 border-black p-0"
                    style={{ left: `${pzx(e.x as number)}%`, top: `${pzy(e.y as number)}%`, width: 16, height: 16, background: farbeVon(e.opfer), transform: 'translate(-50%, -50%) scale(calc(1 / var(--z, 1)))', opacity: sichtbarTeam(e.opfer) ? Math.max(0.25, 1 - (zeit - e.t) / KNOCK_DAUER) : 0.1 }} />
                ))}

                {/* 3D: Pfosten fuer die Eliminierungen */}
                {dreiD && tote.slice(-80).map((e, i) => (
                  <button key={`p${i}`} type="button" data-marker aria-label={t('Eliminiert')} {...marker(e)}
                    className="absolute block w-[5px] cursor-pointer border-0 p-0"
                    style={{ left: `${pzx(e.x as number)}%`, top: `${pzy(e.y as number)}%`, height: 46, background: farbeVon(e.opfer), boxShadow: '0 0 6px #000', transformOrigin: '50% 100%', transform: 'translate(-50%, -100%) rotateX(-90deg) scale(calc(1 / var(--z, 1)))', opacity: sichtbarTeam(e.opfer) ? 1 : 0.2 }} />
                ))}
              </div>
            </div>

            <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-100">
              {titel ?? ''} · {uhr(zeit - tStart)}
            </span>

            {/* Zoom */}
            <div className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-black/70 text-slate-100" data-knopf>
              <button type="button" data-knopf onClick={() => zoomUm(1.6)} className="px-3 py-1.5 text-base font-bold transition hover:bg-white/10" aria-label="Zoom in">+</button>
              <button type="button" data-knopf onClick={() => zoomUm(1 / 1.6)} className="border-t border-white/10 px-3 py-1.5 text-base font-bold transition hover:bg-white/10" aria-label="Zoom out">−</button>
              <button type="button" data-knopf onClick={() => setAnsicht({ z: 1, x: 0, y: 0 })} disabled={ansicht.z === 1} className="border-t border-white/10 px-3 py-1.5 text-[11px] font-bold tabular-nums transition hover:bg-white/10 disabled:opacity-40">{ansicht.z === 1 ? '1×' : `${ansicht.z.toFixed(1)}×`}</button>
            </div>

            {/* Das kleine Fenster ueber einem Zeichen */}
            {tip && (() => {
              const h = hud(tip.e);
              const breit = 232;
              const links = Math.min(Math.max(tip.links, breit / 2 + 6), tip.breite - breit / 2 - 6);
              const unten = tip.oben < 150;
              return (
                <div className="pointer-events-none absolute z-30 rounded-lg border border-white/15 bg-zinc-950/95 px-3 py-2 text-[11px] shadow-2xl"
                  style={{ left: links, top: tip.oben + (unten ? 30 : -8), width: breit, transform: unten ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}>
                  <p className="flex items-center gap-2 text-[13px] font-black text-slate-50">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: h.farbe }} />
                    <span className="truncate">{h.name}</span>
                  </p>
                  {h.mitspieler.length > 0 && <p className="mt-0.5 truncate text-[10px] text-slate-500">+ {h.mitspieler.join(' · ')}</p>}
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums text-slate-300">
                    {h.platz !== null && <span><T>Platz</T> <b className="text-slate-50">#{h.platz}</b></span>}
                    {h.punkte !== null && <span><T>Punkte</T> <b className="text-slate-50">{h.punkte}</b></span>}
                    <span>Elims <b className="text-slate-50">{h.kills}</b>{h.teamKills !== h.kills ? <span className="text-slate-500"> (Team {h.teamKills})</span> : null}</span>
                  </p>
                  <p className={`mt-1 text-[10px] ${tip.e.art === 'tot' ? 'text-rose-400' : 'text-amber-300'}`}>
                    {tip.e.art === 'tot' ? t('Eliminiert') : t('Umgehauen')} · {uhr(tip.e.t - tStart)}
                    {h.von ? <span className="text-slate-400"> {t('durch')} {h.von}{h.abstand !== null ? ` · ${h.abstand} m` : ''}</span> : <span className="text-slate-500"> · {t('Zone / Sturz')}</span>}
                  </p>
                </div>
              );
            })()}
          </div>

          {/* ------------------------------------------------ Steuerung */}
          <div className="mx-auto mt-3 w-full max-w-[860px] rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { if (zeit >= tEnde) setZeit(tStart); setLaeuft((l) => !l); }}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400" aria-label={laeuft ? t('Pause') : t('Abspielen')}>
                {laeuft ? '❚❚' : '▶'} <span className="ml-1"><T>{laeuft ? 'Pause' : 'Abspielen'}</T></span>
              </button>
              <button type="button" onClick={() => { setLaeuft(false); setZeit(tStart); }}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-sky-500/60"><T>Von vorn</T></button>
              <button type="button" onClick={() => naechstes('tot')}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-sky-500/60"><T>Nächste Eliminierung</T></button>
              <button type="button" onClick={() => naechstes('zone')}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-sky-500/60"><T>Nächste Zone</T></button>
              <div className="ml-auto flex items-center gap-1">
                {GESCHWINDIGKEIT.map((g) => (
                  <button key={g} type="button" onClick={() => setTempo(g)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-bold tabular-nums transition ${tempo === g ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}>{g}×</button>
                ))}
              </div>
            </div>
            <input type="range" min={tStart} max={tEnde} step={1} value={Math.round(zeit)} onChange={(e) => springe(Number(e.target.value))}
              className="mt-3 w-full accent-sky-400" aria-label={t('Zeit')} />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {(['2D', '3D'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setDreiD(m === '3D')}
                  className={`rounded-lg px-3 py-1.5 font-bold transition ${(m === '3D') === dreiD ? 'bg-sky-500 text-white shadow' : 'border border-white/10 text-slate-400 hover:text-slate-100'}`}>{m}</button>
              ))}
              <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-slate-400">
                <input type="checkbox" checked={knocks} onChange={(e) => setKnocks(e.target.checked)} className="accent-sky-400" /> <T>Knocks zeigen</T>
              </label>
              {teamWahl !== null && (
                <button type="button" onClick={() => setTeamWahl(null)} className="ml-auto rounded-lg border border-sky-500/40 px-3 py-1.5 font-semibold text-sky-300 transition hover:bg-sky-500/10">
                  <T>Auswahl aufheben</T>
                </button>
              )}
            </div>
          </div>

          {/* ------------------------------------------------ Legende */}
          <div className="mx-auto mt-3 w-full max-w-[860px] rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Legende</T></p>
            <ul className="grid gap-x-6 gap-y-2 text-[12px] leading-snug text-slate-300 sm:grid-cols-2">
              <li className="flex items-start gap-2.5"><span className="mt-0.5 shrink-0"><XZeichen farbe="#38bdf8" gross={18} /></span><span><T>Eliminierung: hier ist ein Spieler ausgeschieden. Die Farbe zeigt sein Team; das Zeichen bleibt stehen.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-black bg-amber-400" /><span><T>Knock: ein Spieler liegt am Boden. Der Kreis verschwindet nach 12 Sekunden - dann ist er aufgestanden oder ausgeschieden.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white" /><span><T>Weißer Ring: die Zone jetzt. Gestrichelt: die nächste Zone.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1.5 h-1 w-3.5 shrink-0 rounded bg-yellow-400" /><span><T>Pfeile: die Busroute. Gelb: wo man abspringen kann.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm bg-violet-600/60" /><span><T>Violette Fläche: der Sturm, außerhalb der Zone.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-0.5 h-4 w-1 shrink-0 bg-sky-400" /><span><T>3D: Die Pfosten stehen für Eliminierungen, die Wand ist die Zone.</T></span></li>
              <li className="text-slate-400"><T>Mausrad vergrößert die Karte, Ziehen verschiebt sie, Doppelklick setzt zurück. Fahre über ein Zeichen für Details.</T></li>
            </ul>
          </div>

          {/* ------------------------------------------------ Kurve */}
          <div className="mx-auto mt-3 w-full max-w-[860px] rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Spieler am Leben im Verlauf</T></p>
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="h-24 w-full cursor-pointer"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); springe(tStart + ((e.clientX - r.left) / r.width) * (tEnde - tStart)); }}>
              {match.zonen.map((z, i) => (
                <rect key={i} x={kx(z.schrumpftAb ?? 0)} y="0" width={Math.max(2, kx(z.schrumpftBis ?? 0) - kx(z.schrumpftAb ?? 0))} height="100" fill="#8b5cf6" fillOpacity={0.16} />
              ))}
              <polyline fill="none" stroke="#38bdf8" strokeWidth={2.5} vectorEffect="non-scaling-stroke"
                points={kurve.map(([z, n]) => `${kx(z)},${ky(n)}`).join(' ')} />
              <line x1={kx(zeit)} x2={kx(zeit)} y1="0" y2="100" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
            <p className="mt-1 text-[11px] text-slate-500"><T>Die violetten Streifen sind die Zeiten, in denen die Zone schrumpft. Ein Klick springt dorthin.</T></p>
          </div>
        </div>

        {/* ------------------------------------------------ Seitenleiste */}
        <aside className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 lg:sticky lg:top-4">
          <div className="flex gap-1 border-b border-white/[0.08] p-1.5">
            {([['feed', 'Kill-Feed'], ...(treffer.length ? [['treffer', 'Treffer'] as const] : []), ['teams', 'Teams'], ['spieler', 'Spieler']] as const).map(([k, name]) => (
              <button key={k} type="button" onClick={() => setReiter(k)}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}><T>{name}</T></button>
            ))}
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {reiter === 'feed' && (
              imFeed.length ? (
                <ul>
                  {imFeed.map((e, i) => {
                    const opfer = nachId.get(e.opfer ?? -1); const taeter = nachId.get(e.taeter ?? -1);
                    return (
                      <li key={`${e.t}-${i}`} className="border-b border-white/[0.04]">
                        <button type="button" onClick={() => springe(e.t)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-sky-500/[0.06]">
                          <span className="w-10 shrink-0 text-[11px] tabular-nums text-slate-500">{uhr(e.t - tStart)}</span>
                          <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-300">
                            {e.art === 'auf' ? (
                              <><b style={{ color: farbeVon(e.taeter) }}>{taeter ? nameVon(taeter) : t('Teamkamerad')}</b> <span className="text-emerald-400"><T>hilft hoch</T></span> <b style={{ color: farbeVon(e.opfer) }}>{nameVon(opfer)}</b></>
                            ) : (
                              <>{taeter && taeter.id !== opfer?.id ? <b style={{ color: farbeVon(e.taeter) }}>{nameVon(taeter)}</b> : <span className="text-slate-500"><T>Zone / Sturz</T></span>}
                                {' '}<span className={e.art === 'tot' ? 'text-rose-400' : 'text-amber-300'}>{e.art === 'tot' ? t('eliminiert') : t('knockt')}</span>{' '}
                                <b style={{ color: farbeVon(e.opfer) }}>{nameVon(opfer)}</b>
                                {typeof e.abstand === 'number' && e.abstand > 0 && <span className="ml-1 text-[10px] text-slate-600">{Math.round(e.abstand / 100)} m</span>}</>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="px-4 py-6 text-sm text-slate-500"><T>Bis hierhin ist noch nichts passiert. Drück auf Abspielen.</T></p>
            )}

            {reiter === 'treffer' && (
              trefferBis.length ? (
                <ul>
                  {[...trefferBis].reverse().slice(0, 120).map((h, i) => {
                    const von = nachId.get(h[1]); const an = nachId.get(h[2]);
                    return (
                      <li key={`${h[0]}-${i}`} className="border-b border-white/[0.04]">
                        <button type="button" onClick={() => springe(h[0])} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition hover:bg-sky-500/[0.06]">
                          <span className="w-10 shrink-0 text-[11px] tabular-nums text-slate-500">{uhr(h[0] - tStart)}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-slate-300">
                            <b style={{ color: farbeVon(h[1]) }}>{nameVon(von)}</b> <span className="text-slate-500">→</span> <b style={{ color: farbeVon(h[2]) }}>{nameVon(an)}</b>
                            {h[5] ? <span className="ml-1 text-[10px] text-amber-300/80"><T>am Boden</T></span> : null}
                          </span>
                          <span className={`shrink-0 text-[12px] font-bold tabular-nums ${h[6] ? 'text-rose-400' : h[4] ? 'text-amber-300' : 'text-slate-200'}`}>
                            {h[3]}{h[4] ? <span className="ml-0.5 text-[10px]">HS</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="px-4 py-6 text-sm text-slate-500"><T>Bis hierhin ist noch nichts passiert. Drück auf Abspielen.</T></p>
            )}

            {reiter === 'teams' && (
              <ul>
                {teams.map((x) => {
                  const lebt = x.spieler.some((s) => lebtBei(s, zeit));
                  const pk = punkteVon(x.platz, x.kills);
                  return (
                    <li key={x.team} className="border-b border-white/[0.04]">
                      <button type="button" onClick={() => setTeamWahl(teamWahl === x.team ? null : x.team)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-sky-500/[0.06] ${teamWahl === x.team ? 'bg-sky-500/10' : ''}`}>
                        <span className={`w-6 shrink-0 text-right text-[11px] font-black tabular-nums ${x.platz === 1 ? 'text-amber-300' : 'text-slate-500'}`}>{x.platz < 999 ? x.platz : '–'}</span>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FARBEN[x.team % FARBEN.length], opacity: lebt ? 1 : 0.3 }} />
                        <span className="flex min-w-0 flex-1 flex-col text-[11px] font-bold uppercase leading-[1.25]" style={{ opacity: lebt ? 1 : 0.5 }}>
                          {x.spieler.map((s) => <span key={s.id} className="truncate text-slate-100">{ohneVorsatz(s.name)}</span>)}
                        </span>
                        <span className="shrink-0 text-right text-[11px] tabular-nums text-slate-400">{pk !== null ? <><b className="text-slate-100">{pk}</b> {t('Punkte')} · </> : null}{x.kills} <T>Elims</T></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {reiter === 'spieler' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-9 px-3 py-2">#</th><th className="px-2 py-2"><T>Spieler</T></th><th className="px-2 py-2 text-right">Elims</th>{treffer.length > 0 && <th className="px-2 py-2 text-right">Damage</th>}<th className="px-3 py-2 text-right"><T>Ausgeschieden</T></th>
                  </tr>
                </thead>
                <tbody>
                  {[...echte].sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999) || (b.kills ?? 0) - (a.kills ?? 0)).map((s) => (
                    <tr key={s.id} className="border-b border-white/[0.04]" style={{ opacity: lebtBei(s, zeit) ? 1 : 0.5 }}>
                      <td className="px-3 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{s.platz && s.platz < 999 ? s.platz : '–'}</td>
                      <td className="px-2 py-1.5 text-[12px] font-bold uppercase text-slate-100">{ohneVorsatz(s.name)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{s.kills ?? 0}</td>
                      {treffer.length > 0 && <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{Math.round(schadenBis.get(s.id) ?? 0).toLocaleString()}</td>}
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{typeof s.tod === 'number' ? uhr(s.tod - tStart) : <T>Sieger</T>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------ Zonen */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40">
        <p className="border-b border-white/[0.08] bg-zinc-900/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300"><T>Zonen</T></p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-2">#</th><th className="px-3 py-2"><T>Beginn</T></th><th className="px-3 py-2 text-right"><T>Radius</T></th><th className="px-3 py-2 text-right"><T>Danach</T></th><th className="px-3 py-2 text-right"><T>Schrumpft</T></th>
              </tr>
            </thead>
            <tbody>
              {match.zonen.map((z, i) => (
                <tr key={i} className={`border-b border-white/[0.04] transition hover:bg-sky-500/[0.05] ${zone.phase === i + 1 ? 'bg-sky-500/[0.08]' : ''}`}>
                  <td className="px-4 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{i + 1}</td>
                  <td className="px-3 py-1.5"><button type="button" onClick={() => springe(z.schrumpftAb ?? tStart)} className="tabular-nums text-sky-300 hover:underline">{uhr((z.schrumpftAb ?? 0) - tStart)}</button></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{Math.round((z.radius ?? 0) / 100)} m</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{Math.round((z.naechsterRadius ?? 0) / 100)} m</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{Math.round((z.schrumpftBis ?? 0) - (z.schrumpftAb ?? 0))} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {/* ------------------------------------------------ Spielerwerte des ganzen Matches */}
      {(match.schaden?.length || match.zusatz?.length) ? (() => {
        /*
         * Was das Replay je Spieler fuer das ganze Match hergibt (Aufgabe 113: "Werte, die nur die Replay-Analyse liefert"): Schaden ausgeteilt und eingesteckt, Treffer,
         * Kopftreffer, Zeit im Sturm, wie oft wiederbelebt und rebootet. Jede Spalte steht nur da, wenn das Replay sie fuer dieses Match fuehrt - fuer alle Spieler gleich.
         */
        const sch = new Map((match.schaden ?? []).map((x) => [x.id, x]));
        const zu = new Map((match.zusatz ?? []).map((x) => [x.id, x]));
        const mitSchaden = sch.size > 0; const mitZusatz = zu.size > 0;
        const zeilen = [...echte].sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999) || (b.kills ?? 0) - (a.kills ?? 0));
        const sek = (n?: number) => (typeof n === 'number' ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}` : '0:00');
        return (
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40">
            <p className="border-b border-white/[0.08] bg-zinc-900/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300"><T>Spielerwerte des Matches</T></p>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-10 px-4 py-2">#</th><th className="px-3 py-2"><T>Spieler</T></th><th className="px-3 py-2 text-right">Elims</th>
                    {mitSchaden && <><th className="px-3 py-2 text-right">Damage</th><th className="px-3 py-2 text-right"><T>Eingesteckt</T></th><th className="px-3 py-2 text-right"><T>Treffer</T></th><th className="px-3 py-2 text-right"><T>Kopftreffer</T></th></>}
                    {mitZusatz && <><th className="px-3 py-2 text-right"><T>Im Sturm</T></th><th className="px-3 py-2 text-right"><T>Wiederbelebt</T></th><th className="px-3 py-2 text-right">Reboots</th></>}
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((sp) => {
                    const a = sch.get(sp.id); const z = zu.get(sp.id);
                    return (
                      <tr key={sp.id} className={`border-b border-white/[0.04] transition hover:bg-sky-500/[0.05] ${wahlTeam?.spieler.some((x) => x.id === sp.id) ? 'bg-sky-500/[0.08]' : ''}`}>
                        <td className="px-4 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{sp.platz && sp.platz < 999 ? sp.platz : '–'}</td>
                        <td className="px-3 py-1.5 text-[12px] font-bold uppercase" style={{ color: farbeVon(sp.id) }}>{ohneVorsatz(sp.name)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{sp.kills ?? 0}</td>
                        {mitSchaden && <>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-100">{Math.round(a?.gemachtOhneBoden ?? a?.gemacht ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{Math.round(a?.genommen ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{a?.treffer ?? 0}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-amber-300/90">{a?.krit ?? 0}</td>
                        </>}
                        {mitZusatz && <>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{sek(z?.sturmSek)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{z?.wiederbelebt ?? 0}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{z?.rebootet ?? 0}</td>
                        </>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })() : null}
      {wahlTeam && (
        <p className="text-xs text-slate-400"><T>Markiert</T>: {wahlTeam.spieler.map((s) => ohneVorsatz(s.name)).join(' · ')}</p>
      )}
    </div>
  );
}
