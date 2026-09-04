// Platzierungen und Mitspieler zu jedem Spieltag im Archiv holen.
//
// Das gespiegelte Archiv (data/szene-stats) enthaelt je Spieler seine Werte,
// aber weder seinen Platz noch mit wem er angetreten ist. Beides steht in
// Epics eigener Bestenliste: dort hat jeder Eintrag einen Rang und die
// Konto-Ids aller Teammitglieder - bei Duos zwei, bei Trios drei.
//
// Gespeichert werden nur Konto-Ids, keine Namen. Namen wechseln staendig,
// die Id nicht; wer wie heisst, steht ohnehin schon im Archiv.
//
//   node scripts/platzierungen-holen.mjs              -> alles, was fehlt
//   node scripts/platzierungen-holen.mjs S41 S42      -> nur diese Saisons
//   node scripts/platzierungen-holen.mjs --neu        -> auch Vorhandenes neu
//
// Die Bestenlisten holt das eigene Werkzeug ueber seine Schnittstelle - so
// bleibt die Anmeldung bei Epic an einer Stelle und wird hier nicht
// nachgebaut. Dafuer muss der Entwicklungsserver laufen.

import { promises as fs } from 'fs';
import path from 'path';

const BASIS = process.env.WERKZEUG_URL || 'http://localhost:3000';
const ARCHIV = path.join(process.cwd(), 'data', 'szene-stats');
const ABLAGE = path.join(process.cwd(), 'data', 'platzierungen');

const argumente = process.argv.slice(2);
const neu = argumente.includes('--neu');
const saisons = argumente.filter((a) => /^S\d+$/i.test(a)).map((a) => a.toUpperCase());

/** Kurz durchatmen - wir sind bei Epic zu Gast. */
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function hole(eventId, windowId) {
  const url = `${BASIS}/api/cup-leaderboard`
    + `?event=${encodeURIComponent(eventId)}`
    + `&window=${encodeURIComponent(windowId)}&limit=10000`;
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  const daten = await antwort.json();
  if (daten.error) throw new Error(daten.error);
  return daten.entries ?? [];
}

async function main() {
  const verzeichnis = JSON.parse(
    await fs.readFile(path.join(ARCHIV, 'index.json'), 'utf8'));
  const ziel = saisons.length
    ? verzeichnis.filter((e) => saisons.includes(e.season))
    : verzeichnis;

  console.log(`${ziel.length} Spieltage zu pruefen.`);
  let geholt = 0; let vorhanden = 0; let leer = 0; const fehler = [];

  for (const e of ziel) {
    const ordner = path.join(ABLAGE, e.season);
    const datei = path.join(ordner, `${e.windowId}.json`);

    if (!neu) {
      try { await fs.access(datei); vorhanden++; continue; } catch { /* fehlt */ }
    }

    let eintraege;
    try {
      eintraege = await hole(e.eventId, e.windowId);
    } catch (err) {
      // Ein zweiter Versuch nach laengerer Pause. Beim ersten grossen Lauf
      // kamen ganze Saisons als 500 zurueck - das war keine fehlende Datei,
      // sondern eine Drosselung. Wer einmal wartet, bekommt sie doch.
      await warte(2500);
      try {
        eintraege = await hole(e.eventId, e.windowId);
      } catch (err2) {
        fehler.push(`${e.windowId}: ${err2.message}`);
        await warte(400);
        continue;
      }
    }

    if (!eintraege.length) { leer++; await warte(400); continue; }

    const teams = eintraege.map((x) => ({
      platz: x.rank,
      punkte: x.points ?? 0,
      // Nur die Ids: Namen wechseln, die Id bleibt.
      spieler: (x.players ?? []).map((p) => p.id).filter(Boolean),
    })).filter((t) => t.spieler.length);

    await fs.mkdir(ordner, { recursive: true });
    await fs.writeFile(datei, JSON.stringify({
      eventId: e.eventId, windowId: e.windowId, region: e.region,
      season: e.season, name: e.name,
      geholt: new Date().toISOString(),
      teams,
    }), 'utf8');

    geholt++;
    if (geholt % 25 === 0) console.log(`  ${geholt} geholt …`);
    await warte(400);
  }

  console.log(`Fertig: ${geholt} neu, ${vorhanden} lagen schon vor, `
    + `${leer} ohne Eintraege, ${fehler.length} Fehler.`);
  if (fehler.length) {
    console.log('Nicht erreichbar (Epic haelt alte Fenster nicht ewig vor):');
    for (const f of fehler.slice(0, 15)) console.log('  ' + f);
    if (fehler.length > 15) console.log(`  … und ${fehler.length - 15} weitere`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
