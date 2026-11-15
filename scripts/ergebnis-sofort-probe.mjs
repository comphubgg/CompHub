/*
 * Trockenlauf ohne laufende Seite (z. B. im GitHub-Ablauf mit .env.local und epic-auth.json): derselbe Code wie /api/cron/ergebnis-sofort
 * (lib/ergebnisSofort.ts, per jiti mit dem "@/"-Alias geladen). Postet nichts, vermerkt nichts.
 *   node scripts/ergebnis-sofort-probe.mjs <windowId>     der Post zu diesem Spieltag (fertig oder nicht)
 *   node scripts/ergebnis-sofort-probe.mjs                ein normaler Lauf: was jetzt fertig waere
 *   ... --json aus.json                                   dazu die Antwort als Datei (fuer ergebnis-sofort.mjs --probe <w> --datei aus.json --bild x.png)
 */
import path from 'node:path';
import { createJiti } from 'jiti';
const PROJEKT = path.resolve(import.meta.dirname, '..');
const jiti = createJiti(import.meta.url, { alias: { '@': PROJEKT }, jsx: true });
const { sofortLauf } = await jiti.import(path.join(PROJEKT, 'lib/ergebnisSofort.ts'));
const w = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;
const j = await sofortLauf(w);
const ji = process.argv.indexOf('--json');
if (ji >= 0) (await import('node:fs')).writeFileSync(process.argv[ji + 1], JSON.stringify(j));
for (const p of j.posts) console.log(`--- ${p.windowId} (${p.region}) · Grund ${p.grund} · ${p.bild.length} Fotos: ${p.bild.map((b) => b.datei).join(', ')}\n${p.text}\n`);
console.log('beobachtet:', JSON.stringify(j.beobachtet), 'eng:', j.eng);
process.exit(0);
