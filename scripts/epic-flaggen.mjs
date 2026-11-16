// Probe (16.11.2026): traegt Epics Turnier-Bestenliste je Spieler die Flagge, die er in Fortnite gewaehlt hat (playerFlagTokens, wie die Power Rankings)?
//   node scripts/epic-flaggen.mjs <eventId> <windowId> [seiten]
// Schreibt epic-flaggen.json ({ konto: land }) und zaehlt, wie viele Eintraege eine Flagge tragen; dazu drei Rohbeispiele.
import fs from 'node:fs';
import { holeNutzerToken } from '../lib/replayKern.mjs';
import { landAusGeoToken, unbekannteGeoTokens } from '../lib/spielerFlagge.mjs';
const [e, w, seitenArg] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
async function seite(nr) {
  for (let v = 0; v < 5; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(e)}/${encodeURIComponent(w)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token } }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404) return null;
    await new Promise((x) => setTimeout(x, 2000 * (v + 1)));
  }
  return null;
}
const raus = {}; let eintraege = 0, mitToken = 0, spieler = 0, mitLand = 0, seiten = 1; const beispiele = []; const schluessel = new Set();
for (let n = 0; n < Math.min(seiten, Number(seitenArg) || 100); n++) {
  const j = await seite(n); if (!j) break; seiten = j.totalPages ?? 1;
  for (const x of j.entries ?? []) {
    eintraege += 1; Object.keys(x).forEach((k) => schluessel.add(k));
    if (x.playerFlagTokens && Object.keys(x.playerFlagTokens).length) { mitToken += 1; if (beispiele.length < 3) beispiele.push({ rank: x.rank, teamAccountIds: x.teamAccountIds, playerFlagTokens: x.playerFlagTokens }); }
    for (const id of x.teamAccountIds ?? []) { spieler += 1; const l = landAusGeoToken(x.playerFlagTokens?.[id]); if (l) { mitLand += 1; raus[id.toLowerCase()] = l; } }
  }
}
fs.writeFileSync('epic-flaggen.json', JSON.stringify(raus));
console.log(`FLAGGEN ${w}: ${eintraege} Eintraege (${seiten} Seiten), Felder je Eintrag: ${[...schluessel].join(', ')}`);
console.log(`FLAGGEN mit playerFlagTokens: ${mitToken}/${eintraege}; Spieler mit Land: ${mitLand}/${spieler}`);
console.log(`FLAGGEN Beispiele: ${JSON.stringify(beispiele)}`);
if (unbekannteGeoTokens.size) console.log(`FLAGGEN ohne Kuerzel: ${[...unbekannteGeoTokens].join(', ')}`);
