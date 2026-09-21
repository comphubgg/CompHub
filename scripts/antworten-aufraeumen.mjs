/*
 * Alte Profil-Antworten aus der Ablage nehmen.
 *
 * Die Seite legt zu jedem angesehenen Profil eine fertige Antwort ab
 * (antworten/szene_spieler=<id>.json, gut hundert Kilobyte), damit der
 * naechste Aufruf sofort kommt. Sie ist reiner Zwischenspeicher: gerechnet
 * aus der Akte, in einer Sekunde wieder da. Ohne Aufraeumen sammelten sich
 * dort achttausend Profile mit fast einem Gigabyte - mehr als das
 * kostenlose Kontingent. Deshalb nimmt der stuendliche Lauf heraus, was
 * seit dreissig Tagen niemand mehr angefasst hat. Daten des Betreibers
 * (Konten, Profile, Bilder, Archiv) werden hier nie beruehrt - nur dieser
 * eine Namensraum.
 *
 *   node scripts/antworten-aufraeumen.mjs            aelter als 30 Tage
 *   node scripts/antworten-aufraeumen.mjs --tage 14
 *   node scripts/antworten-aufraeumen.mjs --probe    nur zaehlen
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim();
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const URL_ = (U.SUPABASE_URL || U.STORAGE_URL || '').replace(/\/+$/, '');
const KEY = U.SUPABASE_SERVICE_ROLE_KEY || U.STORAGE_SERVICE_ROLE_KEY || '';
const KOPF = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };

const arg = (name, standard = '') => { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] ?? standard) : standard; };
const TAGE = Math.max(1, Number(arg('--tage', '30')) || 30);
const PROBE = process.argv.includes('--probe');

if (!URL_ || !KEY) { console.error('SUPABASE_URL oder der Schluessel fehlen.'); process.exit(1); }

const grenze = new Date(Date.now() - TAGE * 86_400_000).toISOString();
// Nur dieser Namensraum, nur aelter als die Grenze. Das "=" im Namen ist im
// Muster als Zeichen gemeint; PostgREST nimmt es so, wie es hier steht.
const filter = `name=like.antworten/szene_spieler%3D*&geaendert=lt.${encodeURIComponent(grenze)}`;

const zaehlung = await fetch(`${URL_}/rest/v1/ablage?select=name&${filter}`, {
  headers: { ...KOPF, Prefer: 'count=exact', Range: '0-0' },
});
const bereich = zaehlung.headers.get('content-range') ?? '';
const anzahl = Number(bereich.split('/')[1] ?? 0) || 0;
console.log(`  Profil-Antworten aelter als ${TAGE} Tage: ${anzahl}`);
// Kein process.exit: Node 24 unter Windows meldet sonst nach einem fetch
// eine Assertion beim Beenden. Das Skript endet von selbst.
if (!PROBE && anzahl) {
  const r = await fetch(`${URL_}/rest/v1/ablage?${filter}`, {
    method: 'DELETE',
    headers: { ...KOPF, Prefer: 'return=minimal' },
  });
  if (!r.ok) { console.error(`  Loeschen fehlgeschlagen: ${r.status} ${await r.text()}`); process.exitCode = 1; }
  else console.log(`  Entfernt: ${anzahl}`);
}
