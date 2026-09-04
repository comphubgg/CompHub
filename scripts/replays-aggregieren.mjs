// Aus den ausgewerteten Matches die Turnierwerte rechnen.
//
// Warum als eigener Lauf und nicht bei jeder Anfrage?
//
// Ein Turnierfenster sind 148 Matches mit 25 000 Eliminierungen. Das jedes
// Mal neu durchzurechnen, wenn jemand ein Profil oeffnet, waere Verschwendung
// - die Rohdaten aendern sich nach dem Einsammeln nicht mehr. Das Ergebnis
// liegt deshalb neben ihnen als _aggregat.json und wird nur neu gerechnet,
// wenn Matches dazugekommen sind oder der Auswerter eine neue Fassung hat.
//
//   node scripts/replays-aggregieren.mjs           -> alles Noetige
//   node scripts/replays-aggregieren.mjs --neu     -> alles noch einmal
//
// -------------------------------------------------------------- Ehrlichkeit
//
// Gerechnet wird ausschliesslich, was in den Ereignissen steht:
// Eliminierungen, Knocks, Waffen, Zeitpunkte, wer wen ausgeschaltet hat.
//
// NICHT gerechnet werden Schaden, Kopftreffer, Material, Bauteile oder
// Trefferquote - die stehen im Netzwerk-Stream, den der offene Parser auf
// Fortnite 42.00 nicht mehr lesen kann. Sie bleiben Sache der Szene-Quelle.
// Und NICHT gerechnet wird die Platzierung: die Reihenfolge der letzten
// Eliminierungen sieht zwar danach aus, ist aber keine - wer sich aus dem
// Sturm rettet oder als Team ueberlebt, taucht dort gar nicht auf. Der Platz
// kommt weiter aus Epics Bestenliste, wo er belegt ist.

import { promises as fs } from 'fs';
import path from 'path';
import { ABLAGE, PARSER_VERSION } from '../lib/replayKern.mjs';

const neu = process.argv.slice(2).includes('--neu');
const PLATZIERUNGEN = path.join(process.cwd(), 'data', 'platzierungen');
const EPIC_SPIELTAGE = path.join(process.cwd(), 'data', 'epic-spieltage');

/**
 * Wer mit wem in einem Team stand.
 *
 * Das Replay kennt nur einzelne Konten - es weiss nichts von Duos. Die
 * Aufstellung steht in Epics Bestenliste, die wir ohnehin schon spiegeln:
 * einmal unter data/platzierungen (fuer Spieltage der Szene-Quelle) und
 * einmal unter data/epic-spieltage (fuer Cups, die dort fehlen).
 *
 * Sie gilt fuer das ganze Turnierfenster, nicht je Match - ein Duo bleibt
 * ueber den Cup zusammen. Fehlt sie, entfaellt die Team-Auswertung, statt
 * eine Zuordnung zu raten.
 */
async function teamsFuer(season, windowId) {
  for (const ordner of [PLATZIERUNGEN, EPIC_SPIELTAGE]) {
    try {
      const roh = JSON.parse(await fs.readFile(
        path.join(ordner, season, `${windowId}.json`), 'utf8'));
      if (Array.isArray(roh.teams) && roh.teams.length) return roh.teams;
    } catch { /* naechste Ablage */ }
  }
  return null;
}

/** Ein leerer Satz Zahlen fuer ein Konto. */
function leer() {
  return {
    matches: 0,
    kills: 0, knocks: 0,
    gestorben: 0, umgehauen: 0,
    waffen: {},
    ersterKill: null, letzterKill: null,
    // Wen dieses Konto ausgeschaltet hat und von wem es erwischt wurde.
    opfer: {}, gegner: {},
  };
}

function zaehle(satz, elim, rolle) {
  if (rolle === 'taeter') {
    if (elim.knock) satz.knocks++;
    else {
      satz.kills++;
      const w = elim.waffe ?? 'unbekannt';
      satz.waffen[w] = (satz.waffen[w] ?? 0) + 1;
      if (elim.zeit !== null) {
        satz.ersterKill = satz.ersterKill === null
          ? elim.zeit : Math.min(satz.ersterKill, elim.zeit);
        satz.letzterKill = satz.letzterKill === null
          ? elim.zeit : Math.max(satz.letzterKill, elim.zeit);
      }
      if (elim.opfer) satz.opfer[elim.opfer] = (satz.opfer[elim.opfer] ?? 0) + 1;
    }
  } else {
    if (elim.knock) satz.umgehauen++;
    else {
      satz.gestorben++;
      if (elim.taeter) satz.gegner[elim.taeter] = (satz.gegner[elim.taeter] ?? 0) + 1;
    }
  }
}

async function fensterRechnen(season, windowId) {
  const ordner = path.join(ABLAGE, season, windowId);
  const dateien = (await fs.readdir(ordner))
    .filter((d) => d.endsWith('.json') && !d.startsWith('_'));
  if (!dateien.length) return null;

  const spieler = new Map();
  let elimsGesamt = 0;
  let titel = null; let region = null; let eventId = null;
  let frueheste = null; let spaeteste = null;

  for (const datei of dateien) {
    const m = JSON.parse(await fs.readFile(path.join(ordner, datei), 'utf8'));
    titel ??= m.titel; region ??= m.region; eventId ??= m.eventId;
    if (m.zeitpunkt) {
      const t = Date.parse(m.zeitpunkt);
      if (Number.isFinite(t)) {
        frueheste = frueheste === null ? t : Math.min(frueheste, t);
        spaeteste = spaeteste === null ? t : Math.max(spaeteste, t);
      }
    }

    // Wer im Match war - dafuer zaehlt jedes Konto, das ueberhaupt in einem
    // Ereignis vorkommt. Ein Spieler ohne jede Eliminierung, der auch nie
    // ausgeschaltet wurde (Sturm, Absturz), fehlt damit; das ist eine
    // Untergrenze und keine erfundene Zahl.
    for (const konto of m.konten ?? []) {
      if (!spieler.has(konto)) spieler.set(konto, leer());
      spieler.get(konto).matches++;
    }

    for (const e of m.elims ?? []) {
      elimsGesamt++;
      if (e.taeter && spieler.has(e.taeter)) zaehle(spieler.get(e.taeter), e, 'taeter');
      if (e.opfer && spieler.has(e.opfer)) zaehle(spieler.get(e.opfer), e, 'opfer');
    }
  }

  // Team-Ebene, wo die Aufstellung bekannt ist
  const teams = await teamsFuer(season, windowId);
  const teamWerte = [];
  if (teams) {
    for (const t of teams) {
      const mitglieder = (t.spieler ?? []).filter((id) => spieler.has(id));
      if (!mitglieder.length) continue;
      const summe = { kills: 0, knocks: 0, gestorben: 0, umgehauen: 0 };
      for (const id of mitglieder) {
        const s = spieler.get(id);
        summe.kills += s.kills; summe.knocks += s.knocks;
        summe.gestorben += s.gestorben; summe.umgehauen += s.umgehauen;
      }
      teamWerte.push({
        platz: t.platz ?? null, punkte: t.punkte ?? null,
        spieler: t.spieler ?? [], erfasst: mitglieder.length, ...summe,
      });
    }
    teamWerte.sort((a, b) => (a.platz ?? 9e9) - (b.platz ?? 9e9));
  }

  return {
    season, windowId, eventId, region, titel,
    von: frueheste, bis: spaeteste,
    matches: dateien.length,
    elims: elimsGesamt,
    parserVersion: PARSER_VERSION,
    gerechnet: new Date().toISOString(),
    // Die Herkunft steht an den Daten, nicht nur in der Beschreibung.
    quelle: 'REPLAY',
    spieler: [...spieler.entries()].map(([epicId, s]) => ({ epicId, ...s }))
      .sort((a, b) => b.kills - a.kills),
    teams: teams ? teamWerte : null,
    teamQuelle: teams ? 'Epic-Bestenliste' : null,
  };
}

async function main() {
  let gerechnet = 0; let uebersprungen = 0;

  let saisons = [];
  try { saisons = await fs.readdir(ABLAGE); } catch { console.log('Noch keine Replays.'); return; }

  for (const season of saisons) {
    let fenster = [];
    try { fenster = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }

    for (const windowId of fenster) {
      const ordner = path.join(ABLAGE, season, windowId);
      const ziel = path.join(ordner, '_aggregat.json');

      if (!neu) {
        try {
          const alt = JSON.parse(await fs.readFile(ziel, 'utf8'));
          const dateien = (await fs.readdir(ordner))
            .filter((d) => d.endsWith('.json') && !d.startsWith('_')).length;
          // Neu rechnen, wenn Matches dazugekommen sind oder der Auswerter
          // eine andere Fassung hat.
          if (alt.matches === dateien && alt.parserVersion === PARSER_VERSION) {
            uebersprungen++; continue;
          }
        } catch { /* noch keins da */ }
      }

      const werte = await fensterRechnen(season, windowId);
      if (!werte) continue;
      await fs.writeFile(ziel, JSON.stringify(werte), 'utf8');
      gerechnet++;
      console.log(`${season} ${String(werte.region).padEnd(4)} ${werte.titel ?? windowId}`
        + ` - ${werte.matches} Matches, ${werte.spieler.length} Konten,`
        + ` ${werte.elims} Eliminierungen`
        + (werte.teams ? `, ${werte.teams.length} Teams` : ', keine Aufstellung'));
    }
  }
  console.log(`\nFertig: ${gerechnet} gerechnet, ${uebersprungen} unveraendert`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
