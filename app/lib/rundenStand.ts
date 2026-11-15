/*
 * Der Stand einer Runde darf nur vorwaerts gehen (Betreiber, FNCS Heat 2, 15.11.2026).
 *
 * Gesehen: "30 / 39 Teams noch im Spiel", die Tabelle zeigte aber nur die Plaetze 36-39, und ein paar Sekunden spaeter stand dieselbe Runde auf "35 / 39" -
 * die Seite sprang zwischen einem neueren und einem aelteren Stand hin und her, und ein Name wechselte zwischen "dxnx 19!" und "142a7f94".
 *
 * Ursachen (app/api/cup-matches): dieselbe Runde kommt aus Quellen verschiedenen Alters - frisch von Epic (holeTop, 3 s), aus dem Vorrat auf der Platte
 * (bis ueber zwei Minuten alt, sobald limit > 500), aus verschiedenen Zwischenspeicher-Schluesseln je limit und aus einer veralteten CDN-Kopie
 * (stale-while-revalidate). "Noch im Spiel" kam dagegen aus dem niedrigsten je gesehenen Platz ueber alle Abfragen, die Zeilen aus der gerade
 * beantworteten - zwei verschiedene Staende in einer Ueberschrift. Und ein Name, den Epic gerade nicht aufloesen wollte (429), stand als gekuerzte Id da.
 *
 * Deshalb werden zwei Staende einer Runde vereinigt statt ersetzt: ein Team, das einmal einen Platz hatte, behaelt ihn (ein vergebener Platz ist
 * endgueltig), und ein einmal bekannter Name wird nie wieder durch die Id ersetzt. Alles, was daraus folgt (verbleibend, Lobby, Luecken, Sieger),
 * wird aus genau dieser vereinigten Aufstellung gerechnet - Ueberschrift und Zeilen stammen damit aus demselben Stand.
 *
 * Rein und ohne Abhaengigkeiten: laeuft im Server (Route) und im Browser (Seite).
 */

export interface StandSpieler { id: string; name: string }
export interface StandTeam {
  platz: number | null;
  tagesPlatz?: number;
  teamId?: string | null;
  spieler: StandSpieler[];
}

/** Steht da nur die (gekuerzte) Konto-Id statt eines Namens? */
export function istIdName(name: string | null | undefined, id: string | null | undefined): boolean {
  const n = String(name ?? '').trim().toLowerCase();
  if (!n) return true;
  const k = String(id ?? '').trim().toLowerCase();
  if (!k) return false;
  return n === k || n === k.slice(0, 8) || /^[0-9a-f]{32}$/.test(n);
}

const kontoKey = (id: string) => String(id ?? '').trim().toLowerCase();

/** Woran ein Team in beiden Staenden wiedererkannt wird: seine Konten. */
function teamKey(t: StandTeam): string {
  const k = t.spieler.map((s) => kontoKey(s.id)).filter(Boolean).sort().join('+');
  return k || `team:${t.teamId ?? ''}`;
}

/** Die bekannten (echten) Namen aus Teams sammeln. */
export function namenSammeln(teams: Iterable<StandTeam>, karte: Map<string, string>): void {
  for (const t of teams) {
    for (const s of t.spieler) {
      if (s.id && !istIdName(s.name, s.id)) karte.set(kontoKey(s.id), s.name);
    }
  }
}

/** Ein Team mit allen Id-Namen ersetzt, wo ein echter Name bekannt ist - dasselbe Objekt, wenn nichts zu tun ist. */
export function namenEinsetzen<T extends StandTeam>(t: T, karte: Map<string, string>): T {
  let anders = false;
  const spieler = t.spieler.map((s) => {
    if (!istIdName(s.name, s.id)) return s;
    const echt = karte.get(kontoKey(s.id));
    if (!echt) return s;
    anders = true;
    return { ...s, name: echt };
  });
  return anders ? { ...t, spieler } : t;
}

const hatPlatz = (t: StandTeam) => typeof t.platz === 'number';

/**
 * Zwei Aufstellungen derselben Runde vereinigen.
 *
 * Ein Team aus nur einem Stand bleibt; steht es in beiden, gilt der neue - ausser der neue kennt keinen Platz und der alte schon.
 */
export function teamsVereinigen<T extends StandTeam>(alt: T[], neu: T[]): T[] {
  const karte = new Map<string, string>();
  namenSammeln(alt, karte);
  namenSammeln(neu, karte);
  const nach = new Map<string, T>();
  for (const t of alt) nach.set(teamKey(t), t);
  for (const t of neu) {
    const k = teamKey(t);
    const a = nach.get(k);
    nach.set(k, a && hatPlatz(a) && !hatPlatz(t) ? a : t);
  }
  return [...nach.values()]
    .map((t) => namenEinsetzen(t, karte))
    .sort((a, b) => (a.platz ?? 9999) - (b.platz ?? 9999) || (a.tagesPlatz ?? 0) - (b.tagesPlatz ?? 0));
}

/** Die spaetere zweier Zeiten (ISO), null bleibt null. */
export function spaeter(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return b > a ? b : a;
}

/** Was aus einer Aufstellung folgt - an genau einer Stelle gerechnet, fuer Ueberschrift und Zeilen dieselbe. */
export function rundeAbleiten(teams: StandTeam[], live: boolean) {
  const plaetze = teams.map((x) => x.platz).filter((n): n is number => typeof n === 'number');
  const hoechster = plaetze.length ? Math.max(...plaetze) : 0;
  const niedrigster = plaetze.length ? Math.min(...plaetze) : 0;
  const lebt = live && niedrigster > 1;
  const erwartet = hoechster - (lebt ? niedrigster : 1) + 1;
  const einmalig = new Set(plaetze).size;
  return {
    hoechster,
    niedrigster,
    live: lebt,
    lobby: hoechster || null,
    verbleibend: lebt ? Math.max(0, niedrigster - 1) : 0,
    gesehen: teams.length,
    vollstaendig: plaetze.length > 0 && einmalig >= erwartet,
    fehlend: Math.max(0, erwartet - einmalig),
  };
}

/** Eine Runde, wie die Seite sie bekommt - nur was fuers Vereinigen zaehlt. */
export interface StandRunde<T extends StandTeam = StandTeam> {
  id: string;
  ende: string | null;
  teams: T[];
  live?: boolean;
  lobby?: number | null;
  verbleibend?: number;
  gesehen?: number;
  vollstaendig?: boolean;
  fehlend?: number;
  sieger?: string[];
  schmal?: boolean;
}

/**
 * Die neue Antwort mit dem vereinigen, was schon dasteht (Seite).
 *
 * Jede Runde wird teamweise vereinigt; eine Runde, die nur im alten Stand steht (die neue Antwort ist aelter und kennt sie noch nicht), bleibt.
 * Alles andere an der Runde (abgesagt, Dauer, ...) kommt aus der neuen Antwort.
 */
export function rundenMischen<R extends StandRunde>(alt: R[] | null | undefined, neu: R[]): R[] {
  if (!alt?.length) return neu;
  const altNach = new Map(alt.map((x) => [x.id, x]));
  const raus: R[] = neu.map((n) => {
    const a = altNach.get(n.id);
    if (!a || (n.schmal && !a.teams.length)) return n;
    // Eine schlanke Zeile ohne Teams (riesige Tage) loescht keine schon bekannte Aufstellung.
    const teams = teamsVereinigen(a.teams, n.teams);
    const d = rundeAbleiten(teams, Boolean(n.live));
    return {
      ...n,
      ende: spaeter(a.ende, n.ende),
      teams,
      live: d.live,
      lobby: d.lobby,
      verbleibend: d.verbleibend,
      gesehen: d.gesehen,
      vollstaendig: d.vollstaendig,
      fehlend: d.fehlend,
      sieger: teams.find((t) => t.platz === 1)?.spieler.map((x) => x.name) ?? n.sieger ?? [],
      schmal: n.schmal && !teams.length ? n.schmal : undefined,
    };
  });
  const da = new Set(neu.map((x) => x.id));
  for (const a of alt) if (!da.has(a.id)) raus.push(a);
  return raus.sort((a, b) => (b.ende ?? '').localeCompare(a.ende ?? ''));
}
