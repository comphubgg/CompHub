// Der Live-Sammler als Schleife: solange ein Cup laeuft, alle sechzig Sekunden.
//
// Bisher lief der Sammler alle zehn Minuten als eigener Auftrag bei GitHub:
// Abhaengigkeiten, Anmeldung, Stand holen, sammeln, auswerten, hochladen -
// sechs bis sieben Minuten je Durchgang. Ein Match, das gerade zu Ende war,
// stand damit zehn bis siebzehn Minuten spaeter in den Werten. Der
// Betreiber wollte es "so schnell wie moeglich", so wie die Seiten, die
// ihre Werte binnen Minuten haben.
//
// Der Unterschied ist nicht die Quelle - es sind dieselben Server-Replays
// von Epic - sondern der Takt. Deshalb bleibt ein Auftrag jetzt an, solange
// ein Cup laeuft, und wiederholt die drei Schritte alle sechzig Sekunden:
// nur neue Matches werden geholt, nur betroffene Fenster neu gerechnet,
// nur Veraendertes hochgeladen. Ein Match ist damit ein bis drei Minuten
// nach seinem Ende in der Ablage - das ist die Grenze, die Epic setzt: das
// Replay liegt erst dann auf dem Server.
//
// Ende: wenn fuenf Nachfragen hintereinander keinen laufenden Cup mehr
// nennen - die letzten Replays eines Cups liegen erst ein paar Minuten nach
// seinem Ende bei Epic -, oder nach der Hoechstdauer (GitHub erlaubt sechs
// Stunden je Auftrag; der naechste geplante Lauf wartet in der Schlange und
// uebernimmt).
//
//   node scripts/replays-live-schleife.mjs [--minuten 330] [--takt 60]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WERKZEUG = (process.env.WERKZEUG_URL || 'https://www.thecomphub.com').replace(/\/+$/, '');
const arg = (name, standard) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : standard;
};
const HOECHSTENS_MIN = arg('--minuten', 330);
const TAKT_S = arg('--takt', 60);
const PROTOKOLL = path.join(process.cwd(), 'data', 'replays', '_live-lauf.json');

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wie viele Cups laut Katalog gerade laufen - oder null, wenn die Seite nicht antwortet. */
async function laufendeCups() {
  try {
    const r = await fetch(`${WERKZEUG}/api/cup-catalog?modus=aktuell`,
      { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.live === 'number' ? j.live : null;
  } catch {
    return null;
  }
}

/** Ein Skript laufen lassen, Ausgabe durchreichen, Rueckgabewert melden. */
function schritt(name, args) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [path.join('scripts', name), ...args],
    { stdio: 'inherit', env: process.env });
  const dauer = Math.round((Date.now() - start) / 1000);
  console.log(`   ${name} ${args.join(' ')} -> Code ${r.status ?? 'null'} nach ${dauer}s`);
  return r.status ?? -1;
}

/** Welche Fenster der letzte Sammler-Lauf angefasst hat - aus seinem Protokoll. */
function angefassteFenster() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'replays', '_lauf.json'), 'utf8'));
    return Array.isArray(p.angefasst) ? p.angefasst : [];
  } catch {
    return [];
  }
}

function protokoll(daten) {
  try {
    fs.mkdirSync(path.dirname(PROTOKOLL), { recursive: true });
    fs.writeFileSync(PROTOKOLL, JSON.stringify({
      zeit: new Date().toISOString(),
      lauf: process.env.GITHUB_RUN_ID ?? null,
      ...daten,
    }, null, 1));
  } catch { /* dann eben ohne Protokoll */ }
}

async function main() {
  const beginn = Date.now();
  let durchgang = 0;
  let ohneCup = 0;
  const verlauf = [];

  console.log(`Live-Schleife: hoechstens ${HOECHSTENS_MIN} Minuten, alle ${TAKT_S} Sekunden.`);

  while (Date.now() - beginn < HOECHSTENS_MIN * 60_000) {
    const live = await laufendeCups();
    if (live === 0) {
      ohneCup += 1;
      console.log(`Kein laufender Cup (${ohneCup}/5).`);
      if (ohneCup >= 5) break;
    } else {
      ohneCup = 0;
    }
    durchgang += 1;
    const t0 = Date.now();
    console.log(`\n=== Durchgang ${durchgang} - ${new Date().toISOString()} - laufende Cups: ${live ?? 'unbekannt'}`);

    const sammeln = schritt('replays-holen.mjs', ['--live']);
    /*
     * Nur die Fenster neu rechnen, die der Sammler gerade angefasst hat.
     * Alle dreihundert Fenster der Saison jede Minute durchzusehen hiesse,
     * jede Minute siebenhundert Megabyte Aggregate zu lesen.
     */
    const angefasst = angefassteFenster();
    const auswerten = angefasst.length
      ? schritt('replays-aggregieren.mjs', angefasst) : 0;
    // Ans Release, nicht mehr nach Supabase (seit dem 22.9.2026 - siehe
    // lib/ablageGithub, nurRelease). Die Seite liest die Auswertung von dort.
    const hochladen = schritt('ablage-github.mjs', ['--neuer-als', '5', '--nur', 'replays']);

    verlauf.push({
      zeit: new Date().toISOString(), live,
      dauerS: Math.round((Date.now() - t0) / 1000),
      sammeln, auswerten, hochladen,
    });
    protokoll({ art: 'schleife', durchgaenge: durchgang, verlauf: verlauf.slice(-30) });

    // Das Protokoll selbst mit hochladen, damit es aussen lesbar ist.
    schritt('ablage-github.mjs', ['--neuer-als', '2', '--nur', 'replays/_live-lauf.json']);

    const rest = TAKT_S * 1000 - (Date.now() - t0);
    if (rest > 0) await warte(rest);
  }

  console.log(`\nSchleife beendet nach ${durchgang} Durchgaengen, `
    + `${Math.round((Date.now() - beginn) / 60_000)} Minuten.`);
  protokoll({ art: 'schleife', durchgaenge: durchgang, beendet: true, verlauf: verlauf.slice(-30) });
  schritt('ablage-github.mjs', ['--neuer-als', '2', '--nur', 'replays/_live-lauf.json']);
}

main().catch((e) => {
  console.error('Fehlgeschlagen:', e.message);
  protokoll({ art: 'schleife', fehler: e.message });
  process.exit(1);
});
