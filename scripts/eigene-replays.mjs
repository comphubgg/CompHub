// Die eigenen Werte aus den Replays auf diesem Rechner holen.
//
// -------------------------------------------------------------- Warum das
//
// Epic veroeffentlicht zu einem Turniermatch nur Platz, Eliminierungen,
// Lebenszeit und Siege - nachgemessen an sechs Cup-Arten, darunter FNCS
// Division 1, Performance Evaluation, Solo Victory und die Skin-Cups. Kein
// Schaden, keine Trefferquote, kein Material.
//
// Aus dem Server-Replay, das dieses Werkzeug ohnehin holt, kommen die
// vollstaendige Lobby, die Platzierungen, Kills je Spieler, Waffen und
// Todesorte - aber ebenfalls kein Schaden. Dort steht "Stats: null", weil
// ein Server-Replay niemanden hat, der es aufzeichnet.
//
// Fortnite legt aber auf dem eigenen Rechner zu jedem gespielten Match ein
// Replay ab, und DARIN stehen die eigenen Werte vollstaendig:
//
//   Eliminations, Accuracy, WeaponDamage, OtherDamage, DamageToPlayers,
//   DamageTaken, DamageToStructures, MaterialsGathered, MaterialsUsed,
//   TotalTraveled, Revives, Assists
//
// Sie gelten fuer genau eine Person - die, die das Replay aufgenommen hat.
// Fuer alle anderen enthaelt die Datei diese Felder nicht; nachgesehen an
// hundertsiebzehn Spielern eines echten Matches, kein einziges Damage-Feld.
// Deshalb kann dieses Skript auch nur die eigenen Werte liefern, und genau
// das tut es. Erfunden wird nichts.
//
// Die Zuordnung zum Turnier geht ueber die GameSessionId des Replays: sie
// ist dieselbe Kennung, die Epic in der Bestenliste als Match fuehrt und
// die im Werkzeug als "Match ID" steht.
//
// ------------------------------------------------------------- Aufrufe
//
//   node scripts/eigene-replays.mjs              -> alles Neue
//   node scripts/eigene-replays.mjs --alle       -> auch schon Gelesenes
//   node scripts/eigene-replays.mjs --auch-pubs  -> nicht nur Turniere
//
// Was hier entsteht, sind ein paar hundert Byte je Match. Das Replay selbst
// bleibt liegen, wo es liegt - es wird nur gelesen.

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Wo die Daten liegen - dieselbe Regel wie im Replay-Kern.
 *
 * lib/datenOrt.ts laesst sich aus einem einfachen Skript nicht laden, es
 * ist TypeScript. Die Regel ist kurz genug, um sie hier zu wiederholen:
 * der Ordner "data" neben dem Projekt, sofern beschreibbar.
 */
const DATEN_ORT = process.env.COMPHUB_DATEN || path.join(process.cwd(), 'data');

const argumente = process.argv.slice(2);
const alle = argumente.includes('--alle');
const auchPubs = argumente.includes('--auch-pubs');

/**
 * Wo Fortnite die Replays ablegt.
 *
 * Ueber FORTNITE_DEMOS umstellbar, falls das Spiel woanders liegt - etwa
 * auf einer zweiten Platte.
 */
const DEMOS = process.env.FORTNITE_DEMOS
  || path.join(os.homedir(), 'AppData', 'Local', 'FortniteGame', 'Saved', 'Demos');

/** Wohin die herausgeloesten Werte gehoeren. */
const ZIEL = path.join(DATEN_ORT, 'eigene-matches');

/** Was schon gelesen wurde - damit ein zweiter Lauf nichts doppelt tut. */
const MERKZETTEL = path.join(ZIEL, '_gelesen.json');

/**
 * Nur Turniere, wenn nichts anderes verlangt ist.
 *
 * Epic nennt sie in der Playlist so. Oeffentliche Runden und Kreativmodus
 * gehoeren nicht in ein Werkzeug fuer Wettkampfstatistik und wuerden die
 * Ablage nur fuellen.
 */
const istTurnier = (playlist) => /showdown|tournament/i.test(playlist ?? '');

async function liesMerkzettel() {
  try {
    return JSON.parse(await fs.readFile(MERKZETTEL, 'utf8'));
  } catch {
    return { dateien: {} };
  }
}

/**
 * Die Werte, die im Replay stehen - unveraendert uebernommen.
 *
 * Umgerechnet wird nur, was ohne Umrechnung irrefuehrend waere: die
 * Trefferquote steht als Anteil zwischen null und eins, und die
 * zurueckgelegte Strecke in Zentimetern, wie es die Unreal Engine tut.
 */
function werteAus(stats) {
  if (!stats) return null;
  return {
    elims: stats.Eliminations ?? null,
    assists: stats.Assists ?? null,
    trefferquote: stats.Accuracy ?? null,
    schadenWaffen: stats.WeaponDamage ?? null,
    schadenSonst: stats.OtherDamage ?? null,
    schadenAnSpieler: stats.DamageToPlayers ?? null,
    schadenErhalten: stats.DamageTaken ?? null,
    schadenAnBauten: stats.DamageToStructures ?? null,
    matsGefarmt: stats.MaterialsGathered ?? null,
    matsVerbaut: stats.MaterialsUsed ?? null,
    // Zentimeter aus der Engine - in Metern ist es lesbar.
    streckeMeter: stats.TotalTraveled === null || stats.TotalTraveled === undefined
      ? null : Math.round(stats.TotalTraveled / 100),
    wiederbelebt: stats.Revives ?? null,
  };
}

async function main() {
  let dateien;
  try {
    dateien = (await fs.readdir(DEMOS)).filter((d) => d.endsWith('.replay'));
  } catch {
    console.log('');
    console.log(`  Kein Replay-Ordner unter ${DEMOS}`);
    console.log('  Fortnite legt sie dort ab, sobald ein Match gespielt wurde.');
    console.log('  Liegt das Spiel woanders, hilft FORTNITE_DEMOS.');
    console.log('');
    return;
  }

  const merk = await liesMerkzettel();
  await fs.mkdir(ZIEL, { recursive: true });

  const { leseReplay } = await import('../lib/replayLeser.mjs');

  let neu = 0; let uebersprungen = 0; let ohneWerte = 0; let keinTurnier = 0;
  let schief = 0;

  console.log('');
  console.log(`  Ordner   : ${DEMOS}`);
  console.log(`  Replays  : ${dateien.length}`);
  console.log('');

  for (const [i, d] of dateien.entries()) {
    const voll = path.join(DEMOS, d);
    const st = await fs.stat(voll).catch(() => null);
    if (!st) continue;
    const marke = `${st.size}-${Math.round(st.mtimeMs)}`;
    if (!alle && merk.dateien[d] === marke) { uebersprungen += 1; continue; }

    process.stdout.write(`\r  ${String(i + 1).padStart(4)}/${dateien.length}  ${d.slice(0, 46).padEnd(46)}`);

    try {
      const e = await leseReplay(voll);
      const spiel = e.GameData ?? {};
      const playlist = spiel.CurrentPlaylist ?? null;

      if (!auchPubs && !istTurnier(playlist)) {
        merk.dateien[d] = marke;
        keinTurnier += 1;
        continue;
      }

      const stats = werteAus(e.Stats);
      const eigen = (e.PlayerData ?? []).find((p) => p.IsReplayOwner);
      if (!stats || !eigen?.EpicId || !spiel.GameSessionId) {
        merk.dateien[d] = marke;
        ohneWerte += 1;
        continue;
      }

      const konto = String(eigen.EpicId).toLowerCase();
      const ordner = path.join(ZIEL, konto);
      await fs.mkdir(ordner, { recursive: true });
      await fs.writeFile(
        path.join(ordner, `${String(spiel.GameSessionId).toLowerCase()}.json`),
        JSON.stringify({
          sitzung: String(spiel.GameSessionId).toLowerCase(),
          konto,
          name: eigen.PlayerName ?? null,
          playlist,
          beginn: spiel.UtcTimeStartedMatch ?? null,
          platz: eigen.Placement ?? null,
          teamKills: eigen.TeamKills ?? null,
          plattform: eigen.Platform ?? null,
          werte: stats,
          quelle: 'EIGENES_REPLAY',
          gelesen: new Date().toISOString(),
        }, null, 1), 'utf8');

      merk.dateien[d] = marke;
      neu += 1;
    } catch (fehler) {
      schief += 1;
      if (schief <= 5) console.log(`\n    - ${d}: ${fehler.message}`);
    }
  }

  await fs.writeFile(MERKZETTEL, JSON.stringify(merk, null, 1), 'utf8');

  console.log('\n');
  console.log(`  Neu gelesen        : ${neu}`);
  console.log(`  Schon bekannt      : ${uebersprungen}`);
  console.log(`  Kein Turnier       : ${keinTurnier}`);
  console.log(`  Ohne eigene Werte  : ${ohneWerte}`);
  console.log(`  Fehlgeschlagen     : ${schief}`);
  console.log('');
  if (neu) {
    console.log('  Damit die Werte auf der Seite ankommen, muessen sie noch hoch:');
    console.log('    node scripts/umzug-supabase.mjs --nur eigene-matches');
    console.log('');
  }
}

await main();
