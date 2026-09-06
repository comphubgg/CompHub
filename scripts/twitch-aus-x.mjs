// Twitch-Kanaele aus der vorhandenen Streamerliste in die Spielerprofile.
//
//   node scripts/twitch-aus-x.mjs           -> nur zeigen, was passieren wuerde
//   node scripts/twitch-aus-x.mjs --schreiben
//
// Warum das geht, ohne etwas zu raten:
//
// data/streamers.json fuehrt zu jedem Streamer den Twitch-Kanal UND das
// X-Konto. data/spieler-profile.json fuehrt zu vielen Profis das X-Konto.
// Stimmt das X-Konto ueberein, ist es derselbe Mensch - das ist eine
// Gleichheit, keine Aehnlichkeit. Aus einem Namen auf einen Twitch-Kanal zu
// schliessen waere dagegen geraten, und genau das soll hier nicht passieren:
// "Sky" gibt es auf Twitch hundertmal.
//
// Vorhandene Eintraege werden nicht ueberschrieben. Wer schon einen Kanal im
// Profil stehen hat, behaelt ihn - der ist von Hand gesetzt und geht vor.

import { promises as fs } from 'fs';
import path from 'path';

const SCHREIBEN = process.argv.slice(2).includes('--schreiben');
const ORT = path.join(process.cwd(), 'data');

/** Ein X-Konto vergleichbar machen: ohne @, klein, ohne Adresse davor. */
function xSchluessel(wert) {
  return String(wert ?? '').trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '')
    .replace(/^@/, '')
    .replace(/[/?].*$/, '');
}

async function lies(datei) {
  return JSON.parse(await fs.readFile(path.join(ORT, datei), 'utf8'));
}

async function main() {
  const streamer = await lies('streamers.json');
  const profile = await lies('spieler-profile.json');

  /** X-Konto -> Twitch-Kanal, aus der gepflegten Streamerliste. */
  const zuTwitch = new Map();
  for (const liste of Object.values(streamer.streamers ?? {})) {
    for (const e of liste ?? []) {
      const x = xSchluessel(e.twitter);
      if (x && e.twitch) zuTwitch.set(x, String(e.twitch).trim());
    }
  }
  console.log(`${zuTwitch.size} Streamer mit X-Konto in der Liste.`);

  let neu = 0; let schonDa = 0; let ohne = 0;
  for (const [schluessel, p] of Object.entries(profile)) {
    if (!p.x) { ohne += 1; continue; }
    const kanal = zuTwitch.get(xSchluessel(p.x));
    if (!kanal) { ohne += 1; continue; }
    if (p.twitch) { schonDa += 1; continue; }
    console.log(`  ${(p.anzeige || p.name || schluessel).padEnd(26)} `
      + `X @${p.x}  ->  twitch.tv/${kanal}`);
    p.twitch = kanal;
    neu += 1;
  }

  console.log(`\n${neu} Kanaele zugeordnet, ${schonDa} standen schon im Profil, `
    + `${ohne} ohne Treffer.`);

  if (!SCHREIBEN) {
    console.log('Nichts geschrieben. Mit --schreiben uebernehmen.');
    return;
  }
  await fs.writeFile(path.join(ORT, 'spieler-profile.json'),
    JSON.stringify(profile, null, 2), 'utf8');
  console.log('data/spieler-profile.json geschrieben.');
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
