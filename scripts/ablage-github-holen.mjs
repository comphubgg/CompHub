// Einzelne Dateien vom GitHub-Release holen - fuer den Laufrechner.
//
// Gegenstueck zu scripts/ablage-github.mjs fuer die Gegenrichtung. Die
// Verdienst-Akte (verdienst-archiv.json) und Epics Auszahlungstabellen
// (preisgeld-tabellen.json) entstehen nur auf dem Betreiber-Rechner - die
// alten Bestenlisten liegen nur dort - und kommen von dort ans Release.
// Der stuendliche Lauf holt sie sich sonst aus Supabase; antwortet das
// nicht (am 16. und 17.9.2026 stundenlang), rechnete er die Akten mit dem
// Stand aus seinem Zwischenspeicher und lud sie hoch: die Profile fielen
// auf die Zahlen von gestern zurueck. Deshalb hier: die genannten Dateien
// vom Release, und zwar immer, wenn die Pruefsumme dort eine andere ist.
//
//   node scripts/ablage-github-holen.mjs verdienst-archiv.json preisgeld-tabellen.json
//
// Kein Token noetig: die Anhaenge eines oeffentlichen Releases liest jeder.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATEN = path.join(process.cwd(), 'data');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const TAG = 'daten';
const BASIS = `https://github.com/${REPO}/releases/download/${TAG}/`;
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');
const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex');

async function holen(anhang) {
  const r = await fetch(BASIS + encodeURIComponent(anhang), {
    redirect: 'follow', signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'comphub-ablage' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const namen = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!namen.length) { console.error('Aufruf: node scripts/ablage-github-holen.mjs datei.json [...]'); process.exit(1); }

  let manifest = {};
  try { manifest = JSON.parse((await holen('manifest.json'))?.toString('utf8') || '{}'); }
  catch (e) { console.error(`  Manifest nicht lesbar: ${e.message}`); }

  let geholt = 0;
  for (const name of namen) {
    const anhang = anhangName(name);
    const ziel = path.join(DATEN, name);
    const dort = manifest[anhang]?.summe;
    const hier = fs.existsSync(ziel) ? pruefsumme(fs.readFileSync(ziel)) : null;
    if (dort && hier === dort) { console.log(`  =  ${name} (unveraendert)`); continue; }
    try {
      const daten = await holen(anhang);
      if (!daten) { console.log(`  -  ${name} (nicht am Release)`); continue; }
      if (hier && pruefsumme(daten) === hier) { console.log(`  =  ${name} (unveraendert)`); continue; }
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, daten);
      geholt += 1;
      console.log(`  +  ${name} (${Math.round(daten.length / 1024)} KB)`);
    } catch (e) {
      console.log(`  !  ${name}: ${e.message}`);
    }
  }
  console.log(`Fertig: ${geholt} geholt.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
