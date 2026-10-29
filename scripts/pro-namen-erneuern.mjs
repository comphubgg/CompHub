// Einmal am Tag die aktuellen Epic-Namen aller Pros nach data/epic-namen.json.
//
// Der Betreiber (29.10.2026): "du musst wirklich jeden Tag einmal Username updaten von jedem Pro in-game" - er hatte Juu unter seinem
// In-Game-Namen ("juuzon ay лол7") gesucht und nicht gefunden. Die Namen standen bisher nur so aktuell da, wie der letzte Cup, in dem das Konto
// gespielt hat. Hier werden alle Konten der Szene-Liste und der gepflegten Profile bei Epic nachgeschlagen (100 je Anfrage).
//
//   node scripts/pro-namen-erneuern.mjs           einmal am Tag (Marke data/pro-namen-stand.json)
//   node scripts/pro-namen-erneuern.mjs --jetzt   sofort

import fs from 'node:fs';
import path from 'node:path';
import { holeNutzerToken } from '../lib/replayKern.mjs';

const DATEN = path.join(process.cwd(), 'data');
const lies = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATEN, f), 'utf8')); } catch { return d; } };
const ID = /^[0-9a-f]{32}$/i;

const stand = lies('pro-namen-stand.json', {});
if (!process.argv.includes('--jetzt') && Date.now() - (stand.zeit ?? 0) < 20 * 3600_000) {
  console.log(`Pro-Namen: heute schon erneuert (${new Date(stand.zeit).toISOString()})`);
  process.exit(0);
}

const ids = new Set();
for (const p of lies('szene-quelle/spielerliste.json', [])) if (p?.ID && ID.test(p.ID)) ids.add(p.ID.toLowerCase());
const profile = lies('spieler-profile.json', []);
for (const p of (Array.isArray(profile) ? profile : Object.values(profile))) if (p?.id && ID.test(p.id)) ids.add(p.id.toLowerCase());

const namen = lies('epic-namen.json', {});
const { token } = await holeNutzerToken();
const liste = [...ids];
let neu = 0; let gleich = 0; let fehler = 0;
for (let i = 0; i < liste.length; i += 100) {
  const teil = liste.slice(i, i + 100);
  try {
    const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account?${teil.map((x) => `accountId=${x}`).join('&')}`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) { fehler += 1; continue; }
    for (const a of await r.json()) {
      // Konsolen-Konten tragen den Namen nur bei der Plattform (PSN, Xbox).
      const name = a.displayName || Object.values(a.externalAuths ?? {}).map((x) => x?.externalDisplayName).find(Boolean);
      if (!a.id || !name) continue;
      const k = a.id.toLowerCase();
      if (namen[k] === name) gleich += 1; else { namen[k] = name; neu += 1; }
    }
  } catch { fehler += 1; }
  await new Promise((weiter) => setTimeout(weiter, 250));
}

fs.writeFileSync(path.join(DATEN, 'epic-namen.json'), JSON.stringify(namen));
fs.writeFileSync(path.join(DATEN, 'pro-namen-stand.json'), JSON.stringify({ zeit: Date.now(), pros: liste.length, neu, gleich, fehler }));
console.log(`Pro-Namen: ${liste.length} Pros nachgeschlagen, ${neu} neue Namen, ${gleich} unveraendert, ${fehler} Anfragen gescheitert`);
