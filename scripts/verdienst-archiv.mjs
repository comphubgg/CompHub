// Die kompakte Verdienst-Akte: je Konto jeder bezahlte Spieltag seit 2019.
//
// Der Betreiber: "zu jedem Spieler, der in meinem Archiv ist, sollen dessen
// Earnings drin sein" - seit Chapter 1, mit Herkunft je Cup. Epic liefert die
// alten Bestenlisten noch, wenn man ihre Kennung kennt; sie liegen unter
// data/epic-spieltage-alt (nur auf dem Rechner, tausende Dateien). Hier
// werden sie ein einziges Mal mit Epics Auszahlungstabellen bewertet
// (data/preisgeld-tabellen.json, dieselbe Rechnung wie lib/preisgeld) und
// das Ergebnis als kleine Datei abgelegt, die Seite und Laufrechner lesen:
//
//   data/verdienst-archiv.json
//   { konten: { <epicId>: [ [fenster, region, datum, platz, punkte, betrag], ... ] } }
//
// Nur Konten, die das Werkzeug kennt (Akten, Profile, Archiv der Szene) -
// die Datei bleibt so bei wenigen Megabyte. Mehrtaegige Finals zaehlen
// ueber den Endstand aller Tage (siehe lib/szeneStats, platzKarte), der
// erste Tag zahlt nie. LAN-Events stehen nicht hier, sondern je Konto in
// data/lan-preisgelder.json.
//
//   node scripts/verdienst-archiv.mjs            alle Fenster unter epic-spieltage-alt
//   node scripts/verdienst-archiv.mjs --alle     dazu platzierungen und epic-spieltage

import { promises as fs } from 'fs';
import path from 'path';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'verdienst-archiv.json');
const alle = process.argv.includes('--alle');
const ORDNER = ['epic-spieltage-alt', ...(alle ? ['platzierungen', 'epic-spieltage'] : [])];

async function jsonLesen(p, standard = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return standard; }
}

/** Konten, die das Werkzeug kennt. */
async function bekannteKonten() {
  const konten = new Set();
  for (const f of await fs.readdir(path.join(DATEN, 'akten')).catch(() => [])) {
    if (f.endsWith('.json')) konten.add(f.slice(0, -5));
  }
  const profile = await jsonLesen(path.join(DATEN, 'spieler-profile.json'), {});
  for (const [k, v] of Object.entries(profile)) {
    const id = v?.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '');
    if (id) konten.add(id);
  }
  const index = await jsonLesen(path.join(DATEN, 'szene-stats', 'index.json'), []);
  for (const e of index) {
    const d = await jsonLesen(path.join(DATEN, 'szene-stats', e.region, e.season, e.datei));
    for (const p of d?.players ?? []) if (p.epicId) konten.add(p.epicId);
  }
  return konten;
}

/** Tabelle zu einem Fenster - genau, sonst Familie. */
function tabelleFuer(tabellen, windowId, region) {
  let muster = null;
  for (const t of tabellen) {
    if (region && t.region && t.region !== region) continue;
    if (t.fenster === windowId) return t;
    if (!muster && t.re.test(windowId)) muster = t;
  }
  return muster;
}

function betragAus(t, platz, punkte) {
  if (t.art === 'platz') {
    if (!platz || platz < 1) return 0;
    const stufen = t.stufen.filter((s) => typeof s.bis === 'number').sort((a, b) => a.bis - b.bis);
    const stufe = stufen.find((s) => platz <= s.bis);
    return stufe ? stufe.betrag : 0;
  }
  if (t.art === 'punkte') {
    if (punkte === null || punkte === undefined) return 0;
    const stufen = t.stufen.filter((s) => typeof s.abPunkte === 'number').sort((a, b) => b.abPunkte - a.abPunkte);
    const stufe = stufen.find((s) => punkte >= s.abPunkte);
    return stufe ? stufe.betrag : 0;
  }
  return 0;
}

/** Alle Fenster auf der Platte: Kennung -> Datei. */
async function fensterDateien() {
  const karte = new Map();
  for (const ordner of ORDNER) {
    const wurzel = path.join(DATEN, ordner);
    for (const saison of await fs.readdir(wurzel).catch(() => [])) {
      for (const f of await fs.readdir(path.join(wurzel, saison)).catch(() => [])) {
        if (f.endsWith('.json') && !f.startsWith('_') && !karte.has(f.slice(0, -5))) {
          karte.set(f.slice(0, -5), path.join(wurzel, saison, f));
        }
      }
    }
  }
  return karte;
}

/** Endstand eines Fensters: Teams mit Platz und Punkten - bei Finals ueber alle Tage. */
async function endstand(karte, windowId, tage) {
  const eigene = await jsonLesen(karte.get(windowId));
  if (!eigene?.teams?.length) return null;
  const m = windowId.match(/Day(\d+)/);
  if (tage !== 'summe' || !m || Number(m[1]) < 2) return eigene;
  const summe = new Map();
  for (let t = 1; t <= Number(m[1]); t++) {
    const tag = t === Number(m[1]) ? eigene : await jsonLesen(karte.get(windowId.replace(/Day\d+/, `Day${t}`)));
    if (!tag?.teams?.length) return null;
    for (const team of tag.teams) {
      const k = [...team.spieler].sort().join(',');
      const e = summe.get(k) ?? { spieler: team.spieler, punkte: 0 };
      e.punkte += team.punkte;
      summe.set(k, e);
    }
  }
  const liste = [...summe.values()].sort((a, b) => b.punkte - a.punkte);
  let platz = 0;
  return { ...eigene, teams: liste.map((t, i) => { if (i === 0 || t.punkte !== liste[i - 1].punkte) platz = i + 1; return { ...t, platz }; }) };
}

async function main() {
  const roh = await jsonLesen(path.join(DATEN, 'preisgeld-tabellen.json'), { eintraege: [] });
  const tabellen = roh.eintraege.map((t) => ({ ...t, re: new RegExp(t.muster, 'i') }));
  const konten = await bekannteKonten();
  const karte = await fensterDateien();
  console.log(`${tabellen.length} Tabellen, ${konten.size} bekannte Konten, ${karte.size} Fenster`);

  const archiv = {};
  let mitGeld = 0; let ohneTabelle = 0; let unvollstaendig = 0;
  for (const [windowId] of karte) {
    if (/^(Escargo|Bratwurst|Dinosauron|BambiRaptor)/.test(windowId)) continue;
    if (/(?:_Final_Day1_|CupFinal_Day1_|GrandFinalDay1_)/.test(windowId)) continue;
    const region = (windowId.match(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)(?:_[A-Za-z0-9]+)?$/) ?? [])[1] ?? '';
    const t = tabelleFuer(tabellen, windowId, region);
    if (!t) { ohneTabelle += 1; continue; }
    const stand = await endstand(karte, windowId, t.tage);
    if (!stand) { unvollstaendig += 1; continue; }
    const datum = stand.datum ? new Date(stand.datum).toISOString().slice(0, 10) : (t.beginn ?? '').slice(0, 10);
    let einer = false;
    for (const team of stand.teams) {
      const betrag = betragAus(t, team.platz, team.punkte);
      if (betrag <= 0) continue;
      for (const id of team.spieler) {
        if (!konten.has(id)) continue;
        (archiv[id] ??= []).push([windowId, region, datum, team.platz, team.punkte ?? 0, betrag]);
        einer = true;
      }
    }
    if (einer) mitGeld += 1;
  }
  for (const liste of Object.values(archiv)) liste.sort((a, b) => a[2].localeCompare(b[2]));

  await fs.writeFile(ZIEL, JSON.stringify({
    hinweis: 'Prize money per known account and match day, computed once from Epic\'s leaderboards (data/epic-spieltage-alt on the operator\'s machine) and Epic\'s payout tables (data/preisgeld-tabellen.json): [window, region, date, placement, points, amount per player in USD]. Two-day finals count by the final standing across both days; the first day never pays. LAN events are not here (data/lan-preisgelder.json). Built by scripts/verdienst-archiv.mjs.',
    stand: new Date().toISOString(),
    fenster: mitGeld,
    konten: archiv,
  }), 'utf8');
  const summe = Object.values(archiv).reduce((s, l) => s + l.reduce((x, e) => x + e[5], 0), 0);
  console.log(`${Object.keys(archiv).length} Konten, ${mitGeld} Spieltage mit Geld, ${ohneTabelle} ohne Tabelle, ${unvollstaendig} unvollstaendig, Summe ${summe.toLocaleString('de-DE')} $`);
  console.log(`geschrieben: ${path.relative(process.cwd(), ZIEL)} (${Math.round((await fs.stat(ZIEL)).size / 1024)} KB)`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
