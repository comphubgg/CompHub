'use client';

/*
 * Die Replay-Ansicht eines Games - Karte, Zeitleiste, Kill-Feed, Teams.
 *
 * Der Betreiber (13.10.2026): die Replay-Funktion soll eine eigene, dauerhafte Seite sein wie bei Osirion - 2D und 3D, zu jedem Game,
 * ueber eine Adresse, die sich nie aendert. Gespielt wird, was die Server-Replays hergeben (tools/replay-voll): die Zonen jedes Games
 * mit Beginn und Ende des Schrumpfens, jeder Knock und jede Eliminierung mit Ort und Zeit, die Spieler mit Team und Platz. Die 3D-Ansicht
 * ist am 15.11.2026 entfallen (Betreiber: "das ist kein echtes 3D"); die Spieler laufen mit ihren Orten aus dem vollen Replay ueber die Karte.
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
import { inselKarte } from '@/app/replays/inselKarten';
import { KartenHud, SchussEbene, SpielerPunkte, SpurEbene, ortBei, useSpielerDaten, type SpielerDaten } from '@/app/replays/SpielerEbene';
import { EinstellungenKnopf, Flagge, KartenFeed, Zeichenflaeche, useEinstellungen, type FeedZeile } from '@/app/replays/Werkzeuge';
import SeitenPanel from '@/app/replays/SeitenPanel';
import Analysen from '@/app/replays/Analysen';
import { mitBusStart } from '@/app/replays/analyse';

export interface RSpieler {
  id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number;
  kills?: number; teamKills?: number; tod?: number; todX?: number; todY?: number; plattform?: string;
}
export interface REreignis { t: number; opfer?: number; taeter?: number; art: 'auf' | 'unten' | 'tot'; x?: number; y?: number; abstand?: number; ursache?: number | null }

/*
 * Die Todesursache aus dem Replay (Fortnites EDeathCause) als Waffenart wie bei Osirion - am Performance-Finale (8.11.2026) Zeile fuer Zeile gegen
 * Osirions Feed desselben Matches abgeglichen: 2 Pistol, 3 Shotgun, 4 Rifle, 5 SMG, 8 Melee, 17 DBNO Timeout. Die uebrigen nach Fortnites Liste.
 */
const URSACHE: Record<number, string> = {
  0: 'Storm', 1: 'Fall Damage', 2: 'Pistol', 3: 'Shotgun', 4: 'Rifle', 5: 'SMG', 6: 'Sniper', 7: 'Sniper', 8: 'Melee', 10: 'Grenade', 11: 'C4',
  12: 'Grenade Launcher', 13: 'Rocket Launcher', 14: 'Minigun', 15: 'Bow', 16: 'Trap', 17: 'DBNO Timeout', 23: 'Vehicle', 24: 'LMG',
};
export interface RZone { radius?: number; naechsterRadius?: number; x?: number; y?: number; schrumpftAb?: number; schrumpftBis?: number }
export interface RMatch extends SpielerDaten {
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
const GESCHWINDIGKEIT = [1, 2, 5, 10, 20, 50];
// 16-fach, darueber wird das Kartenbild nur Pixel (Betreiber, 30.10.2026: "zu wenig Zoom ... man erkennt die Spieler gar nicht") - die Zeichen bleiben dabei gleich gross.
const MAX_ZOOM = 16;
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

export default function ReplayAnsicht({ match: roh, kartenBild: grosseKarte, titel, wertung, hervorheben, kopf, games }: {
  match: RMatch; kartenBild: string | null; titel?: string; wertung?: RWertung | null;
  /** Kopf der rechten Leiste: Cup und Game */
  kopf?: string;
  /** die Games des Spieltags (Auswahl unter der Karte) */
  games?: Array<{ nr: number; href: string; aktiv: boolean }>;
  /** Epic-Konto, dessen Team von Anfang an markiert ist (die eigenen Spiele unter "Meine Cups"). */
  hervorheben?: string;
}) {
  /*
   * Spieler starten im Bus (Betreiber, 15.11.2026): Orte vor dem Bus (die Startinsel) fallen weg; der erste Ort jedes Spielers ist der Bus im
   * Augenblick seines Absprungs - aus "figuren" (neue Figur nach dem Bus = Absprung), sonst der Punkt der Route, der seiner Landung am naechsten liegt.
   * Von dort gleitet er geradlinig bis zu seinem ersten Ort am Boden.
   */
  const match = useMemo<typeof roh>(() => mitBusStart(roh), [roh]);
  // Reload-Inseln: Bild und geeichter Ausschnitt (app/replays/inselKarten) - die grosse Karte kommt wie bisher von der Seite.
  const insel = useMemo(() => (/^Athena_Empty/i.test((match as { karte?: string }).karte ?? '') ? inselKarte(match.playlist) : null), [match]);
  const kartenBild = grosseKarte ?? insel?.bild ?? null;
  const t = useT();
  const echte = useMemo(() => match.spieler.filter((s) => !s.bot), [match.spieler]);
  const feed = useMemo(() => [...match.feed].sort((a, b) => a.t - b.t), [match.feed]);
  const nachId = useMemo(() => new Map(match.spieler.map((s) => [s.id, s])), [match.spieler]);

  /*
   * Der Ausschnitt der Welt. Die grosse Insel ("Hera_..._Terrain") hat feste Grenzen; die kleinen Reload-Inseln ("Athena_Empty") haben ein
   * anderes Mass, und ein Kartenbild gibt es dort nicht - der Ausschnitt wird dann aus den Zonen und den Orten der Eliminierungen gebildet.
   */
  // Das Kartenbild selbst: welcher Weltausschnitt es abdeckt.
  const bildRahmen = useMemo(() => (insel ? { x0: insel.x0, y0: insel.y0, spanne: insel.spanne } : { x0: -BR_SPANNE, y0: -BR_SPANNE, spanne: 2 * BR_SPANNE }), [insel]);
  const welt = useMemo(() => {
    // Mit Spielerorten: die Hauptinsel, wo gespielt wurde (Orte ab dem Bus, 1.-99. Perzentil, dazu die Zonen ab Kreis 2) - die Startinsel bleibt draussen.
    const orte = Object.values((match as { orte?: Record<string, number[][]> }).orte ?? {}).flat();
    if (orte.length > 50) {
      const xs = orte.map((o) => o[1]).sort((a, b) => a - b); const ys = orte.map((o) => o[2]).sort((a, b) => a - b);
      const q = (l: number[], f: number) => l[Math.min(l.length - 1, Math.max(0, Math.floor(f * l.length)))];
      let x0 = q(xs, 0.01); let x1 = q(xs, 0.99); let y0 = q(ys, 0.01); let y1 = q(ys, 0.99);
      for (const z of match.zonen.slice(1)) { if (typeof z.x === 'number' && typeof z.y === 'number' && typeof z.radius === 'number' && z.radius < 80_000) { x0 = Math.min(x0, z.x - z.radius); x1 = Math.max(x1, z.x + z.radius); y0 = Math.min(y0, z.y - z.radius); y1 = Math.max(y1, z.y + z.radius); } }
      const spanne = Math.max(x1 - x0, y1 - y0) * 1.1;
      return { x0: (x0 + x1) / 2 - spanne / 2, y0: (y0 + y1) / 2 - spanne / 2, spanne };
    }
    if (insel) return insel.ausschnitt;
    if (kartenBild) return { x0: -BR_SPANNE, y0: -BR_SPANNE, spanne: 2 * BR_SPANNE };
    const xs: number[] = []; const ys: number[] = [];
    for (const z of match.zonen) { if (typeof z.x === 'number' && typeof z.y === 'number') { const r = z.radius ?? 0; xs.push(z.x - r, z.x + r); ys.push(z.y - r, z.y + r); } }
    for (const e of match.feed) { if (typeof e.x === 'number') xs.push(e.x); if (typeof e.y === 'number') ys.push(e.y); }
    if (!xs.length || !ys.length) return { x0: -BR_SPANNE, y0: -BR_SPANNE, spanne: 2 * BR_SPANNE };
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const spanne = Math.max(x1 - x0, y1 - y0) * 1.08;
    return { x0: (x0 + x1) / 2 - spanne / 2, y0: (y0 + y1) / 2 - spanne / 2, spanne };
  }, [kartenBild, insel, match]);
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
    // Volles Replay mit Bus: die Zeitleiste beginnt mit dem Abflug des Busses (Landung und erster Loot sind dann im Verlauf).
    if (typeof match.busAb === 'number' && match.orte && Object.keys(match.orte).length) return Math.max(0, Math.floor(match.busAb));
    const innen = feed.filter(aufKarte);
    for (let i = 0; i < innen.length; i += 1) {
      const dicht = innen.filter((e) => e.t >= innen[i].t && e.t <= innen[i].t + 60).length;
      if (dicht >= 3) return Math.max(0, Math.floor(innen[i].t - 40));
    }
    const erster = Math.min(innen[0]?.t ?? Infinity, match.zonen[0]?.schrumpftAb ?? Infinity);
    return Number.isFinite(erster) ? Math.max(0, Math.floor(erster - 45)) : 0;
  }, [feed, match.zonen, aufKarte, match.busAb, match.orte]);
  const tEnde = useMemo(() => Math.ceil(Math.max(match.ende ?? 0, feed[feed.length - 1]?.t ?? 0, match.zonen[match.zonen.length - 1]?.schrumpftBis ?? 0)), [match.ende, feed, match.zonen]);

  const [zeit, setZeit] = useState(tStart);
  const [laeuft, setLaeuft] = useState(false);
  const [tempo, setTempo] = useState(5);
  const [knocks, setKnocks] = useState(true);
  const [teamWahl, setTeamWahl] = useState<number | null>(null);
  // Einstellungen der Karte (Zahnrad), Zeichnen, Legende - app/replays/Werkzeuge.
  const [ein, setzeEin] = useEinstellungen();
  const [zeichnen, setZeichnen] = useState(false);
  const [leeren, setLeeren] = useState(0);
  const [legende, setLegende] = useState(false);
  // Auge: Spielerleiste und Kill-Feed ausblenden. Vollbild fuer den Kartenrahmen.
  const [ruhig, setRuhig] = useState(false);
  const [vollbild, setVollbild] = useState(false);
  useEffect(() => {
    const f = () => setVollbild(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  // Flaggen nur aus unseren Profilen (die Antwort von /api/replay?match= bringt sie als laender: Epic-Konto -> Kuerzel).
  const laender = (match as { laender?: Record<string, string> }).laender;
  const landVon = useCallback((id?: number) => { const e = nachId.get(id ?? -1)?.epic; return e ? laender?.[e.toLowerCase()] : undefined; }, [nachId, laender]);
  // Der angeklickte Spieler (Lebenspunkte, Inventar, Treffer) - die Spieler laufen ueber die Karte, wo das Replay ihre Orte fuehrt (app/replays/SpielerEbene).
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const sd = useSpielerDaten(match);
  // Anfangs niemand gewaehlt: rechts steht die Spielerliste (Betreiber, 15.11.2026).
  useEffect(() => { setGewaehlt(null); }, [match]);
  useEffect(() => {
    setZeit(tStart); setLaeuft(false);
    const eigen = hervorheben ? match.spieler.find((s) => s.epic === hervorheben)?.team : undefined;
    setTeamWahl(typeof eigen === 'number' ? eigen : null);
  }, [tStart, match, hervorheben]);

  // Zoom und Verschiebung der Karte: z = Vergroesserung, x/y = Verschiebung in Bildpunkten.
  const [ansicht, setAnsicht] = useState({ z: 1, x: 0, y: 0 });
  // Breite des Kartenrahmens in Bildpunkten (fuer das Ausweichen der Namensschilder).
  const [kartenBreite, setKartenBreite] = useState(800);
  useEffect(() => {
    const el = kartenRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setKartenBreite(el.getBoundingClientRect().width || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
   * dazu der Schaden je Spieler bis hierhin (ohne Treffer auf schon Umgehauene - wie die Damage-Werte der Seite). Lebenspunkte, Orte, Schuesse und Loot: SpielerEbene.
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
  /*
   * Der Feed wie bei Osirion: Waffenart (eine Elimination ohne eigene Ursache erbt die vom Knock davor), Entfernung und der laufende Elim-Zaehler dessen,
   * dem der Kill gutgeschrieben wird (der umgehauen hat - siehe Erinnerung kill-geht-an-den-knocker). Filter: alle Spieler oder nur das Team des Gewaehlten.
   */
  const feedInfo = useMemo(() => {
    const knock = new Map<number, REreignis>(); const elims = new Map<number, number>();
    return feed.map((e) => {
      if (e.art === 'unten' && e.opfer !== undefined) knock.set(e.opfer, e);
      const vorKnock = e.art === 'tot' && e.opfer !== undefined ? knock.get(e.opfer) : undefined;
      const ursache = e.ursache ?? vorKnock?.ursache ?? null;
      const rueckkehr = e.art === 'tot' && e.ursache === 50;
      let gutschrift: number | null = null; let zahl: number | null = null;
      if (e.art === 'tot' && !rueckkehr) {
        gutschrift = vorKnock && vorKnock.taeter !== undefined && e.t - vorKnock.t <= 50 ? vorKnock.taeter : e.taeter ?? null;
        if (gutschrift !== null && gutschrift !== e.opfer) { zahl = (elims.get(gutschrift) ?? 0) + 1; elims.set(gutschrift, zahl); } else gutschrift = null;
        if (e.opfer !== undefined) knock.delete(e.opfer);
      }
      return { waffe: ursache === null || ursache === 50 ? null : URSACHE[ursache] ?? null, rueckkehr, gutschrift, zahl };
    });
  }, [feed]);
  const feedEintraege = useMemo(() => feed.map((e, i) => ({ e, waffe: feedInfo[i]?.waffe ?? null, gutschrift: feedInfo[i]?.gutschrift ?? null, rueckkehr: Boolean(feedInfo[i]?.rueckkehr) })), [feed, feedInfo]);
  // Kill-Feed oben links auf der Karte: verblasst nach 6 s Spielzeit, bei schnellem Abspielen entsprechend laenger.
  const kartenFeed = useMemo<FeedZeile[]>(() => feedEintraege.filter((f) => (f.e.art === 'tot' || f.e.art === 'unten') && !f.rueckkehr && f.e.opfer !== undefined).map((f, i) => {
    const an = nachId.get(f.e.opfer ?? -1); const von = f.e.taeter !== undefined && f.e.taeter !== f.e.opfer ? nachId.get(f.e.taeter) : undefined;
    return {
      schluessel: `${f.e.t}-${i}`, t: f.e.t, art: f.e.art as 'unten' | 'tot', waffe: f.waffe,
      von: von ? { name: nameVon(von), land: landVon(von.id), farbe: farbeVon(von.id) } : null,
      an: { name: nameVon(an), land: landVon(an?.id), farbe: farbeVon(an?.id) },
    };
  }), [feedEintraege, nachId, landVon]); // eslint-disable-line react-hooks/exhaustive-deps
  const feedDauer = 6 * Math.max(1, tempo / 4);
  // Ortsnamen: nur fuer die grosse Insel (aktuelle Karte, /api/fortnite-map) - die Reload-Inseln haben keine.
  const [ortsnamen, setOrtsnamen] = useState<Array<{ name: string; links: number; oben: number }>>([]);
  const ortsnamenDa = Boolean(kartenBild && !insel);
  useEffect(() => {
    if (!ortsnamenDa) return undefined;
    let weg = false;
    fetch('/api/fortnite-map').then((r) => r.json()).then((j) => { if (!weg && Array.isArray(j?.orte)) setOrtsnamen(j.orte); }).catch(() => {});
    return () => { weg = true; };
  }, [ortsnamenDa]);
  // Fokus: nur der gewaehlte Spieler kraeftig. Folgen: die Karte haelt ihn in der Mitte.
  const fokusAn = ein.fokus && gewaehlt !== null;
  const sichtbarSpieler = (id?: number) => (fokusAn ? id === gewaehlt : sichtbarTeam(id));
  useEffect(() => {
    if (!ein.folgen || gewaehlt === null) return;
    const o = ortBei(sd.orte.get(gewaehlt), zeit);
    const r = kartenRef.current?.getBoundingClientRect();
    if (!o || !r) return;
    setAnsicht((a) => {
      const z = Math.max(a.z, 3);
      return klemme(z, r.width / 2 - (pzx(o.x) / 100) * r.width * z, r.height / 2 - (pzy(o.y) / 100) * r.height * z, r.width, r.height);
    });
  }, [ein.folgen, gewaehlt, zeit, sd.orte]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leertaste: Abspielen / Pause (nicht in Eingabefeldern).
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement | null)?.closest('input, textarea, select, button')) return;
      e.preventDefault();
      setLaeuft((l) => { if (!l && zeit >= tEnde) setZeit(tStart); return !l; });
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [zeit, tEnde, tStart]);
  /** Zu einem Ort auf der Karte heranfahren (Verlauf in der rechten Leiste). */
  const zeigeOrt = (x: number, y: number) => {
    const r = kartenRef.current?.getBoundingClientRect();
    if (!r) return;
    setAnsicht((a) => { const z = Math.max(a.z, 4); return klemme(z, r.width / 2 - (pzx(x) / 100) * r.width * z, r.height / 2 - (pzy(y) / 100) * r.height * z, r.width, r.height); });
  };
  // Hoehe des Gewaehlten (Meter ueber dem Meer) und ob er noch im Bus sitzt.
  const gewOrte = gewaehlt !== null ? sd.orte.get(gewaehlt) : undefined;
  const gewHoehe = (() => { if (!gewOrte?.length) return null; let lo = 0; let hi = gewOrte.length - 1; let r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (gewOrte[m][0] <= zeit) { r = m; lo = m + 1; } else hi = m - 1; } return r >= 0 && typeof gewOrte[r][3] === 'number' ? gewOrte[r][3] / 100 : null; })();
  const imBus = gewaehlt !== null && typeof match.busAb === 'number' && zeit >= match.busAb && gewOrte?.length ? zeit < gewOrte[0][0] : false;

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
        // Das ganze Kartenbild, so verschoben und vergroessert, dass genau der Ausschnitt den Rahmen fuellt.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={kartenBild} alt="" className="absolute max-w-none" draggable={false}
          style={{ filter: ein.grau ? 'grayscale(1) brightness(.8)' : undefined, left: `${((bildRahmen.x0 - welt.x0) / welt.spanne) * 100}%`, top: `${((bildRahmen.y0 - welt.y0) / welt.spanne) * 100}%`, width: `${(bildRahmen.spanne / welt.spanne) * 100}%`, height: `${(bildRahmen.spanne / welt.spanne) * 100}%` }} />
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
        {(ein.bus ? match.bus ?? [] : []).map((b, i) => {
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
            <g key={`bus${i}`} opacity={imFlug !== null && imFlug > flug + 90 ? 0.3 : 1}>
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
              {/* Der Battlebus selbst statt eines Punkts (Betreiber, 8.11.2026), in Flugrichtung gedreht - das Bild zeigt mit der Front nach oben. */}
              {jetzt && (
                <image href="/replay/battlebus.webp" x={pzx(jetzt.x) - 3.2} y={pzy(jetzt.y) - 3.2} width={6.4} height={6.4}
                  transform={`rotate(${b.yaw + 90} ${pzx(jetzt.x)} ${pzy(jetzt.y)})`} style={{ filter: 'drop-shadow(0 0 0.4px #000)' }} />
              )}
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
        {/* ------------------------------------------------ Karte */}
        <div>
          <div ref={kartenRef}
            className={`relative mx-auto aspect-square w-full ${sd.da ? 'max-w-[1150px]' : 'max-w-[860px]'} touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-sky-950`}
            style={{ cursor: ansicht.z > 1 ? 'grab' : 'default' }}
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
            <div className="absolute inset-0">
              <div className="absolute inset-0"
                style={{ transformOrigin: '0 0', transform: `translate(${ansicht.x}px, ${ansicht.y}px) scale(${ansicht.z})`, '--z': ansicht.z, '--zs': Math.pow(ansicht.z, 0.65) } as CSSProperties}>
                <div className="absolute inset-0 overflow-hidden rounded-xl shadow-2xl">{kartenInhalt}</div>

                {/* Eliminierungen: ein X in der Farbe des Teams - bleibt stehen */}
                {ein.elims && tote.map((e, i) => (
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

                {ein.spuren && <SpurEbene d={sd} zeit={zeit} spieler={echte.map((s) => ({ id: s.id, name: nameVon(s), tod: s.tod }))} pzx={pzx} pzy={pzy} farbeVon={farbeVon} sichtbar={sichtbarSpieler} ereignisse={ein.spurEreignisse} gewaehlt={gewaehlt} />}
                {ortsnamenDa && ein.orte && ortsnamen.map((o) => (
                  <span key={o.name} className="pointer-events-none absolute z-[12] whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-white/85"
                    style={{ left: `${pzx(-BR_SPANNE + (o.links / 100) * 2 * BR_SPANNE)}%`, top: `${pzy(-BR_SPANNE + (o.oben / 100) * 2 * BR_SPANNE)}%`, transform: 'translate(-50%, -50%) scale(calc(var(--zs, 1) / var(--z, 1)))', textShadow: '0 0 3px #000, 0 0 2px #000' }}>{o.name}</span>
                ))}
                <SchussEbene d={sd} zeit={zeit} pzx={pzx} pzy={pzy} sichtbar={sichtbarSpieler} gewaehlt={fokusAn ? null : gewaehlt} linien={ein.schuesse} zahlen={ein.schaden} />
                <SpielerPunkte d={sd} zeit={zeit} spieler={echte.map((s) => ({ id: s.id, name: nameVon(s), tod: s.tod, team: s.team }))} pzx={pzx} pzy={pzy}
                  farbeVon={farbeVon} sichtbar={sichtbarSpieler} balken={ein.hp} pfeil={ein.richtung}
                  gewaehlt={gewaehlt} waehle={setGewaehlt} namenZeigen={ein.namen} zoom={ansicht.z} rahmenBreite={kartenBreite} />

              </div>
            </div>

            {(() => {
              // Oben links wie bei Osirion: wer lebt (bei Duo/Trio/Squad Teams und Spieler getrennt), die Zeit, die Sturmphase und wann der Sturm kommt.
              const mitTeams = teams.length < echte.length;
              const naechste = match.zonen.find((z) => (z.schrumpftAb ?? 0) > zeit);
              const pille = 'flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 text-[13px] font-bold tabular-nums text-white';
              return (
                <div className="pointer-events-none absolute left-2 top-2 z-30 flex max-w-[calc(100%-150px)] flex-col items-start gap-1.5">
                <div className="flex flex-wrap gap-1">
                  {sd.da && <span className="flex items-center rounded bg-amber-400 px-2 py-1 text-[12px] font-black tracking-wider text-black">BETA</span>}
                  <span className={pille}><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><circle cx="10" cy="6" r="4" /><path d="M2 19c0-5 4-7 8-7s8 2 8 7z" /></svg>{lebende}/{echte.length}</span>
                  {mitTeams && <span className={pille}><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><circle cx="6" cy="7" r="3" /><circle cx="14" cy="7" r="3" /><path d="M0 18c0-4 3-6 6-6s6 2 6 6zM8 18c0-4 3-6 6-6s6 2 6 6z" /></svg>{teamsLeben}/{teams.length}</span>}
                  <span className={pille}><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="8" /><path d="M10 5v5l3 2" /></svg>{uhr(zeit - tStart)}</span>
                  <span className={pille}><svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M10 1l3 7-3 2 4 9-9-11 4-2-3-5z" /></svg>{zone.phase}/{match.zonen.length}</span>
                  <span className={pille + ' !font-semibold'}>{zone.schrumpft ? <span className="text-violet-300"><T>Sturm zieht</T></span> : naechste ? <><T>Sturm in</T> {uhr((naechste.schrumpftAb ?? 0) - zeit)}</> : <T>Letzte Zone</T>}</span>
                </div>
                {ein.feed && !ruhig && <KartenFeed zeilen={kartenFeed} zeit={zeit} dauer={feedDauer} />}
                </div>
              );
            })()}

            {sd.da && (
              <KartenHud d={sd} zeit={zeit} s={gewaehlt !== null && nachId.get(gewaehlt) ? { id: gewaehlt, name: nameVon(nachId.get(gewaehlt)), tod: nachId.get(gewaehlt)?.tod } : null}
                farbe={farbeVon(gewaehlt ?? -1)} inventar={ein.inventar && !ruhig}
                vorName={gewaehlt !== null ? <Flagge land={landVon(gewaehlt)} /> : null}
                zusatz={gewaehlt !== null && !ruhig ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[11px] font-semibold text-slate-300">
                    {imBus && <span className="rounded bg-amber-400 px-1.5 text-[10px] font-black uppercase text-black"><T>On the bus</T> · <T>jumps at</T> {uhr((gewOrte?.[0]?.[0] ?? zeit) - tStart)}</span>}
                    <span>Elims <b className="tabular-nums text-white">{feedEintraege.filter((f) => f.e.t <= zeit && f.gutschrift === gewaehlt).length}</b></span>
                    {(() => { const pl = nachId.get(gewaehlt)?.platz; return pl && pl < 999 ? <span><T>Placement</T> <b className="tabular-nums text-white">#{pl}</b></span> : null; })()}
                    {gewHoehe !== null && <span title={t('Height above sea level')}>▲ <b className="tabular-nums text-white">{Math.round(gewHoehe)} m</b></span>}
                  </p>
                ) : null}
                steuerung={(
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <button type="button" data-knopf onClick={() => { if (zeit >= tEnde) setZeit(tStart); setLaeuft((l) => !l); }} className="grid h-7 w-7 place-items-center rounded bg-white/15 hover:bg-white/25" aria-label={laeuft ? t('Pause') : t('Abspielen')}>{laeuft ? '❚❚' : '▶'}</button>
                    <button type="button" data-knopf onClick={() => setTempo(GESCHWINDIGKEIT[Math.max(0, GESCHWINDIGKEIT.indexOf(tempo) - 1)])} className="grid h-7 w-6 place-items-center rounded bg-white/15 hover:bg-white/25" aria-label="-">−</button>
                    <span className="w-7 text-center tabular-nums">{tempo}×</span>
                    <button type="button" data-knopf onClick={() => setTempo(GESCHWINDIGKEIT[Math.min(GESCHWINDIGKEIT.length - 1, GESCHWINDIGKEIT.indexOf(tempo) + 1)])} className="grid h-7 w-6 place-items-center rounded bg-white/15 hover:bg-white/25" aria-label="+">+</button>
                    <span className="tabular-nums">{uhr(zeit - tStart)}</span>
                    <input type="range" data-knopf min={tStart} max={tEnde} step={1} value={Math.round(zeit)} onChange={(e) => springe(Number(e.target.value))} className="min-w-0 flex-1 accent-white" aria-label={t('Zeit')} />
                    <span className="tabular-nums text-slate-300">{uhr(tEnde - tStart)}</span>
                  </div>
                )} />
            )}

            {/* Zeichnen: Leinwand ueber der Karte */}
            <Zeichenflaeche an={zeichnen} leeren={leeren} beenden={() => setZeichnen(false)} />
            {/* Einstellungen (Zahnrad) und Zoom */}
            <div className="absolute right-3 top-3 z-[45] flex gap-1" data-knopf>
              <button type="button" data-knopf onClick={() => setRuhig((x) => !x)} aria-label={t('Hide player bar and kill feed')} title={t('Hide player bar and kill feed')}
                className={`grid h-9 w-9 place-items-center rounded-lg border bg-black/70 text-slate-100 transition hover:bg-white/10 ${ruhig ? 'border-sky-500 text-sky-300' : 'border-white/15'}`}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{ruhig && <path d="M3 3l18 18" />}</svg>
              </button>
              <button type="button" data-knopf aria-label={t('Fullscreen')} title={t('Fullscreen')}
                onClick={() => { try { if (document.fullscreenElement) void document.exitFullscreen(); else void kartenRef.current?.requestFullscreen(); } catch { /* ohne Vollbild */ } }}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-black/70 text-slate-100 transition hover:bg-white/10">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{vollbild ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /> : <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />}</svg>
              </button>
              <EinstellungenKnopf e={ein} setze={setzeEin} ortsnamenDa={ortsnamenDa} spielerDa={sd.da}
                zeichnen={zeichnen} setZeichnen={setZeichnen} zuruecksetzen={() => { setAnsicht({ z: 1, x: 0, y: 0 }); setLeeren((n) => n + 1); }}
                legende={legende} setLegende={setLegende} />
            </div>
            {legende && (
              <div className="absolute right-3 top-14 z-40 w-64 rounded-xl border border-white/15 bg-zinc-950/95 p-3 text-[11px] text-slate-300 shadow-2xl" data-knopf>
                <p className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300/80"><T>Icon legend</T><button type="button" data-knopf onClick={() => setLegende(false)} className="text-base leading-none text-slate-400 hover:text-white">×</button></p>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2"><svg viewBox="0 0 20 20" width="16" height="16"><path d="M18 10 L3 3 L6.5 10 L3 17 Z" fill="#38bdf8" stroke="#000" strokeWidth="2" /></svg><T>Player and view direction</T></li>
                  <li className="flex items-center gap-2"><XZeichen farbe="#38bdf8" gross={16} /><T>Elimination</T></li>
                  <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-black bg-amber-400" /><T>Knock (12 s)</T></li>
                  <li className="flex items-center gap-2"><span className="h-0.5 w-4 bg-rose-400" /><T>Bullet trace (hit)</T></li>
                  <li className="flex items-center gap-2"><span className="h-0.5 w-4 bg-yellow-400" /><T>Headshot</T></li>
                  <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><T>Trail event: loot picked up</T></li>
                  <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white" /><T>Zone now / dashed: next zone</T></li>
                  <li className="flex items-center gap-2"><span className="h-1 w-4 rounded bg-yellow-400" /><T>Bus route (yellow: jump window)</T></li>
                </ul>
              </div>
            )}
            <div className={`absolute right-3 z-20 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-black/70 text-slate-100 ${legende ? 'top-[300px]' : 'top-14'}`} data-knopf>
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

          {sd.da && (
            <p className={`mx-auto mt-3 w-full ${sd.da ? 'max-w-[1150px]' : 'max-w-[860px]'} rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-[12px] leading-snug text-amber-100`}>
              <b className="mr-1.5 rounded bg-amber-400 px-1.5 py-px text-[10px] font-black tracking-wider text-black">BETA</b>
              {sd.schildEcht
                ? <T>Player view: between two recorded positions a player moves in a straight line; shield and health come straight from the replay. Ammo and material counts are not in the replay data yet, and some new weapons have no image yet.</T>
                : <T>Player view: between two recorded positions a player moves in a straight line; this replay has no shield values, so the shield is estimated. Ammo and material counts are not in the replay data yet, and some new weapons have no image yet.</T>}
            </p>
          )}

          {/* ------------------------------------------------ Steuerung */}
          <div className={`mx-auto mt-3 w-full ${sd.da ? 'max-w-[1150px]' : 'max-w-[860px]'} rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-3`}>
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
              <label className="flex cursor-pointer items-center gap-1.5 text-slate-400">
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
          <div className={`mx-auto mt-3 w-full ${sd.da ? 'max-w-[1150px]' : 'max-w-[860px]'} rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-3`}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Legende</T></p>
            <ul className="grid gap-x-6 gap-y-2 text-[12px] leading-snug text-slate-300 sm:grid-cols-2">
              <li className="flex items-start gap-2.5"><span className="mt-0.5 shrink-0"><XZeichen farbe="#38bdf8" gross={18} /></span><span><T>Eliminierung: hier ist ein Spieler ausgeschieden. Die Farbe zeigt sein Team; das Zeichen bleibt stehen.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-black bg-amber-400" /><span><T>Knock: ein Spieler liegt am Boden. Der Kreis verschwindet nach 12 Sekunden - dann ist er aufgestanden oder ausgeschieden.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white" /><span><T>Weißer Ring: die Zone jetzt. Gestrichelt: die nächste Zone.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1.5 h-1 w-3.5 shrink-0 rounded bg-yellow-400" /><span><T>Pfeile: die Busroute. Gelb: wo man abspringen kann.</T></span></li>
              <li className="flex items-start gap-2.5"><span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm bg-violet-600/60" /><span><T>Violette Fläche: der Sturm, außerhalb der Zone.</T></span></li>
              <li className="text-slate-400"><T>Mausrad vergrößert die Karte, Ziehen verschiebt sie, Doppelklick setzt zurück. Fahre über ein Zeichen für Details.</T></li>
            </ul>
          </div>

          {/* ------------------------------------------------ Kurve */}
          <div className={`mx-auto mt-3 w-full ${sd.da ? 'max-w-[1150px]' : 'max-w-[860px]'} rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-3`}>
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

          {/* ------------------------------------------------ Auswertungen: Hoehe, Zonen-Glueck, Glueck gegen Leistung */}
          {sd.da && (
            <div className="mt-3">
              <Analysen match={match} orte={sd.orte} tStart={tStart} tEnde={tEnde} zeit={zeit} echte={echte} nameVon={nameVon} landVon={landVon} farbeVon={farbeVon}
                springe={springe} waehle={setGewaehlt} gewaehlt={gewaehlt} wertung={wertung} games={games} />
            </div>
          )}
        </div>

        {/* ------------------------------------------------ Seitenleiste: Spieler | Kill-Feed (app/replays/SeitenPanel) */}
        <SeitenPanel match={match} sd={sd} zeit={zeit} tStart={tStart} nachId={nachId} echte={echte} farbeVon={farbeVon} nameVon={nameVon} landVon={landVon}
          feed={feedEintraege} schadenBis={schadenBis} zeigeOrt={zeigeOrt} gewaehlt={gewaehlt} waehle={setGewaehlt} springe={springe} kopf={kopf ?? titel} matchId={(match as { match?: string }).match}
          extraReiter={[
            ...(treffer.length ? [{ k: 'treffer', name: 'Hits', inhalt: (
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
            ) }] : []),
            { k: 'teams', name: 'Teams', inhalt: (
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
            ) },
          ]} />
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
