/*
 * Epics Punktetabellen je Spieltag dauerhaft ablegen (Koordinator, 16.11.2026: vergangene Cups behalten ihr Punktesystem unter About).
 *
 * Epic laesst die Wertung mit dem Cup aus dem Katalog fallen - danach stand unter About "Scoring not published" (S42 FNCS Solos LCQ). Wie
 * scripts/preisgeld-aus-katalog.mjs fuer die Auszahlungen: jede Region einmal abfragen (app/api/cup-preise?wertungen=1) und alles, was Epic
 * gerade nennt, in data/wertung-tabellen.json schreiben. Viele Spieltage teilen sich einen Regelsatz; abgelegt wird jeder Satz einmal
 * (Schluessel: sein Inhalt) und je Fenster nur der Schluessel. Was schon da ist, bleibt stehen. Gelesen von app/api/cup-preise (wertungMitRueckfall).
 *
 * Aufruf:  node scripts/wertung-aus-katalog.mjs http://localhost:3000 [--probe]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const DATEI = path.join(DATEN, 'wertung-tabellen.json');
const SERVER = (process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3000').replace(/\/+$/, '');
const PROBE = process.argv.includes('--probe');
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

const hole = (weg) => fetch(`${SERVER}${weg}`, { cache: 'no-store', signal: AbortSignal.timeout(120_000) })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

async function main() {
  let datei = { saetze: {}, fenster: {} };
  try { datei = { saetze: {}, fenster: {}, ...JSON.parse(fs.readFileSync(DATEI, 'utf8')) }; } catch { /* neu */ }
  let neu = 0; let gefragt = 0;
  for (const region of REGIONEN) {
    const d = await hole(`/api/cup-preise?wertungen=1&region=${region}`);
    if (!d?.fenster) { console.log(`${region}: keine Antwort`); continue; }
    gefragt += 1;
    for (const [w, regeln] of Object.entries(d.fenster)) {
      if (!Array.isArray(regeln) || !regeln.length || datei.fenster[w]) continue;
      const roh = JSON.stringify(regeln);
      const k = createHash('sha1').update(roh).digest('hex').slice(0, 12);
      datei.saetze[k] ??= regeln;
      datei.fenster[w] = k;
      neu += 1;
    }
  }
  console.log(`${gefragt}/${REGIONEN.length} Regionen, ${neu} Spieltage neu, ${Object.keys(datei.fenster).length} Spieltage / ${Object.keys(datei.saetze).length} Regelsaetze gesamt.`);
  if (!neu || PROBE) return;
  datei.stand = new Date().toISOString();
  fs.mkdirSync(DATEN, { recursive: true });
  fs.writeFileSync(DATEI, JSON.stringify(datei));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
