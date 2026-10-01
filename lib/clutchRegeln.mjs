/*
 * Die Wertungsregeln eines Spieltags herleiten, wenn Epic sie nicht mehr
 * herausgibt.
 *
 * Der Betreiber (1.10.2026): Solo Clutch Points "sollen ueberall sein, in
 * jedem Tournament". In 109 von 144 gelesenen Spieltagen fehlten sie, weil
 * die Punktetabelle fehlte: Epics Katalog fuehrt sie nur, solange ein Cup
 * laeuft (scripts/clutch-berechnen.mjs, wertung()). Fuer die Division Cups
 * ist sie lange weg.
 *
 * Geraten wird nicht. Die Tabelle eines FNCS-Cups hat immer dieselbe Form:
 * Platz 1 neun Punkte, Platz 2 bis 5 je vier dazu, Platz 6 bis 25 je zwei
 * dazu (additiv, wie in den Tabellen der Globals), dazu ein fester Wert je
 * Elimination des Teams. Offen ist nur dieser Wert - und der laesst sich
 * pruefen: Epic fuehrt je Team die Punkte des Spieltags, dazu seine
 * Eliminationen. Aus den Plaetzen der Replays und diesem Wert muss genau die
 * Punktzahl herauskommen, die Epic nennt. Eine Tabelle gilt erst, wenn das
 * bei mindestens 90 Prozent der Teams stimmt (Stand 1.10.2026: Division 1
 * Offene Runden mit 2 Punkten je Elimination 96 bis 99 Prozent, Division 1
 * Finals mit 4 Punkten 96 bis 100 Prozent, Division 2 mit 1 Punkt 94 bis 98
 * Prozent). Was sich so nicht belegen laesst - Ranked Cups, Victory Cups,
 * Division 3 -, bleibt ohne Clutch Points.
 */

const REGEL_ORT = 'https://github.com/comphubgg/CompHub/releases/download/daten-spieltage';

/** Platz-Stufen, additiv: jede Stufe zaehlt, wenn der Platz so gut oder besser ist. */
function platzStufen(erster, mitte, bisMitte, unten, bisUnten) {
  const st = [[1, erster]];
  for (let k = 2; k <= bisMitte; k++) st.push([k, mitte]);
  for (let k = bisMitte + 1; k <= bisUnten; k++) st.push([k, unten]);
  return st;
}
const SAETZE = {
  // Wie Globals, Division und Performance Cup.
  A: platzStufen(9, 4, 5, 2, 25),
  // Wie die Reload Cash Cups.
  C: platzStufen(10, 5, 5, 3, 15),
};

/** Die Tabelle in der Form, in der sie am Spieltag steht (siehe clutch-berechnen.mjs). */
export function regelnAus(satz, elimPunkte) {
  return [
    ...SAETZE[satz].map(([platz, punkte]) => ({ was: 'Placement', schwelle: platz, regel: 'lte', punkte, jeStueck: false })),
    { was: 'Elimination', schwelle: 1, regel: 'gte', punkte: elimPunkte, jeStueck: true },
  ];
}

const punkteFuerPlatz = (stufen, p) => stufen.reduce((a, [bis, pt]) => a + (p <= bis ? pt : 0), 0);

async function holeJson(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/**
 * Welche Tabelle passt zu Epics Punkten dieses Spieltags?
 *
 * @param windowId  Kennung des Spieltags, z. B. "S42_FNCSDivisionalCup_Division1_Week2Final_EU"
 * @param matches   die Rohdaten der Replays (data/clutch-roh/<windowId>.json, "matches")
 * @returns { regeln, beleg } oder null, wenn keine Tabelle belegt ist
 */
export async function regelnHerleiten(windowId, matches) {
  const saison = /^(S\d+)_/.exec(windowId)?.[1];
  if (!saison || !matches?.length) return null;
  const epic = await holeJson(`${REGEL_ORT}/epic-spieltage__${saison}__${windowId}.json`);
  if (!epic?.teams?.length) return null;

  // Je Team von Epic: sein Platz in jedem Match der Replays.
  const teamVon = new Map();
  epic.teams.forEach((t, k) => (t.spieler ?? []).forEach((id) => teamVon.set(String(id).toLowerCase(), k)));
  const plaetze = epic.teams.map(() => []);
  for (const m of matches) {
    const gesehen = new Map();
    for (const p of m.spieler ?? []) {
      if (!p.epic) continue;
      const k = teamVon.get(String(p.epic).toLowerCase());
      if (k === undefined || gesehen.has(p.team)) continue;
      gesehen.set(p.team, { k, platz: p.platz });
    }
    for (const t of gesehen.values()) plaetze[t.k].push(t.platz);
  }
  // Nur Teams, von denen alle Matches in den Replays stehen - sonst fehlt ein Platz.
  const pruefbar = epic.teams
    .map((t, k) => ({ t, p: plaetze[k] }))
    .filter(({ t, p }) => t.matches > 0 && p.length === t.matches && p.every((x) => typeof x === 'number'));
  if (pruefbar.length < 20) return null;

  const ergebnisse = [];
  for (const satz of Object.keys(SAETZE)) {
    for (let e = 1; e <= 6; e++) {
      const genau = pruefbar.filter(({ t, p }) =>
        p.reduce((a, x) => a + punkteFuerPlatz(SAETZE[satz], x), 0) + e * t.teamElims === t.punkte).length;
      ergebnisse.push({ satz, e, genau });
    }
  }
  ergebnisse.sort((a, b) => b.genau - a.genau);
  const [beste, zweite] = ergebnisse;
  const anteil = beste.genau / pruefbar.length;
  // Mindestens 90 Prozent, und deutlich besser als jede andere Tabelle.
  if (anteil < 0.9 || (zweite.genau / pruefbar.length) > anteil - 0.2) return null;
  return {
    regeln: regelnAus(beste.satz, beste.e),
    beleg: { satz: beste.satz, elimPunkte: beste.e, teams: pruefbar.length, genau: beste.genau },
  };
}
