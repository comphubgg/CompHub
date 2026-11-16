// Der Spieler-Kreis: ein Profil fuer jeden, der regelmaessig gut platziert ist.
//
// Der Betreiber (4.11.2026): "wir haben gerade mal 8000 Profile" - "ein Bot im Hintergrund, der jedes Leaderboard analysiert und schaut, welche Spieler
// regelmaessig gut platzieren. Nicht ueber den Username, jeder kann ihn jede zweite Woche aendern." Die Akten entstanden bisher nur fuer Konten aus dem Archiv der
// Szene, und das bekommt seit dem 10.10.2026 nichts mehr. Epics Bestenlisten liegen aber laengst hier (data/epic-spieltage), je Team mit Konto-Ids: ueber
// 900.000 Konten. Hier wird daraus gefiltert, wer es verdient - allein ueber die Konto-Id, Ranked Cups zaehlen nicht:
//
//   data/spieler-kreis/_index.json   [{ epicId, name, konstanz, region, cups, top500, top100, beste, matches }]  fuer die Suche
//   data/spieler-kreis/<xx>.json     { <epicId>: [Zeile je Spieltag] }  je ersten zwei Zeichen der Kennung, dieselben Zeilen wie die Akte (EpicZeile)
//
// Kein Name, keine Flagge und kein Foto werden erfunden: der Name ist der letzte, den Epic zu diesem Konto nannte; Schaden und Clutch stehen nur, wo ein volles
// Replay gelesen ist. Laeuft auf GitHub (spieler-kreis.yml), nie auf dem PC des Betreibers.
//
//   node scripts/spieler-kreis.mjs

import fs from 'node:fs';
import path from 'node:path';
import { holeNutzerToken, warte } from '../lib/replayKern.mjs';

const DATEN = path.join(process.cwd(), 'data');
const SPIELTAGE = path.join(DATEN, 'epic-spieltage');
const ZIEL = path.join(DATEN, 'spieler-kreis');
/*
 * Wer ins Profil kommt, entscheidet kein fester Wert wie "dreimal Top 300" (Betreiber, 4.11.2026: "zweimal Top 100 kann jeder erreichen, indem man im Busch campt.
 * Du musst das zusammenrechnen, fuer jeden Spieler ein bisschen anders ... er platziert zu 70, 80 Prozent gut, und dann gibt es einen kleinen Ausrutscher").
 *
 * Darum eine Note je Spieler aus seinen letzten zwanzig Cups:
 *   - Jede Platzierung zaehlt nach dem Feld: 1 - log(Platz) / log(Feld). Platz 1 ist 1, Platz 100 von 30.000 etwa 0,55, Platz 1.000 etwa 0,33.
 *   - Offene Runden (ab 3.000 Teams) und gekuerzte alte Listen zaehlen mit einem Feld von 30.000. Kleinere Felder sind schon gesiebt: 0,15 dazu.
 *   - Listen unter zwanzig Teams zaehlen nicht, die Note ist hoechstens 1. Der erste Lauf hatte Konten mit 25 ersten Plaetzen in Mini-Listen ganz oben.
 *   - Die Regionen sind nicht gleich stark: Top 100 in Asien ist nicht Top 100 in Europa (REGION_FAKTOR).
 *   - Das schlechteste Fuenftel faellt weg - das sind die Ausrutscher wegen Mitspielern oder eines schlechten Tages. Die Note ist der Schnitt des Rests.
 * Ins Profil kommt, wer mindestens MINDEST_CUPS sichtbare Ergebnisse und mindestens NOTE_AB hat; wer seit einem Jahr nicht mehr auftaucht, braucht NOTE_ALT.
 * Ein Einzelerfolg reicht so nie. Mit dem Archiv bis 2019 waren es bei einer Grenze fuer alle 59.000 Konten, die meisten davon laengst nicht mehr aktiv.
 */
const MINDEST_CUPS = 10;
const NOTE_AB = 0.4;
const NOTE_ALT = 0.5;
const LETZTE = 20;
const OFFENES_FELD = 30_000;
const OFFEN_AB = 3000;
const REGION_FAKTOR = { EU: 1, NAC: 1, BR: 0.95, NAW: 0.9, OCE: 0.9, ME: 0.9, ASIA: 0.85 };

/*
 * Prospects (Betreiber, 15.11.2026; neu aufgesetzt am 16.11.2026: "Du musst die Liste selber machen, und du musst das System verstehen, wie es berechnet wird").
 *
 * Das Vorbild (eine handgepflegte Liste junger Spieler, 53 Namen, elf mit Stern) waehlt seine Prospects von Hand aus und zeigt dazu ein Rating aus den
 * Spielwerten der laufenden Saison. Nachgeprueft am 16.11.2026: alle 53 stehen in Epics Power Ranking unter den ersten 3.100, 51 unter den ersten 810, die elf
 * Sterne zwischen Platz 64 und 292 - und keiner hat schon mehrere Grand Finals gewonnen. Ein Alter kennen wir nicht. Daraus unsere eigene Rechnung:
 *
 *   Niveau     = Epics Power Ranking (data/power-rankings/global.json, die ersten 10.000 mit Konto-Id). Es ist weltweit EINE Wertung (Elo ueber alle Gegner,
 *                Events nach Gewicht, aeltere Ergebnisse verfallen) - Regionen sind damit vergleichbar, ohne dass wir sie von Hand gewichten. Mit dem
 *                frueheren REGION_FAKTOR und den offenen Feldern standen zu viele Konten aus NA oben.
 *   Neu        = 1 - Jahre seit dem Durchbruch / PROSPECT_JAHRE (0 ab drei Jahren). Durchbruch = das erste Top 10 in einem Cash, Victory, Elite, Series Cup
 *                oder einer Performance Evaluation mit mindestens PROSPECT_T10_FELD Teams, oder die erste FNCS-Runde ab Runde 3 (Heat, Halbfinale, Finale).
 *                Gesucht wird in der ganzen Geschichte bis 2019 (das alte Archiv fuehrt je Spieltag die besten 500 - ein erstes Top 10 sieht man darin).
 *                Wer jung ist, weiss nur die Redaktion: Spieler aus der Seed-Liste (lib/prospectsSeed.json, im Admin pflegbar) zaehlen als ganz neu.
 *   Trend      = unsere Platzierungsnote der neueren Haelfte der letzten 20 Wettkampf-Spieltage in der Heimatregion minus der aelteren, +-PROSPECT_TREND_MAX.
 *   Score      = Power-Ranking-Punkte + PROSPECT_NEU * Neu + PROSPECT_TREND * Trend.
 *   Etabliert  = schon oben angekommen, also kein Prospect mehr: Grand Finals in mindestens ETABLIERT_GF_SAISONS Saisons, oder mindestens ETABLIERT_PODIEN Podien in
 *                Grand Finals, oder ein Sieg in einem Grand Final in EU oder NA. Grand Finals aus lib/fncsBestenlisten (EU, CH1 bis CH6 S3) und aus unseren
 *                Bestenlisten (alle Regionen). Ein Sieg in einer kleinen Region (z. B. ASIA) macht noch niemanden etabliert.
 *   Kandidat   = automatisch: im Power Ranking unter den ersten PROSPECT_PR_MAX, nicht etabliert, Durchbruch hoechstens PROSPECT_JAHRE her,
 *                mindestens PROSPECT_MIN Spieltage in den letzten PROSPECT_AKTIV Tagen. Seed-Spieler sind immer Kandidaten.
 * Erste Fassung (15.11.) liess nur "Durchbruch in den letzten 24 Monaten" zu und ordnete nach der Platzierungsnote: Rax, Twek, Pardal, Lucx, Wagers und Xavier fehlten,
 * Zucki, Vampi und frxstyy standen auf 130 bis 150.
 *
 * Ausgabe: spieler-kreis/_prospects.json { stand, regeln, konten: { <epicId>: Fakten } } fuer jedes aktive Konto aus dem Power Ranking. Die Liste selbst rechnet
 * app/api/prospects daraus - so wirkt ein im Admin aufgenommener Seed-Spieler sofort und nicht erst nach dem naechsten Lauf.
 */
const PROSPECT_AKTIV = 183;
const PROSPECT_MIN = 5;
const PROSPECT_JAHRE = 3;
const PROSPECT_NEU = 5000;
const PROSPECT_TREND = 2000;
const PROSPECT_TREND_MAX = 0.1;
const PROSPECT_PR_MAX = 1500;
const PROSPECT_T10_FELD = 300;
const ETABLIERT_GF_SAISONS = 4;
const ETABLIERT_PODIEN = 2;
/** Zum Nachsehen, warum ein Konto (nicht) in der Liste steht: PROSPECT_PRUEFEN=<id>,<id> node scripts/spieler-kreis.mjs */
const PRUEFEN = new Set((process.env.PROSPECT_PRUEFEN ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const PROSPECT_AKTIV_AB = Date.now() - PROSPECT_AKTIV * 864e5;
// Zero Build, Mobile und Reload sind andere Spielarten - sie zaehlen fuer die Prospects nirgends. Ebenso Uebungs- und Test-Cups: die Divisional Cups von S42
// heissen bei Epic "FNCS Division 1 Practice" - ein Week Final dort ist kein FNCS-Durchbruch.
const ohneProspect = (tag) => /(^|_)ZB(_|$)|ZeroBuild|NoBuild|Mobile|Reload/i.test(`${tag.windowId} ${tag.cupId ?? ''}`) || /Practice|Test ?Cup/i.test(`${tag.titel ?? ''} ${tag.windowId}`);
const fncsStufe = (w) => /FNCS/i.test(w) && !/FNCSCup/i.test(w) && !/Division[2-9]/i.test(w) && /Round[3-9]|Heat|Semi|Final/i.test(w) && !/LastChance/i.test(w);
const cupArt = (w) => /CashCup|VictoryCup|EliteCup|SeriesCup|PerformanceEvaluation|FN[CS]{2}Showdown/i.test(w);
/** Ein Grand Final (Major, Solo-Finale, Global Championship, CH1-Finals) - nicht die woechentlichen Divisional-Finals und nicht die Second Chance. */
const grandFinal = (w) => /GrandFinal|FNCSSolo_Final|FNCSMajor\d_Final|GlobalChampionship_Final|FNCS_Finals/i.test(w) && !/Divisional|SecondChance/i.test(w);
const GROSSE_REGION = new Set(['EU', 'NAC', 'NAE']);
/** 2 = FNCS ab Runde 3, 1 = Top 10 in einem grossen Cup mit genug Teams, 0 = sonst. */
const nennenswert = (tag, platz) => {
  if (ohneProspect(tag)) return 0;
  if (fncsStufe(tag.windowId)) return 2;
  if (cupArt(tag.windowId) && platz <= 10 && tag.teams.length >= PROSPECT_T10_FELD) return 1;
  return 0;
};

const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };
// Neue Spieltage zuerst: was in beiden Ordnern liegt, zaehlt aus dem neueren. Das alte Archiv reicht bis 2019 zurueck (je Spieltag die besten 500).
const dateien = [];
const schonDa = new Set();
for (const wurzel of [SPIELTAGE, path.join(DATEN, 'epic-spieltage-alt')]) {
  for (const ordner of fs.existsSync(wurzel) ? fs.readdirSync(wurzel) : []) {
    const voll = path.join(wurzel, ordner);
    if (!fs.statSync(voll).isDirectory()) continue;
    for (const f of fs.readdirSync(voll)) {
      if (!f.endsWith('.json') || f.startsWith('_') || schonDa.has(f)) continue;
      schonDa.add(f);
      dateien.push(path.join(voll, f));
    }
  }
}
const zaehlt = (tag) => tag?.windowId && Array.isArray(tag.teams) && tag.teams.length >= 20 && !/ranked/i.test(`${tag.windowId} ${tag.titel ?? ''} ${tag.cupId ?? ''}`);
const note = (tag, platz) => {
  const offen = tag.gekuerzt || tag.teams.length >= OFFEN_AB;
  const feld = offen ? OFFENES_FELD : Math.max(tag.teams.length, 50);
  const roh = Math.max(0, 1 - Math.log10(Math.max(platz, 1)) / Math.log10(feld)) + (offen ? 0 : 0.15);
  return Math.min(1, roh) * (REGION_FAKTOR[tag.region] ?? 1);
};

// Erster Durchgang: je Konto Datum und Note jedes Ergebnisses.
// Je Ergebnis SCHRITT Werte: Datum, Note, Platz, Region, Nummer des Spieltags (tagListe) und Art fuer die Prospects (-1 Zero Build/Mobile, sonst nennenswert()).
const SCHRITT = 6;
const ergebnisse = new Map();
const tagListe = [];
/*
 * Dieselbe Bestenliste unter mehreren Spieltagen (Stand 15.11.2026: 370 Dateien, z. B. am 4.10.2026 eine Liste mit 0 Punkten unter allen Regionen von
 * FNCSSoloFastTracks, PerformanceEvaluation und ReloadSoloVictoryCup). Fuer die Prospects zaehlt keine dieser Kopien - welche die echte ist, laesst sich nicht sagen.
 */
const abdruecke = new Map();
let tage = 0;
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  tage += 1;
  const nr = tagListe.length;
  tagListe.push({ windowId: tag.windowId, titel: tag.titel ?? '', region: tag.region ?? '', season: tag.season ?? '', datum: tag.datum ?? 0, feld: tag.teams.length, gekuerzt: !!tag.gekuerzt });
  const abdruck = tag.teams.slice(0, 20).map((t) => (t.spieler ?? []).join('+')).join(',');
  (abdruecke.get(abdruck) ?? abdruecke.set(abdruck, []).get(abdruck)).push(nr);
  const aus = ohneProspect(tag);
  for (const t of tag.teams) {
    const n = note(tag, t.platz);
    const art = aus ? -1 : nennenswert(tag, t.platz);
    for (const id of t.spieler ?? []) {
      let l = ergebnisse.get(id);
      if (!l) { l = []; ergebnisse.set(id, l); }
      l.push(tag.datum ?? 0, n, t.platz, tag.region ?? '', nr, art);
    }
  }
}
const noten = new Map();
// Das Rating im Profil und die Aufsteiger (app/api/spieler-rating): Note und Form jedes Kontos ab 0,30, nicht nur der Konten im Kreis.
const formen = new Map();
const aufsteiger = [];
const absteiger = [];
const schnitt = (liste) => {
  const b = [...liste].sort((x, y) => y - x);
  const behalten = b.slice(0, Math.ceil(b.length * 0.8));
  return behalten.reduce((a, c) => a + c, 0) / behalten.length;
};
const zwei = (x) => Math.round(x * 100) / 100;
const kopien = new Set();
for (const nrn of abdruecke.values()) if (new Set(nrn.map((n) => tagListe[n].windowId)).size > 1) for (const n of nrn) kopien.add(n);
abdruecke.clear();
console.log(`${kopien.size} Spieltage sind Kopien einer anderen Bestenliste - fuer die Prospects ausgelassen.`);
// Wettkampf-Spieltage fuer den Trend der Prospects: FNCS (ohne Skin-Cups) und die grossen Cup-Reihen. Icon-, Skin-, One-Piece- und Test-Cups nicht - dort spielen
// viele Profis nur nebenbei (Vampi: Inoxtag Icon Cup #2042).
const wettkampf = tagListe.map((t) => (/FNCS/i.test(t.windowId) && !/FNCSCup/i.test(t.windowId)) || cupArt(t.windowId));
const istGrandFinal = tagListe.map((t) => grandFinal(t.windowId) && !ohneProspect(t));
/*
 * Die Note fuer den Trend zaehlt das echte Feld (gekuerzte Listen - alte Top 500, oder bei PROSPECT_LISTE_VOLL abgeschnitten - mit 30.000) und keinen Regionsfaktor:
 * der Trend vergleicht einen Spieler nur mit sich selbst, in seiner Heimatregion.
 */
const PROSPECT_LISTE_VOLL = 10_000;
const noteProspect = (x) => {
  const t = tagListe[x[4]];
  const offen = t.gekuerzt || t.feld >= OFFEN_AB;
  const feld = t.gekuerzt || t.feld >= PROSPECT_LISTE_VOLL ? OFFENES_FELD : Math.max(t.feld, 50);
  const roh = Math.max(0, 1 - Math.log10(Math.max(x[2], 1)) / Math.log10(feld)) + (offen ? 0 : 0.15);
  return Math.min(1, roh);
};
// Epics Power Ranking: die ersten 10.000 weltweit, mit Konto-Id (scripts/power-rankings-holen.mjs).
const prRoh = lies(path.join(DATEN, 'power-rankings', 'global.json'), null);
const powerRanking = new Map((prRoh?.spieler ?? []).filter((x) => x?.id).map((x) => [String(x.id).replace(/-/g, '').toLowerCase(), x]));
console.log(`Power Ranking: ${powerRanking.size} Konten${prRoh?.geholt ? `, Stand ${new Date(prRoh.geholt).toISOString().slice(0, 16)}` : ''}.`);
// Die Grand Finals aus dem Archiv (lib/fncsBestenlisten.json, EU, CH1 bis CH6 S3 und Summit): je Konto Saison -> bester Platz.
const gfArchiv = new Map();
for (const [schluessel, teams] of Object.entries(lies(path.join(process.cwd(), 'lib', 'fncsBestenlisten.json'), {}))) {
  const saison = schluessel.split('|')[0];
  (teams ?? []).forEach((team, i) => {
    for (const [id] of team?.[4] ?? []) {
      const m = gfArchiv.get(id) ?? new Map();
      m.set(saison, Math.min(m.get(saison) ?? 999, i + 1));
      gfArchiv.set(id, m);
    }
  });
}
/** Je aktivem Konto aus dem Power Ranking die Fakten fuer app/api/prospects (Schluessel kurz, die Datei wird bei jeder Anfrage gelesen). */
const prospectKonten = {};
const JAHR = 365.25 * 864e5;
for (const [id, l] of ergebnisse) {
  if (l.length / SCHRITT < PROSPECT_MIN) continue;
  const paare = [];
  for (let i = 0; i < l.length; i += SCHRITT) paare.push([l[i], l[i + 1], l[i + 2], l[i + 3], l[i + 4], kopien.has(l[i + 4]) ? -1 : l[i + 5]]);
  paare.sort((a, b) => b[0] - a[0]);
  const pr = powerRanking.get(id);
  if (pr) {
    const gueltig = paare.filter((x) => x[5] >= 0);
    const fenster = gueltig.filter((x) => x[0] >= PROSPECT_AKTIV_AB);
    if (fenster.length >= PROSPECT_MIN) {
      // Die Heimatregion (die meisten Spieltage im letzten halben Jahr): Cups in fremden Regionen spielt man mit hohem Ping, oft nur nebenbei (Zucki: Trios
      // Cash Cup ME #984, Victory Cup NAC #5220) - sie sagen wenig ueber die Form.
      const zaehlung = new Map();
      for (const x of fenster) zaehlung.set(x[3], (zaehlung.get(x[3]) ?? 0) + 1);
      const heim = [...zaehlung].sort((a, b) => b[1] - a[1])[0][0];
      const letzte = gueltig.filter((x) => x[3] === heim && wettkampf[x[4]]).slice(0, LETZTE);
      let trend = 0;
      if (letzte.length >= PROSPECT_MIN) {
        const alt = [...letzte].reverse();
        const mitte = Math.floor(alt.length / 2);
        trend = Math.max(-PROSPECT_TREND_MAX, Math.min(PROSPECT_TREND_MAX, schnitt(alt.slice(mitte).map(noteProspect)) - schnitt(alt.slice(0, mitte).map(noteProspect))));
      }
      // Durchbruch: das frueheste FNCS ab Runde 3 oder Top 10 in einem grossen Cup (Kopien derselben Liste zaehlen nicht).
      let durchbruch = null;
      for (const x of gueltig) if (x[5] >= 1 && (!durchbruch || x[0] < durchbruch[0])) durchbruch = x;
      // Grand Finals: Archiv (EU) und unsere Bestenlisten; je Saison der beste Platz. Kopien zaehlen hier mit (dasselbe Finale steht oft unter zwei Kennungen).
      const gf = new Map([...(gfArchiv.get(id) ?? new Map())].map(([saison, platz]) => [saison, { platz, region: 'EU' }]));
      for (const x of paare) {
        if (!istGrandFinal[x[4]]) continue;
        const saison = tagListe[x[4]].season || tagListe[x[4]].windowId.split('_')[0];
        const vorher = gf.get(saison);
        if (!vorher || x[2] < vorher.platz) gf.set(saison, { platz: x[2], region: x[3] });
      }
      const podien = [...gf.values()].filter((g) => g.platz <= 3).length;
      const grosserSieg = [...gf.values()].some((g) => g.platz === 1 && GROSSE_REGION.has(g.region));
      const etabliert = gf.size >= ETABLIERT_GF_SAISONS || podien >= ETABLIERT_PODIEN || grosserSieg;
      const jahre = durchbruch ? (Date.now() - durchbruch[0]) / JAHR : null;
      const neu = jahre == null ? 0 : Math.max(0, 1 - jahre / PROSPECT_JAHRE);
      const kandidat = !etabliert && pr.rank <= PROSPECT_PR_MAX && jahre != null && jahre <= PROSPECT_JAHRE;
      const t = durchbruch ? tagListe[durchbruch[4]] : null;
      prospectKonten[id] = {
        r: pr.rank, w: pr.wertung, d: pr.deltaWertung ?? 0, h: heim, e: fenster.length, t: Math.round(trend * 1000) / 1000, n: zwei(neu),
        b: t ? [durchbruch[0], t.titel || t.windowId, durchbruch[2], durchbruch[5] === 2 ? 'fncs' : 'cup'] : null,
        g: gf.size, p: podien, ...(grosserSieg ? { s: 1 } : {}), ...(etabliert ? { x: 1 } : {}), ...(kandidat ? { k: 1 } : {}),
      };
      if (PRUEFEN.has(id)) {
        const d = (x) => (x ? `${new Date(x[0]).toISOString().slice(0, 10)} ${tagListe[x[4]].windowId} #${x[2]}` : '-');
        console.log(`PRUEFEN ${id} | PR #${pr.rank} ${pr.wertung} | Heimat ${heim} | Durchbruch ${d(durchbruch)} | GF ${[...gf].map(([s, g]) => `${s}:${g.platz}`).join(',')} | etabliert ${etabliert} | Kandidat ${kandidat} | Trend ${trend.toFixed(3)}`);
      }
    } else if (PRUEFEN.has(id)) console.log(`PRUEFEN ${id} | nur ${fenster.length} Spieltage in ${PROSPECT_AKTIV} Tagen`);
  } else if (PRUEFEN.has(id)) console.log(`PRUEFEN ${id} | nicht im Power Ranking`);
  if (paare.length < MINDEST_CUPS) continue;
  const wert = schnitt(paare.slice(0, LETZTE).map((x) => x[1]));
  if (wert >= 0.3) formen.set(id, { n: zwei(wert), f: paare.slice(0, LETZTE).reverse().map((x) => [zwei(x[1]), x[2]]), c: paare.length });
  // Aufsteiger: die letzten zehn gegen die zehn davor, nur wer im letzten Monat gespielt hat und schon jetzt gut ist.
  if (paare.length >= 15 && paare[0][0] >= Date.now() - 31 * 864e5) {
    const jetzt = schnitt(paare.slice(0, 10).map((x) => x[1]));
    const vorher = schnitt(paare.slice(10, 20).map((x) => x[1]));
    const steigt = jetzt >= NOTE_AB && jetzt > vorher;
    // Die Absteiger: dieselbe Rechnung andersherum, nur wer vorher gut war.
    const faellt = vorher >= NOTE_AB && jetzt < vorher;
    if (steigt || faellt) {
      const zaehlung = new Map();
      for (const x of paare.slice(0, 10)) zaehlung.set(x[3], (zaehlung.get(x[3]) ?? 0) + 1);
      (steigt ? aufsteiger : absteiger).push({
        epicId: id, region: [...zaehlung].sort((a, b) => b[1] - a[1])[0][0], jetzt: zwei(jetzt), vorher: zwei(vorher), delta: zwei(jetzt - vorher), cups: paare.length,
        verlauf: paare.slice(0, 20).reverse().map((x) => zwei(x[1])), beste: Math.min(...paare.slice(0, 10).map((x) => x[2])),
      });
    }
  }
  if (wert >= (paare[0][0] >= Date.now() - 365 * 864e5 ? NOTE_AB : NOTE_ALT)) noten.set(id, Math.round(wert * 1000) / 1000);
}
ergebnisse.clear();
// Prospects: die Referenz fuer das angezeigte Rating - der Median der Power-Ranking-Punkte aller etablierten aktiven Konten unter den ersten 500.
// Ein Rating von 1,00 heisst also: so stark wie ein typischer etablierter Profi aus der Weltspitze, Neuheit und Trend eingerechnet.
const prospectReferenz = (() => {
  const w = Object.values(prospectKonten).filter((k) => k.x && k.r <= 500).map((k) => k.w).sort((a, b) => a - b);
  return w.length ? w[Math.floor(w.length / 2)] : 33_000;
})();
console.log(`Prospects: ${Object.keys(prospectKonten).length} aktive Konten aus dem Power Ranking, ${Object.values(prospectKonten).filter((k) => k.k).length} Kandidaten, Referenz ${prospectReferenz}.`);
const kreis = new Set(noten.keys());
console.log(`${tage} Spieltage ohne Ranked, ${kreis.size} Konten im Kreis.`);
if (!kreis.size) { console.log('Kein Konto im Kreis - nichts geschrieben.'); process.exit(1); }

// Zweiter Durchgang: die Zeilen. Schaden und Clutch aus den vollen Replays, wo der Spieltag gelesen ist.
const zeilen = new Map();
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  const voll = lies(path.join(DATEN, 'clutch', `${tag.windowId}.json`), null);
  const gelesen = voll && !voll.teilweise ? voll : null;
  for (const t of tag.teams) {
    for (const id of t.spieler ?? []) {
      if (!kreis.has(id)) continue;
      const sch = gelesen?.schaden?.[id];
      const dmg = gelesen?.epicDmg?.[id] ?? sch?.dmg;
      const liste = zeilen.get(id) ?? [];
      liste.push({
        event: tag.windowId, windowId: tag.windowId, region: tag.region, season: tag.season, titel: tag.titel, datum: tag.datum ?? null,
        platz: t.platz, punkte: t.punkte, matches: t.matches, mitspieler: (t.spieler ?? []).filter((x) => x !== id), nurEpic: true,
        ...(sch ? { replaySchaden: { dmg: Math.round(dmg), erlitten: Math.round(sch.erlitten), treffer: sch.treffer, krit: sch.krit } } : {}),
        ...(gelesen?.summe && Object.keys(gelesen.summe).length ? { replayClutch: gelesen.summe[id] ?? 0 } : {}),
      });
      zeilen.set(id, liste);
    }
  }
}

const namen = lies(path.join(DATEN, 'epic-namen.json'), {});
// Wer im Namensverzeichnis fehlt, wird bei Epic nachgefragt: hundert Konten je Abfrage. Ohne Namen waere das Profil nicht zu finden.
{
  aufsteiger.sort((a, b) => b.delta - a.delta);
  const je = new Map();
  aufsteiger.splice(0, aufsteiger.length, ...aufsteiger.filter((x) => { je.set(x.region, (je.get(x.region) ?? 0) + 1); return je.get(x.region) <= 60; }));
  absteiger.sort((a, b) => a.delta - b.delta);
  const jeAb = new Map();
  absteiger.splice(0, absteiger.length, ...absteiger.filter((x) => { jeAb.set(x.region, (jeAb.get(x.region) ?? 0) + 1); return jeAb.get(x.region) <= 60; }));
  const fehlend = [...new Set([...zeilen.keys(), ...aufsteiger.map((x) => x.epicId), ...absteiger.map((x) => x.epicId), ...Object.keys(prospectKonten).filter((id) => prospectKonten[id].k)])].filter((id) => !namen[id]);
  let gefunden = 0;
  try {
    const { token } = await holeNutzerToken();
    for (let i = 0; i < fehlend.length; i += 100) {
      const qs = fehlend.slice(i, i + 100).map((id) => `accountId=${id}`).join('&');
      const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account?${qs}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (r?.status === 429) { await warte(30_000); i -= 100; continue; }
      if (!r?.ok) continue;
      for (const k of await r.json()) {
        const n = k.displayName || Object.values(k.externalAuths ?? {}).map((e) => e.externalDisplayName).find(Boolean);
        if (n) { namen[k.id] = n; gefunden += 1; }
      }
      await warte(250);
    }
  } catch (e) { console.log(`Namen: ${e.message}`); }
  console.log(`Namen: ${gefunden} von ${fehlend.length} fehlenden bei Epic gefunden.`);
}
const eimer = new Map();
const index = [];
for (const [id, liste] of zeilen) {
  liste.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  const k = id.slice(0, 2);
  const e = eimer.get(k) ?? {};
  e[id] = liste;
  eimer.set(k, e);
  const regionen = new Map();
  for (const z of liste) regionen.set(z.region, (regionen.get(z.region) ?? 0) + 1);
  index.push({
    epicId: id, name: namen[id] ?? '', konstanz: noten.get(id) ?? 0, region: [...regionen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    cups: liste.length, top500: liste.filter((z) => z.platz <= 500).length, top100: liste.filter((z) => z.platz <= 100).length,
    beste: Math.min(...liste.map((z) => z.platz)), matches: liste.reduce((a, z) => a + (z.matches ?? 0), 0),
  });
}
index.sort((a, b) => b.konstanz - a.konstanz);

fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(ZIEL, { recursive: true });
for (const [k, e] of eimer) fs.writeFileSync(path.join(ZIEL, `${k}.json`), JSON.stringify(e));
fs.writeFileSync(path.join(ZIEL, '_index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(ZIEL, '_aufsteiger.json'), JSON.stringify(aufsteiger.map((x) => ({ ...x, name: namen[x.epicId] ?? '' }))));
fs.writeFileSync(path.join(ZIEL, '_absteiger.json'), JSON.stringify(absteiger.map((x) => ({ ...x, name: namen[x.epicId] ?? '' }))));
for (const [id, k] of Object.entries(prospectKonten)) if (namen[id]) k.name = namen[id];
fs.writeFileSync(path.join(ZIEL, '_prospects.json'), JSON.stringify({
  stand: Date.now(), prStand: prRoh?.geholt ?? null,
  regeln: {
    aktivTage: PROSPECT_AKTIV, minEvents: PROSPECT_MIN, jahre: PROSPECT_JAHRE, neu: PROSPECT_NEU, trend: PROSPECT_TREND, trendMax: PROSPECT_TREND_MAX,
    prMax: PROSPECT_PR_MAX, t10Feld: PROSPECT_T10_FELD, gfSaisons: ETABLIERT_GF_SAISONS, podien: ETABLIERT_PODIEN, referenz: prospectReferenz,
  },
  konten: prospectKonten,
}));
const notenEimer = new Map();
for (const [id, r] of formen) {
  const k = id.slice(0, 2);
  const e = notenEimer.get(k) ?? {};
  e[id] = r;
  notenEimer.set(k, e);
}
for (const [k, e] of notenEimer) fs.writeFileSync(path.join(ZIEL, `n-${k}.json`), JSON.stringify(e));
console.log(`${formen.size} Ratings, ${aufsteiger.length} Aufsteiger.`);
console.log(`${index.length} Profile in ${eimer.size} Dateien, ${index.filter((x) => !x.name).length} ohne Namen.`);
