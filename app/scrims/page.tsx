'use client';

// Scrims: die Übungsrunden der Community-Server (Noble, Manu, Vital …).
//
// Sie kommen nicht von Epic, sondern von Yunite - dem Discord-Bot, mit dem
// diese Server ihre Scrims veranstalten (siehe lib/yunite). Der Betreiber
// wollte das, was Fortnite Tracker unter "Scrims" zeigt, auf seiner eigenen
// Seite haben - und hat am 23.9.2026 genau vorgegeben, wie: "mach Form auch
// so und auch so von unten nach oben leicht schwarz, die Filter genau so und
// die Scrims-Server auch rechts am Rand ... man soll auch so sehen, dass man
// die verschiedenen Sessions sieht, und dann, wie es in einer Session
// aussieht."
//
// Also, wie im Vorbild:
//   - Kacheln mit farbigem Streifen oben (LIVE rot, laufend dunkel), dem
//     Logo der Serie und dem Namen unten auf einem Verlauf ins Schwarze;
//   - oben die Filter: Scrims oder Community Events, Raster oder Liste,
//     die Region;
//   - rechts die Server mit ihrem Discord;
//   - ein Klick auf eine Kachel zeigt ihre Sessions, ein Klick auf eine
//     Session oeffnet sie: Kopf, Uebersicht, Standings mit Team-Details,
//     rechts die Besten und die Matches.
//
// Farben: das Blau der Startseite statt des Gelbs im Vorbild - alle Akzente
// im Werkzeug folgen ihm.
//
// Noch nicht fuer alle: Besucher sehen den Vorhang ("Something Big Is
// Coming"), der Betreiber die Sache selbst. Solange kein Server mit
// Yunite-Premium verbunden ist, steht ein Beispiel da - gekennzeichnet, an
// jeder Kachel und ueber der ganzen Ansicht.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import LadeSchirm from '@/app/components/LadeSchirm';
import { MARKE } from '@/lib/marke';
import { SCRIM_SERVER, einladungVon } from '@/lib/scrimServer';

/* ================================================================ Daten */

interface Server { guildId: string; name: string; bild: string | null; rechte: string[] }
interface Sitzung {
  id: string; name: string; beschreibung?: string; bild?: string;
  teamGroesse: number; region: string; beginn: number; ende: number;
  art: string; bauen?: string | null; spielart?: string | null;
  live: boolean; vorbei: boolean;
  guildId?: string;
}
interface Team {
  teamId: string;
  spieler: Array<{ name: string; epicId?: string; discordId?: string; land?: string | null }>;
  platz: number; punkte: number; elims: number; matches: number; siege: number;
  elimsJeMatch: number; schnittPlatz: number; zeitSchnitt: number;
  spiele: Array<{ platz: number; elims: number; punkte: number; zeitpunkt: number; zaehlt: boolean }>;
}
interface Runde {
  sessionId: string; zeitpunkt: number; gastgeber: string | null;
  spieler: number; gewertet: string; ignoriert: boolean;
}

/** Eine Serie - eine Kachel. Sie traegt ihre Sessions. */
interface Serie {
  id: string; name: string; region: string; logo: string | null;
  server: string; sitzungen: Sitzung[];
  /**
   * Offener Server: jeder darf mitspielen, eine Session laeuft ueber viele
   * Lobbys zugleich (bei Noble Practice bis zu 1000 Spieler). Sonst eine
   * Lobby mit 100 Spielern je Session - siehe beispielTeams.
   */
  offen?: boolean;
  /** Nur ein Beispiel - klar gekennzeichnet, keine echten Zahlen. */
  beispiel?: boolean;
  /** Woher die echten Zahlen kommen. */
  quelle?: 'noble' | 'yunite';
  /** Gerade ohne Scrims (Noble X). */
  inaktiv?: boolean;
  /** Die Quelle hat fuer diesen Server nicht geantwortet. */
  fehler?: boolean;
}

/** Wie viele Spieler ein Team hat - als Wort, wie im Turnierbereich. */
const GROESSE: Record<number, string> = { 1: 'Solo', 2: 'Duo', 3: 'Trio', 4: 'Squad' };

const REGION_NAME: Record<string, string> = {
  EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', NAE: 'NA East', BR: 'Brazil',
  ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};

/* Die Server rechts am Rand stehen in lib/scrimServer. */

/**
 * Das Logo einer Serie - aus den Logos, die der Betreiber geschickt hat.
 *
 * Nach dem Namen: Noble traegt die Krone in der Farbe der Serie, Vital das
 * Herz, Manu sein Zeichen. Was keinem gehoert, bekommt sein eigenes Bild
 * von Yunite oder das Farbfeld.
 */
function logoFuer(name: string, eigenes?: string | null): string | null {
  const n = name.toLowerCase();
  if (/noble/.test(n)) {
    if (/pro/.test(n)) return '/scrims/noble-gold.jpg';
    if (/division\s*1|div\s*1/.test(n)) return '/scrims/noble-gruen.jpg';
    if (/division\s*2|div\s*2/.test(n)) return '/scrims/noble-lachs.jpg';
    if (/division\s*3|div\s*3/.test(n)) return '/scrims/noble-blau.jpg';
    if (/zero|zb/.test(n)) return '/scrims/noble-pink.jpg';
    if (/reload/.test(n)) return '/scrims/noble-rot.jpg';
    return '/scrims/noble-gelb.jpg';
  }
  if (/vital/.test(n)) {
    if (/pro|elite/.test(n)) return '/scrims/vital-gelb.jpg';
    if (/zero|zb|reload/.test(n)) return '/scrims/vital-rot.jpg';
    return '/scrims/vital-gruen.jpg';
  }
  if (/manu/.test(n)) return '/scrims/manu.jpg';
  // Poyo: jede Division ihr eigenes Banner, in ihrer Farbe.
  if (/poyo/.test(n)) {
    if (/solo/.test(n)) return '/scrims/poyo-solo.jpg';
    if (/master/.test(n)) return '/scrims/poyo-master.jpg';
    if (/legend/.test(n)) return '/scrims/poyo-legends.jpg';
    if (/closed/.test(n)) return '/scrims/poyo-closed.jpg';
    if (/prestige/.test(n)) return '/scrims/poyo-prestige.jpg';
    return '/scrims/poyo-nzr.jpg';
  }
  return eigenes ?? null;
}

/*
 * Der Hintergrund: schwarz mit feinen Punkten, darüber ein Schimmer im Blau
 * der Startseite - wie gewuenscht ("mit Punkten schwarz ... diese
 * transparente Schwarz").
 */
const PUNKTE = {
  backgroundImage:
    'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px),'
    + 'radial-gradient(60% 50% at 50% 0%, rgba(14,165,233,0.10), transparent 70%)',
  backgroundSize: '22px 22px, 100% 100%',
} as const;

/* ============================================================== Beispiel
 *
 * Solange kein Server verbunden ist, zeigt die Seite, wie sie aussehen
 * wird - mit Beispielwerten, die als solche gekennzeichnet sind. Die Namen
 * der Serien stammen aus dem Vorbild; Status, Sessions und alle Zahlen
 * sind ausgedacht und stehen nie ohne das Wort "Beispiel" da.
 */

function beispielSitzungen(praefix: string, region: string, groesse: number, live: boolean): Sitzung[] {
  const tag = 24 * 3600_000;
  const heute = new Date(); heute.setHours(11, 0, 0, 0);
  const datum = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/`
    + `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  const arten = groesse === 3 ? ['Trio', 'Solo', 'Duo'] : ['Duo', 'Solo', 'Trio'];
  const raus: Sitzung[] = [];
  for (let t = 0; t < 2; t += 1) {
    const beginn = heute.getTime() - t * tag;
    for (const [i, art] of arten.entries()) {
      raus.push({
        id: `${praefix}-${t}-${art.toLowerCase()}`,
        name: `${art} Customs [${datum(new Date(beginn))}]`,
        beschreibung: 'Scrim Rules:\n• Fight till 80 alive.\n• Re-start fighting 4th zone fully closed.\n• No teaming, no stream sniping.',
        teamGroesse: art === 'Solo' ? 1 : art === 'Duo' ? 2 : 3,
        region, beginn: beginn + i * 1800_000, ende: beginn + 15 * 3600_000,
        art: 'SCRIM', bauen: 'BUILD', spielart: 'BR',
        live: live && t === 0, vorbei: t > 0,
      });
    }
  }
  return raus;
}

/*
 * Noble steht nicht mehr hier: dessen Scrims kommen seit dem 25.9.2026 echt
 * von nobleprac.com (lib/noble). Was bleibt, sind Server, deren Zahlen noch
 * keine offene Quelle hat - als Beispiel, an jeder Kachel so beschriftet.
 */
/** Beispiel-Events: ein Cup je Woche, der letzte laeuft gerade. */
function beispielEvents(praefix: string, region: string, groesse: number, titel: string): Sitzung[] {
  const woche = 7 * 24 * 3600_000;
  const heute = new Date(); heute.setHours(18, 0, 0, 0);
  return [0, 1, 2].map((w) => {
    const beginn = heute.getTime() - w * woche;
    return {
      id: `${praefix}-${w}`,
      name: `${titel} #${3 - w}`,
      beschreibung: 'Example event:\n• 3 hours, up to 10 matches.\n• Points for placement and eliminations.',
      teamGroesse: groesse, region, beginn, ende: beginn + 3 * 3600_000,
      art: 'TOURNAMENT', bauen: 'BUILD', spielart: 'BR',
      live: w === 0, vorbei: w > 0,
    };
  });
}

const BEISPIEL_SERIEN: Serie[] = [
  { id: 'b-manu', name: 'Manu Scrims', region: 'NAC', server: 'Manu Scrims',
    logo: '/scrims/manu.jpg', sitzungen: beispielSitzungen('manu', 'NAC', 3, true) },
  /*
   * Vital - die Server, wie vitalscrims.com/scrims sie fuehrt (25.9.2026).
   * Der Betreiber: "Virtual Scrims nur ein Server? Da hat sicher mehrere
   * Server gehabt." Dort stehen fuenf; Leaderboards zeigt die Seite keine,
   * nur Dropmaps - deshalb bleiben die Zahlen ein Beispiel.
   */
  { id: 'b-vital-nac', name: 'Vital Scrims NA-Central', region: 'NAC', server: 'Vital Scrims',
    offen: true, logo: '/scrims/vital-gruen.jpg', sitzungen: beispielSitzungen('vital-nac', 'NAC', 2, true) },
  { id: 'b-vital-naw', name: 'Vital Scrims NA-West', region: 'NAW', server: 'Vital Scrims',
    logo: '/scrims/vital-gruen.jpg', sitzungen: beispielSitzungen('vital-naw', 'NAW', 2, false) },
  { id: 'b-vital-oce', name: 'Vital Scrims OCE', region: 'OCE', server: 'Vital Scrims',
    logo: '/scrims/vital-gelb.jpg', sitzungen: beispielSitzungen('vital-oce', 'OCE', 2, false) },
  { id: 'b-vital-me', name: 'Vital ME Private', region: 'ME', server: 'Vital Scrims',
    logo: '/scrims/vital-rot.jpg', sitzungen: beispielSitzungen('vital-me', 'ME', 2, false) },
  { id: 'b-vital-console', name: 'Vital Scrims Console', region: 'NAC', server: 'Vital Scrims',
    logo: '/scrims/vital-gruen.jpg', sitzungen: beispielSitzungen('vital-console', 'NAC', 2, false) },
  // Poyo - die Divisionen wie bei Fortnite Tracker. Europa: das hat der
  // Betreiber gesagt ("Poyo No Zone Rules sind auch Europa"), und die
  // Divisionen sind die Aufstiegsstufen desselben Servers.
  { id: 'b-poyo-nzr', name: 'Poyo No Zone Rules', region: 'EU', server: 'Poyo No Zone Rules',
    offen: true, logo: '/scrims/poyo-nzr.jpg', sitzungen: beispielSitzungen('pnzr', 'EU', 2, true) },
  { id: 'b-poyo-solo', name: 'Poyo Solo Division', region: 'EU', server: 'Poyo No Zone Rules',
    logo: '/scrims/poyo-solo.jpg', sitzungen: beispielSitzungen('psolo', 'EU', 1, false) },
  { id: 'b-poyo-master', name: 'Poyo Master Division', region: 'EU', server: 'Poyo No Zone Rules',
    logo: '/scrims/poyo-master.jpg', sitzungen: beispielSitzungen('pmaster', 'EU', 2, false) },
  { id: 'b-poyo-legends', name: 'Poyo Legends Division', region: 'EU', server: 'Poyo No Zone Rules',
    logo: '/scrims/poyo-legends.jpg', sitzungen: beispielSitzungen('plegends', 'EU', 2, true) },
  { id: 'b-poyo-closed', name: 'Poyo Closed Division', region: 'EU', server: 'Poyo No Zone Rules',
    logo: '/scrims/poyo-closed.jpg', sitzungen: beispielSitzungen('pclosed', 'EU', 2, false) },
  { id: 'b-poyo-prestige', name: 'Poyo Prestige Division', region: 'EU', server: 'Poyo No Zone Rules',
    logo: '/scrims/poyo-prestige.jpg', sitzungen: beispielSitzungen('pprestige', 'EU', 2, false) },
  /*
   * Community Events - Cups, die ein Server fuer seine Leute ausrichtet. Der
   * Betreiber: "bei Community Events gibt es keine Beispiele." Echte kommen,
   * sobald ein Server Yunite freigibt; bis dahin zeigt das hier, wie sie
   * aussehen. Die Namen sind Gattungen, keine echten Cups.
   */
  { id: 'b-community-solo', name: 'Community Solo Cup', region: 'EU', server: 'Community',
    offen: true, logo: null, sitzungen: beispielEvents('csolo', 'EU', 1, 'Solo Cup') },
  { id: 'b-community-duo', name: 'Community Duo Cup', region: 'EU', server: 'Community',
    logo: null, sitzungen: beispielEvents('cduo', 'EU', 2, 'Duo Cup') },
  { id: 'b-community-trio', name: 'Community Trio Cash Cup', region: 'NAC', server: 'Community',
    logo: null, sitzungen: beispielEvents('ctrio', 'NAC', 3, 'Trio Cash Cup') },
].map((x) => ({ ...x, beispiel: true }));

/*
 * Wie gross eine Session ist - so, wie der Betreiber es beschrieben hat:
 * eine Lobby hat 100 Spieler, also 100 Solos, 50 Duos oder rund 33 Trios.
 * Eine Division spielt eine Lobby je Session; ein offener Server wie Noble
 * Practice viele zugleich, bis zu 1000 Spieler.
 */
const LOBBY = 100;
const OFFEN_SPIELER = 1000;

function teamZahl(groesse: number, offen = false) {
  return Math.floor((offen ? OFFEN_SPIELER : LOBBY) / Math.max(1, groesse));
}

/** Eine Bestenliste, wie sie aussieht - mit Platzhaltern statt Namen. */
function beispielTeams(groesse: number, offen = false): Team[] {
  const n = Math.max(1, groesse);
  const zahl = teamZahl(n, offen);
  const jeLobby = teamZahl(n);
  // Neun Matches; in jedem gewinnt je Lobby ein Team.
  let sieg = 9 * (offen ? OFFEN_SPIELER / LOBBY : 1);
  return Array.from({ length: zahl }, (_, i) => {
    const anteil = 1 - i / (zahl * 1.12);
    const matches = 9 - (i % 4);
    const siege = sieg > 0 ? Math.min(sieg, i === 0 ? 2 : 1) : 0;
    sieg -= siege;
    const elims = Math.max(0, Math.round(44 * Math.pow(anteil, 1.3)));
    return {
      teamId: `b-${i}`,
      spieler: Array.from({ length: n }, (__, k) => ({ name: `Player ${i * n + k + 1}` })),
      platz: i + 1,
      punkte: Math.max(1, Math.round(393 * Math.pow(anteil, 1.6))),
      elims, matches, siege,
      elimsJeMatch: +(elims / matches).toFixed(2),
      schnittPlatz: +(4 + (1 - anteil) * jeLobby * 0.8).toFixed(1),
      zeitSchnitt: Math.round(1100 * (0.35 + 0.65 * anteil)),
      spiele: Array.from({ length: Math.min(matches, 8) }, (__, k) => ({
        platz: ((i * 7 + k * 5) % jeLobby) + 1,
        elims: (i + k * 3) % 10,
        punkte: Math.max(0, 80 - ((i * 7 + k * 5) % jeLobby) * 2),
        zeitpunkt: Date.now() - k * 1500_000,
        zaehlt: true,
      })),
    };
  });
}

function beispielRunden(groesse: number, offen = false): Runde[] {
  const voll = teamZahl(groesse, offen) * Math.max(1, groesse);
  return Array.from({ length: 9 }, (_, i) => ({
    sessionId: `b-runde-${i}`, zeitpunkt: Date.now() - i * 1500_000, gastgeber: null,
    spieler: voll - (offen ? i * 9 : i), gewertet: 'SCORED', ignoriert: false,
  }));
}

/** Woher die Spieler kommen - nur im Beispiel; Yunite nennt es nicht. */
function beispielLaender(spieler: number): Array<[string, number]> {
  const teil = (x: number) => Math.round(spieler * x);
  const oben: Array<[string, number]> = [['FR', teil(0.11)], ['GB', teil(0.11)], ['IT', teil(0.09)], ['DE', teil(0.08)]];
  return [...oben, ['Other', spieler - oben.reduce((a, [, z]) => a + z, 0)]];
}

/* ============================================================ Helfer */

function uhr(ms: number, sprache: string, mitDatum = true) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE',
    mitDatum
      ? { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' });
}

function dauer(ms: number) {
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3600_000);
  const m = Math.round((ms % 3600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function zeitText(sekunden: number) {
  if (!sekunden) return '–';
  return `${Math.floor(sekunden / 60)}m ${String(Math.round(sekunden % 60)).padStart(2, '0')}s`;
}

/** Status einer Serie: live, laeuft (eine Session ist offen) oder vorbei. */
/** In dieser Reihenfolge stehen die Kacheln: was live ist, zuerst. */
const RANG = { live: 0, laeuft: 1, vorbei: 2 } as const;

function statusVon(s: Serie): 'live' | 'laeuft' | 'vorbei' {
  if (s.sitzungen.some((x) => x.live)) return 'live';
  if (s.sitzungen.some((x) => !x.vorbei)) return 'laeuft';
  return 'vorbei';
}

/* ======================================================== Kleine Teile */

function Marke({ children, art }: { children: React.ReactNode; art: 'hell' | 'gruen' | 'grau' }) {
  const farbe = art === 'hell' ? 'border-white/80 text-white'
    : art === 'gruen' ? 'border-emerald-400/70 text-emerald-300'
      : 'border-zinc-500/70 text-slate-300';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase
                      leading-none tracking-wide ${farbe}`}>
      {children}
    </span>
  );
}

/*
 * Ob etwas live ist - ohne Rot.
 *
 * Vorher trug eine laufende Kachel oben einen roten Streifen und rundum
 * einen roten Rahmen. Der Betreiber: "dieses Rot da gefaellt mir irgendwie
 * nicht ... hast du dazu eine andere Idee?" Jetzt sagt es eine Marke aus
 * dunklem Glas oben links, bei Live mit pulsierendem Punkt im Blau der
 * Startseite. Und was vorbei ist, verblasst: das Bild wird grau, bis man
 * darueberfaehrt - so springen die laufenden Serien von selbst ins Auge.
 */
function StatusMarke({ status, klein = false }: {
  status: 'live' | 'laeuft' | 'vorbei'; klein?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-black/65 font-bold
                      uppercase tracking-wider ring-1 ring-white/15 backdrop-blur-sm ${
      klein ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} ${
      status === 'live' ? 'text-white' : status === 'laeuft' ? 'text-slate-200' : 'text-slate-400'}`}>
      {status === 'live' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full
                           bg-sky-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
        </span>
      )}
      {status === 'laeuft' && <span className="h-2 w-2 rounded-full border border-slate-300" />}
      {status === 'live' ? 'Live' : status === 'laeuft' ? <T>Läuft</T> : <T>Beendet</T>}
    </span>
  );
}

/** Ein Knopf in einer Gruppe - wie die Filter im Vorbild. */
function Filter({ an, onClick, children }: {
  an: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition ${
        an ? 'bg-sky-500 text-white' : 'bg-zinc-900/80 text-slate-300 hover:bg-zinc-800'}`}>
      {children}
    </button>
  );
}

/* =============================================================== Kachel */

function Kachel({ serie, offen, umschalten, waehle }: {
  serie: Serie; offen: boolean;
  umschalten: () => void; waehle: (s: Sitzung) => void;
}) {
  const status = statusVon(serie);
  const beispiel = !!serie.beispiel;

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950
                     ${beispiel ? 'border-dashed' : ''}`}>
      <div role="button" tabIndex={0} onClick={umschalten}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') umschalten(); }}
        className="relative block aspect-square w-full cursor-pointer overflow-hidden text-left">
        {serie.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={serie.logo} alt="" loading="lazy"
            className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${
              status === 'vorbei' ? 'opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0' : ''}`} />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-sky-900/60 to-zinc-950" />
        )}
        {/* Von unten nach oben leicht schwarz - wie im Vorbild. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <h3 className="absolute inset-x-0 bottom-0 p-4 text-2xl font-black leading-tight
                       tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {serie.name}
        </h3>
        {/* Oben: links der Stand, rechts Region und - im Beispiel - der Hinweis. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start
                        justify-between gap-2 p-3">
          {serie.inaktiv || serie.fehler ? (
            <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold uppercase
                             tracking-wider text-slate-400 ring-1 ring-white/15 backdrop-blur-sm">
              {serie.inaktiv ? <T>Inaktiv</T> : <T>Keine Antwort</T>}
            </span>
          ) : <StatusMarke status={status} />}
          <span className="flex flex-col items-end gap-1.5">
            {serie.region && (
              <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold
                               uppercase tracking-wider text-slate-200 ring-1 ring-white/15
                               backdrop-blur-sm">
                {serie.region}
              </span>
            )}
            {beispiel && (
              <span className="rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold uppercase
                               tracking-wider text-amber-300">
                <T>Beispiel</T>
              </span>
            )}
          </span>
        </div>

        {/*
          * Die Sessions der Serie - ein Klick auf die Kachel zeigt sie, wie
          * im Vorbild: Name mit Datum, rechts LIVE oder ENDED.
          */}
        {offen && (
          <div className="absolute inset-0 overflow-y-auto bg-zinc-950/92 p-2 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}>
            {serie.sitzungen.length === 0 && (
              <p className="p-3 text-center text-xs text-slate-500">
                {serie.inaktiv ? <T>Dieser Server ist gerade inaktiv.</T>
                  : serie.fehler ? <T>nobleprac.com antwortet gerade nicht.</T>
                    : <T>Keine Sessions.</T>}
              </p>
            )}
            {serie.sitzungen.map((s) => (
              <button key={s.id} type="button" onClick={() => waehle(s)}
                className={`mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3
                            py-2.5 text-left text-sm font-semibold transition ${
                  s.vorbei ? 'bg-zinc-900/60 text-slate-400 hover:bg-zinc-800'
                    : 'bg-zinc-900 text-slate-100 hover:bg-zinc-800'}`}>
                <span className="min-w-0 truncate">{s.name}</span>
                <span className={`shrink-0 text-[11px] font-bold uppercase ${
                  s.live ? 'text-sky-400' : s.vorbei ? 'text-slate-500' : 'text-emerald-400'}`}>
                  {s.live ? 'Live' : s.vorbei ? 'Ended' : 'Open'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================ Server-Rand */

function ServerRand() {
  const { sprache } = useSprache();
  /*
   * Die Mitgliederzahl jedes Servers - von Discord, wie im Vorbild
   * ("166,887 members"). Kommt keine, steht keine da, nie eine 0.
   */
  const [zahlen, setZahlen] = useState<Record<string, { mitglieder: number }>>({});
  useEffect(() => {
    let weg = false;
    fetch('/api/scrims/einladungen').then((r) => r.json())
      .then((d) => { if (!weg) setZahlen(d.zahlen ?? {}); })
      .catch(() => {});
    return () => { weg = true; };
  }, []);

  return (
    <aside className="space-y-3">
      <h2 className="text-lg font-black uppercase tracking-wide text-slate-100">
        <T>Server</T>
      </h2>
      {SCRIM_SERVER.map((s) => (
        <div key={s.name}
          className="flex items-center gap-3 overflow-hidden rounded-xl border border-zinc-800
                     bg-black/40 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.logo} alt="" className="h-16 w-16 shrink-0 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight text-slate-100">{s.name}</p>
            {s.region && <p className="text-[11px] text-slate-500">{s.region}</p>}
            {zahlen[s.code] && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {zahlen[s.code].mitglieder.toLocaleString(sprache === 'en' ? 'en-US' : 'de-DE')}
                {' '}<T>Mitglieder</T>
              </p>
            )}
          </div>
          <a href={einladungVon(s.code)} target="_blank" rel="noreferrer"
            title={`${s.name} — Discord`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#5865F2] px-3 py-2
                       text-xs font-bold text-white transition hover:bg-[#4752c4]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18.3 18.3 0 0 1 4.5 1.6 16.5 16.5 0 0 0-15.4 0A18.3 18.3 0 0 1 8.8 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 .1 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.9 12.9 0 0 1-2 1L17.7 21a19.9 19.9 0 0 0 6-3c.3-5.2-.6-9.7-3.4-13.6ZM8.4 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
            </svg>
            <T>Beitreten</T>
          </a>
        </div>
      ))}
    </aside>
  );
}

/* ========================================================== Session-Seite */

function Kennzahl({ titel, wert }: { titel: string; wert: string | number }) {
  return (
    <div>
      <p className="text-xs text-slate-400"><T>{titel}</T></p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-100">{wert}</p>
    </div>
  );
}

/** Der Kringel "Spieler je Land" - nur mit Werten, die es gibt. */
function Kringel({ teile }: { teile: Array<[string, number]> }) {
  const summe = teile.reduce((s, [, n]) => s + n, 0) || 1;
  const farben = ['#38bdf8', '#f43f5e', '#34d399', '#facc15', '#6366f1', '#a78bfa'];
  const umfang = 2 * Math.PI * 38;
  const stuecke = teile.map(([land, n], i) => {
    const vorher = teile.slice(0, i).reduce((s, [, m]) => s + m, 0) / summe;
    return { land, anteil: n / summe, vorher, farbe: farben[i % farben.length] };
  });
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        {stuecke.map((s) => (
          <circle key={s.land} cx="50" cy="50" r="38" fill="none" stroke={s.farbe}
            strokeWidth="12" strokeDasharray={`${s.anteil * umfang} ${umfang}`}
            strokeDashoffset={-s.vorher * umfang} />
        ))}
      </svg>
      <ul className="space-y-1 text-xs">
        {teile.map(([land, n], i) => (
          <li key={land} className="flex items-center gap-2 tabular-nums">
            <span className="h-2 w-2 rounded-full" style={{ background: farben[i % farben.length] }} />
            <span className="w-12 font-semibold text-slate-200">{land}</span>
            <span className="w-10 text-right text-slate-300">{n}</span>
            <span className="w-12 text-right text-slate-500">{((n / summe) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Wie sich die Punkte der Teams verteilen - sechs Spannen, wie im Vorbild. */
function PunkteVerteilung({ teams }: { teams: Team[] }) {
  const hoechst = Math.max(1, ...teams.map((t) => t.punkte));
  const schritt = Math.ceil((hoechst + 1) / 6);
  const eimer = Array.from({ length: 6 }, (_, i) => ({
    von: i * schritt, bis: (i + 1) * schritt - 1,
    n: teams.filter((t) => t.punkte >= i * schritt && t.punkte < (i + 1) * schritt).length,
  }));
  const max = Math.max(1, ...eimer.map((e) => e.n));
  return (
    <div>
      <div className="flex h-24 items-end gap-2 border-b border-l border-zinc-800 pl-2">
        {eimer.map((e) => (
          <div key={e.von} className="flex-1 rounded-t bg-sky-500/70"
            style={{ height: `${(e.n / max) * 100}%` }} title={`${e.n}`} />
        ))}
      </div>
      <div className="mt-1 flex gap-2 pl-2 text-[10px] tabular-nums text-slate-500">
        {eimer.map((e) => <span key={e.von} className="flex-1 text-center">{e.von}-{e.bis}</span>)}
      </div>
    </div>
  );
}

function SessionSeite({ serie, sitzung, teams, runden, laender, laedt, nichtDa, zurueck, wechsle }: {
  serie: Serie; sitzung: Sitzung; teams: Team[]; runden: Runde[]; nichtDa: boolean;
  /** Spieler je Land - nur, wo die Quelle es nennt (Noble). */
  laender: Array<[string, number]> | null;
  laedt: boolean; zurueck: () => void; wechsle: (s: Sitzung) => void;
}) {
  const beispiel = !!serie.beispiel;
  const noble = serie.quelle === 'noble';
  const { sprache, t } = useSprache();
  const [reiter, setReiter] = useState<'uebersicht' | 'wertung' | 'preise' | 'streams'>('uebersicht');
  const [liste, setListe] = useState<'leaderboard' | 'spieler' | 'teams'>('leaderboard');
  const [suche, setSuche] = useState('');
  const [mehr, setMehr] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  const q = suche.trim().toLowerCase();
  const gefiltert = useMemo(() => (q
    ? teams.filter((tm) => tm.spieler.some((s) => s.name.toLowerCase().includes(q)))
    : teams), [teams, q]);

  /*
   * Nach und nach zeichnen, nicht alles auf einmal: ein offener Server
   * bringt bis zu 500 Teams. Sichtbar sind zuerst sechzig, und jedes Mal,
   * wenn das Ende der Liste ins Bild kommt, sechzig mehr - ohne Knopf.
   */
  // Wechselt die Liste oder die Suche, beginnt es wieder bei sechzig.
  const schluessel = `${liste}|${q}|${teams.length}`;
  const [stand, setStand] = useState({ schluessel, zahl: 60 });
  const zeigen = stand.schluessel === schluessel ? stand.zahl : 60;
  const ende = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ende.current;
    if (!el) return;
    const beob = new IntersectionObserver((e) => {
      if (!e.some((x) => x.isIntersecting)) return;
      setStand((s) => ({ schluessel, zahl: (s.schluessel === schluessel ? s.zahl : 60) + 60 }));
    }, { rootMargin: '400px' });
    beob.observe(el);
    return () => beob.disconnect();
    // Auch nach jedem Nachladen neu beobachten: steht das Ende dann noch im
    // Bild, meldet der Beobachter das sofort, und es kommen weitere sechzig.
  }, [schluessel, zeigen]);
  const team = teams.find((x) => x.teamId === gewaehlt) ?? teams[0] ?? null;

  const spielerZahl = teams.reduce((n, x) => n + x.spieler.length, 0);
  const kills = teams.reduce((n, x) => n + x.elims, 0);

  /* Die Besten - aus dem, was Yunite je Team zaehlt. */
  const beste = useMemo(() => {
    if (!teams.length) return [];
    const nach = (f: (x: Team) => number, aufsteigend = false) => [...teams]
      .filter((x) => x.matches > 0)
      .sort((a, b) => (aufsteigend ? f(a) - f(b) : f(b) - f(a)))[0];
    const liste: Array<[string, Team | undefined, (x: Team) => string]> = [
      ['Meiste Punkte', nach((x) => x.punkte), (x) => `${x.punkte} ${t('Punkte')}`],
      ['Meiste Eliminierungen', nach((x) => x.elims), (x) => `${x.elims} Elims`],
      ['Meiste Siege', nach((x) => x.siege), (x) => `${x.siege} ${t('Siege')}`],
      ['Bester Schnittplatz', nach((x) => x.schnittPlatz, true), (x) => `Ø ${x.schnittPlatz}`],
      ['Am längsten am Leben', nach((x) => x.zeitSchnitt), (x) => zeitText(x.zeitSchnitt)],
    ];
    return liste.map(([titel, x, wert]) => ({ titel, team: x, wert: x ? wert(x) : '' }));
  }, [teams, t]);

  const zeile = 'border-t border-zinc-900';

  return (
    <div>
      <button onClick={zurueck}
        className="mb-4 flex items-center gap-2 text-sm font-semibold text-sky-400 transition
                   hover:text-sky-300">
        ← <T>Alle Events</T>
      </button>

      {/* ------------------------------------------------------------ Kopf */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-black/40">
        <div className="flex flex-col gap-4 sm:flex-row">
          {serie.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={serie.logo} alt="" className="h-48 w-full shrink-0 object-cover sm:h-auto sm:w-56" />
          )}
          <div className="min-w-0 flex-1 p-4 sm:py-5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-100 sm:text-3xl">
                {serie.name}: {sitzung.name}
              </h1>
              {beispiel && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold
                                 uppercase tracking-wider text-amber-300">
                  <T>Beispiel</T>
                </span>
              )}
            </div>
            {sitzung.beschreibung && (
              <div className="mt-2 max-w-3xl text-sm text-slate-400">
                <p className={`whitespace-pre-line ${mehr ? '' : 'line-clamp-3'}`}>
                  {sitzung.beschreibung}
                </p>
                <button onClick={() => setMehr((v) => !v)}
                  className="mt-1 text-xs font-semibold text-slate-200 hover:text-sky-400">
                  {mehr ? <T>Weniger</T> : <T>Mehr</T>}
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white">
                {sitzung.region ? (REGION_NAME[sitzung.region] ?? sitzung.region) : t('Alle Regionen')}
              </span>
              <select value={sitzung.id}
                onChange={(e) => {
                  const s = serie.sitzungen.find((x) => x.id === e.target.value);
                  if (s) wechsle(s);
                }}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white
                           outline-none">
                {serie.sitzungen.map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-900">{s.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm
                            font-semibold text-slate-200">
              <span>📅 {uhr(sitzung.beginn, sprache)}{sitzung.ende ? ` – ${uhr(sitzung.ende, sprache)}` : ''}</span>
              {sitzung.ende > sitzung.beginn && <span>⏱ {dauer(sitzung.ende - sitzung.beginn)}</span>}
              <span>👤 {GROESSE[sitzung.teamGroesse] ?? `${sitzung.teamGroesse}er`}</span>
              <span>⚔ {runden.length} <T>Matches</T></span>
              {sitzung.bauen === 'ZERO_BUILD' && <span>Zero Build</span>}
            </div>
          </div>
        </div>
      </div>

      {/*
        * Ein leeres Noble-Leaderboard sagt, warum - statt nur "0" zu zeigen.
        * Ob es die Session nie gab oder nobleprac.com sie gerade nicht
        * herausgibt, ist fuer den Leser ein Unterschied.
        */}
      {!laedt && noble && !teams.length && (
        <p className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3
                      text-sm text-amber-200/90">
          {nichtDa
            ? <T>nobleprac.com gibt dieses Leaderboard gerade nicht heraus — auch dort lässt es sich nicht öffnen. Jüngere Sessions stehen meist vollständig da.</T>
            : <T>Zu dieser Session hat nobleprac.com keine Einträge — gespielt wurde offenbar nicht.</T>}
        </p>
      )}

      {laedt ? <LadeSchirm /> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">

            {/* ------------------------------------------------ Event-Info */}
            <section>
              <h2 className="mb-2 text-lg font-black uppercase tracking-wide text-slate-100">
                <T>Event-Info</T>
              </h2>
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/40">
                <div className="grid grid-cols-4 border-b border-zinc-800 text-center text-sm font-semibold">
                  {([['uebersicht', 'Übersicht'], ['wertung', 'Wertung'], ['preise', 'Preise'],
                    ['streams', 'Streams']] as const).map(([k, titel]) => (
                    <button key={k} onClick={() => setReiter(k)}
                      className={`py-3 transition ${reiter === k
                        ? 'border-b-2 border-sky-500 text-slate-100'
                        : 'text-slate-500 hover:text-slate-300'}`}>
                      <T>{titel}</T>
                    </button>
                  ))}
                </div>

                {reiter === 'uebersicht' ? (
                  <div className="p-4">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                          <T>Spieler je Land</T>
                        </p>
                        {beispiel ? <Kringel teile={beispielLaender(spielerZahl)} />
                          : laender?.length ? <Kringel teile={laender} /> : (
                            <p className="text-xs text-slate-500">
                              {noble
                                ? <T>Kein Spieler dieser Session hat ein Land hinterlegt.</T>
                                : <T>Die Herkunft der Spieler gibt Yunite nicht heraus.</T>}
                            </p>
                          )}
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                          <T>Punkte der Teams</T>
                        </p>
                        <PunkteVerteilung teams={teams} />
                      </div>
                    </div>
                    <p className="mt-5 text-sm font-semibold text-slate-200">
                      <T>Insgesamt</T> <span className="text-xs text-slate-500">{runden.length} <T>Matches</T></span>
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Kennzahl titel="Teams" wert={teams.length} />
                      <Kennzahl titel="Spieler" wert={spielerZahl} />
                      <Kennzahl titel="Kills" wert={kills.toLocaleString('en-US')} />
                      <Kennzahl titel="Siege" wert={teams.reduce((n, x) => n + x.siege, 0)} />
                    </div>
                  </div>
                ) : (
                  <p className="p-6 text-center text-sm text-slate-500">
                    {beispiel
                      ? <T>Steht hier, sobald ein Server verbunden ist.</T>
                      : noble
                        ? <T>Das nennt nobleprac.com zu dieser Session nicht.</T>
                        : <T>Das gibt Yunite zu dieser Session nicht heraus.</T>}
                  </p>
                )}
              </div>
            </section>

            {/* -------------------------------------------------- Standings */}
            <section>
              <h2 className="mb-2 text-lg font-black uppercase tracking-wide text-slate-100">
                <T>Stand der Session</T>
              </h2>
              <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-zinc-800">
                <Filter an={liste === 'leaderboard'} onClick={() => setListe('leaderboard')}>
                  <T>Leaderboard</T>
                </Filter>
                <Filter an={liste === 'spieler'} onClick={() => setListe('spieler')}>
                  <T>Spieler</T>
                </Filter>
                <Filter an={liste === 'teams'} onClick={() => setListe('teams')}>
                  <T>Teams</T>
                </Filter>
              </div>

              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/40">
                <p className="border-b border-zinc-800 px-4 py-2.5 text-center text-xs text-slate-400">
                  {noble ? (
                    <a href={`https://nobleprac.com/leaderboards/${encodeURIComponent(sitzung.id)}`}
                      target="_blank" rel="noreferrer" className="hover:text-sky-400">
                      <T>Daten von nobleprac.com</T>
                    </a>
                  ) : <T>Powered by Yunite</T>} {'//'} {teams.length} <T>Teams</T>
                  {beispiel && <> {'//'} <span className="text-amber-300"><T>Beispiel</T></span></>}
                </p>
                <div className="border-b border-zinc-800 px-4 py-2">
                  <input value={suche} onChange={(e) => setSuche(e.target.value)}
                    placeholder={t('Spieler finden')}
                    className="w-full bg-transparent py-1.5 text-sm text-slate-100 outline-none
                               placeholder:text-slate-600" />
                </div>

                <div className={liste === 'leaderboard' ? 'grid lg:grid-cols-[minmax(0,1fr)_260px]' : ''}>
                  <div className="overflow-x-auto">
                    {liste === 'leaderboard' && (
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs capitalize text-slate-400">
                          <tr>
                            <th className="px-4 py-2 font-medium"><T>Platz</T></th>
                            <th className="px-2 py-2 font-medium"><T>Team</T></th>
                            <th className="px-2 py-2 text-right font-medium"><T>Punkte</T></th>
                            <th className="px-2 py-2 text-right font-medium"><T>Matches</T></th>
                            <th className="px-2 py-2 text-right font-medium"><T>Siege</T></th>
                            <th className="px-4 py-2 text-right font-medium">Ø Elims</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {gefiltert.slice(0, zeigen).map((tm) => (
                            <tr key={tm.teamId} onClick={() => setGewaehlt(tm.teamId)}
                              className={`${zeile} cursor-pointer transition ${
                                team?.teamId === tm.teamId ? 'bg-sky-500/10' : 'hover:bg-zinc-900/60'}`}>
                              <td className="px-4 py-2.5">
                                <span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-black ${
                                  tm.platz === 1 ? 'bg-amber-400/20 text-amber-300'
                                    : tm.platz <= 3 ? 'bg-zinc-800 text-slate-200' : 'text-slate-400'}`}>
                                  {tm.platz}
                                </span>
                              </td>
                              <td className="max-w-[340px] px-2 py-2.5 font-semibold text-slate-100">
                                <span className="line-clamp-1">
                                  {tm.spieler.map((s) => s.name).join(' + ')}
                                </span>
                              </td>
                              <td className="px-2 py-2.5 text-right font-bold text-slate-100">{tm.punkte}</td>
                              <td className="px-2 py-2.5 text-right text-slate-300">{tm.matches}</td>
                              <td className="px-2 py-2.5 text-right text-slate-300">{tm.siege}</td>
                              <td className="px-4 py-2.5 text-right text-slate-300">{tm.elimsJeMatch.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {liste === 'spieler' && (
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs capitalize text-slate-400">
                          <tr>
                            <th className="px-4 py-2 font-medium"><T>Spieler</T></th>
                            <th className="px-2 py-2 text-right font-medium"><T>Platz</T></th>
                            <th className="px-2 py-2 text-right font-medium"><T>Punkte</T></th>
                            <th className="px-4 py-2 text-right font-medium">Elims</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {gefiltert.slice(0, zeigen).flatMap((tm) => tm.spieler.map((s) => (
                            <tr key={`${tm.teamId}-${s.name}`} className={zeile}>
                              <td className="px-4 py-2 font-semibold text-slate-100">{s.name}</td>
                              <td className="px-2 py-2 text-right text-slate-300">{tm.platz}</td>
                              <td className="px-2 py-2 text-right text-slate-300">{tm.punkte}</td>
                              <td className="px-4 py-2 text-right text-slate-300">{tm.elims}</td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    )}

                    {liste === 'teams' && (
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs capitalize text-slate-400">
                          <tr>
                            <th className="px-4 py-2 font-medium"><T>Team</T></th>
                            <th className="px-2 py-2 text-right font-medium">Elims</th>
                            <th className="px-2 py-2 text-right font-medium"><T>Siege</T></th>
                            <th className="px-2 py-2 text-right font-medium">Ø <T>Platz</T></th>
                            <th className="px-4 py-2 text-right font-medium">Ø <T>am Leben</T></th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {[...gefiltert].sort((a, b) => b.elims - a.elims).slice(0, zeigen).map((tm) => (
                            <tr key={tm.teamId} className={zeile}>
                              <td className="max-w-[340px] px-4 py-2 font-semibold text-slate-100">
                                <span className="line-clamp-1">{tm.spieler.map((s) => s.name).join(' + ')}</span>
                              </td>
                              <td className="px-2 py-2 text-right text-slate-300">{tm.elims}</td>
                              <td className="px-2 py-2 text-right text-slate-300">{tm.siege}</td>
                              <td className="px-2 py-2 text-right text-slate-300">{tm.schnittPlatz}</td>
                              <td className="px-4 py-2 text-right text-slate-300">{zeitText(tm.zeitSchnitt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {liste === 'spieler' && (
                      <p className="px-4 py-2 text-[11px] text-slate-600">
                        <T>Yunite zählt je Team - jeder Spieler steht mit den Werten seines Teams.</T>
                      </p>
                    )}
                    {!gefiltert.length && (
                      <p className="py-8 text-center text-sm text-slate-500"><T>Niemand gefunden.</T></p>
                    )}
                    {/* Kommt das ins Bild, laden die naechsten sechzig. */}
                    <div ref={ende} aria-hidden className="h-px" />
                  </div>

                  {/* ---------------------------------------- Team-Details */}
                  {liste === 'leaderboard' && team && (
                    <div className="border-t border-zinc-800 lg:border-l lg:border-t-0">
                      <p className="border-b border-zinc-800 px-4 py-2 text-xs font-semibold text-slate-400">
                        #{team.platz} <T>Team-Details</T>
                      </p>
                      <div className="space-y-1 border-b border-zinc-800 px-4 py-3">
                        {team.spieler.map((s) => (
                          <p key={s.name} className="truncate text-lg font-black text-slate-100">{s.name}</p>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3 border-b border-zinc-800 px-4 py-3 text-xs tabular-nums">
                        {([
                          ['Punkte', team.punkte], ['Matches', team.matches], ['Siege', team.siege],
                          ['Elims', team.elims], ['Ø Elims', team.elimsJeMatch.toFixed(1)],
                          ['Ø Platz', team.schnittPlatz],
                          ['Ø Punkte', team.matches ? (team.punkte / team.matches).toFixed(1) : '–'],
                          ['Ø am Leben', zeitText(team.zeitSchnitt)],
                        ] as Array<[string, string | number]>).map(([titel, wert]) => (
                          <div key={titel}>
                            <p className="text-slate-500"><T>{titel}</T></p>
                            <p className="font-bold text-slate-100">{wert}</p>
                          </div>
                        ))}
                      </div>
                      <div className="max-h-80 space-y-1.5 overflow-y-auto p-3">
                        {team.spiele.map((sp, i) => (
                          <div key={i}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                              sp.platz === 1 ? 'border-amber-500/40 bg-amber-500/10'
                                : sp.platz <= 3 ? 'border-zinc-700 bg-zinc-900/80'
                                  : 'border-zinc-800 bg-zinc-900/40'}`}>
                            <div>
                              <p className="text-[10px] text-slate-500">
                                {uhr(sp.zeitpunkt, sprache, false)}
                              </p>
                              <p className="font-bold text-slate-100">
                                {sp.platz}. <T>Platz</T>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-500">Elims</p>
                              <p className="font-bold tabular-nums text-slate-100">{sp.elims}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* -------------------------------------------------- Rand */}
          <aside className="space-y-6">
            <section>
              <h2 className="mb-2 text-lg font-black uppercase tracking-wide text-slate-100">
                <T>Die Besten</T>
              </h2>
              <div className="overflow-hidden rounded-2xl border border-sky-500/40 bg-black/40">
                {beste.map((b) => (
                  <div key={b.titel} className="border-b border-zinc-900 px-4 py-3 last:border-0">
                    <p className="text-[11px] font-semibold text-sky-400"><T>{b.titel}</T></p>
                    <p className="truncate text-sm font-bold text-slate-100">
                      {b.team?.spieler.map((s) => s.name).join(' + ') ?? '–'}
                    </p>
                    <p className="text-[11px] text-slate-500">{b.wert}</p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h2 className="mb-2 flex items-baseline gap-2 text-lg font-black uppercase tracking-wide text-slate-100">
                <T>Matches</T> <span className="text-xs font-normal normal-case text-slate-500">{runden.length}</span>
              </h2>
              <div className="max-h-96 space-y-1.5 overflow-y-auto rounded-2xl border border-zinc-800 bg-black/40 p-3">
                {runden.map((r, i) => (
                  <div key={r.sessionId}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
                    <p className="text-[10px] text-slate-500">
                      {uhr(r.zeitpunkt, sprache)} {'//'} Match {runden.length - i}
                    </p>
                    <p className="font-semibold text-slate-200">
                      {r.ignoriert ? t('nicht gewertet')
                        : r.gewertet === 'SCORED' ? `${r.spieler} ${t('Spieler')}` : t('wird gewertet')}
                    </p>
                  </div>
                ))}
                {!runden.length && (
                  <p className="py-4 text-center text-xs text-slate-500"><T>Noch keine Runde gespielt.</T></p>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ================================================================ Seite */

export default function ScrimsSeite() {
  const { t } = useSprache();
  const zugang = useZugang();
  const [serien, setSerien] = useState<Serie[]>([]);
  const [offeneKachel, setOffeneKachel] = useState<string | null>(null);
  const [offen, setOffen] = useState<{ serie: Serie; sitzung: Sitzung } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [runden, setRunden] = useState<Runde[]>([]);
  /*
   * Erst laden, wenn feststeht, wer da ist: ein Besucher sieht den Vorhang
   * und soll gar nichts anfragen.
   */
  const [laedt, setLaedt] = useState(true);
  const [laedtCup, setLaedtCup] = useState(false);
  const [hinweis, setHinweis] = useState('');
  const [laender, setLaender] = useState<Array<[string, number]> | null>(null);
  /** Noble: das Leaderboard gibt es dort gerade nicht (sonst: einfach ohne Eintraege). */
  const [nichtDa, setNichtDa] = useState(false);

  /* Die Filter - wie im Vorbild. */
  const [art, setArt] = useState<'scrims' | 'community'>('scrims');
  const [ansicht, setAnsicht] = useState<'raster' | 'liste'>('raster');
  const [region, setRegion] = useState('alle');

  const darf = zugang.admin;

  /*
   * Die Server und ihre Sessions - alles in einem Zug.
   *
   * Echt sind Noble (von nobleprac.com) und was ein Server ueber Yunite
   * freigibt. Fuer alle anderen steht ein Beispiel da, an jeder Kachel
   * gekennzeichnet - aber nie fuer einen Server, der echte Zahlen hat.
   */
  const holen = useCallback(async () => {
    setHinweis('');
    const nobleHolen = async (): Promise<Serie[]> => {
      try {
        const d = await fetch('/api/scrims?quelle=noble').then((r) => r.json());
        return ((d.serien ?? []) as Array<{
          guildId: string; name: string; logo: string; offen?: boolean; inaktiv?: boolean;
          fehler?: boolean; sitzungen: Sitzung[];
        }>).map((x) => ({
          id: `noble-${x.guildId}`, name: x.name, server: 'Noble Scrims', region: 'EU',
          logo: x.logo, offen: x.offen, inaktiv: x.inaktiv, fehler: x.fehler,
          quelle: 'noble' as const,
          sitzungen: [...x.sitzungen].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.beginn - a.beginn),
        }));
      } catch { return []; }
    };
    const echteNoble = await nobleHolen();
    /** Yunite hat nichts: Noble und dazu die Beispiele der uebrigen Server. */
    const zeigeBeispiel = (grund: string) => {
      setHinweis(grund);
      setSerien([...echteNoble, ...BEISPIEL_SERIEN]);
    };
    try {
      const d = await fetch('/api/scrims').then((r) => r.json());
      if (d.error === 'nicht-eingerichtet' || d.eingerichtet === false) {
        zeigeBeispiel('nicht-eingerichtet'); return;
      }
      const liste: Server[] = d.server ?? [];
      if (!liste.length) { zeigeBeispiel('kein-server'); return; }

      /* Eine Kachel je Server, mit seinen Sessions darin - neueste zuerst. */
      const neu: Serie[] = [];
      let ohnePremium = 0;
      for (const s of liste) {
        const e = await fetch(`/api/scrims?server=${encodeURIComponent(s.guildId)}`).then((r) => r.json());
        if (e.error === 'kein-premium') { ohnePremium += 1; continue; }
        const sitzungen: Sitzung[] = ((e.turniere ?? []) as Sitzung[])
          .map((x) => ({ ...x, guildId: s.guildId }))
          .sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.beginn - a.beginn);
        if (!sitzungen.length) continue;
        const regionen = [...new Set(sitzungen.map((x) => x.region).filter(Boolean))];
        neu.push({
          id: s.guildId, name: s.name, server: s.name,
          region: regionen.length === 1 ? regionen[0] : '',
          logo: logoFuer(s.name, s.bild ?? sitzungen[0]?.bild ?? null),
          sitzungen, quelle: 'yunite',
        });
      }
      if (!neu.length) { zeigeBeispiel(ohnePremium ? 'kein-premium' : 'keine-scrims'); return; }
      // Beispiele nur fuer Server, die weder Noble noch ueber Yunite echt sind.
      const echt = new Set([...neu, ...echteNoble].map((x) => x.server.toLowerCase()));
      setSerien([...echteNoble, ...neu,
        ...BEISPIEL_SERIEN.filter((b) => !echt.has(b.server.toLowerCase()))]);
    } catch {
      zeigeBeispiel('fehler');
    } finally { setLaedt(false); }
  }, []);

  useEffect(() => {
    if (zugang.laedt || !darf) return;
    const id = setTimeout(() => { void holen(); }, 0);
    return () => clearTimeout(id);
  }, [zugang.laedt, darf, holen]);

  /** Eine Session öffnen: Bestenliste und Runden dazu. */
  const oeffnen = useCallback(async (serie: Serie, sitzung: Sitzung) => {
    setOffen({ serie, sitzung }); setTeams([]); setRunden([]); setLaender(null); setNichtDa(false);
    setOffeneKachel(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    // Das Beispiel braucht keine Abfrage - es steht schon fest.
    if (serie.beispiel) {
      setTeams(beispielTeams(sitzung.teamGroesse, serie.offen));
      setRunden(beispielRunden(sitzung.teamGroesse, serie.offen));
      return;
    }
    setLaedtCup(true);
    if (serie.quelle === 'noble') {
      try {
        const d = await fetch(`/api/scrims?quelle=noble&turnier=${encodeURIComponent(sitzung.id)}`)
          .then((r) => r.json());
        setTeams(d.teams ?? []);
        setRunden(d.runden ?? []);
        setLaender(d.laender ?? null);
        setNichtDa(!!d.nichtDa);
        // Die Teamgroesse und die Regeln kennt erst das Leaderboard selbst.
        if (d.turnier) setOffen({ serie, sitzung: { ...sitzung, ...d.turnier } });
      } catch { /* dann bleibt es leer */ }
      finally { setLaedtCup(false); }
      return;
    }
    try {
      const d = await fetch(`/api/scrims?server=${encodeURIComponent(sitzung.guildId ?? serie.id)}`
        + `&turnier=${encodeURIComponent(sitzung.id)}`).then((r) => r.json());
      setTeams(d.teams ?? []);
      setRunden(d.runden ?? []);
    } catch { /* dann bleibt es leer, der Hinweis steht unten */ }
    finally { setLaedtCup(false); }
  }, []);

  const regionen = useMemo(
    () => [...new Set(serien.map((x) => x.region).filter(Boolean))].sort(), [serien]);

  /*
   * Was gezeigt wird: Scrims oder Community Events (Yunite unterscheidet
   * sie an der Art der Veranstaltung), und die gewaehlte Region.
   */
  const gezeigt = useMemo(() => serien
    .map((s) => ({
      ...s,
      sitzungen: s.sitzungen.filter((x) => (art === 'scrims' ? x.art === 'SCRIM' : x.art !== 'SCRIM')),
    }))
    // Ein inaktiver Server (Noble X) bleibt unter Scrims sichtbar - mit Hinweis.
    .filter((s) => s.sitzungen.length || (art === 'scrims' && (s.inaktiv || s.fehler)))
    .filter((s) => region === 'alle' || s.region === region)
    .sort((a, b) => Number(!!a.beispiel) - Number(!!b.beispiel)
      || RANG[statusVon(a)] - RANG[statusVon(b)]), [serien, art, region]);

  /* ------------------------------------------------------------ Vorhang */

  if (!zugang.laedt && !darf) {
    return (
      <main className="relative flex-1 overflow-hidden bg-zinc-950 text-slate-200" style={PUNKTE}>
        <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center
                        justify-center px-4 py-20 text-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-sky-500/20 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARKE.logoFrei} alt=""
              className="h-24 w-auto opacity-90 sm:h-28" />
          </div>
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-100 sm:text-5xl">
            <T>Something Big Is Coming</T>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-slate-400 sm:text-base">
            <T>Scrims der Community-Server — Leaderboards, Sessions und Statistiken,
            direkt auf CompHub.</T>
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/events"
              className="rounded-xl border border-zinc-800 bg-black/40 px-5 py-2.5 text-sm
                         font-semibold text-slate-300 transition hover:border-sky-500
                         hover:text-sky-400">
              <T>Zu den Turnieren</T>
            </Link>
            <a href={MARKE.discord} target="_blank" rel="noreferrer"
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white
                         transition hover:bg-sky-400">
              <T>Im Discord erfahren, wann es losgeht</T>
            </a>
          </div>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------------- Die Ansicht */

  return (
    <main className="relative flex-1 bg-zinc-950 px-4 py-6 text-slate-200" style={PUNKTE}>
      <div className="mx-auto max-w-[1500px]">

        {laedt || zugang.laedt ? <LadeSchirm /> : offen ? (
          <SessionSeite serie={offen.serie} sitzung={offen.sitzung} teams={teams} runden={runden}
            laender={laender} laedt={laedtCup} nichtDa={nichtDa}
            zurueck={() => setOffen(null)}
            wechsle={(s) => { void oeffnen(offen.serie, s); }} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-2xl font-black uppercase tracking-wide text-slate-100">
                <T>Scrims</T>
              </h1>
              <p className="text-sm text-slate-500">
                <T>Leaderboards, Sessions und Statistiken der Scrims der Community-Server.</T>
              </p>
            </div>

            {/* ------------------------------------------------ Filter */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex overflow-hidden rounded-lg border border-zinc-800">
                <Filter an={art === 'scrims'} onClick={() => setArt('scrims')}>
                  <span aria-hidden>⚔</span> <T>Scrims</T>
                </Filter>
                <Filter an={art === 'community'} onClick={() => setArt('community')}>
                  <span aria-hidden>🗓</span> <T>Community Events</T>
                </Filter>
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border border-zinc-800">
                <Filter an={ansicht === 'raster'} onClick={() => setAnsicht('raster')}>
                  <span aria-hidden>▦</span> <T>Raster</T>
                </Filter>
                <Filter an={ansicht === 'liste'} onClick={() => setAnsicht('liste')}>
                  <span aria-hidden>☰</span> <T>Liste</T>
                </Filter>
              </div>
              <select value={region} onChange={(e) => setRegion(e.target.value)}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white
                           outline-none">
                <option value="alle" className="bg-zinc-900">{t('Alle Regionen')}</option>
                {regionen.map((r) => (
                  <option key={r} value={r} className="bg-zinc-900">{REGION_NAME[r] ?? r}</option>
                ))}
              </select>
              {/* Der Weg zurueck zu Epics Turnieren. */}
              <Link href="/events"
                className="ml-auto text-xs font-semibold text-slate-400 transition hover:text-sky-400">
                <T>Fortnite Events</T> →
              </Link>
            </div>

            {hinweis && (
              <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06]
                              px-4 py-3 text-sm text-amber-200/90">
                {hinweis === 'nicht-eingerichtet' && (
                  <T>Yunite ist noch nicht eingerichtet — es fehlt der Schlüssel der App.</T>
                )}
                {hinweis === 'kein-server' && (
                  <T>Noch hat kein Discord-Server die App freigeschaltet. Sobald einer es tut, stehen seine Scrims hier.</T>
                )}
                {hinweis === 'kein-premium' && (
                  <T>Der freigeschaltete Server hat kein Yunite-Premium — ohne das gibt Yunite seine Scrims nicht heraus.</T>
                )}
                {hinweis === 'keine-scrims' && <T>Dieser Server hat noch keine Scrims veranstaltet.</T>}
                {hinweis === 'fehler' && <T>Yunite antwortet gerade nicht.</T>}
                <p className="mt-1 text-[11px] text-amber-200/70">
                  <T>Noble ist echt (von nobleprac.com). Die Kacheln mit „Beispiel“ zeigen, wie ein Server aussieht, sobald er verbunden ist — keine dieser Zahlen ist echt.</T>
                </p>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                {!gezeigt.length ? (
                  <p className="rounded-xl border border-zinc-800 bg-black/40 p-8 text-center text-sm text-slate-500">
                    {art === 'community'
                      ? <T>Gerade gibt es keine Community Events.</T>
                      : <T>In dieser Region gibt es gerade keine Scrims.</T>}
                  </p>
                ) : ansicht === 'raster' ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {gezeigt.map((s) => (
                      <Kachel key={s.id} serie={s}
                        offen={offeneKachel === s.id}
                        umschalten={() => setOffeneKachel((v) => (v === s.id ? null : s.id))}
                        waehle={(x) => { void oeffnen(s, x); }} />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/40">
                    {gezeigt.map((s) => {
                      const status = statusVon(s);
                      return (
                        <div key={s.id} className="border-b border-zinc-900 last:border-0">
                          <button type="button"
                            onClick={() => setOffeneKachel((v) => (v === s.id ? null : s.id))}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition
                                       hover:bg-zinc-900/60">
                            {s.logo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.logo} alt="" className="h-11 w-11 rounded-lg object-cover" />
                            )}
                            <span className="min-w-0 flex-1 truncate font-bold text-slate-100">{s.name}</span>
                            {s.region && <Marke art="grau">{s.region}</Marke>}
                            <StatusMarke status={status} klein />
                            <span className="w-24 text-right text-xs text-slate-500">
                              {s.sitzungen.length} <T>Sessions</T>
                            </span>
                            {s.beispiel && (
                              <span className="text-[10px] font-bold uppercase text-amber-300"><T>Beispiel</T></span>
                            )}
                          </button>
                          {offeneKachel === s.id && (
                            <div className="grid gap-1 bg-zinc-950/60 px-3 pb-3 sm:grid-cols-2">
                              {s.sitzungen.map((x) => (
                                <button key={x.id} type="button" onClick={() => { void oeffnen(s, x); }}
                                  className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2
                                             text-left text-sm font-semibold text-slate-200 hover:bg-zinc-800">
                                  <span className="truncate">{x.name}</span>
                                  <span className={`text-[11px] font-bold uppercase ${
                                    x.live ? 'text-sky-400' : x.vorbei ? 'text-slate-500' : 'text-emerald-400'}`}>
                                    {x.live ? 'Live' : x.vorbei ? 'Ended' : 'Open'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <ServerRand />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
