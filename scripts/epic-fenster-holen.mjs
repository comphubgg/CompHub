// Bestimmte Spieltage von Epic holen - nach Kennung, nicht nach Muster.
//
// Die Schwester von epic-fenster-suchen.mjs: dort werden Kennungen geraten,
// hier sind sie bekannt. Anlass: der Vergleich mit Fortnite Tracker zeigte,
// welche bezahlten Spieltage in unserer Ablage fehlen (Solo Victory Cups,
// Reload Victory Cups, das Second-Chance-Finale, einzelne Division-Wochen).
// Die Kennungen stehen in einer Datei, Epics Bestenliste dazu holt der
// Werkzeugserver, und abgelegt wird wie bei den gesuchten Spieltagen unter
// data/epic-spieltage/<Saison>/<Fenster>.json.
//
//   node scripts/epic-fenster-holen.mjs liste.json
//
// liste.json: [{ "windowId": "...", "eventId": "...", "beginn": "2026-03-08" }, ...]

import { promises as fs } from 'fs';
import path from 'path';

const BASIS = (process.env.WERKZEUG_URL || 'http://localhost:3000').replace(/\/+$/, '');
/*
 * Wohin: "epic-spieltage" fuer die laufenden Saisons (wird nach Supabase
 * geladen), "epic-spieltage-alt" fuer die Jahre davor - die bleiben auf
 * dem Rechner, daraus rechnet scripts/verdienst-archiv.mjs die kompakte
 * Verdienst-Akte. Tausende alte Bestenlisten haetten in der Datenbank
 * keinen Platz (500 MB im Gratis-Plan).
 */
const zielIdx = process.argv.indexOf('--ziel');
const ABLAGE = path.join(process.cwd(), 'data', zielIdx >= 0 ? process.argv[zielIdx + 1] : 'epic-spieltage');
const datei = process.argv.slice(2).find((a) => a.endsWith('.json'));
/*
 * Wie viele Plaetze je Fenster: Epic liefert hundert je Seite, ein offener
 * Cup hat zehntausend Teilnehmer - hundert Anfragen fuer ein Fenster, von
 * dem nur die vorderen Plaetze Geld sehen. Fuer das Preisgeld reichen die
 * ersten tausend (Siege stehen oben, Platzgeld endet weit davor).
 */
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) || 10000 : 10000;
/*
 * Wie viele Plaetze bleiben, wenn das Feld gekuerzt wird: die World-Cup-
 * Opens 2019 zahlten bis Platz 2000, ein Cash Cup bis 50 - mit --behalte
 * wird so weit behalten, wie die Tabelle zahlt.
 */
const behalteIdx = process.argv.indexOf('--behalte');
const BEHALTE = behalteIdx >= 0 ? Number(process.argv[behalteIdx + 1]) || 500 : 500;
if (!datei) { console.error('Aufruf: node scripts/epic-fenster-holen.mjs liste.json [--ziel epic-spieltage-alt]'); process.exit(1); }

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) {
    let grund = '';
    try { grund = (await r.json())?.error ?? ''; } catch { /* kein JSON */ }
    throw new Error(`HTTP ${r.status}${grund ? ` (${String(grund).slice(0, 160)})` : ''}`);
  }
  return r.json();
}

async function main() {
  const liste = JSON.parse(await fs.readFile(datei, 'utf8'));
  let geholt = 0; let leer = 0; let da = 0;
  for (const f of liste) {
    const season = (f.windowId.match(/^(S\d+)_/) ?? [])[1] ?? 'LAN';
    const region = (f.windowId.match(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)(?:_[A-Za-z0-9]+)?$/) ?? [])[1] ?? '';
    const ziel = path.join(ABLAGE, season, `${f.windowId}.json`);
    try { await fs.access(ziel); da += 1; continue; } catch { /* holen */ }
    let daten;
    try {
      // namen=0: nur Konto-Ids - die Namensaufloesung bei Epic ist gedrosselt
      // und wird hier nicht gebraucht.
      daten = await json(`${BASIS}/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}`
        + `&window=${encodeURIComponent(f.windowId)}&limit=${LIMIT}&namen=0`);
    } catch (e) {
      console.log(`  ! ${f.windowId}: ${e.message}`);
      await warte(1000);
      continue;
    }
    const eintraege = daten?.entries ?? [];
    if (!eintraege.length) { leer += 1; console.log(`  - ${f.windowId}: leer`); continue; }
    const zeiten = eintraege.flatMap((e) => (e.matches ?? [])
      .map((m) => Date.parse(m.endTime ?? '')).filter(Number.isFinite));
    const datum = zeiten.length ? Math.min(...zeiten)
      : (f.beginn ? Date.parse(f.beginn) : null);
    let teams = eintraege.map((e) => ({
      platz: e.rank, punkte: e.points ?? 0,
      matches: e.games ?? e.matches?.length ?? 0,
      teamElims: e.elims ?? 0,
      spieler: (e.players ?? []).map((p) => p.id).filter(Boolean),
    })).filter((t) => t.spieler.length);
    /*
     * Grosse Felder kuerzen: Preisgeld gibt es fuer die vorderen Plaetze
     * oder fuer Siege (hundert Punkte). Der Rest des Feldes verdient hier
     * nichts und wuerde nur die Datei aufblaehen - ein Victory Cup hat
     * viertausend Teams.
     */
    let gekuerzt = false;
    if (teams.length > BEHALTE + 100) {
      teams = teams.filter((t, i) => i < BEHALTE || t.punkte >= 100);
      gekuerzt = true;
    }
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    await fs.writeFile(ziel, JSON.stringify({
      eventId: f.eventId, windowId: f.windowId, region, season,
      titel: f.titel ?? f.windowId, cupId: null, runde: null, rundenTyp: null,
      istFinale: /final|round2/i.test(f.windowId),
      datum, geholt: new Date().toISOString(),
      quelle: 'gesucht',
      ...(gekuerzt ? { gekuerzt: `Only the first ${BEHALTE} teams and every team with at least 100 points (a Victory Royale) are kept; the rest of the field earns nothing here.` } : {}),
      teams,
    }, null, 1), 'utf8');
    geholt += 1;
    console.log(`  + ${f.windowId} (${teams.length} Teams)`);
    await warte(300);
  }
  console.log(`\nFertig: ${geholt} geholt, ${leer} leer, ${da} lagen schon da.`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
