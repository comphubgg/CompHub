// Die Seite auf Hugging Face Spaces bereitstellen (kostenlos, ohne Karte) - siehe hf-space/Dockerfile.
//
// Netlify hat am 11.10.2026 die Seite abgeschaltet (300 Punkte im Monat aufgebraucht, bis 4.11.).
// Das Image der Seite liegt fertig und oeffentlich bei ghcr.io/comphubgg/comphub-web; das Space startet nur dieses.
//
// Aufruf (das Token mit Schreibrecht kommt aus der Umgebung, nie in eine Datei):
//   HF_TOKEN=hf_... node scripts/hf-bereitstellen.mjs [--name comphub] [--neustart]
//
//   (ohne Flags)  Space anlegen/aktualisieren (README + Dockerfile) und warten, bis es laeuft
//   --neustart    Space neu bauen lassen (holt das neueste Image)
//
// Die Einstellungen der Seite (Zugaenge fuer Discord, Mail, Twitch, Datenarchiv ...) setzt dieses Skript NICHT:
// sie stehen als "Secrets" in den Einstellungen des Space und kommen nur mit ausdruecklicher Erlaubnis des
// Betreibers dorthin.

import fs from 'node:fs';
import path from 'node:path';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const TOKEN = process.env.HF_TOKEN || '';
const NAME = (process.argv.find((a, i) => process.argv[i - 1] === '--name')) || 'comphub';
const API = 'https://huggingface.co/api';

if (!TOKEN) { console.error('HF_TOKEN fehlt.'); process.exit(1); }

const ruf = async (weg, init = {}) => {
  const r = await fetch(`${API}${weg}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* kein JSON */ }
  return { ok: r.ok, status: r.status, j, text };
};

const ich = await ruf('/whoami-v2');
if (!ich.ok) { console.error('Token nicht gueltig:', ich.status); process.exit(1); }
const konto = ich.j.name;
const repo = `${konto}/${NAME}`;
console.log('Konto:', konto, '· Space:', repo);

// 1. Anlegen (schon vorhanden ist in Ordnung).
const neu = await ruf('/repos/create', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'space', name: NAME, sdk: 'docker', private: false }),
});
console.log('Anlegen:', neu.ok ? 'neu' : (neu.status === 409 ? 'schon vorhanden' : `Fehler ${neu.status} ${neu.text.slice(0, 200)}`));

// 2. Dateien: README (Kopfzeile) und Dockerfile.
const dateien = ['README.md', 'Dockerfile'].map((n) => ({
  path: n, content: fs.readFileSync(path.join(PROJEKT, 'hf-space', n)).toString('base64'),
}));
const zeilen = [
  JSON.stringify({ key: 'header', value: { summary: 'CompHub: Image von ghcr.io starten', description: '' } }),
  ...dateien.map((d) => JSON.stringify({ key: 'file', value: { content: d.content, path: d.path, encoding: 'base64' } })),
].join('\n');
const c = await ruf(`/spaces/${repo}/commit/main`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-ndjson' }, body: zeilen,
});
console.log('Dateien:', c.ok ? 'abgelegt' : `Fehler ${c.status} ${c.text.slice(0, 300)}`);

if (process.argv.includes('--neustart')) {
  const r = await ruf(`/spaces/${repo}/restart?factory=true`, { method: 'POST' });
  console.log('Neustart:', r.ok ? 'angestossen' : `Fehler ${r.status} ${r.text.slice(0, 200)}`);
}

// 3. Warten, bis es laeuft.
const adresse = `https://${konto.toLowerCase()}-${NAME.toLowerCase()}.hf.space`;
for (let i = 0; i < 60; i += 1) {
  const s = await ruf(`/spaces/${repo}/runtime`);
  const stufe = s.j?.stage ?? s.status;
  console.log(`  ${new Date().toISOString().slice(11, 19)} ${stufe}`);
  if (stufe === 'RUNNING') break;
  if (['BUILD_ERROR', 'RUNTIME_ERROR', 'CONFIG_ERROR'].includes(stufe)) { console.error('Fehler im Space:', JSON.stringify(s.j).slice(0, 400)); process.exit(1); }
  await new Promise((x) => setTimeout(x, 20_000));
}
try {
  const p = await fetch(`${adresse}/api/ping`, { signal: AbortSignal.timeout(30_000) });
  console.log('Antwort der Seite:', p.status, adresse);
} catch (e) { console.log('Noch keine Antwort:', e.message, adresse); }
