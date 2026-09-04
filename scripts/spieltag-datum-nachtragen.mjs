// Das echte Datum jedes Spieltags nachtragen.
//
// Im Verzeichnis (data/szene-stats/index.json) stand als "datum" bisher der
// Zeitpunkt, an dem wir die Datei geholt haben - nicht der Tag, an dem das
// Turnier lief. Beim ersten grossen Lauf im Juli trugen deshalb 768 von 894
// Spieltagen denselben Wert, quer durch acht Saisons.
//
// Das faellt an zwei Stellen auf:
//
//   - Die Turnierliste im Spielerprofil sortiert nach diesem Wert. Bei
//     lauter gleichen Werten stand Chapter 7 Season 1 zwischen Chapter 5
//     und Chapter 6, weil dann die Lesereihenfolge entscheidet.
//   - Ein Datum neben dem Turniernamen waere schlicht falsch gewesen.
//
// Epic haelt die alten Bestenlisten weiter vor, und jeder Eintrag darin
// nennt zu jedem Match seine Endzeit. Der frueheste dieser Zeitpunkte ist
// der Beginn des Spieltags. Zur Probe: Dinosauron_Day1 - im Archiv als
// "CH6S4FNCSGlobals2025Day1" gefuehrt - liefert den 6. September 2025, den
// ersten Tag der FNCS Global Championship 2025.
//
//   node scripts/spieltag-datum-nachtragen.mjs           -> alles Fehlende
//   node scripts/spieltag-datum-nachtragen.mjs S37 S39   -> nur diese Saisons
//   node scripts/spieltag-datum-nachtragen.mjs --neu     -> auch Vorhandenes
//
// Wie bei den Platzierungen laeuft die Abfrage ueber die eigene
// Schnittstelle, damit die Epic-Anmeldung an einer Stelle bleibt. Der
// Entwicklungsserver muss also laufen.

import { promises as fs } from 'fs';
import path from 'path';

const BASIS = process.env.WERKZEUG_URL || 'http://localhost:3000';
const VERZEICHNIS = path.join(process.cwd(), 'data', 'szene-stats', 'index.json');

const argumente = process.argv.slice(2);
const neu = argumente.includes('--neu');
const saisons = argumente.filter((a) => /^S\d+$/i.test(a)).map((a) => a.toUpperCase());

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Woran ein nachgetragenes Datum zu erkennen ist.
 *
 * Die alten Eintraege tragen alle den Abrufzeitpunkt aus dem Juli 2026.
 * Ein echtes Turnierdatum liegt davor - die Quelle spiegelt nur, was
 * gespielt wurde. Wer also nach dem 1. Juli 2026 datiert ist und nicht aus
 * der laufenden Saison stammt, hat noch den Abrufzeitpunkt stehen.
 *
 * Statt das zu raten, merkt sich der Lauf sein Ergebnis: `datumQuelle`
 * steht auf 'epic', sobald der Wert aus einer Bestenliste stammt. Alles
 * ohne diese Marke wird geholt.
 */
function brauchtNachtrag(e) {
  if (neu) return true;
  return e.datumQuelle !== 'epic';
}

/** Die frueheste Match-Endzeit einer Bestenliste - der Beginn des Spieltags. */
async function spieltagsDatum(eventId, windowId) {
  const url = `${BASIS}/api/cup-leaderboard`
    + `?event=${encodeURIComponent(eventId)}`
    + `&window=${encodeURIComponent(windowId)}&limit=1`;
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  const daten = await antwort.json();

  const zeiten = [];
  for (const eintrag of daten.entries ?? []) {
    for (const m of eintrag.matches ?? []) {
      const t = Date.parse(m.endTime ?? '');
      if (Number.isFinite(t)) zeiten.push(t);
    }
  }
  return zeiten.length ? Math.min(...zeiten) : null;
}

async function main() {
  const verzeichnis = JSON.parse(await fs.readFile(VERZEICHNIS, 'utf8'));
  const offen = verzeichnis.filter((e) =>
    brauchtNachtrag(e) && (!saisons.length || saisons.includes(e.season)));

  console.log(`${verzeichnis.length} Spieltage im Verzeichnis, `
    + `${offen.length} ohne echtes Datum`);
  if (!offen.length) return;

  let getroffen = 0, ohne = 0;
  const fehler = [];

  for (const [i, e] of offen.entries()) {
    let datum = null;
    try {
      datum = await spieltagsDatum(e.eventId, e.windowId);
    } catch (err) {
      // Epic drosselt bei laengeren Laeufen. Einmal nachfassen genuegt
      // erfahrungsgemaess - bei den Platzierungen brachte das 859 von 894.
      await warte(2500);
      try { datum = await spieltagsDatum(e.eventId, e.windowId); }
      catch (err2) { fehler.push(`${e.windowId}: ${err2.message}`); }
    }

    if (datum) {
      e.datum = datum;
      e.datumQuelle = 'epic';
      getroffen++;
    } else {
      // Kein Datum? Dann bleibt der alte Wert stehen, statt ihn durch eine
      // Null zu ersetzen - eine Null sortierte den Spieltag ans Ende.
      ohne++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${offen.length} - ${getroffen} datiert, ${ohne} ohne`);
      await fs.writeFile(VERZEICHNIS, JSON.stringify(verzeichnis, null, 1), 'utf8');
    }
    await warte(350);
  }

  await fs.writeFile(VERZEICHNIS, JSON.stringify(verzeichnis, null, 1), 'utf8');
  console.log(`\nFertig: ${getroffen} Spieltage datiert, ${ohne} ohne Angabe`);
  if (fehler.length) {
    console.log(`${fehler.length} Fehler, die ersten fuenf:`);
    for (const f of fehler.slice(0, 5)) console.log('   ', f);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
