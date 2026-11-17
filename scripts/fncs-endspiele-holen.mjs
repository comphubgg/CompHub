// Die FNCS-Endspiele aus Epics eigenen Bestenlisten - fuer FNCS -> All-Time Stats (/api/fncs-alltime).
//
// Bis zum 16.11.2026 rechnete die All-Time-Tabelle aus einem Verzeichnis von Spieltagen, das aus einer fremden Quelle stammte.
// Das ist weg (17.11.2026). Die Ergebnisse selbst sind Epics Bestenlisten - die holen wir hier selbst, Fenster fuer Fenster:
//
//   * die Grand Finals und Global Championships mit ihren bekannten Epic-Kennungen (Event + Fenster je Tag, ENDSPIELE unten),
//   * dazu, was Epics laufender Katalog (/api/cup-catalog) an Grand-Finals-Fenstern fuehrt (kuenftige Majors kommen so von selbst).
//
// Je Endspiel: jedes Team mit Platz, Punkten, Siegen, Eliminierungen und Spielen - bei zwei Tagen beide zusammengerechnet, neu gereiht.
// Epic fuehrt Eliminierungen nur je Team (TEAM_ELIMS_STAT_INDEX); jedes Teammitglied traegt die seines Teams - die Seite sagt das so.
// Was Epic nicht mehr herausgibt, steht mit Epics Antwort unter "fehlend".
//
// Die Bestenlisten holt das eigene Werkzeug ueber seine Schnittstelle (die Anmeldung bei Epic bleibt dort):
//
//   WERKZEUG_URL=https://www.thecomphub.com node scripts/fncs-endspiele-holen.mjs
//   node scripts/fncs-endspiele-holen.mjs --nur S40,S41      nur diese Saisons neu, der Rest bleibt aus der alten Datei
//
// Ergebnis: data/fncs-endspiele.json (am Release "daten", lib/ablageGithub). Die Seite liest sie erst, wenn jemand die
// All-Time Stats aufruft - nicht beim Start.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASIS = (process.env.WERKZEUG_URL || 'http://localhost:3000').replace(/\/+$/, '');
const ZIEL = path.join(process.cwd(), 'data', 'fncs-endspiele.json');
const argumente = process.argv.slice(2);
const nurIdx = argumente.indexOf('--nur');
const NUR = nurIdx >= 0 ? new Set(String(argumente[nurIdx + 1] ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
const GLEICHZEITIG = 4;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Die Endspiele mit ihren Epic-Kennungen. Je Tag eine Liste moeglicher Fenster - das erste, das Epic beantwortet, gilt.
 * Geprueft am 17.11.2026 ueber /api/cup-leaderboard; die Platz-1-Teams stimmen mit lib/fncsFakten ueberein.
 *
 *   Chapter 1 SX bis Chapter 2 S2: das Finale ist "Event 5" der Finals (Sonntag), ein Tag.
 *   Chapter 2 S3: ein Fenster "GrandFinals" (Solo).
 *   Chapter 2 S4: Event bekannt (epicgames_S14_FNCS_Finals_EU_PC), das Fenster des Finales nicht.
 *   Chapter 2 S5 bis Chapter 3 S3: Epic kennt das Event, aber die Wertung lag in einem Fenster ohne Bestenliste
 *     ("No leaderboardId defined in score location") - Epic gibt sie nicht mehr heraus.
 *   Ab Chapter 4: zwei Tage, die Summe beider ist das Ergebnis.
 */
const gf = (saison, nr, titel, eventId, tage) => ({ key: `${saison}|gf`, saison, art: 'gf', region: 'EU', titel, nr, eventId, tage });
const gc = (saison, jahr, eventId, tage) => ({ key: `${saison}|gc`, saison, art: 'gc', region: 'GLOBAL', titel: `Global Championship ${jahr}`, jahr, eventId, tage });
const zweiTage = (f) => [[f(1)], [f(2)]];

const ENDSPIELE = [
  gf('S10', null, 'FNCS Grand Finals', 'epicgames_S10_FNCS_Finals_EU', [['S10_FNCS_Finals_EU_Event5']]),
  gf('S11', null, 'FNCS Grand Finals', 'epicgames_S11_FNCS_Finals_EU', [['S11_FNCS_Finals_EU_Event5']]),
  gf('S12', null, 'FNCS Grand Finals', 'epicgames_S12_FNCS_Finals_PC_EU', [['S12_FNCS_Finals_EU_PC_Event5']]),
  gf('S13', null, 'FNCS Grand Finals', 'epicgames_S13_FNCS_EU_Finals_PC', [['S13_FNCS_EU_Finals_PC_GrandFinals']]),
  gf('S14', null, 'FNCS Grand Finals', 'epicgames_S14_FNCS_Finals_EU_PC', [['S14_FNCS_Grandfinals_EU_PC', 'S14_FNCS_GrandFinals_EU_PC', 'S14_FNCS_Finals_EU_PC_Event2']]),
  gf('S15', null, 'FNCS Grand Finals', 'epicgames_S15_FNCS_GrandFinals_EU', [['S15_FNCS_GrandFinals_EU', 'S15_FNCS_GrandFinals_EU_Round2']]),
  ...['S16', 'S17', 'S18', 'S19', 'S20', 'S21'].map((s) => gf(s, null, 'FNCS Grand Finals', `epicgames_${s}_FNCS_Finals_EU`, [[`${s}_FNCS_Finals_EU`, `${s}_FNCS_Finals_EU_Round2`]])),
  gf('S23', 1, 'FNCS Major 1', 'epicgames_S23_FNCS_Major1_GrandFinals_EU', zweiTage((d) => `S23_FNCS_Major1_GrandFinals_EU_Day${d}`)),
  gf('S24', 2, 'FNCS Major 2', 'epicgames_S24_FNCS_Major2_GrandFinals_EU', zweiTage((d) => `S24_FNCS_Major2_GrandFinals_EU_Day${d}`)),
  gf('S25', 3, 'FNCS Major 3', 'epicgames_S25_FNCS_Major3_GrandFinals_EU', zweiTage((d) => `S25_FNCS_Major3_GrandFinals_EU_Day${d}`)),
  gf('S28', 1, 'FNCS Major 1', 'epicgames_S28_FNCS_Major1_GrandFinals_EU', zweiTage((d) => `S28_FNCS_Major1_GrandFinalDay${d}_EU`)),
  gf('S29', 2, 'FNCS Major 2', 'epicgames_S29_FNCS_Major2_GrandFinals_EU', zweiTage((d) => `S29_FNCS_Major2_GrandFinalDay${d}_EU`)),
  gf('S30', 3, 'FNCS Major 3', 'epicgames_S30_FNCS_Major3_GrandFinals_EU', zweiTage((d) => `S30_FNCS_Major3_GrandFinalDay${d}_EU`)),
  gc('S31', 2024, 'epicgames_BambiRaptor', zweiTage((d) => `BambiRaptor_Day${d}`)),
  gf('S33', 1, 'FNCS Major 1', 'epicgames_S33_FNCSMajor1_Final_EU', zweiTage((d) => `S33_FNCSMajor1_Final_Day${d}_EU`)),
  gf('S34', 2, 'FNCS Major 2', 'epicgames_S34_FNCSMajor2_Final_EU', zweiTage((d) => `S34_FNCSMajor2_Final_Day${d}_EU`)),
  gf('S36', 3, 'FNCS Major 3', 'epicgames_S36_FNCSMajor3_Final_EU', zweiTage((d) => `S36_FNCSMajor3_Final_Day${d}_EU`)),
  gc('S37', 2025, 'epicgames_Dinosauron_Official', zweiTage((d) => `Dinosauron_Day${d}`)),
  gf('S40', 1, 'FNCS Major 1', 'epicgames_S40_FNCSMajor1_Final_EU', zweiTage((d) => `S40_FNCSMajor1_Final_Day${d}_EU`)),
  gf('S41', 2, 'FNCS Major 2', 'epicgames_S41_FNCSMajor2_Final_EU', zweiTage((d) => `S41_FNCSMajor2_Final_Day${d}_EU`)),
  gc('S42', 2026, 'epicgames_MannekenPis_Official', zweiTage((d) => `MannekenPis_Day${d}`)),
];

/** Kuenftige Majors aus Epics laufendem Katalog: "S44_FNCSMajor1_Final_Day1_EU" und der zweite Tag dazu. */
async function ausKatalog(bekannt) {
  let k;
  try { k = await json(`${BASIS}/api/cup-catalog?modus=alle`); } catch (e) { console.log(`Katalog: ${e.message}`); return []; }
  const raus = new Map();
  for (const cup of k.cups ?? []) {
    for (const liste of Object.values(cup.regionen ?? {})) {
      for (const f of liste ?? []) {
        const m = /^(S\d+)_FNCSMajor(\d)_Final_Day1_EU$/.exec(f.windowId ?? '');
        if (!m || !f.eventId || bekannt.has(`${m[1]}|gf`)) continue;
        if (typeof f.end === 'number' && f.end > Date.now()) continue; // noch nicht gespielt
        raus.set(`${m[1]}|gf`, gf(m[1], Number(m[2]), `FNCS Major ${m[2]}`, f.eventId, [[f.windowId], [f.windowId.replace('_Day1_', '_Day2_')]]));
      }
    }
  }
  return [...raus.values()];
}

class NichtBeiEpic extends Error {}

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* kein JSON */ }
  if (!r.ok || j?.error) {
    const grund = String(j?.error ?? text).slice(0, 400);
    // Epics 404/400 reicht die Seite als 500 weiter - das ist eine Antwort, kein Aussetzer.
    if (/HTTP 40[04] bei https:\/\/events-public-service|not found|No leaderboardId/i.test(grund)) throw new NichtBeiEpic(grund.replace(/^.*-> /s, '').replace(/\s+/g, ' ').slice(0, 200));
    throw new Error(`HTTP ${r.status}: ${grund.slice(0, 160)}`);
  }
  return j;
}

/** Ein Tag: die Bestenliste (Endspiele haben hoechstens hundert Teams), drei Versuche bei Aussetzern. */
async function holeTag(eventId, windowId) {
  const url = `${BASIS}/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&limit=200`;
  for (let v = 1; ; v += 1) {
    try {
      const j = await json(url);
      return j.entries ?? [];
    } catch (e) {
      if (e instanceof NichtBeiEpic || v >= 3) throw e;
      await warte(5000 * v);
    }
  }
}

const IST_ID = /^[0-9a-f]{32}$/i;

async function holeEndspiel(e, namen, laender) {
  const tage = [];
  for (const kandidaten of e.tage) {
    let letzter = null;
    let tag = null;
    for (const w of kandidaten) {
      try {
        const eintraege = await holeTag(e.eventId, w);
        if (eintraege.length) { tag = { windowId: w, eintraege }; break; }
        letzter = new NichtBeiEpic('leere Bestenliste');
      } catch (err) { letzter = err; if (!(err instanceof NichtBeiEpic)) break; }
    }
    if (!tag) throw letzter ?? new Error('nichts geholt');
    tage.push(tag);
  }
  // Teams ueber die Tage zusammen: Schluessel sind die sortierten Konto-Ids.
  const summe = new Map();
  let datum = null;
  for (const t of tage) {
    for (const x of t.eintraege) {
      const ids = (x.players ?? []).map((p) => p.id).filter(Boolean).sort();
      if (!ids.length) continue;
      for (const p of x.players ?? []) {
        if (p.name && !IST_ID.test(p.name) && p.name !== String(p.id).slice(0, 8)) namen[p.id] = p.name;
        if (p.spielLand) laender[p.id] = String(p.spielLand).toUpperCase();
      }
      for (const m of x.matches ?? []) {
        const z = Date.parse(m.endTime ?? '');
        if (Number.isFinite(z) && (datum === null || z < datum)) datum = z;
      }
      const k = ids.join('+');
      const a = summe.get(k) ?? { spieler: ids, punkte: 0, siege: 0, elims: 0, spiele: 0, tage: 0, besterRang: Infinity };
      a.punkte += x.points ?? 0; a.siege += x.wins ?? 0; a.elims += x.elims ?? 0; a.spiele += x.games ?? 0; a.tage += 1;
      a.besterRang = Math.min(a.besterRang, x.rank ?? Infinity);
      summe.set(k, a);
    }
  }
  // Ein Tag: Epics Rang gilt. Zwei Tage: nach Punkten, dann Siegen, dann Eliminierungen; Epics Rang des letzten Tages entscheidet den Rest.
  const letzterRang = new Map((tage[tage.length - 1]?.eintraege ?? []).map((x) => [(x.players ?? []).map((p) => p.id).sort().join('+'), x.rank ?? Infinity]));
  const teams = [...summe.entries()]
    .sort(([ka, a], [kb, b]) => (tage.length === 1 ? a.besterRang - b.besterRang : 0)
      || b.punkte - a.punkte || b.siege - a.siege || b.elims - a.elims || (letzterRang.get(ka) ?? Infinity) - (letzterRang.get(kb) ?? Infinity))
    .map(([, a], i) => ({ rang: i + 1, punkte: a.punkte, siege: a.siege, elims: a.elims, spiele: a.spiele, spieler: a.spieler }));
  return {
    key: e.key, saison: e.saison, art: e.art, region: e.region, titel: e.titel,
    ...(e.nr ? { nr: e.nr } : {}), ...(e.jahr ? { jahr: e.jahr } : {}),
    eventId: e.eventId, fenster: tage.map((t) => t.windowId), datum, teams,
  };
}

async function main() {
  let alt = null;
  try { alt = JSON.parse(await fs.readFile(ZIEL, 'utf8')); } catch { alt = null; }
  const liste = [...ENDSPIELE];
  liste.push(...await ausKatalog(new Set(liste.map((e) => e.key))));
  const dran = liste.filter((e) => !NUR || NUR.has(e.saison));
  console.log(`${dran.length} Endspiele zu holen (von ${liste.length} bekannten) ueber ${BASIS}`);

  const namen = { ...(alt?.namen ?? {}) };
  const laender = { ...(alt?.laender ?? {}) };
  const geholt = new Map();
  const fehlend = [];
  let i = 0;
  await Promise.all(Array.from({ length: GLEICHZEITIG }, async () => {
    while (i < dran.length) {
      const e = dran[i++];
      try {
        const r = await holeEndspiel(e, namen, laender);
        geholt.set(e.key, r);
        console.log(`  ${e.key.padEnd(9)} ${r.fenster.join(' + ')}: ${r.teams.length} Teams`);
      } catch (err) {
        const art = err instanceof NichtBeiEpic ? 'nicht bei Epic' : 'Aussetzer';
        fehlend.push({ key: e.key, saison: e.saison, art: e.art, titel: e.titel, eventId: e.eventId, fenster: e.tage.map((t) => t[0]), grund: `${art}: ${err.message}` });
        console.log(`  ${e.key.padEnd(9)} fehlt (${art}): ${err.message}`);
      }
    }
  }));

  // Was in diesem Lauf nicht drankam oder nur aussetzte, bleibt aus der alten Datei - ein Aussetzer loescht kein Endspiel.
  const endspiele = [];
  const fehlendNeu = [];
  for (const e of liste) {
    const neu = geholt.get(e.key);
    const vorher = (alt?.endspiele ?? []).find((x) => x.key === e.key);
    const f = fehlend.find((x) => x.key === e.key);
    if (neu) endspiele.push(neu);
    else if (vorher && (!f || f.grund.startsWith('Aussetzer'))) endspiele.push(vorher);
    else if (f) fehlendNeu.push(f);
    else { const fa = (alt?.fehlend ?? []).find((x) => x.key === e.key); if (fa) fehlendNeu.push(fa); }
  }
  endspiele.sort((a, b) => Number(a.saison.slice(1)) - Number(b.saison.slice(1)) || a.art.localeCompare(b.art));
  if (!endspiele.length) { console.error('Kein einziges Endspiel geholt - nichts geschrieben.'); process.exit(1); }

  // Nur Namen und Flaggen von Konten, die in einem Endspiel stehen.
  const konten = new Set(endspiele.flatMap((e) => e.teams.flatMap((t) => t.spieler)));
  const nur = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => konten.has(k)));
  const datei = {
    hinweis: 'FNCS Grand Finals (EU) and Global Championships from Epic\'s own leaderboards (events-public-service via /api/cup-leaderboard), '
      + 'built by scripts/fncs-endspiele-holen.mjs. Per team: rank, points, wins, eliminations (Epic counts eliminations per team) and games; '
      + 'two-day finals are summed. namen = Epic display names, laender = the flag the player picked in Fortnite. '
      + '"fehlend" lists finals Epic no longer serves, with Epic\'s answer.',
    stand: new Date().toISOString(),
    endspiele, fehlend: fehlendNeu, namen: nur(namen), laender: nur(laender),
  };
  await fs.mkdir(path.dirname(ZIEL), { recursive: true });
  const zwischen = `${ZIEL}.${process.pid}.neu`;
  await fs.writeFile(zwischen, JSON.stringify(datei), 'utf8');
  await fs.rename(zwischen, ZIEL);
  console.log(`${endspiele.length} Endspiele, ${fehlendNeu.length} fehlen, ${konten.size} Konten -> ${path.relative(process.cwd(), ZIEL)}`);
  for (const f of fehlendNeu) console.log(`  fehlt: ${f.key} ${f.grund}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
