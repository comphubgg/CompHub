// Die Team-Eliminierungen je Konto - aus Epics Bestenlisten seit 2019.
//
// Der Betreiber wollte fuer die Jahre vor dem Archiv der Szene (2019 bis
// 2023) mehr als nur das Preisgeld: "Team-elims statistics 2019 to 2023
// from Epic leaderboards." Epics Bestenlisten fuehren je Team die
// Eliminierungen des ganzen Teams ("teamElims") - keine Werte je Spieler,
// keinen Schaden. Also zaehlt hier jedes Teammitglied die Eliminierungen
// seines Teams je Spieltag; die Liste heisst deshalb ehrlich
// "Team-Eliminierungen" und nicht "Eliminierungen".
//
// Die Bestenlisten liegen unter data/epic-spieltage-alt (tausende Dateien,
// nur auf dem Rechner) und data/epic-spieltage (stuendlich, auch am
// Laufrechner). Gekuerzt auf die besten 500 Teams je Spieltag plus alle
// Teams ab 100 Punkten - wer weiter hinten stand, fehlt. Das Ergebnis ist
// eine kleine Datei mit fertigen Bestenlisten, die Seite und Laufrechner
// lesen:
//
//   data/elims-archiv.json
//   { konten: [epicId, ...],
//     listen: { "<jahr>|<region>": { spieltage, plaetze: [[konto, teamElims, matches, spieltage], ...] },
//               "<saison>|<region>": ... , "0|": alle Zeit } }
//
// "konto" ist der Index in "konten". Region leer heisst alle Regionen.
// LAN-Spieltage tragen keine Region und zaehlen nur dort.
//
// Zwei Betriebsarten:
//
//   node scripts/elims-archiv.mjs
//     Auf dem Rechner mit allen Dateien: alles neu. Schreibt dazu
//     data/elims-summen-alt.json - die Summen aller abgeschlossenen Saisons
//     (Jahre vor dem laufenden) je Konto und Region, damit der Laufrechner
//     "alle Zeit" fortschreiben kann, ohne die alten Dateien zu haben.
//
//   node scripts/elims-archiv.mjs --ergaenzen
//     Auf dem Laufrechner, stuendlich: die offenen Saisons neu aus
//     data/epic-spieltage, das laufende Jahr und "alle Zeit" daraus plus
//     den abgeschlossenen Summen. Alle anderen Listen bleiben, wie sie
//     sind. Der Betreiber will keine Daten, die stehen bleiben: "einmal
//     taeglich" hat er beim Ranking verlangt, und hier geht es stuendlich.

import { promises as fs } from 'fs';
import path from 'path';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'elims-archiv.json');
const ALT = path.join(DATEN, 'elims-summen-alt.json');
const ergaenzen = process.argv.includes('--ergaenzen');
const ORDNER = ergaenzen ? ['epic-spieltage'] : ['epic-spieltage', 'epic-spieltage-alt'];
/** Wie viele Plaetze je Liste - wie LISTEN_LAENGE in lib/szeneStats. */
const LAENGE = 400;
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const HINWEIS = 'Team eliminations per account from Epic\'s leaderboards (data/epic-spieltage-alt on the operator\'s machine and data/epic-spieltage). Epic lists eliminations per team, not per player, so every member counts the team\'s eliminations of each match day. Leaderboards are cut to the top 500 teams per match day plus every team with 100 points or more. Keys: "<year>|<region>", "<season>|<region>", "0|" for all time; an empty region means all regions. Rows: [index into "konten", team eliminations, matches, match days]. Built by scripts/elims-archiv.mjs; the hourly run refreshes the open seasons with --ergaenzen.';

async function jsonLesen(p, standard = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return standard; }
}

/** Welche Saisons zu welchem Jahr zaehlen - aus lib/saisonJahre.ts, damit es nur eine Liste gibt. */
async function jahrVonSaisonKarte() {
  const quelle = await fs.readFile(path.join(process.cwd(), 'lib', 'saisonJahre.ts'), 'utf8');
  const karte = new Map();
  for (const m of quelle.matchAll(/(\d{4}):\s*\[([^\]]*)\]/g)) {
    for (const s of m[2].matchAll(/'(S\d+)'/g)) karte.set(s[1], Number(m[1]));
  }
  if (!karte.size) throw new Error('JAHR_SAISONS nicht gefunden in lib/saisonJahre.ts');
  return karte;
}

/** Saison je Fenster, wo die Kennung keine traegt: Archiv der Szene und LAN-Datei. */
async function saisonNachschlagen() {
  const karte = new Map();
  for (const e of await jsonLesen(path.join(DATEN, 'szene-stats', 'index.json'), [])) {
    if (e.windowId && e.season) karte.set(e.windowId, e.season);
  }
  const lan = await jsonLesen(path.join(DATEN, 'lan-preisgelder.json'), { eintraege: [] });
  const praefixe = new Map();
  for (const e of lan.eintraege ?? []) {
    if (e.fenster && e.season) praefixe.set(e.fenster.split('_')[0], e.season);
  }
  return { karte, praefixe };
}

function saisonFuer(windowId, ordner, datum, nachschlag) {
  // "S12_..." und einmal "S24CollegiateCup_..." - die Saison steht vorn.
  const m = windowId.match(/(?:^|_)(S\d+)(?:_|[A-Z])/);
  if (m) return m[1];
  if (/^S\d+$/.test(ordner)) return ordner;
  if (nachschlag.karte.has(windowId)) return nachschlag.karte.get(windowId);
  const praefix = windowId.replace(/^epicgames_/, '').split('_')[0];
  if (nachschlag.praefixe.has(praefix)) return nachschlag.praefixe.get(praefix);
  // 2019 vor Season X: Chapter 1 Season 8 lief bis zum 9. Mai, Season 9 bis
  // zum 1. August - wie saisonVonFenster in lib/szeneStats.
  const tag = datum ? new Date(datum).toISOString().slice(0, 10) : '';
  if (tag && tag < '2019-05-09') return 'S8';
  if (tag && tag < '2019-08-01') return 'S9';
  return '';
}

/** Region aus Datei oder Kennung - "NAE" hiess frueher, was heute NAC ist. */
function regionFuer(datei, windowId) {
  if (datei.region && REGIONEN.includes(datei.region)) return datei.region;
  const m = windowId.match(/(?:^|_)(EU|NAE|NAC|NAW|BR|ASIA|ME|OCE)(?:_|$)/);
  if (!m) return '';
  return m[1] === 'NAE' ? 'NAC' : m[1];
}

/** Alle Fenster: je Kennung die Datei mit den meisten Teams. */
async function fensterSammeln() {
  const karte = new Map();
  for (const ordner of ORDNER) {
    const wurzel = path.join(DATEN, ordner);
    for (const saison of await fs.readdir(wurzel).catch(() => [])) {
      const d = path.join(wurzel, saison);
      if (!(await fs.stat(d)).isDirectory()) continue;
      for (const f of await fs.readdir(d)) {
        if (!f.endsWith('.json')) continue;
        const j = await jsonLesen(path.join(d, f));
        if (!j?.windowId || !Array.isArray(j.teams) || !j.teams.length) continue;
        const da = karte.get(j.windowId);
        if (da && da.teams.length >= j.teams.length) continue;
        karte.set(j.windowId, { ...j, ordner: saison });
      }
    }
  }
  return karte;
}

/** In eine Summenkarte (konto -> [elims, matches, spieltage]) einrechnen. */
function dazu(karte, konto, e) {
  const da = karte.get(konto);
  if (da) { da[0] += e[0]; da[1] += e[1]; da[2] += e[2]; } else karte.set(konto, [e[0], e[1], e[2]]);
}

/**
 * Die Summen je "saison|region" aus den Fenstern - und je Saison, wie viele
 * Spieltage es waren.
 */
function summieren(fenster, nachschlag, nurSaisons) {
  const eventIds = new Set([...fenster.values()].map((f) => f.eventId));
  const uebersprungen = [];
  const summen = new Map();
  const spieltage = new Map();
  const fensterJeSaison = new Map();
  for (const [windowId, f] of fenster) {
    /*
     * Was nicht zaehlt:
     *   - Epics Testfenster ("pv_test")
     *   - die Gesamtwertung eines Finales, wenn seine Tage einzeln da sind -
     *     sonst zaehlte jede Eliminierung doppelt
     *   - Fenster ohne Saison (dann ist kein Jahr bestimmbar)
     */
    if (/_pv_test_/i.test(windowId)) continue;
    if (/CumulativeLeaderboard$/.test(windowId)) {
      const stamm = 'epicgames_' + windowId.replace(/^epicgames_/, '').replace(/_CumulativeLeaderboard$/, '');
      if (eventIds.has(stamm)) continue;
    }
    const saison = saisonFuer(windowId, f.ordner, f.datum, nachschlag);
    if (!saison) { uebersprungen.push(windowId); continue; }
    if (nurSaisons && !nurSaisons(saison)) continue;
    fensterJeSaison.set(saison, (fensterJeSaison.get(saison) ?? 0) + 1);
    const region = regionFuer(f, windowId);
    const schluessel = [`${saison}|`, ...(region ? [`${saison}|${region}`] : [])];
    for (const k of schluessel) {
      spieltage.set(k, (spieltage.get(k) ?? 0) + 1);
      if (!summen.has(k)) summen.set(k, new Map());
    }
    for (const team of f.teams) {
      const e = [Number(team.teamElims) || 0, Number(team.matches) || 0, 1];
      for (const id of team.spieler ?? []) {
        if (!/^[0-9a-f]{32}$/i.test(id)) continue;
        for (const k of schluessel) dazu(summen.get(k), id, e);
      }
    }
  }
  if (uebersprungen.length) console.log(`ohne Saison, nicht gezaehlt: ${uebersprungen.join(', ')}`);
  return { summen, spieltage, fensterJeSaison };
}

/** Saison-Summen zu Jahren und "alle Zeit" (0) zusammenfassen - aus vollen Summen, nicht aus Listen. */
function zusammenfassen(summen, spieltage, jahrVon) {
  const gesamt = new Map();
  const tage = new Map();
  for (const [k, m] of summen) {
    const [saison, region] = k.split('|');
    const jahr = jahrVon.get(saison);
    if (!jahr) console.log(`Saison ${saison} gehoert zu keinem Jahr (lib/saisonJahre.ts) - nur als Saison gefuehrt.`);
    for (const ziel of [...(jahr ? [`${jahr}|${region}`] : []), `0|${region}`]) {
      if (!gesamt.has(ziel)) gesamt.set(ziel, new Map());
      const z = gesamt.get(ziel);
      for (const [konto, e] of m) dazu(z, konto, e);
      tage.set(ziel, (tage.get(ziel) ?? 0) + (spieltage.get(k) ?? 0));
    }
  }
  return { gesamt, tage };
}

async function main() {
  const jahrVon = await jahrVonSaisonKarte();
  const nachschlag = await saisonNachschlagen();
  const laufendesJahr = new Date().getUTCFullYear();

  // Das Bestehende: beim Ergaenzen die Grundlage, sonst nur die Kontenliste
  // (damit Indizes stabil bleiben, falls jemand sie sich gemerkt hat).
  const bestehend = await jsonLesen(ZIEL, null);
  const konten = Array.isArray(bestehend?.konten) ? [...bestehend.konten] : [];
  const index = new Map(konten.map((id, i) => [id, i]));
  const nummer = (id) => {
    let n = index.get(id);
    if (n === undefined) { n = konten.length; konten.push(id); index.set(id, n); }
    return n;
  };
  const listen = ergaenzen && bestehend?.listen ? { ...bestehend.listen } : {};
  const ablegen = (schluessel, m, tage) => {
    const plaetze = [...m.entries()]
      .filter(([, e]) => e[0] > 0)
      .sort((a, b) => b[1][0] - a[1][0] || b[1][2] - a[1][2])
      .slice(0, LAENGE)
      .map(([id, e]) => [nummer(id), e[0], e[1], e[2]]);
    listen[schluessel] = { spieltage: tage, plaetze };
  };

  let fensterJeSaison;
  let abgeschlossen;
  if (!ergaenzen) {
    const fenster = await fensterSammeln();
    console.log(`${fenster.size} Fenster`);
    const s = summieren(fenster, nachschlag, null);
    fensterJeSaison = s.fensterJeSaison;
    const { gesamt, tage } = zusammenfassen(s.summen, s.spieltage, jahrVon);
    for (const [k, m] of gesamt) ablegen(k, m, tage.get(k) ?? 0);
    for (const [k, m] of s.summen) ablegen(k, m, s.spieltage.get(k) ?? 0);

    /*
     * Die abgeschlossenen Saisons als volle Summen je Konto und Region -
     * fuer den Laufrechner (siehe Kopf). Abgeschlossen ist, was zu einem
     * frueheren Jahr gehoert; die Kontenliste steht als ein Text, damit die
     * Datei nicht doppelt so gross wird.
     */
    abgeschlossen = [...s.fensterJeSaison.keys()].filter((sai) => {
      const j = jahrVon.get(sai);
      return j && j < laufendesJahr;
    }).sort();
    const altSummen = new Map();
    const altTage = new Map();
    for (const [k, m] of s.summen) {
      const [saison, region] = k.split('|');
      if (!abgeschlossen.includes(saison)) continue;
      if (!altSummen.has(region)) altSummen.set(region, new Map());
      const z = altSummen.get(region);
      for (const [konto, e] of m) dazu(z, konto, e);
      altTage.set(region, (altTage.get(region) ?? 0) + (s.spieltage.get(k) ?? 0));
    }
    const altKonten = [];
    const altIndex = new Map();
    const altSummenFlach = {};
    for (const [region, m] of altSummen) {
      const flach = [];
      for (const [id, e] of m) {
        let n = altIndex.get(id);
        if (n === undefined) { n = altKonten.length; altKonten.push(id); altIndex.set(id, n); }
        flach.push(n, e[0], e[1], e[2]);
      }
      altSummenFlach[region] = flach;
    }
    await fs.writeFile(ALT, JSON.stringify({
      hinweis: 'Full sums of team eliminations over the closed seasons (years before the current one) per account and region - the base the hourly run adds the open seasons to for the all-time list. "konten" is one string of 32-character account ids; "summen[region]" is flat: index, team eliminations, matches, match days, repeated. Built by scripts/elims-archiv.mjs on the operator\'s machine.',
      stand: new Date().toISOString(),
      saisons: abgeschlossen,
      spieltage: Object.fromEntries(altTage),
      konten: altKonten.join(''),
      summen: altSummenFlach,
    }), 'utf8');
    console.log(`abgeschlossene Saisons: ${abgeschlossen.join(' ')} - ${altKonten.length} Konten, geschrieben: ${path.relative(process.cwd(), ALT)} (${Math.round((await fs.stat(ALT)).size / 1024)} KB)`);
  } else {
    /*
     * Ergaenzen: nur die offenen Saisons, aus data/epic-spieltage. Fehlt
     * eine Grundlage, bleibt alles wie es ist - lieber ein alter Stand als
     * ein halber.
     */
    if (!bestehend?.listen) { console.log('Kein data/elims-archiv.json - nichts zu ergaenzen.'); return; }
    const alt = await jsonLesen(ALT, null);
    if (!alt?.summen || typeof alt.konten !== 'string') { console.log('Kein data/elims-summen-alt.json - nichts zu ergaenzen.'); return; }
    const zu = new Set(alt.saisons ?? []);
    const fenster = await fensterSammeln();
    const s = summieren(fenster, nachschlag, (sai) => !zu.has(sai));
    if (!s.summen.size) { console.log('Keine offenen Saisons unter data/epic-spieltage - nichts zu ergaenzen.'); return; }
    /*
     * Nie weniger als vorher: hat dieser Rechner fuer eine offene Saison
     * weniger Spieltage als der Stand, der die Datei gebaut hat, fehlen ihm
     * Dateien - dann bleibt die Liste stehen, statt kleiner zu werden.
     */
    const vorher = bestehend.fensterJeSaison ?? {};
    for (const [sai, n] of s.fensterJeSaison) {
      if ((vorher[sai] ?? 0) > n) {
        console.log(`Saison ${sai}: hier ${n} Spieltage, im Stand ${vorher[sai]} - Dateien fehlen, nichts ergaenzt.`);
        return;
      }
    }
    fensterJeSaison = new Map(Object.entries(vorher));
    for (const [sai, n] of s.fensterJeSaison) fensterJeSaison.set(sai, n);
    abgeschlossen = [...zu];

    // Offene Saisons und ihre Jahre neu; "alle Zeit" aus alt plus offen.
    const { gesamt, tage } = zusammenfassen(s.summen, s.spieltage, jahrVon);
    for (const [k, m] of s.summen) ablegen(k, m, s.spieltage.get(k) ?? 0);
    for (const [k, m] of gesamt) {
      const [jahr, region] = k.split('|');
      if (jahr !== '0') { ablegen(k, m, tage.get(k) ?? 0); continue; }
      const alle = new Map();
      const flach = alt.summen[region] ?? [];
      for (let i = 0; i + 3 < flach.length; i += 4) {
        alle.set(alt.konten.slice(flach[i] * 32, flach[i] * 32 + 32), [flach[i + 1], flach[i + 2], flach[i + 3]]);
      }
      for (const [konto, e] of m) dazu(alle, konto, e);
      ablegen(k, alle, (alt.spieltage?.[region] ?? 0) + (tage.get(k) ?? 0));
    }
    console.log(`offene Saisons: ${[...s.fensterJeSaison.keys()].sort().join(' ')} - ${[...s.fensterJeSaison.values()].reduce((a, b) => a + b, 0)} Spieltage`);
  }

  /*
   * Beim Ergaenzen nur schreiben, wenn sich eine Liste geaendert hat -
   * sonst ginge jede Stunde eine unveraenderte Datei von drei Megabyte in
   * die Ablage und ans Release, nur wegen eines neuen Zeitstempels.
   */
  if (ergaenzen && JSON.stringify(listen) === JSON.stringify(bestehend.listen) && konten.length === bestehend.konten.length) {
    console.log('Keine Liste hat sich geaendert - Datei bleibt.');
    return;
  }
  await fs.writeFile(ZIEL, JSON.stringify({
    hinweis: HINWEIS,
    stand: new Date().toISOString(),
    abgeschlossen,
    fensterJeSaison: Object.fromEntries([...fensterJeSaison.entries()].sort()),
    konten,
    listen,
  }), 'utf8');
  const groesse = Math.round((await fs.stat(ZIEL)).size / 1024);
  console.log(`${Object.keys(listen).length} Listen, ${konten.length} Konten, geschrieben: ${path.relative(process.cwd(), ZIEL)} (${groesse} KB)`);
  for (const k of ['2019|', '2020|', '2021|', '2022|', '2023|', '2024|', '2025|', `${laufendesJahr}|`, '0|']) {
    const l = listen[k];
    if (!l?.plaetze?.length) { console.log(`  ${k}: keine Liste`); continue; }
    console.log(`  ${k}: ${l.spieltage} Spieltage, Spitze ${konten[l.plaetze[0][0]].slice(0, 8)} mit ${l.plaetze[0][1]} Team-Elims in ${l.plaetze[0][2]} Matches`);
  }
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
