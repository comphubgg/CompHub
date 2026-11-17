// Alte Spieltage bei Epic suchen, die keine Liste mehr nennt.
//
// Epics Turnierliste fuehrt nur die laufende Saison (gemessen: 1008 Fenster,
// alle S42). Die Bestenlisten aelterer Fenster liefert Epic aber weiter, wenn
// man ihre Kennung kennt - der Lauf fuer die Platzierungen bekam so 466
// Spieltage aus 2024 und 2025. Nur die Kennungen fehlen.
//
// Die Kennungen sind systematisch: S42_FNCSDivisionalCup_Division1_Event4_EU,
// epicgames_S42_FNCSDivisionalCup_Division1_EU. Also werden die Muster der
// laufenden Saison und der eigenen Spieltage auf die alten Saisons uebertragen, die
// Zaehler (Event1..8, Round1..2, Week1..8) durchprobiert und jede Kennung
// mit einer kleinen Abfrage geprueft. Was antwortet, wird als Spieltag
// abgelegt - mit Platz, Punkten, Teams, wie die anderen Epic-Spieltage.
//
// Der Betreiber: "such unbedingt mehr Runden fuer 2024 und 2025." Das hier
// findet, was Epic noch hergibt; Einzelwerte je Spieler (Schaden, Treffer)
// gibt es dazu nirgends.
//
//   node scripts/epic-fenster-suchen.mjs S30 S31 S33 S34 S36 S37 S39 S40 S41
//   node scripts/epic-fenster-suchen.mjs --hoechstens 3000   (Abfragen je Lauf)

import { promises as fs } from 'fs';
import path from 'path';

const BASIS = (process.env.WERKZEUG_URL || 'http://localhost:3000').replace(/\/+$/, '');
const VERZEICHNIS = path.join(process.cwd(), 'data', 'antworten', 'statistik_tage.json');
const ABLAGE = path.join(process.cwd(), 'data', 'epic-spieltage');
const MERKER = path.join(ABLAGE, '_gesucht.json');
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

const argumente = process.argv.slice(2);
const saisons = argumente.filter((a) => /^S\d+$/i.test(a)).map((a) => a.toUpperCase());
const hoechstensIdx = argumente.indexOf('--hoechstens');
const hoechstens = hoechstensIdx >= 0 ? Number(argumente[hoechstensIdx + 1]) || 3000 : 3000;
const ZIEL = saisons.length ? saisons : ['S30', 'S31', 'S33', 'S34', 'S36', 'S37', 'S39', 'S40', 'S41'];

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Epic kennt die Kennung nicht (16.11.2026): die Seite reicht Epics 404 als 500 weiter ("HTTP 404 bei https://events-public-service-live...
 * Event '...' not found"). Das Skript hielt jede 5xx fuer einen Aussetzer, wartete zehn Sekunden und merkte nichts - jeder Lauf pruefte
 * dieselben gut siebzig Kennungen, zwoelf Minuten lang, und die Zahl "274994 Kennungen zu pruefen" blieb Lauf fuer Lauf gleich.
 */
class NichtBeiEpic extends Error {}

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    if (r.status === 404 || /HTTP 404 bei https:\/\/events-public-service/.test(text)) throw new NichtBeiEpic(`HTTP ${r.status} (Epic: 404)`);
    throw new Error(`HTTP ${r.status}`);
  }
  return r.json();
}

/**
 * Ganz schreiben oder gar nicht: der Schritt laeuft neben anderen, die epic-spieltage lesen und hochladen (daten-erneuern.yml).
 * Die Zwischendatei endet auf ".<pid>.neu" - die laesst scripts/ablage-github.mjs aus, und Leser nehmen nur ".json".
 */
async function schreibeGanz(datei, text) {
  const zwischen = `${datei}.${process.pid}.neu`;
  await fs.writeFile(zwischen, text, 'utf8');
  await fs.rename(zwischen, datei);
}

/** Muster: Kennung ohne Saison und Region, mit Platzhaltern fuer Zaehler. */
function muster(windowId, eventId) {
  const w = windowId.replace(/^S\d+_/i, '').replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i, '');
  const e = (eventId ?? '').replace(/^epicgames_/i, '').replace(/^S\d+_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i, '');
  return { w, e };
}

/** Alle Zaehler-Varianten eines Musters. */
function varianten(kern) {
  let liste = [kern];
  for (const [re, bis] of [[/Event(\d+)/, 10], [/Round(\d+)/, 3], [/Week(\d+)/, 8], [/Day(\d+)/, 4], [/Heat(\d+)/, 4]]) {
    const neu = [];
    for (const k of liste) {
      if (!re.test(k)) { neu.push(k); continue; }
      for (let n = 1; n <= bis; n++) neu.push(k.replace(re, (m, z) => m.replace(z, String(n))));
    }
    liste = [...new Set(neu)];
  }
  return liste;
}

async function main() {
  // Muster aus dem laufenden Katalog und aus dem Archiv aller Saisons.
  const katalog = await json(`${BASIS}/api/cup-catalog?modus=alle`);
  const paare = new Map(); // w-Muster -> { e, titel }
  for (const cup of katalog.cups ?? []) {
    for (const liste of Object.values(cup.regionen ?? {})) {
      for (const f of liste) {
        const { w, e } = muster(f.windowId, f.eventId);
        if (w && e && !paare.has(w)) paare.set(w, { e, titel: cup.titel });
      }
    }
  }
  let index = [];
  try { index = JSON.parse(await fs.readFile(VERZEICHNIS, 'utf8')); } catch { index = []; }
  for (const x of index) {
    if (!/^S\d+_/i.test(x.windowId)) continue;
    const { w, e } = muster(x.windowId, x.eventId);
    if (w && e && !paare.has(w)) paare.set(w, { e, titel: x.name.replace(/\s*-\s*(Week|Day|Grand|Finals?).*$/i, '') });
  }
  console.log(`${paare.size} Muster`);

  let gesucht = {};
  try { gesucht = JSON.parse(await fs.readFile(MERKER, 'utf8')); } catch { gesucht = {}; }

  const kandidaten = [];
  for (const season of ZIEL) {
    for (const [w, { e, titel }] of paare) {
      for (const wv of varianten(w)) {
        // Der Zaehler des Events steht auch in der Event-Kennung, wenn dort einer ist.
        const ev = varianten(e).length > 1 ? e.replace(/Event\d+/, (wv.match(/Event\d+/) ?? [''])[0] || 'Event1') : e;
        for (const region of REGIONEN) {
          const windowId = `${season}_${wv}_${region}`;
          const eventId = `epicgames_${season}_${ev}_${region}`;
          // "fehlt" (Epic: 404) nach dreissig Tagen noch einmal - ein einzelner Befund ist kein Beweis fuer immer (AGENTS.md).
          const stand = gesucht[windowId];
          if (stand && !(String(stand).startsWith('fehlt ') && Date.now() - Date.parse(String(stand).slice(6)) > 30 * 86_400_000)) continue;
          kandidaten.push({ season, region, windowId, eventId, titel });
        }
      }
    }
  }
  console.log(`${kandidaten.length} Kennungen zu pruefen (hoechstens ${hoechstens} in diesem Lauf)`);

  /*
   * Zaehler nicht blind bis zehn: Cups sind fortlaufend nummeriert. Gibt es
   * in einer Familie und Region kein Event 1 und kein Event 2, gibt es auch
   * kein Event 7 - jede weitere Abfrage waere eine Antwort, die feststeht.
   * Gemerkt wird je Familie die hoechste gefundene Nummer; geprueft wird
   * bis zwei darueber.
   */
  const hoechsteNummer = new Map();
  const familie = (k, art) => `${k.season}|${k.windowId.replace(new RegExp(`${art}\\d+`), art)}`;
  const zuWeit = (k) => {
    for (const art of ['Event', 'Week', 'Round', 'Day', 'Heat']) {
      const m = k.windowId.match(new RegExp(`${art}(\\d+)`));
      if (!m) continue;
      const n = Number(m[1]);
      const bisher = hoechsteNummer.get(familie(k, art)) ?? 0;
      if (n > bisher + 2) return true;
    }
    return false;
  };
  const merken = (k) => {
    for (const art of ['Event', 'Week', 'Round', 'Day', 'Heat']) {
      const m = k.windowId.match(new RegExp(`${art}(\\d+)`));
      if (!m) continue;
      const f = familie(k, art);
      hoechsteNummer.set(f, Math.max(hoechsteNummer.get(f) ?? 0, Number(m[1])));
    }
  };
  // Was schon gefunden wurde, zaehlt fuer die Zaehler mit.
  for (const [w, stand] of Object.entries(gesucht)) {
    if (stand === 'gefunden' || stand === 'da') {
      const m = /^(S\d+)_/.exec(w);
      if (m) merken({ season: m[1], windowId: w });
    }
  }
  kandidaten.sort((a, b) => a.windowId.localeCompare(b.windowId, undefined, { numeric: true }));

  let gefunden = 0; let geprueft = 0; let uebersprungen = 0; let nichtDa = 0;
  // Der Ablauf beendet den Schritt mit SIGTERM ("timeout"): dann sauber aufhoeren und den Merker sichern, statt bis zu 99 Befunde zu verlieren.
  let aufhoeren = false;
  process.on('SIGTERM', () => { aufhoeren = true; });
  for (const k of kandidaten) {
    if (geprueft >= hoechstens || aufhoeren) break;
    const datei = path.join(ABLAGE, k.season, `${k.windowId}.json`);
    try { await fs.access(datei); gesucht[k.windowId] = 'da'; merken(k); continue; } catch { /* fehlt */ }
    if (zuWeit(k)) { uebersprungen += 1; continue; }
    geprueft += 1;
    let daten = null;
    try {
      daten = await json(`${BASIS}/api/cup-leaderboard?event=${encodeURIComponent(k.eventId)}`
        + `&window=${encodeURIComponent(k.windowId)}&limit=10000`);
    } catch (e) {
      if (e instanceof NichtBeiEpic) {
        gesucht[k.windowId] = `fehlt ${new Date().toISOString().slice(0, 10)}`;
        nichtDa += 1;
        if (geprueft % 100 === 0) await schreibeGanz(MERKER, JSON.stringify(gesucht, null, 1));
        await warte(250);
        continue;
      }
      // Eine Drosselung (429) oder ein Aussetzer (5xx) ist kein Befund:
      // dann kurz warten und die Kennung beim naechsten Lauf noch einmal.
      if (/HTTP (429|5\d\d)|timeout|fetch failed/i.test(e.message)) { await warte(10_000); continue; }
      gesucht[k.windowId] = `fehler ${new Date().toISOString().slice(0, 10)}`;
      await warte(250);
      continue;
    }
    const eintraege = daten?.entries ?? [];
    if (!eintraege.length) {
      gesucht[k.windowId] = `leer ${new Date().toISOString().slice(0, 10)}`;
      await warte(250);
      if (geprueft % 100 === 0) await schreibeGanz(MERKER, JSON.stringify(gesucht, null, 1));
      continue;
    }
    const zeiten = eintraege.flatMap((e) => (e.matches ?? [])
      .map((m) => Date.parse(m.endTime ?? '')).filter(Number.isFinite));
    const datum = zeiten.length ? Math.min(...zeiten) : null;
    const teams = eintraege.map((e) => ({
      platz: e.rank, punkte: e.points ?? 0,
      matches: e.games ?? e.matches?.length ?? 0,
      teamElims: e.elims ?? 0,
      spieler: (e.players ?? []).map((p) => p.id).filter(Boolean),
    })).filter((t) => t.spieler.length);
    await fs.mkdir(path.join(ABLAGE, k.season), { recursive: true });
    await schreibeGanz(datei, JSON.stringify({
      eventId: k.eventId, windowId: k.windowId, region: k.region, season: k.season,
      titel: k.titel, cupId: null, runde: null, rundenTyp: null,
      istFinale: /final|round2/i.test(k.windowId),
      datum, geholt: new Date().toISOString(),
      // Damit klar ist, woher die Kennung stammt.
      quelle: 'gesucht',
      teams,
    }, null, 1));
    gesucht[k.windowId] = 'gefunden';
    merken(k);
    gefunden += 1;
    console.log(`  + ${k.windowId} (${teams.length} Teams${datum ? ', ' + new Date(datum).toISOString().slice(0, 10) : ''})`);
    await warte(300);
  }
  await schreibeGanz(MERKER, JSON.stringify(gesucht, null, 1));
  console.log(`\nFertig: ${geprueft} geprueft, ${gefunden} gefunden, ${nichtDa} bei Epic nicht vorhanden, ${uebersprungen} als aussichtslos uebersprungen.`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
