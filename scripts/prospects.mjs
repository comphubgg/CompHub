// Prospects: junge Spieler auf dem Weg nach oben - allein aus CompHubs eigenen Daten gerechnet.
//
// Der Betreiber (16.11.2026): keine Namensliste von aussen, kein Name steht hier, weil er auf einer fremden Liste stand. Die Rechnung nimmt nur, was hier liegt:
//
//   data/spieler-verlauf/        der Turnierverlauf jedes Kontos (scripts/spieler-verlauf.mjs, Release daten-verlauf): jede Platzierung seit 2019 mit Feld,
//                                Punkten, Spielen, Mitspielern und Preisgeld - alte Spieltage bis 2019 nur mit den besten 500.
//   data/verdienst-archiv.json   jeder bezahlte Spieltag seit 2019 je Konto (Epics Auszahlungstabellen) - fuer "schon etabliert".
//   lib/fncsBestenlisten.json    die Grand Finals seit Chapter 1 (EU) - fuer "schon etabliert".
//   data/clutch/<Fenster>.json   die vollen Replays (Schaden ausgeteilt / eingesteckt je Spieler), wo gelesen.
//   data/power-rankings/global.json  nur zum Anzeigen (Platz im Power Ranking), nicht im Score.
//
// Die Rechnung (alle Zahlen stehen unten als Konstanten und gehen mit in die Ausgabe):
//
//   Ergebnis-Note   Jede Platzierung in einem Wettkampf-Cup (FNCS, Cash, Victory, Elite, Series Cup, Performance Evaluation; kein Zero Build, Reload,
//                   Ranked, Mobile, Icon-/Skin-Cup, Practice oder Test) bekommt eine Note von 0 bis 1:
//                     offenes Feld (ab 3.000 Teams oder gekuerzte Liste): 1 - log(Platz) / log(30.000)
//                     gesiebtes Feld (Runde 2, Heat, Finale ...):        Sockel + (1 - Sockel) x (1 - log(Platz) / log(Feld))
//                   Der Sockel ist, was es heisst, ueberhaupt dort zu stehen: FNCS-Finale und Grand Finals 0,60, FNCS Heats/Halbfinale/Runde 3,
//                   Week Finals, Last Chance Lobby, Performance Evaluation Runde 2 und Series-Cup-Finale 0,45, andere gesiebte Runden 0,30.
//                   Regionen: EU/NAC 1, BR 0,95, NAW/OCE/ME 0,90, ASIA 0,85 (wie im Spieler-Kreis).
//   Gewicht         Stufe (Finale x3, Heats & Co. x2, sonst x1) x Teamgroesse (Solo 1, Duo 0,8, Trio/Squad 0,7) x Aktualitaet (Halbwertszeit HALB Tage).
//                   Gezaehlt wird die ganze junge Karriere (KARRIERE Tage), nicht nur die letzten 20 Cups - neuere Ergebnisse zaehlen mehr.
//   Niveau (55 %)   gewichteter Schnitt der Noten ohne das schlechteste Fuenftel (Ausrutscher), zur Mitte gezogen, wenn es wenige Ergebnisse sind.
//   Spitze (25 %)   Schnitt der fuenf besten Noten der letzten zwoelf Monate (fehlende zaehlen als 0,25).
//   Replay (20 %)   wo volle Replays gelesen sind: Schaden je Spiel und Schadensquote (ausgeteilt / eingesteckt) als Perzentil im selben Cup, mit
//                   demselben Sockel wie die Note; mindestens REPLAY_MIN Cups, sonst teilen sich Niveau und Spitze die 100 %.
//   Score           100 x (0,55 Niveau + 0,25 Spitze + 0,20 Replay)
//   Stern           Form der letzten FORM_TAGE Tage deutlich ueber dem Niveau davor: Schnitt (ohne schlechtestes Fuenftel) mindestens STERN_PLUS hoeher,
//                   mit je mindestens FORM_MIN Ergebnissen.
//
// Wer ist ein Prospect? (die "junge Karriere" aus unseren Daten; ein Alter steht in keiner Bestenliste)
//   Aktiv           mindestens AKTIV_MIN Wettkampf-Ergebnisse in den letzten AKTIV_TAGE Tagen, das letzte hoechstens LETZTES_TAGE Tage her.
//   Jung oben       Die Zeit an der Spitze ist kurz: das erste Grand Final / FNCS-Finale hoechstens JUNG_TAGE her (oder noch keins), UND hoechstens
//                   JUNG_SAISONS Saisons VOR den letzten zwoelf Monaten mit einem Spitzen-Ergebnis (Note ab SPITZE_NOTE: etwa Top 13 eines offenen Felds,
//                   Top 9 einer Runde 2 mit 500, Top 8 eines Heats, Top 17 eines Finales). Wer frueher nur mitlief, zaehlt als jung - wer schon seit
//                   Jahren vorne steht, nicht. Unsere Grand Finals von S30 bis S41 kennen wir nur fuer EU (Archiv) - die zweite Bedingung faengt
//                   die anderen Regionen ab.
//   Nicht etabliert Preisgeld insgesamt unter ETABLIERT_GELD Dollar, Grand Finals / FNCS-Finale in weniger als ETABLIERT_GF Saisons, nie auf dem Podium.
//
// Ausgabe: data/spieler-kreis/_prospects.json (klein: die ersten ZEIGEN je Region und weltweit, mit allem, was die Seite zum Erklaeren braucht).
// Laeuft auf GitHub (spieler-kreis.yml) nach dem Spieler-Kreis, nie auf dem Server der Seite.
//
//   node scripts/prospects.mjs --holen     den aktuellen Stand von daten-verlauf holen (rund 330 MB)
//   node scripts/prospects.mjs             rechnen
//   PROSPECT_PRUEFEN=<id>,<id> node scripts/prospects.mjs     zeigt, warum ein Konto (nicht) drinsteht

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DATEN = path.join(process.cwd(), 'data');
const VERLAUF = path.join(DATEN, 'spieler-verlauf');
const ZIEL = path.join(DATEN, 'spieler-kreis');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const TAG = 864e5;
const JETZT = Date.now();

export const REGELN = {
  karriereTage: 730, halbTage: 180, aktivTage: 183, aktivMin: 8, letztesTage: 60,
  offenAb: 3000, offenFeld: 30000, sockelFinale: 0.6, sockelHeat: 0.45, sockelGesiebt: 0.3,
  gNiveau: 0.55, gSpitze: 0.25, gReplay: 0.2, replayMin: 3, schrumpf: 2, prior: 0.25,
  formTage: 42, formMin: 5, sternPlus: 0.12,
  spitzeNote: 0.75, jungSaisons: 3, jungTage: 730, etabliertGeld: 25000, etabliertGf: 4,
  zeigen: 100,
};
const R = REGELN;
const REGION_FAKTOR = { EU: 1, NAC: 1, NAE: 1, BR: 0.95, NAW: 0.9, OCE: 0.9, ME: 0.9, ASIA: 0.85 };
const PRUEFEN = new Set((process.env.PROSPECT_PRUEFEN ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));

const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };

/* ------------------------------------------------------------------ Holen */

async function holeDatei(name, ziel) {
  for (let v = 0; v < 4; v++) {
    const r = await fetch(`https://github.com/${REPO}/releases/download/daten-verlauf/${encodeURIComponent(name)}`, { redirect: 'follow', signal: AbortSignal.timeout(180_000) }).catch(() => null);
    if (r?.ok) { fs.writeFileSync(ziel, Buffer.from(await r.arrayBuffer())); return true; }
    await new Promise((x) => setTimeout(x, 3000 * (v + 1)));
  }
  return false;
}

if (process.argv.includes('--holen')) {
  fs.mkdirSync(VERLAUF, { recursive: true });
  if (!await holeDatei('_stand.json', path.join(VERLAUF, '_stand.json'))) throw new Error('_stand.json von daten-verlauf nicht erreichbar');
  const { build } = lies(path.join(VERLAUF, '_stand.json'), {});
  const namen = Array.from({ length: 256 }, (_, i) => `verlauf-${build}-${i.toString(16).padStart(2, '0')}.bin`);
  let fehlt = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (namen.length) { const n = namen.shift(); if (!await holeDatei(n, path.join(VERLAUF, n))) fehlt += 1; }
  }));
  console.log(`Verlauf ${build}: ${256 - fehlt} von 256 Stuecken geholt.`);
  process.exit(fehlt ? 1 : 0);
}

/* ------------------------------------------------------- Spieltage einordnen */

const stand = lies(path.join(VERLAUF, '_stand.json'), null);
if (!stand?.tage?.length) { console.log('Kein Turnierverlauf (data/spieler-verlauf/_stand.json) - nichts gerechnet.'); process.exit(1); }

// Nur Wettkampf: FNCS (ohne die Skin-"FNCS Cups" und die Practice-Cups), Cash, Victory, Elite, Series, Performance Evaluation, Showdown, LAN-Finals.
const WETTKAMPF = /FNCS|CashCup|VictoryCup|VictoryCashCup|EliteCup|SeriesCup|PerformanceEvaluation|Showdown|WorldCup|OnlineOpen|ChampionSeries|GlobalChampionship|Bratwurst|MannekenPis/i;
const NICHT = /FNCSCup|Practice|Test|Icon|Mobile|Reload|ZeroBuild|NoBuild|(^|_)ZB(_|$)|Ranked|Arena|FightNight/i;
const istFinale = (w) => (/FNCS|Major/i.test(w) && /GrandFinal|Final(s)?(_|$)|Finals?_Day|Final_Day/i.test(w) && !/Week\d*Final|Divisional|LastChance|Qual|SecondChance/i.test(w))
  || /GlobalChampionship|Bratwurst_Finals|MannekenPis/i.test(w);
const istHeat = (w) => (/FNCS/i.test(w) && /Heat|Semi|Round[3-9]|LastChanceLobby|Week\d*Final|SecondChance_Final/i.test(w))
  || /PerformanceEvaluation.*Round2|SeriesCup_Final|Showdown.*Round2|Bratwurst_LowerBracket/i.test(w);
/** Je Spieltag: null (zaehlt nicht) oder [Stufe 3/2/1, Sockel, offen]. */
const art = stand.tage.map((t) => {
  const text = `${t.w} ${t.t ?? ''}`;
  if (t.m !== 'br' || t.zb || t.rk || !t.n || t.n < 20 || !WETTKAMPF.test(text) || NICHT.test(text)) return null;
  const offen = !!t.g || t.n >= R.offenAb;
  if (istFinale(t.w)) return [3, R.sockelFinale, offen];
  if (istHeat(t.w)) return [2, R.sockelHeat, offen];
  return [1, R.sockelGesiebt, offen];
});
const saisonVon = (t) => t.s || (/^S\d+/.exec(t.w)?.[0] ?? '');
console.log(`${art.filter(Boolean).length} von ${stand.tage.length} Spieltagen zaehlen als Wettkampf.`);

/** Die Note einer Platzierung (0..1), mit Regionsfaktor. */
function note(i, platz) {
  const t = stand.tage[i];
  const [, sockel, offen] = art[i];
  const roh = offen
    ? 1 - Math.log10(Math.max(platz, 1)) / Math.log10(R.offenFeld)
    : sockel + (1 - sockel) * (1 - Math.log10(Math.max(platz, 1)) / Math.log10(Math.max(t.n, 50)));
  return Math.max(0, Math.min(1, roh)) * (REGION_FAKTOR[t.r] ?? 1);
}

/* ---------------------------------------------------- Replays je Spieltag */

// Je gelesenem Spieltag (data/clutch, nicht "teilweise"): je Konto Perzentil von Schaden je Spiel und Schadensquote im Feld - nur wer mindestens die Haelfte
// der meisten Spiele hat (wie die Tournament Leaders).
const replay = new Map();
{
  const ordner = path.join(DATEN, 'clutch');
  const fenster = new Map(stand.tage.map((t, i) => [t.w, i]));
  let gelesen = 0;
  for (const f of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) {
    const i = fenster.get(f.replace(/\.json$/, ''));
    if (i === undefined || !art[i] || (JETZT - (stand.tage[i].d ?? 0)) > 365 * TAG) continue;
    const c = lies(path.join(ordner, f), null);
    if (!c?.schaden || c.teilweise) continue;
    const spiele = c.spiele ?? {};
    const meiste = Math.max(0, ...Object.values(spiele).map(Number).filter(Number.isFinite));
    const feld = [];
    for (const [id, s] of Object.entries(c.schaden)) {
      const n = Number(spiele[id]) || 0;
      if (!n || n < meiste / 2) continue;
      const dmg = Number(c.epicDmg?.[id] ?? s.dmg) || 0;
      feld.push([id, dmg / n, dmg / Math.max(Number(s.erlitten) || 0, 1)]);
    }
    if (feld.length < 20) continue;
    const rang = (k) => { const s = feld.map((x) => x[k]).sort((a, b) => a - b); return (v) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo / (s.length - 1 || 1); }; };
    const p1 = rang(1), p2 = rang(2);
    const m = new Map();
    for (const [id, a, b] of feld) m.set(id, (p1(a) + p2(b)) / 2);
    replay.set(i, m);
    gelesen += 1;
  }
  console.log(`Replays: ${gelesen} Wettkampf-Spieltage mit Schaden je Spieler.`);
}

/* ------------------------------------------------------ Etabliert: Preisgeld */

const geld = new Map();
const geldFenster = new Map();
for (const [id, l] of Object.entries(lies(path.join(DATEN, 'verdienst-archiv.json'), {})?.konten ?? {})) {
  let s = 0;
  const f = new Set();
  for (const e of l ?? []) { if (e[5] > 0) { s += e[5]; f.add(e[0]); } }
  geld.set(id, s);
  geldFenster.set(id, f);
}
// Grand Finals aus dem Archiv (EU, Chapter 1 bis CH6 S3): je Konto Saison -> bester Platz.
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
// Das Datum einer Saison (fuer Grand Finals aus dem Archiv, die kein Datum tragen): der Median ihrer Spieltage; fehlt die Saison, zwischen den Nachbarn.
const saisonDaten = new Map();
{
  const je = new Map();
  for (const t of stand.tage) { const s = /^S(\d+)$/.exec(saisonVon(t)); if (s && t.d) (je.get(+s[1]) ?? je.set(+s[1], []).get(+s[1])).push(t.d); }
  for (const [n, l] of je) { l.sort((a, b) => a - b); saisonDaten.set(n, l[Math.floor(l.length / 2)]); }
}
function saisonDatum(saison) {
  const n = Number(/^S(\d+)/.exec(saison)?.[1]);
  if (!n) return JETZT;
  if (saisonDaten.has(n)) return saisonDaten.get(n);
  const vor = Math.max(...[...saisonDaten.keys()].filter((k) => k < n)), nach = Math.min(...[...saisonDaten.keys()].filter((k) => k > n));
  if (Number.isFinite(vor) && Number.isFinite(nach)) return saisonDaten.get(vor) + (saisonDaten.get(nach) - saisonDaten.get(vor)) * (n - vor) / (nach - vor);
  return saisonDaten.get(Number.isFinite(vor) ? vor : nach) ?? JETZT;
}
const prRoh = lies(path.join(DATEN, 'power-rankings', 'global.json'), null);
const powerRanking = new Map((prRoh?.spieler ?? []).filter((x) => x?.id).map((x) => [String(x.id).replace(/-/g, '').toLowerCase(), x.rank]));
console.log(`Verdienst-Akte ${geld.size} Konten, Grand-Final-Archiv ${gfArchiv.size} Konten, Power Ranking ${powerRanking.size}.`);

/* ------------------------------------------------------------ Je Konto */

const halb = (tage) => Math.pow(0.5, tage / R.halbTage);
/** Schnitt ohne das schlechteste Fuenftel; mit Gewichten. */
function niveau(liste) {
  if (!liste.length) return null;
  const s = [...liste].sort((a, b) => b.n - a.n).slice(0, Math.ceil(liste.length * 0.8));
  let a = 0, w = 0;
  for (const x of s) { a += x.n * x.w; w += x.w; }
  return { wert: (a + R.schrumpf * R.prior) / (w + R.schrumpf), roh: w ? a / w : 0, gewicht: w };
}
const schlicht = (liste) => { if (!liste.length) return null; const s = liste.map((x) => x.n).sort((a, b) => b - a).slice(0, Math.ceil(liste.length * 0.8)); return s.reduce((a, c) => a + c, 0) / s.length; };

const konten = [];
let geprueft = 0;
function konto(id, e) {
  const z = e.z;
  // Nur ein schneller Vorfilter: genug Ergebnisse im letzten halben Jahr.
  let jung = 0;
  for (const r of z) { const t = stand.tage[r[0]]; if ((JETZT - t.d) <= R.aktivTage * TAG && art[r[0]]) jung += 1; }
  if (jung < R.aktivMin) return;
  geprueft += 1;
  // Je Spieltag-Kopie (dieselbe Liste unter mehreren Fenstern am selben Tag) nur eine Zeile - die mit der kleinsten Stufe.
  const gesehen = new Map();
  for (const r of z) {
    if (!art[r[0]] || r[6]) continue;
    const t = stand.tage[r[0]];
    const k = `${Math.floor(t.d / TAG)}|${r[1]}|${r[2]}|${r[3]}|${t.n}`;
    const da = gesehen.get(k);
    if (!da || art[r[0]][0] < art[da[0]][0]) gesehen.set(k, r);
  }
  const alle = [...gesehen.values()].map((r) => {
    const t = stand.tage[r[0]];
    const team = 1 + (r[5]?.length ?? 0);
    return { i: r[0], d: t.d, alter: (JETZT - t.d) / TAG, platz: r[1], n: note(r[0], r[1]), stufe: art[r[0]][0], team, preis: r[4] || 0, region: t.r, saison: saisonVon(t) };
  });
  const aktiv = alle.filter((x) => x.alter <= R.aktivTage);
  const letztes = Math.min(...alle.map((x) => x.alter));
  const pruefen = PRUEFEN.has(id);
  if (aktiv.length < R.aktivMin || letztes > R.letztesTage) { if (pruefen) console.log(`PRUEFEN ${id} ${e.n}: nur ${aktiv.length} Wettkampf-Ergebnisse in ${R.aktivTage} Tagen, letztes vor ${Math.round(letztes)} Tagen`); return; }

  // Etabliert: Preisgeld (Verdienst-Akte, dazu neuere bezahlte Zeilen aus dem Verlauf) und Grand Finals / FNCS-Finale.
  const bezahlt = geldFenster.get(id) ?? new Set();
  let preisgeld = geld.get(id) ?? 0;
  for (const r of z) if (r[4] > 0 && !bezahlt.has(stand.tage[r[0]].w)) preisgeld += r[4];
  // Grand Finals je Saison: Archiv (EU) und unsere Final-Listen (alle Regionen). Ein Tagessieg in einem mehrtaegigen Finale ist kein Podium.
  const gf = new Map();
  for (const [saison, platz] of gfArchiv.get(id) ?? []) gf.set(saison, { platz, d: saisonDatum(saison) });
  for (const x of alle) {
    if (x.stufe !== 3) continue;
    const platz = /Day\d/i.test(stand.tage[x.i].w) ? 99 : x.platz;
    const da = gf.get(x.saison);
    gf.set(x.saison, { platz: Math.min(da?.platz ?? 999, platz), d: Math.min(da?.d ?? Infinity, x.d) });
  }
  const gfPodium = [...gf.values()].some((g) => g.platz <= 3);
  const etabliert = preisgeld >= R.etabliertGeld || gf.size >= R.etabliertGf || gfPodium;

  // Jung oben: das erste Grand Final hoechstens JUNG_TAGE her (oder noch keins) und hoechstens JUNG_SAISONS Saisons mit Spitzen-Ergebnissen vor den letzten 12 Monaten.
  const ersterGf = gf.size ? Math.min(...[...gf.values()].map((g) => g.d)) : null;
  const frueh = new Set(alle.filter((x) => x.alter > 365 && x.n >= R.spitzeNote).map((x) => x.saison));
  const ersteSpitze = alle.filter((x) => x.n >= R.spitzeNote).reduce((a, x) => (a && a.d <= x.d ? a : x), null);
  const erstes = alle.reduce((a, x) => (a && a.d <= x.d ? a : x), null);
  const jungOben = (ersterGf == null || (JETZT - ersterGf) <= R.jungTage * TAG) && frueh.size <= R.jungSaisons;

  // Score aus der jungen Karriere (KARRIERE Tage).
  const karriere = alle.filter((x) => x.alter <= R.karriereTage).map((x) => ({ ...x, w: x.stufe * (x.team === 1 ? 1 : x.team === 2 ? 0.8 : 0.7) * halb(x.alter) }));
  const nv = niveau(karriere);
  const jahr = karriere.filter((x) => x.alter <= 365).map((x) => x.n).sort((a, b) => b - a);
  const spitze = Array.from({ length: 5 }, (_, k) => jahr[k] ?? R.prior).reduce((a, c) => a + c, 0) / 5;
  const rp = [];
  for (const x of karriere) {
    const p = replay.get(x.i)?.get(id);
    if (p === undefined) continue;
    const [, sockel, offen] = art[x.i];
    rp.push({ n: offen ? p : sockel + (1 - sockel) * p, w: x.stufe * halb(x.alter) });
  }
  const rep = rp.length >= R.replayMin ? rp.reduce((a, x) => a + x.n * x.w, 0) / rp.reduce((a, x) => a + x.w, 0) : null;
  const score = 100 * (rep == null
    ? (R.gNiveau * nv.wert + R.gSpitze * spitze) / (R.gNiveau + R.gSpitze)
    : R.gNiveau * nv.wert + R.gSpitze * spitze + R.gReplay * rep);

  // Form: die letzten FORM_TAGE Tage gegen die zwoelf Monate davor.
  const jetzt = karriere.filter((x) => x.alter <= R.formTage);
  const vorher = karriere.filter((x) => x.alter > R.formTage && x.alter <= 365);
  const fJetzt = jetzt.length >= R.formMin ? schlicht(jetzt) : null;
  const fVorher = vorher.length >= R.formMin ? schlicht(vorher) : null;
  const plus = fJetzt != null && fVorher != null ? fJetzt - fVorher : null;
  const stern = plus != null && plus >= R.sternPlus;

  // Heimatregion: die meisten Ergebnisse im letzten halben Jahr.
  const zaehl = new Map();
  for (const x of aktiv) zaehl.set(x.region, (zaehl.get(x.region) ?? 0) + 1);
  const heim = [...zaehl].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const beste = karriere.filter((x) => x.alter <= 365).sort((a, b) => b.n - a.n)[0];
  const k = {
    id, name: e.n ?? '', region: heim, score: Math.round(score * 10) / 10,
    niveau: Math.round(nv.wert * 1000) / 1000, spitze: Math.round(spitze * 1000) / 1000, replay: rep == null ? null : Math.round(rep * 1000) / 1000, replayCups: rp.length,
    ergebnisse: karriere.length, form: fJetzt == null ? null : Math.round(fJetzt * 1000) / 1000, formVorher: fVorher == null ? null : Math.round(fVorher * 1000) / 1000,
    stern, preisgeld: Math.round(preisgeld), gf: gf.size, gfBeste: gf.size ? Math.min(...[...gf.values()].map((g) => g.platz)) : null, ersterGf, etabliert, fruehSaisons: frueh.size, jungOben,
    erstes: erstes ? erstes.d : null, ersteSpitze: ersteSpitze ? [ersteSpitze.d, stand.tage[ersteSpitze.i].t || stand.tage[ersteSpitze.i].w, ersteSpitze.platz] : null,
    beste: beste ? [beste.d, stand.tage[beste.i].t || stand.tage[beste.i].w, beste.platz, stand.tage[beste.i].n] : null,
    pr: powerRanking.get(id) ?? null,
  };
  if (pruefen) console.log(`PRUEFEN ${id} ${e.n}:`, JSON.stringify(k));
  konten.push(k);
}

const t0 = Date.now();
for (let a = 0; a < 256; a++) {
  const k2 = a.toString(16).padStart(2, '0');
  const datei = fs.readFileSync(path.join(VERLAUF, `verlauf-${stand.build}-${k2}.bin`));
  for (let b = 0; b < 16; b++) {
    const [start, laenge] = stand.lage[a * 16 + b];
    if (!laenge) continue;
    const stueck = JSON.parse(zlib.gunzipSync(datei.subarray(start, start + laenge)).toString('utf8'));
    for (const [id, e] of Object.entries(stueck)) konto(id, e);
  }
}
console.log(`${geprueft} Konten mit genug Ergebnissen gelesen, ${konten.length} aktiv (${Math.round((Date.now() - t0) / 1000)} s).`);

if (process.env.PROSPECT_ROH) fs.writeFileSync(process.env.PROSPECT_ROH, JSON.stringify(konten));

const prospects = konten.filter((k) => k.jungOben && !k.etabliert && k.name).sort((a, b) => b.score - a.score);
console.log(`${prospects.length} Prospects (jung oben, nicht etabliert), ${prospects.filter((k) => k.stern).length} mit Stern.`);
const auswahl = new Map();
prospects.slice(0, R.zeigen).forEach((k) => auswahl.set(k.id, k));
for (const reg of ['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA']) prospects.filter((k) => k.region === reg).slice(0, R.zeigen).forEach((k) => auswahl.set(k.id, k));
const rangVon = new Map(prospects.map((k, i) => [k.id, i + 1]));
const liste = [...auswahl.values()].sort((a, b) => b.score - a.score).map((k) => {
  const { jungOben, etabliert, ...rest } = k; void jungOben; void etabliert;
  return { ...rest, rang: rangVon.get(k.id) };
});
fs.mkdirSync(ZIEL, { recursive: true });
fs.writeFileSync(path.join(ZIEL, '_prospects.json'), JSON.stringify({
  version: 2, stand: JETZT, verlauf: stand.build, prStand: prRoh?.geholt ?? null, regeln: R, gezaehlt: konten.length, prospects: prospects.length, liste,
}));
console.log(`Geschrieben: ${liste.length} Zeilen in spieler-kreis/_prospects.json.`);
for (const k of prospects.slice(0, 25)) console.log(`${String(rangVon.get(k.id)).padStart(3)} ${k.score.toFixed(1).padStart(5)} ${k.stern ? '*' : ' '} ${k.region.padEnd(4)} ${k.name}`);
